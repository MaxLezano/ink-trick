package com.lezma.InkTrick

import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.UserManager
import android.provider.Settings

/**
 * "InkTrick OS": when the app is the device owner (see setup-tablet.ps1) the tablet behaves like a
 * dedicated reader. Policies are applied once per app version ([applyOnce]); [onResume] only does
 * the cheap per-resume work (re-enter lock task, keep the system in portrait).
 */
object KioskPolicy {
    private const val PREFS = "inktrick_kiosk"
    private const val KEY_APPLIED = "applied_version"
    // Bump to force every device to re-apply the policies (and the wallpaper) after an update.
    private const val POLICY_VERSION = 5
    private const val KEY_PLAY_HIDDEN = "play_store_hidden"
    private const val PLAY_STORE = "com.android.vending"

    /**
     * Packages allowed to run inside lock task mode: the SAF picker (adding folders, photo picker),
     * Google Drive and the Google account sign-in. Settings is deliberately absent: its
     * FallbackHome would otherwise be locked in at boot. "Ajustes de Android" leaves lock task.
     */
    private val LOCK_TASK_CANDIDATES = arrayOf(
        "com.android.documentsui",
        "com.google.android.documentsui",
        "com.google.android.apps.docs",
        "com.google.android.gms",
        "com.google.android.gsf",
        "com.google.android.gsf.login",
    )

    fun admin(context: Context) = ComponentName(context, AdminReceiver::class.java)

    fun dpm(context: Context) = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    fun isDeviceOwner(context: Context): Boolean =
        try { dpm(context).isDeviceOwnerApp(context.packageName) } catch (_: Exception) { false }

    fun applyOnce(context: Context, force: Boolean = false) {
        if (!isDeviceOwner(context)) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!force && prefs.getInt(KEY_APPLIED, 0) == POLICY_VERSION) return
        val activity = context // Policies only need a context; lock task itself starts in onResume.
        val dpm = dpm(activity)
        val admin = admin(activity)
        val pm = activity.packageManager

