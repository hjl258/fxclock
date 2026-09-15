package com.fxclock.overlay

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var tvPerm: TextView
    private lateinit var btnToggle: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        tvPerm = findViewById(R.id.tvPerm)
        btnToggle = findViewById(R.id.btnToggle)

        findViewById<Button>(R.id.btnGrant).setOnClickListener { requestOverlayPermission() }
        btnToggle.setOnClickListener { toggleOverlay() }
        requestNotificationPermission()
    }

    override fun onResume() {
        super.onResume()
        refreshUi()
    }

    private fun canOverlay(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)

    private fun refreshUi() {
        val granted = canOverlay()
        tvPerm.text = if (granted) getString(R.string.hint_granted) else getString(R.string.hint_denied)
        btnToggle.text = if (ClockOverlayService.isRunning) getString(R.string.btn_stop) else getString(R.string.btn_start)
    }

    private fun requestOverlayPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            Toast.makeText(this, "当前系统无需该权限", Toast.LENGTH_SHORT).show()
            return
        }
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + packageName)
        )
        try {
            startActivity(intent)
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION))
        }
    }

    private fun toggleOverlay() {
        val intent = Intent(this, ClockOverlayService::class.java)
        if (ClockOverlayService.isRunning) {
            intent.action = ClockOverlayService.ACTION_STOP
            startService(intent)
            btnToggle.postDelayed({ refreshUi() }, 300)
            return
        }
        if (!canOverlay()) {
            Toast.makeText(this, "请先授予「显示在其他应用上层」权限", Toast.LENGTH_LONG).show()
            requestOverlayPermission()
            return
        }
        intent.action = ClockOverlayService.ACTION_START
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        btnToggle.postDelayed({ refreshUi() }, 300)
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                1001
            )
        }
    }
}