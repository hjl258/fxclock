import Foundation

/// 与小程序 utils/time.js、Android 版 BeijingTime.kt 对齐：
/// 北京时间（UTC+8）挂钟字段、毫秒走时文本、下一个 20:00、倒计时拆分。
enum BeijingTime {

    static let bj = TimeZone(secondsFromGMT: 8 * 3600)!

    struct Parts {
        let hour: Int
        let minute: Int
        let second: Int
        let milli: Int
    }

    /// source: "beijing" / "device" / "server"
    static func now(source: String = "beijing", serverOffsetMs: Double = 0) -> Parts {
        let zone = (source == "beijing") ? bj : TimeZone.current
        var date = Date()
        if source == "server" { date = date.addingTimeInterval(serverOffsetMs / 1000.0) }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = zone
        let c = cal.dateComponents([.hour, .minute, .second, .nanosecond], from: date)
        return Parts(
            hour: c.hour ?? 0,
            minute: c.minute ?? 0,
            second: c.second ?? 0,
            milli: (c.nanosecond ?? 0) / 1_000_000
        )
    }

    /// HH:MM:SS.d（十分位）
    static func clockText(_ p: Parts) -> String {
        String(format: "%02d:%02d:%02d.%d", p.hour, p.minute, p.second, p.milli / 100)
    }

    static func hhmm(_ p: Parts) -> String {
        String(format: "%02d:%02d", p.hour, p.minute)
    }

    /// 下一个北京时间 hh:mm:ss 的时间戳；当天已过则顺延一天
    static func nextBeijing(hour: Int, minute: Int, second: Int, from: Date = Date()) -> Date {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = bj
        var comps = cal.dateComponents([.year, .month, .day], from: from)
        comps.hour = hour
        comps.minute = minute
        comps.second = second
        comps.nanosecond = 0
        var target = cal.date(from: comps) ?? from
        while target <= from {
            target = target.addingTimeInterval(24 * 3600)
        }
        return target
    }

    static func remain(_ target: Date, now: Date = Date()) -> TimeInterval {
        max(0, target.timeIntervalSince(now))
    }

    /// HH:MM:SS:T（与小程序卡片数字块一致）
    static func countdownText(_ remainSeconds: TimeInterval) -> String {
        let total = max(0, remainSeconds)
        let h = Int(total) / 3600
        let m = (Int(total) / 60) % 60
        let s = Int(total) % 60
        let t = Int((total - floor(total)) * 10)
        return String(format: "%02d:%02d:%02d:%d", h, m, s, t)
    }
}