        val allowed = (listOf(activity.packageName) + LOCK_TASK_CANDIDATES.filter { isInstalled(pm, it) }).toTypedArray()
        safe { dpm.setLockTaskPackages(admin, allowed) }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            // Only the power menu (shut down / restart): no home, recents, notifications or status bar.
            safe { dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS) }
        }
        // The system keyguard is replaced by InkTrick's own sleep screen (SleepActivity): Android's
        // lock screen ignores the app orientation (landscape on landscape-native panels), shows
        // notifications and "managed by your organization". Fails (harmlessly) if a PIN is set.
        safe { dpm.setKeyguardDisabled(admin, true) }
        // Lock task already blocks the notification shade; disabling the status bar on top of it
        // made Android drop the immersive flags (the navigation bar stayed on screen).
        safe { dpm.setStatusBarDisabled(admin, false) }
        safe { dpm.addUserRestriction(admin, UserManager.DISALLOW_USER_SWITCH) }
        safe { dpm.addUserRestriction(admin, UserManager.DISALLOW_ADD_USER) }
        // Location is needed to scan Wi-Fi networks; accounts to show the Google account.
        for (perm in listOf(
            android.Manifest.permission.ACCESS_FINE_LOCATION,
            android.Manifest.permission.ACCESS_COARSE_LOCATION,
            android.Manifest.permission.GET_ACCOUNTS,
        )) {
            safe { dpm.setPermissionGrantState(admin, activity.packageName, perm, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED) }
        }
        // Permissions an older build of this branch auto-granted and no longer uses.
        safe {
            dpm.setPermissionGrantState(admin, activity.packageName, android.Manifest.permission.READ_CONTACTS,
                DevicePolicyManager.PERMISSION_GRANT_STATE_DEFAULT)
        }
        safe {
            val home = IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
            }
            dpm.addPersistentPreferredActivity(admin, home, ComponentName(activity, MainActivity::class.java))
        }
        // Play Store stays hidden unless maintenance shows it: no update downloads filling the
        // storage, no "free up space" notifications, no way to install other apps.
        safe { dpm.setApplicationHidden(admin, PLAY_STORE, prefs.getBoolean(KEY_PLAY_HIDDEN, true)) }
        Thread { WallpaperHelper.apply(activity.applicationContext) }.start()
        prefs.edit().putInt(KEY_APPLIED, POLICY_VERSION).apply()
    }

    /**
     * Undoes InkTrick OS and gives up the device owner, so the app can be uninstalled and the
     * tablet used normally again without a factory reset (in-app "Desactivar InkTrick OS" or
     * `setup-tablet.ps1 -Remove`). Leaving the whitelist also ends lock task.
     */
    fun release(context: Context): Boolean {
        if (!isDeviceOwner(context)) return false
        val dpm = dpm(context)
        val admin = admin(context)
        safe { dpm.clearPackagePersistentPreferredActivities(admin, context.packageName) }
        safe { dpm.setKeyguardDisabled(admin, false) }
        safe { dpm.setStatusBarDisabled(admin, false) }
        safe { dpm.clearUserRestriction(admin, UserManager.DISALLOW_USER_SWITCH) }
        safe { dpm.clearUserRestriction(admin, UserManager.DISALLOW_ADD_USER) }
        safe { dpm.setLockTaskPackages(admin, arrayOf()) }
        safe { dpm.setApplicationHidden(admin, PLAY_STORE, false) }
        safe {
            if (Settings.System.canWrite(context)) {
                Settings.System.putInt(context.contentResolver, Settings.System.ACCELEROMETER_ROTATION, 1)
            }
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_APPLIED).apply()
        return try {
            dpm.clearDeviceOwnerApp(context.packageName)
            true
        } catch (_: Exception) {
            false
        }
    }

    fun isPlayStoreHidden(context: Context): Boolean =
        try { dpm(context).isApplicationHidden(admin(context), PLAY_STORE) } catch (_: Exception) { false }

    fun setPlayStoreHidden(context: Context, hidden: Boolean): Boolean {
        if (!isDeviceOwner(context)) return false
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_PLAY_HIDDEN, hidden).apply()
        return try { dpm(context).setApplicationHidden(admin(context), PLAY_STORE, hidden) } catch (_: Exception) { false }
    }

    fun onResume(activity: Activity) {
        if (!isDeviceOwner(activity)) return
        // Only learn the portrait rotation while locked to portrait (the reader may be upside down).
        if (activity.requestedOrientation == android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT) {
            DeviceOrientationHelper.updateFromActivity(activity)
        }
        enforceSystemPortrait(activity)
        val am = activity.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        if (am.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) safe { activity.startLockTask() }
    }

    /** Leaves lock task (for apps that are not whitelisted, e.g. Android settings). */
    fun leaveLockTask(activity: Activity) {
        safe { activity.stopLockTask() }
    }

    fun isLockTaskPermitted(context: Context, pkg: String): Boolean =
        try { dpm(context).isLockTaskPermitted(pkg) } catch (_: Exception) { false }

    /**
     * Keeps the *system* rotation in portrait so other screens (folder picker, Drive, settings)
     * open upright. Needs WRITE_SETTINGS (granted by setup-tablet.ps1 with appops).
     */
    fun enforceSystemPortrait(context: Context) {
        if (!Settings.System.canWrite(context)) return
        val resolver = context.contentResolver
        val rotation = DeviceOrientationHelper.getPortraitRotation(context)
        safe {
            if (Settings.System.getInt(resolver, Settings.System.ACCELEROMETER_ROTATION, 0) != 0) {
                Settings.System.putInt(resolver, Settings.System.ACCELEROMETER_ROTATION, 0)
            }
            if (Settings.System.getInt(resolver, Settings.System.USER_ROTATION, -1) != rotation) {
                Settings.System.putInt(resolver, Settings.System.USER_ROTATION, rotation)
            }
        }
    }

    private fun isInstalled(pm: PackageManager, pkg: String): Boolean =
        try { pm.getPackageInfo(pkg, 0); true } catch (_: Exception) { false }

    private inline fun safe(block: () -> Unit) {
        try { block() } catch (_: Exception) {}
    }
}
