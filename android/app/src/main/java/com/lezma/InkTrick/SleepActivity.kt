package com.lezma.InkTrick

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.app.Activity
import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextClock
import android.widget.TextView
import androidx.core.content.ContextCompat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * InkTrick OS sleep screen, the replacement for Android's keyguard (disabled by [KioskPolicy]).
 * Started when the screen turns off, so waking the tablet shows a Kindle-like cover: an ink-wash
 * screensaver (a different one each time), the clock, date and battery. Swiping up reveals the
 * app exactly where it was.
 */
class SleepActivity : Activity() {

    private var bitmap: Bitmap? = null
    private var coverBitmap: Bitmap? = null
    private lateinit var content: View
    private lateinit var batteryText: TextView
    private var downY = 0f
    private var velocity: VelocityTracker? = null
    private var leaving = false

    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = showBattery(intent)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) setShowWhenLocked(true)
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.BLACK

        val root = FrameLayout(this).apply { setBackgroundColor(BG) }
        val image = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
        content = FrameLayout(this).apply {
            addView(image, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            // Darken top and bottom so the clock and the hint read on any screensaver.
            addView(View(context).apply {
                background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                    intArrayOf(0xD0000000.toInt(), 0x40000000, 0x00000000, 0x30000000, 0xC0000000.toInt()))
            }, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            addView(buildClock(), FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT, Gravity.TOP))
            addView(buildHint(), FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT, Gravity.BOTTOM))
        }
        root.addView(content, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        setContentView(root)
        hideSystemBars()

        // "Libro actual": the cover of the book being read over a faint screensaver.
        val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
        val bookCover = prefs.getString("cover", null)?.takeIf { prefs.getString("mode", "art") == "book" }
        val coverView = bookCover?.let { buildBook(prefs.getString("title", null), prefs.getInt("percentage", 0)) }
        if (coverView != null) {
            image.alpha = 0.22f
            (content as FrameLayout).addView(coverView.first, 2, FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT, Gravity.CENTER))
        }

        // Decode off the UI thread at (about) the screen size: the screen is still off anyway.
        val metrics = resources.displayMetrics
        Thread {
            val bmp = loadScreensaver(min(metrics.widthPixels, metrics.heightPixels), max(metrics.widthPixels, metrics.heightPixels))
            val cover = if (coverView != null) loadCover(bookCover, (shortSide() * COVER_WIDTH).toInt()) else null
            runOnUiThread {
                if (isDestroyed) {
                    bmp?.recycle()
                    cover?.recycle()
                } else {
                    bitmap = bmp
                    image.setImageBitmap(bmp)
                    if (cover != null) {
                        coverBitmap = cover
                        coverView!!.second.setImageBitmap(cover)
                    } else coverView?.first?.visibility = View.GONE
                    if (cover == null) image.alpha = 1f
                }
            }
        }.start()
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
        ContextCompat.registerReceiver(this, batteryReceiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED),
            ContextCompat.RECEIVER_NOT_EXPORTED)?.let { showBattery(it) }
    }

    override fun onPause() {
        super.onPause()
        try { unregisterReceiver(batteryReceiver) } catch (_: Exception) {}
    }

    override fun onDestroy() {
        super.onDestroy()
        bitmap?.recycle()
        bitmap = null
        coverBitmap?.recycle()
        coverBitmap = null
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    // The cover is only left by swiping up.
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {}

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) return true
        return super.dispatchKeyEvent(event)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (leaving) return true
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downY = event.rawY
                velocity = VelocityTracker.obtain().also { it.addMovement(event) }
            }
            MotionEvent.ACTION_MOVE -> {
                velocity?.addMovement(event)
                val dy = min(0f, event.rawY - downY)
                content.translationY = dy
                content.alpha = 1f - min(0.6f, abs(dy) / content.height)
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                velocity?.addMovement(event)
                velocity?.computeCurrentVelocity(1000)
                val vy = velocity?.yVelocity ?: 0f
                velocity?.recycle()
                velocity = null
                val dy = event.rawY - downY
                val fling = vy < -dp(900f) && dy < -dp(24f)
                if (event.actionMasked == MotionEvent.ACTION_UP && (dy < -content.height * 0.18f || fling)) dismiss()
                else content.animate().translationY(0f).alpha(1f).setDuration(220).start()
            }
        }
        return true
    }

    private fun dismiss() {
        leaving = true
        content.animate().translationY(-content.height.toFloat()).alpha(0f).setDuration(260)
            .setListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    finish()
                    @Suppress("DEPRECATION")
                    overridePendingTransition(0, 0)
                }
            }).start()
    }

    private fun buildClock(): View {
        val locale = Locale.getDefault()
        val shadow = { tv: TextView -> tv.setShadowLayer(dp(8f), 0f, 0f, 0xB0000000.toInt()) }
        val time = TextClock(this).apply {
            format12Hour = "h:mm"
            format24Hour = "H:mm"
            setTextColor(TEXT)
            typeface = Typeface.create("sans-serif-thin", Typeface.NORMAL)
            setTextSize(TypedValue.COMPLEX_UNIT_PX, shortSide() * 0.22f)
            includeFontPadding = false
            gravity = Gravity.CENTER
            shadow(this)
        }
        val datePattern = DateFormat.getBestDateTimePattern(locale, "EEEEdMMMM")
        val date = TextClock(this).apply {
            format12Hour = datePattern
            format24Hour = datePattern
            setTextColor(TEXT)
            setTextSize(TypedValue.COMPLEX_UNIT_PX, shortSide() * 0.042f)
            gravity = Gravity.CENTER
            shadow(this)
        }
        batteryText = TextView(this).apply {
            setTextColor(GOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_PX, shortSide() * 0.032f)
            gravity = Gravity.CENTER
            setPadding(0, dp(6f).toInt(), 0, 0)
            shadow(this)
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, (longSide() * 0.07f).toInt(), 0, 0)
            addView(time)
            addView(date)
            addView(batteryText)
        }
    }

    private fun buildHint(): View {
        val chevron = object : View(this) {
            private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = GOLD
                style = Paint.Style.STROKE
                strokeWidth = dp(2.4f)
                strokeCap = Paint.Cap.ROUND
                strokeJoin = Paint.Join.ROUND
            }
            override fun onDraw(canvas: Canvas) {
                val w = width.toFloat()
                val h = height.toFloat()
                canvas.drawPath(Path().apply {
                    moveTo(w * 0.2f, h * 0.68f)
                    lineTo(w * 0.5f, h * 0.32f)
                    lineTo(w * 0.8f, h * 0.68f)
                }, paint)
            }
        }
        val label = TextView(this).apply {
            text = "Desliza hacia arriba para leer"
            setTextColor(0xCCF0F0F0.toInt())
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            letterSpacing = 0.04f
            gravity = Gravity.CENTER
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, 0, 0, (longSide() * 0.05f).toInt())
            addView(chevron, LinearLayout.LayoutParams(dp(36f).toInt(), dp(22f).toInt()))
            addView(label)
        }
    }

    /** Cover + title + progress, centered. Returns the block and the cover's ImageView. */
    private fun buildBook(title: String?, percentage: Int): Pair<View, ImageView> {
        val width = (shortSide() * COVER_WIDTH).toInt()
        val cover = ImageView(this).apply {
            adjustViewBounds = true
            scaleType = ImageView.ScaleType.FIT_CENTER
            elevation = dp(10f)
            clipToOutline = true
            outlineProvider = object : android.view.ViewOutlineProvider() {
                override fun getOutline(view: View, outline: android.graphics.Outline) =
                    outline.setRoundRect(0, 0, view.width, view.height, dp(8f))
            }
        }
        val titleView = TextView(this).apply {
            text = title.orEmpty()
            setTextColor(TEXT)
            setTextSize(TypedValue.COMPLEX_UNIT_PX, shortSide() * 0.036f)
            gravity = Gravity.CENTER
            maxLines = 2
            ellipsize = android.text.TextUtils.TruncateAt.END
            setPadding(dp(32f).toInt(), dp(18f).toInt(), dp(32f).toInt(), 0)
            visibility = if (title.isNullOrBlank()) View.GONE else View.VISIBLE
        }
        val progress = TextView(this).apply {
            text = if (percentage > 0) "$percentage % leído" else ""
            setTextColor(GOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_PX, shortSide() * 0.028f)
            gravity = Gravity.CENTER
            setPadding(0, dp(4f).toInt(), 0, 0)
        }
        val block = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            // Leave the clock above alone: the cover sits a bit below the center.
            setPadding(0, (longSide() * 0.08f).toInt(), 0, 0)
            addView(cover, LinearLayout.LayoutParams(width, WRAP_CONTENT))
            addView(titleView)
            addView(progress)
        }
        return block to cover
    }

    private fun loadCover(uri: String, reqW: Int): Bitmap? = try {
        val parsed = android.net.Uri.parse(uri.substringBefore('?'))
        val open = { if (parsed.scheme == "content") contentResolver.openInputStream(parsed) else java.io.FileInputStream(parsed.path ?: uri) }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        open()?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= reqW) sample *= 2
        open()?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
    } catch (_: Exception) {
        null
    }

    private fun showBattery(intent: Intent) {
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
        if (level < 0 || scale <= 0) return
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        val pct = level * 100 / scale
        batteryText.text = if (charging) "$pct % · Cargando" else "$pct %"
    }

    /** Next screensaver in rotation, decoded with a sample size close to the screen. */
    private fun loadScreensaver(reqW: Int, reqH: Int): Bitmap? {
        return try {
            val names = assets.list(SCREENSAVER_DIR)?.filter { it.endsWith(".webp") }?.sorted().orEmpty()
            if (names.isEmpty()) return null
            val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
            val index = (prefs.getInt("next", 0) % names.size + names.size) % names.size
            prefs.edit().putInt("next", index + 1).apply()
            val path = "$SCREENSAVER_DIR/${names[index]}"
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            assets.open(path).use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= reqW && bounds.outHeight / (sample * 2) >= reqH) sample *= 2
            assets.open(path).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
        } catch (_: Exception) {
            null
        }
    }

    @Suppress("DEPRECATION")
    private fun hideSystemBars() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)
    }

    private fun dp(v: Float) = v * resources.displayMetrics.density
    private fun shortSide() = min(resources.displayMetrics.widthPixels, resources.displayMetrics.heightPixels).toFloat()
    private fun longSide() = max(resources.displayMetrics.widthPixels, resources.displayMetrics.heightPixels).toFloat()

    companion object {
        const val PREFS = "inktrick_sleep"
        private const val COVER_WIDTH = 0.46f
        private const val SCREENSAVER_DIR = "screensavers"
        private const val BG = 0xFF0A0A0A.toInt()
        private const val TEXT = 0xFFF0F0F0.toInt()
        private const val GOLD = 0xFFE2B84E.toInt()

        /**
         * Shows the sleep screen every time the screen turns off (device owner only: without it
         * Android's own keyguard is still there). Registered once from [MainApplication].
         */
        fun install(app: Application) {
            // A fresh process has no reader open: forget any book left by the previous one.
            app.getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .remove("bookId").remove("cover").remove("title").remove("percentage").apply()
            ContextCompat.registerReceiver(app, object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    if (!KioskPolicy.isDeviceOwner(context)) return
                    try {
                        context.startActivity(Intent(context, SleepActivity::class.java).addFlags(
                            Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NO_ANIMATION))
                    } catch (_: Exception) {}
                }
            }, IntentFilter(Intent.ACTION_SCREEN_OFF), ContextCompat.RECEIVER_NOT_EXPORTED)
        }
    }
}
