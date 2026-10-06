package com.lezma.InkTrick

import android.accounts.Account
import android.accounts.AccountManager
import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Reads the Google account's public profile (name and photo) to use the photo as the reader's
 * avatar. Only the basic "profile" scope is requested, through the account already on the
 * device (Google Play services shows its "Allow" screen the first time). The app is identified by
 * its OAuth Android client (package + signing SHA-1) in the InkTrick Google Cloud project; there
 * is no client secret. The photo is stored in the app's private files. Call off the main thread.
 */
object GoogleProfile {
    private const val SCOPE = "oauth2:https://www.googleapis.com/auth/userinfo.profile"
    private const val USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo"
    private const val PHOTO_SIZE = 384

    class Profile(val name: String?, val photoUri: String?)

    class ProfileException(val code: String, message: String) : Exception(message)

    fun fetch(activity: Activity, email: String): Profile {
        val manager = AccountManager.get(activity)
        val account = Account(email, "com.google")
        var token = token(manager, account, activity)
        var json = userinfo(token)
        if (json == null) {
            // Expired / revoked token: drop it and ask once more.
            manager.invalidateAuthToken("com.google", token)
            token = token(manager, account, activity)
            json = userinfo(token) ?: throw ProfileException("UNAUTHORIZED", "Google rejected the token")
        }
        val name = json.optString("name").takeIf { it.isNotBlank() }
        val picture = json.optString("picture").takeIf { it.isNotBlank() }
        return Profile(name, picture?.let { savePhoto(activity, it) })
    }

    private fun token(manager: AccountManager, account: Account, activity: Activity): String {
        // With an activity, AccountManager launches Google's consent screen itself when needed.
        val bundle = try {
            manager.getAuthToken(account, SCOPE, null, activity, null, null).result
        } catch (e: android.accounts.OperationCanceledException) {
            throw ProfileException("CANCELLED", "Consent cancelled")
        } catch (e: Exception) {
            throw ProfileException("TOKEN", e.message ?: "No token")
        }
        return bundle.getString(AccountManager.KEY_AUTHTOKEN) ?: throw ProfileException("TOKEN", "No token")
    }

    /** The userinfo JSON, or null when the token is no longer valid (HTTP 401). */
    private fun userinfo(token: String): JSONObject? {
        val conn = (URL(USERINFO).openConnection() as HttpURLConnection).apply {
            setRequestProperty("Authorization", "Bearer $token")
            connectTimeout = 10000
            readTimeout = 10000
        }
        try {
            return when (conn.responseCode) {
                200 -> JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                401 -> null
                else -> throw ProfileException("HTTP", "userinfo ${conn.responseCode}")
            }
        } catch (e: java.io.IOException) {
            throw ProfileException("NETWORK", e.message ?: "No connection")
        } finally {
            conn.disconnect()
        }
    }

    /** Downloads the photo at avatar size, crops it square and saves it as a JPEG. */
    private fun savePhoto(context: Context, url: String): String? {
        // Google photo URLs end in "=s96-c" (size + crop): ask for the size actually shown.
        val sized = if (Regex("=s\\d+(-c)?$").containsMatchIn(url)) url.replace(Regex("=s\\d+(-c)?$"), "=s$PHOTO_SIZE-c")
        else "$url=s$PHOTO_SIZE-c"
        return try {
            val conn = (URL(sized).openConnection() as HttpURLConnection).apply {
                connectTimeout = 10000
                readTimeout = 15000
            }
            val bitmap = conn.inputStream.use { BitmapFactory.decodeStream(it) } ?: return null
            conn.disconnect()
            val side = minOf(bitmap.width, bitmap.height)
            val square = Bitmap.createBitmap(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side)
            val file = File(context.filesDir, "inktrick/google_photo.jpg")
            file.parentFile?.mkdirs()
            FileOutputStream(file).use { square.compress(Bitmap.CompressFormat.JPEG, 90, it) }
            "file://${file.absolutePath}?v=${System.currentTimeMillis()}"
        } catch (_: Exception) {
            null
        }
    }
}
