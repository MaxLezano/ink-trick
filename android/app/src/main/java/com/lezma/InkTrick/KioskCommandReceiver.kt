package com.lezma.InkTrick

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Maintenance commands for setup-tablet.ps1. Protected by android.permission.DUMP, which only the
 * adb shell and the system hold, so no app on the tablet can trigger them:
 *
 *   adb shell am broadcast -a com.lezma.InkTrick.REAPPLY_KIOSK -n com.lezma.InkTrick/.KioskCommandReceiver
 *   adb shell am broadcast -a com.lezma.InkTrick.RELEASE_KIOSK -n com.lezma.InkTrick/.KioskCommandReceiver
 */
class KioskCommandReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_REAPPLY -> {
                KioskPolicy.applyOnce(context, force = true)
                resultData = "applied"
            }
            ACTION_RELEASE -> resultData = if (KioskPolicy.release(context)) "released" else "not-owner"
        }
        Log.i("InkTrickKiosk", "${intent.action}: $resultData")
    }

    companion object {
        const val ACTION_REAPPLY = "com.lezma.InkTrick.REAPPLY_KIOSK"
        const val ACTION_RELEASE = "com.lezma.InkTrick.RELEASE_KIOSK"
    }
}
