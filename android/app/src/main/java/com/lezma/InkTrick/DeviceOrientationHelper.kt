package com.lezma.InkTrick

import android.content.Context
import android.graphics.Point
import android.view.Surface
import android.view.WindowManager

/**
 * The system rotation (Surface.ROTATION_*) that shows this panel upright in portrait. It is 0 on
 * portrait-native panels and 90 or 270 on landscape-native ones (e.g. TCL 8052, 1024x600), which
 * depends on the vendor. The value is learned from the activity itself, which runs in portrait.
 */
object DeviceOrientationHelper {
    private const val PREFS_NAME = "inktrick_device_orientation"
    private const val KEY_PORTRAIT_ROTATION = "portrait_rotation"

    fun getPortraitRotation(context: Context): Int {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.contains(KEY_PORTRAIT_ROTATION)) return prefs.getInt(KEY_PORTRAIT_ROTATION, Surface.ROTATION_0)
        val display = (context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)?.defaultDisplay
            ?: return Surface.ROTATION_0
        val size = Point().also { display.getRealSize(it) }
        if (size.y >= size.x) return display.rotation
        // Landscape now: AOSP's default portrait rotation for landscape-native panels is 270.
        val natural0 = display.rotation == Surface.ROTATION_0 || display.rotation == Surface.ROTATION_180
        return if (natural0) Surface.ROTATION_270 else Surface.ROTATION_0
    }

    /** Remembers the current rotation when the activity is showing in portrait. */
    fun updateFromActivity(context: Context) {
        val display = (context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)?.defaultDisplay ?: return
        val size = Point().also { display.getRealSize(it) }
        if (size.y <= size.x) return
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getInt(KEY_PORTRAIT_ROTATION, -1) != display.rotation) {
            prefs.edit().putInt(KEY_PORTRAIT_ROTATION, display.rotation).apply()
        }
    }
}
