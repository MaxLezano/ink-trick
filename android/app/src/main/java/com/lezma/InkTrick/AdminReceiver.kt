package com.lezma.InkTrick

import android.app.admin.DeviceAdminReceiver

/**
 * Device admin component that makes InkTrick the device owner (setup-tablet.ps1). Never rename
 * or remove it: Android would drop the device owner and only a factory reset could restore it.
 */
class AdminReceiver : DeviceAdminReceiver()
