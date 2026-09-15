package com.fxclock.overlay

import java.util.Calendar
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/**
 * 与小程序 utils/time.js 对齐的时间计算：
 * 北京时间（UTC+8）挂钟字段、毫秒走时文本、下一个 20:00 的时间戳、倒计时拆分。
 */
object BeijingTime {

    private val BJ: TimeZone = TimeZone.getTimeZone("GMT+08:00")

    data class Parts(
        val year: Int,
        val month: Int,
        val day: Int,
        val hour: Int,
        val minute: Int,
        val second: Int,
        val milli: Int
    )

    /** 取当前时间的挂钟字段；source: beijing / device / server */
    fun now(source: String = "beijing", serverOffsetMs: Long = 0L): Parts {
        val zone = if (source == "beijing") BJ else TimeZone.getDefault()
        val cal = Calendar.getInstance(zone)
        if (source == "server") cal.timeInMillis = System.currentTimeMillis() + serverOffsetMs
        return Parts(
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH) + 1,
            cal.get(Calendar.DAY_OF_MONTH),
            cal.get(Calendar.HOUR_OF_DAY),
            cal.get(Calendar.MINUTE),
            cal.get(Calendar.SECOND),
            cal.get(Calendar.MILLISECOND)
        )
    }

    /** HH:MM:SS.d（十分位），与小程序环形时钟一致 */
    fun clockText(p: Parts): String =
        String.format("%02d:%02d:%02d.%d", p.hour, p.minute, p.second, p.milli / 100)

    fun hhmm(p: Parts): String = String.format("%02d:%02d", p.hour, p.minute)

    /** 下一个北京时间 hh:mm:ss 的时间戳（当天已过则顺延一天） */
    fun nextBeijing(hour: Int, minute: Int, second: Int): Long {
        val now = System.currentTimeMillis()
        val cal = Calendar.getInstance(BJ)
        cal.timeInMillis = now
        cal.set(Calendar.HOUR_OF_DAY, hour)
        cal.set(Calendar.MINUTE, minute)
        cal.set(Calendar.SECOND, second)
        cal.set(Calendar.MILLISECOND, 0)
        var t = cal.timeInMillis
        val day = TimeUnit.DAYS.toMillis(1)
        while (t <= now) t += day
        return t
    }

    fun remain(targetEpochMs: Long): Long = maxOf(0L, targetEpochMs - System.currentTimeMillis())

    /** HH:MM:SS:T，与小程序卡片数字块一致 */
    fun countdownText(remainMs: Long): String {
        val h = remainMs / 3_600_000
        val m = (remainMs / 60_000) % 60
        val s = (remainMs / 1000) % 60
        val t = (remainMs % 1000) / 100
        return String.format("%02d:%02d:%02d:%d", h, m, s, t)
    }
}