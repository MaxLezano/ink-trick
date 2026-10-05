package com.lezma.InkTrick

import android.accounts.AccountManager
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.ScanResult
import android.net.wifi.SupplicantState
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.WindowManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * InkTrick OS system controls: brightness, screen timeout, battery / USB status, Wi-Fi (scan and
 * connect inside the app, so the reader never needs Android settings), Google account, Drive and
 * the file manager. Events (`onDeviceStatusChanged`, `onWifiScan`, `onWifiAuthError`) are only
 * listened to while JS has subscribers.
 */
class TabletControlModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var pickPhotoPromise: Promise? = null
    private var listenerCount = 0
    private var receiverRegistered = false
    private val main = Handler(Looper.getMainLooper())

    private val wifi: WifiManager
        get() = reactApplicationContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                WifiManager.SCAN_RESULTS_AVAILABLE_ACTION -> emit("onWifiScan", null)
                WifiManager.SUPPLICANT_STATE_CHANGED_ACTION -> {
                    @Suppress("DEPRECATION")
                    if (intent.getIntExtra(WifiManager.EXTRA_SUPPLICANT_ERROR, 0) == WifiManager.ERROR_AUTHENTICATING) {
                        emit("onWifiAuthError", null)
                    }
                }
                else -> emit("onDeviceStatusChanged", null)
            }
        }
    }

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "TabletControlModule"

    private fun emit(event: String, payload: Any?) {
        try {
            reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)?.emit(event, payload)
        } catch (_: Exception) {}
    }

    // ─── Events (NativeEventEmitter) ──────────────────────────────────────────

    @ReactMethod
    fun addListener(eventName: String) {
        listenerCount++
        if (receiverRegistered) return
        val filter = IntentFilter().apply {
            addAction("android.hardware.usb.action.USB_STATE")
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
            addAction(Intent.ACTION_BATTERY_CHANGED)
            addAction(WifiManager.WIFI_STATE_CHANGED_ACTION)
            addAction(WifiManager.NETWORK_STATE_CHANGED_ACTION)
            addAction(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION)
            addAction(WifiManager.SUPPLICANT_STATE_CHANGED_ACTION)
        }
        try {
            ContextCompat.registerReceiver(reactApplicationContext, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
            receiverRegistered = true
        } catch (_: Exception) {}
    }

    @ReactMethod
    fun removeListeners(count: Double) {
        listenerCount = max(0, listenerCount - count.toInt())
        if (listenerCount == 0 && receiverRegistered) {
            try { reactApplicationContext.unregisterReceiver(receiver) } catch (_: Exception) {}
            receiverRegistered = false
        }
    }

    // ─── Kiosk info ───────────────────────────────────────────────────────────

    @ReactMethod
    fun getKioskInfo(promise: Promise) {
        val map = Arguments.createMap()
        map.putBoolean("isDeviceOwner", KioskPolicy.isDeviceOwner(reactApplicationContext))
        map.putBoolean("canWriteSettings", Settings.System.canWrite(reactApplicationContext))
        promise.resolve(map)
    }

    /** Turns InkTrick OS off (gives up the device owner); the tablet goes back to normal Android. */
    @ReactMethod
    fun releaseKiosk(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        val ok = KioskPolicy.release(reactApplicationContext)
        activity?.runOnUiThread {
            try { activity.stopLockTask() } catch (_: Exception) {}
            activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
        promise.resolve(ok)
    }

    /** Leaves lock task and opens Android settings (maintenance; Home brings InkTrick back). */
    @ReactMethod
    fun openAndroidSettings(promise: Promise) {
        val activity = reactApplicationContext.currentActivity ?: return promise.resolve(false)
        KioskPolicy.leaveLockTask(activity)
        launch(activity, Intent(Settings.ACTION_SETTINGS), promise)
    }

    // ─── Brightness / screen ──────────────────────────────────────────────────

    /**
     * [level] is the slider position 0..1. Brightness is perceived roughly logarithmically, so the
     * system value follows a gamma curve (half the slider ≈ 22% of the backlight).
     */
    @ReactMethod
    fun setBrightness(level: Double, promise: Promise) {
        val clamped = level.coerceIn(0.0, 1.0)
        val value = (1 + 254 * clamped.pow(GAMMA)).roundToInt().coerceIn(1, 255)
        val context = reactApplicationContext
        var system = false
        if (KioskPolicy.isDeviceOwner(context) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                val dpm = KioskPolicy.dpm(context)
                val admin = KioskPolicy.admin(context)
                dpm.setSystemSetting(admin, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL.toString())
                dpm.setSystemSetting(admin, Settings.System.SCREEN_BRIGHTNESS, value.toString())
                system = true
            } catch (_: Exception) {}
        }
        if (!system && Settings.System.canWrite(context)) {
            try {
                Settings.System.putInt(context.contentResolver, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
                Settings.System.putInt(context.contentResolver, Settings.System.SCREEN_BRIGHTNESS, value)
                system = true
            } catch (_: Exception) {}
        }
        // System brightness applies everywhere; otherwise only this window can be changed.
        windowBrightness = if (system) WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE else (value / 255f)
        reactApplicationContext.currentActivity?.let { activity -> activity.runOnUiThread { applyWindowBrightness(activity) } }
        promise.resolve(clamped)
    }

    @ReactMethod
    fun getBrightness(promise: Promise) {
        val value = if (windowBrightness >= 0f) (windowBrightness * 255).roundToInt()
        else Settings.System.getInt(reactApplicationContext.contentResolver, Settings.System.SCREEN_BRIGHTNESS, 128)
        promise.resolve(((value - 1).coerceAtLeast(0) / 254.0).pow(1 / GAMMA))
    }

    @ReactMethod
    fun getScreenTimeout(promise: Promise) {
        promise.resolve(Settings.System.getInt(reactApplicationContext.contentResolver, Settings.System.SCREEN_OFF_TIMEOUT, 120000).toDouble())
    }

    @ReactMethod
    fun setScreenTimeout(ms: Double, promise: Promise) {
        val context = reactApplicationContext
        val value = ms.toLong().coerceIn(15000L, 3600000L).toString()
        try {
            if (KioskPolicy.isDeviceOwner(context) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                KioskPolicy.dpm(context).setSystemSetting(KioskPolicy.admin(context), Settings.System.SCREEN_OFF_TIMEOUT, value)
            } else if (Settings.System.canWrite(context)) {
                Settings.System.putInt(context.contentResolver, Settings.System.SCREEN_OFF_TIMEOUT, value.toInt())
            } else return promise.resolve(false)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun setOrientation(orientation: String, promise: Promise) {
        val activity = reactApplicationContext.currentActivity ?: return promise.resolve(orientation)
        activity.runOnUiThread {
            // Only this activity rotates; the system stays in portrait for every other screen.
            activity.requestedOrientation = when {
                !KioskPolicy.isDeviceOwner(activity) -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                orientation == "auto" -> ActivityInfo.SCREEN_ORIENTATION_SENSOR
                else -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            }
            promise.resolve(orientation)
        }
    }

    // ─── Status ───────────────────────────────────────────────────────────────

    @ReactMethod
    fun getDeviceStatus(promise: Promise) {
        try {
            val context = reactApplicationContext
            val map = Arguments.createMap()
            val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            val status = battery?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            map.putInt("batteryLevel", if (level >= 0 && scale > 0) level * 100 / scale else -1)
            map.putBoolean("isCharging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL)

            val ssid = connectedSsid()
            map.putBoolean("isWifiEnabled", wifi.isWifiEnabled)
            map.putBoolean("isWifiConnected", ssid != null)
            map.putString("wifiSsid", ssid)

            val usb = context.registerReceiver(null, IntentFilter("android.hardware.usb.action.USB_STATE"))
            val connected = usb?.getBooleanExtra("connected", false) ?: false
            map.putBoolean("isUsbConnected", connected)
            map.putBoolean("isMtpActive", connected && (usb?.getBooleanExtra("mtp", false) ?: false) &&
                (usb?.getBooleanExtra("unlocked", false) ?: false))
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("STATUS_ERROR", e.message)
        }
    }

    // ─── Wi-Fi ────────────────────────────────────────────────────────────────
    // WifiManager's network APIs are deprecated for regular apps on Android 10+, but device owners
    // are exempt, and Android 9 (the TCL 8052) has no restriction at all.

    @Suppress("DEPRECATION")
    private fun connectedSsid(): String? {
        val cm = reactApplicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val onWifi = cm.getNetworkCapabilities(cm.activeNetwork)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        val info = wifi.connectionInfo ?: return null
        if (!onWifi && info.supplicantState != SupplicantState.COMPLETED) return null
        val ssid = info.ssid?.removeSurrounding("\"")?.trim().orEmpty()
        return if (ssid.isEmpty() || ssid == "<unknown ssid>") (if (onWifi) "Wi-Fi" else null) else ssid
    }

    @Suppress("DEPRECATION")
    @ReactMethod
    fun setWifiEnabled(enabled: Boolean, promise: Promise) {
        promise.resolve(try { wifi.setWifiEnabled(enabled) } catch (_: Exception) { false })
    }

    @Suppress("DEPRECATION")
    @ReactMethod
    fun startWifiScan(promise: Promise) {
        promise.resolve(try { wifi.startScan() } catch (_: Exception) { false })
    }

    /** Last scan results, one entry per SSID (strongest), connected / saved first. */
    @Suppress("DEPRECATION")
    @ReactMethod
    fun getWifiNetworks(promise: Promise) {
        try {
            val current = connectedSsid()
            val saved = try { wifi.configuredNetworks?.map { it.SSID.removeSurrounding("\"") }?.toSet() } catch (_: Exception) { null } ?: emptySet()
            val best = HashMap<String, ScanResult>()
            for (r in wifi.scanResults.orEmpty()) {
                val ssid = r.SSID ?: continue
                if (ssid.isBlank()) continue
                val prev = best[ssid]
                if (prev == null || r.level > prev.level) best[ssid] = r
            }
            val list = best.values.sortedWith(compareByDescending<ScanResult> { it.SSID == current }
                .thenByDescending { it.SSID in saved }
                .thenByDescending { it.level })
            val array = Arguments.createArray()
            for (r in list) {
                array.pushMap(Arguments.createMap().apply {
                    putString("ssid", r.SSID)
                    putInt("signal", WifiManager.calculateSignalLevel(r.level, 4))
                    putString("security", securityOf(r.capabilities.orEmpty()))
                    putBoolean("saved", r.SSID in saved)
                    putBoolean("connected", r.SSID == current)
                })
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("WIFI_ERROR", e.message)
        }
    }

    private fun securityOf(caps: String): String = when {
        caps.contains("EAP") -> "eap"
        caps.contains("SAE") -> "sae"
        caps.contains("PSK") || caps.contains("WPA") || caps.contains("RSN") -> "wpa"
        caps.contains("WEP") -> "wep"
        else -> "open"
    }

    /** Connects to [ssid]; [password] is null to reuse a saved network. Result arrives as events. */
    @Suppress("DEPRECATION")
    @ReactMethod
    fun connectWifi(ssid: String, password: String?, security: String, promise: Promise) {
        try {
            val quoted = "\"$ssid\""
            val existing = try { wifi.configuredNetworks?.firstOrNull { it.SSID == quoted } } catch (_: Exception) { null }
            val id = if (existing != null && password == null) existing.networkId else {
                val config = WifiConfiguration().apply {
                    SSID = quoted
                    when (security) {
                        "open" -> allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
                        "wep" -> {
                            allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
                            allowedAuthAlgorithms.set(WifiConfiguration.AuthAlgorithm.OPEN)
                            allowedAuthAlgorithms.set(WifiConfiguration.AuthAlgorithm.SHARED)
                            wepKeys[0] = if (password != null && isHexWepKey(password)) password else "\"$password\""
                            wepTxKeyIndex = 0
                        }
                        "sae" -> {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                allowedKeyManagement.set(WifiConfiguration.KeyMgmt.SAE)
                            }
                            preSharedKey = "\"$password\""
                        }
                        else -> preSharedKey = "\"$password\""
                    }
                }
                if (existing != null) {
                    config.networkId = existing.networkId
                    wifi.updateNetwork(config)
                } else wifi.addNetwork(config)
            }
            if (id == -1) return promise.resolve(false)
            wifi.disconnect()
            val ok = wifi.enableNetwork(id, true)
            wifi.reconnect()
            promise.resolve(ok)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @Suppress("DEPRECATION")
    @ReactMethod
    fun forgetWifi(ssid: String, promise: Promise) {
        try {
            val quoted = "\"$ssid\""
            val nets = wifi.configuredNetworks?.filter { it.SSID == quoted }.orEmpty()
            nets.forEach { wifi.removeNetwork(it.networkId) }
            wifi.saveConfiguration()
            promise.resolve(nets.isNotEmpty())
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    private fun isHexWepKey(key: String) = (key.length == 10 || key.length == 26 || key.length == 58) && key.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }

    // ─── Google account / apps ────────────────────────────────────────────────

    @ReactMethod
    fun getGoogleAccounts(promise: Promise) {
        try {
            val array = Arguments.createArray()
            AccountManager.get(reactApplicationContext).getAccountsByType("com.google").forEach { array.pushString(it.name) }
            promise.resolve(array)
        } catch (_: Exception) {
            promise.resolve(Arguments.createArray())
        }
    }

    /** Google's own sign-in flow (Play services is whitelisted for lock task, no settings needed). */
    @ReactMethod
    fun addGoogleAccount(promise: Promise) {
        val activity = reactApplicationContext.currentActivity ?: return promise.resolve(false)
        try {
            AccountManager.get(activity).addAccount("com.google", null, null, null, activity, { future ->
                val ok = try { future.result != null } catch (_: Exception) { false }
                promise.resolve(ok)
            }, main)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun openGoogleDrive(promise: Promise) {
        val activity = reactApplicationContext.currentActivity ?: return promise.resolve(false)
        val intent = activity.packageManager.getLaunchIntentForPackage("com.google.android.apps.docs")
            ?: return promise.resolve(false)
        launch(activity, intent, promise)
    }

    @ReactMethod
    fun openFileManager(promise: Promise) {
        val activity = reactApplicationContext.currentActivity ?: return promise.resolve(false)
        val pm = activity.packageManager
        val candidates = listOf(
            Intent().setComponent(ComponentName("com.android.documentsui", "com.android.documentsui.files.FilesActivity")),
            Intent().setComponent(ComponentName("com.google.android.documentsui", "com.android.documentsui.files.FilesActivity")),
            pm.getLaunchIntentForPackage("com.google.android.apps.nbu.files"),
            pm.getLaunchIntentForPackage("com.sec.android.app.myfiles"),
            pm.getLaunchIntentForPackage("com.mi.android.globalFileexplorer"),
            pm.getLaunchIntentForPackage("com.android.fileexplorer"),
            pm.getLaunchIntentForPackage("com.transsion.filemanager"),
            pm.getLaunchIntentForPackage("com.huawei.hidisk"),
            Intent("android.intent.action.VIEW_DOWNLOADS"),
        )
        val intent = candidates.firstOrNull { it != null && it.resolveActivity(pm) != null } ?: return promise.resolve(false)
        launch(activity, intent, promise)
    }

    /** Starts another app; apps outside the lock task whitelist require leaving lock task first. */
    private fun launch(activity: Activity, intent: Intent, promise: Promise) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val pkg = intent.resolveActivity(activity.packageManager)?.packageName
            if (pkg != null && !KioskPolicy.isLockTaskPermitted(activity, pkg)) KioskPolicy.leaveLockTask(activity)
            activity.startActivity(intent)
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    // ─── Profile photo ────────────────────────────────────────────────────────

    @ReactMethod
    fun pickProfilePhoto(promise: Promise) {
        val activity = reactApplicationContext.currentActivity ?: return promise.resolve(null)
        try {
            pickPhotoPromise = promise
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                type = "image/*"
                addCategory(Intent.CATEGORY_OPENABLE)
            }
            activity.startActivityForResult(intent, PICK_PHOTO)
        } catch (_: Exception) {
            pickPhotoPromise = null
            promise.resolve(null)
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != PICK_PHOTO) return
        val promise = pickPhotoPromise ?: return
        pickPhotoPromise = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) return promise.resolve(null)
        Thread { promise.resolve(saveProfilePhoto(uri)) }.start()
    }

    /** Center-crops and scales the picked photo to a small square JPEG (avatars are ≤ 120 dp). */
    private fun saveProfilePhoto(uri: Uri): String? {
        return try {
            val resolver = reactApplicationContext.contentResolver
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (minOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= PHOTO_SIZE) sample *= 2
            val src = resolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
            } ?: return null
            val side = minOf(src.width, src.height)
            val square = Bitmap.createBitmap(src, (src.width - side) / 2, (src.height - side) / 2, side, side)
            val scaled = Bitmap.createScaledBitmap(square, PHOTO_SIZE, PHOTO_SIZE, true)
            val file = File(reactApplicationContext.filesDir, "inktrick/profile_photo.jpg")
            file.parentFile?.mkdirs()
            FileOutputStream(file).use { scaled.compress(Bitmap.CompressFormat.JPEG, 90, it) }
            "file://${file.absolutePath}?v=${System.currentTimeMillis()}"
        } catch (_: Exception) {
            null
        }
    }

    override fun onNewIntent(intent: Intent) {}

    companion object {
        private const val PICK_PHOTO = 9002
        private const val PHOTO_SIZE = 384
        private const val GAMMA = 2.2

        /** Window-only brightness when the system setting cannot be written (not device owner). */
        @Volatile
        var windowBrightness: Float = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE

        fun applyWindowBrightness(activity: Activity) {
            val lp = activity.window.attributes
            if (lp.screenBrightness != windowBrightness) {
                lp.screenBrightness = windowBrightness
                activity.window.attributes = lp
            }
        }
    }
}
