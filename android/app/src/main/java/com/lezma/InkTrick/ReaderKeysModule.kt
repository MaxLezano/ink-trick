package com.lezma.InkTrick

import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.view.KeyEvent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference

/**
 * Turns pages with the volume keys while the reader asks for it. [MainActivity] forwards every
 * key event to [handle]; when enabled, volume down / up are consumed (no volume change, no system
 * slider) and sent to JS as `onVolumeKey` with +1 (next page) or -1 (previous page).
 */
class ReaderKeysModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    init {
        instance = WeakReference(this)
    }

    override fun getName(): String = "ReaderKeysModule"

    @ReactMethod
    fun setVolumeKeysEnabled(value: Boolean) {
        enabled = value
    }

    /** Battery percentage for the reader's top bar (sticky broadcast: no permission, no receiver). */
    @ReactMethod
    fun getBatteryLevel(promise: Promise) {
        val battery = reactApplicationContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        promise.resolve(if (level >= 0 && scale > 0) level * 100 / scale else -1)
    }

    private fun emit(direction: Int) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit("onVolumeKey", direction)
        } catch (_: Exception) {}
    }

    // Required by NativeEventEmitter.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    companion object {
        @Volatile
        private var enabled = false
        private var instance: WeakReference<ReaderKeysModule>? = null

        /** Returns true when the event was consumed as a page turn. */
        fun handle(event: KeyEvent): Boolean {
            if (!enabled) return false
            val direction = when (event.keyCode) {
                KeyEvent.KEYCODE_VOLUME_DOWN -> 1
                KeyEvent.KEYCODE_VOLUME_UP -> -1
                else -> return false
            }
            // Holding the key repeats the turn, like holding an arrow key.
            if (event.action == KeyEvent.ACTION_DOWN) instance?.get()?.emit(direction)
            return true
        }
    }
}
