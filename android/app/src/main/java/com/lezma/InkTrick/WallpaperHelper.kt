package com.lezma.InkTrick

import android.app.WallpaperManager
import android.content.Context
import android.graphics.BitmapFactory
import android.util.Log

/**
 * Sets the system wallpaper (home + lock) to the InkTrick logo on black. It is only visible while
 * Android boots ("FallbackHome", drawn in the panel's natural orientation), so the image is square
 * with the logo centered: it looks right in portrait and landscape. Called once per policy version.
 */
object WallpaperHelper {
    private const val TAG = "WallpaperHelper"
    private const val ASSET = "wallpaper.webp"

    fun apply(context: Context) {
        try {
            val bitmap = context.assets.open(ASSET).use { BitmapFactory.decodeStream(it) } ?: return
            val wm = WallpaperManager.getInstance(context)
            wm.setBitmap(bitmap, null, true, WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK)
            bitmap.recycle()
        } catch (e: Exception) {
            Log.w(TAG, "Could not set the wallpaper", e)
        }
    }
}
