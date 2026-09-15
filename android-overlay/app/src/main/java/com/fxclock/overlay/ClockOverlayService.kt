package com.fxclock.overlay

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.NotificationCompat
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * 系统级悬浮窗：TYPE_APPLICATION_OVERLAY，可显示在桌面与其它应用之上。
 * 需要 SYSTEM_ALERT_WINDOW 权限，并以 specialUse 前台服务保活。
 */
class ClockOverlayService : Service() {

    companion object {
        const val ACTION_START = "com.fxclock.overlay.START"
        const val ACTION_STOP = "com.fxclock.overlay.STOP"

        private const val CHANNEL_ID = "fxclock_overlay"
        private const val NOTIF_ID = 1001
        private const val TICK_MS = 100L
        private const val TARGET_HOUR = 20

        @Volatile
        var isRunning: Boolean = false
            private set
    }

    private lateinit var windowManager: WindowManager
    private var overlayView: View? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    private var tvTime: TextView? = null
    private var tvMeta: TextView? = null
    private var targetEpoch: Long = 0L
    private val handler = Handler(Looper.getMainLooper())

    private val ticker = object : Runnable {
        override fun run() {
            render()
            handler.postDelayed(this, TICK_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            shutdown()
            return START_NOT_STICKY
        }
        startForegroundSafe()
        if (!showOverlay()) return START_NOT_STICKY
        targetEpoch = BeijingTime.nextBeijing(TARGET_HOUR, 0, 0)
        handler.removeCallbacks(ticker)
        handler.post(ticker)
        isRunning = true
        return START_STICKY
    }

    override fun onDestroy() {
        teardown()
        isRunning = false
        super.onDestroy()
    }

    /* ---------- 悬浮窗 ---------- */

    private fun canOverlay(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)

    private fun showOverlay(): Boolean {
        if (overlayView != null) return true
        if (!canOverlay()) {
            Toast.makeText(this, "未授予「显示在其他应用上层」权限", Toast.LENGTH_LONG).show()
            shutdown()
            return false
        }
        val view = LayoutInflater.from(this).inflate(R.layout.overlay_clock, null)
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        )
        lp.gravity = Gravity.TOP or Gravity.START
        lp.x = 40
        lp.y = (resources.displayMetrics.heightPixels * 0.22f).roundToInt()

        tvTime = view.findViewById(R.id.tvTime)
        tvMeta = view.findViewById(R.id.tvMeta)
        view.findViewById<View>(R.id.btnClose).setOnClickListener { shutdown() }
        attachDrag(view, lp)

        return try {
            windowManager.addView(view, lp)
            overlayView = view
            layoutParams = lp
            true
        } catch (e: Exception) {
            Toast.makeText(this, "悬浮窗创建失败：" + e.message, Toast.LENGTH_LONG).show()
            false
        }
    }

    private fun attachDrag(view: View, lp: WindowManager.LayoutParams) {
        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        var dragging = false
        view.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    downX = event.rawX
                    downY = event.rawY
                    startX = lp.x
                    startY = lp.y
                    dragging = false
                    false
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - downX
                    val dy = event.rawY - downY
                    if (!dragging && (abs(dx) > 6f || abs(dy) > 6f)) dragging = true
                    if (dragging) {
                        lp.x = startX + dx.toInt()
                        lp.y = startY + dy.toInt()
                        overlayView?.let { v ->
                            try {
                                windowManager.updateViewLayout(v, lp)
                            } catch (ignored: Exception) {
                            }
                        }
                    }
                    dragging
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> dragging
                else -> false
            }
        }
    }

    private fun render() {
        val p = BeijingTime.now("beijing")
        tvTime?.text = BeijingTime.clockText(p)
        var remain = BeijingTime.remain(targetEpoch)
        if (remain <= 0L) {
            // 到点：震动提示并滚到下一场
            vibrate()
            targetEpoch = BeijingTime.nextBeijing(TARGET_HOUR, 0, 0)
            remain = BeijingTime.remain(targetEpoch)
        }
        tvMeta?.text = "北京时间 | " + BeijingTime.countdownText(remain)
    }

    private fun vibrate() {
        try {
            val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(120, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(120)
            }
        } catch (ignored: Exception) {
        }
    }

    /* ---------- 前台服务与通知 ---------- */

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.channel_name),
                NotificationManager.IMPORTANCE_LOW
            )
            channel.setShowBadge(false)
            mgr.createNotificationChannel(channel)
        }
    }

    private fun stopPendingIntent(): PendingIntent {
        val intent = Intent(this, ClockOverlayService::class.java).setAction(ACTION_STOP)
        val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        return PendingIntent.getService(this, 1, intent, flags)
    }

    private fun openPendingIntent(): PendingIntent {
        val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        return PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), flags)
    }

    private fun startForegroundSafe() {
        val notif = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.dot_green)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text))
            .setOngoing(true)
            .setContentIntent(openPendingIntent())
            .addAction(0, getString(R.string.notif_stop), stopPendingIntent())
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun teardown() {
        handler.removeCallbacks(ticker)
        overlayView?.let { v ->
            try {
                windowManager.removeView(v)
            } catch (ignored: Exception) {
            }
        }
        overlayView = null
        layoutParams = null
        tvTime = null
        tvMeta = null
    }

    private fun shutdown() {
        teardown()
        isRunning = false
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (ignored: Exception) {
        }
        stopSelf()
    }
}