import SwiftUI

/// 首页：环形时钟 + 抢购倒计时 + 画中画开关。
/// 画中画那块「同屏预览」是关键：它不是装饰，而是画中画能开启的前提
/// （ContentSource 的 layer 必须挂在屏幕上的视图层级里，详见 PiPDisplayLayerView）。
struct ContentView: View {

    @ObservedObject private var pip = PiPClockController.shared

    @State private var clockText = "--:--:--.-"
    @State private var countdown = "--:--:--:0"
    @State private var progress: Double = 0
    @State private var targetDate = BeijingTime.nextBeijing(hour: 20, minute: 0, second: 0)

    private let timer = Timer.publish(every: 0.05, on: .main, in: .common).autoconnect()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {

                VStack(alignment: .leading, spacing: 4) {
                    Text("悬浮时钟").font(.largeTitle.weight(.bold))
                    Text("毫秒级走时 · 抢购倒计时 · 画中画浮窗")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                // 环形时钟
                HStack {
                    Spacer()
                    RingClockView(clockText: clockText, subText: "北京时间", progress: progress)
                    Spacer()
                }

                // 倒计时
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("距下一场 20:00").font(.subheadline)
                        Spacer()
                        Text(countdown)
                            .font(.system(size: 26, weight: .semibold))
                            .monospacedDigit()
                    }
                    Text("每天 20:00 · 北京时间")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(16)
                .background(Color.secondary.opacity(0.09), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                // 画中画：同屏预览 + 开关 + 诊断
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("画中画").font(.headline)
                        Spacer()
                        Text(pipStatusText)
                            .font(.caption)
                            .foregroundStyle(pip.active ? Color.green : .secondary)
                    }

                    PiPDisplayLayerView(displayLayer: pip.displayLayer)
                        .aspectRatio(2, contentMode: .fit)
                        .frame(maxWidth: .infinity)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(Color.secondary.opacity(0.25), lineWidth: 1)
                        )

                    Text("↑ 这块就是画中画窗口里的画面（实时渲染，不是截图）")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    if pip.supported {
                        Button {
                            if pip.active {
                                pip.stop()
                            } else {
                                pip.start()
                            }
                            pip.refreshState()
                        } label: {
                            Text(pip.active ? "关闭画中画" : "开启画中画")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 4)
                        }
                        .buttonStyle(.borderedProminent)
                        // 故意不禁用：即便 possible 还没置位，点一下也会触发自动重试并把原因写出来，
                        // 禁用它反而会让人觉得「点了没反应」
                    } else {
                        Text("当前设备不支持画中画")
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }

                    if let err = pip.lastError {
                        Text(err)
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }

                    Text(pipDebugText)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(16)
                .background(Color.secondary.opacity(0.07), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                // 说明
                VStack(alignment: .leading, spacing: 8) {
                    Text("用法").font(.subheadline.weight(.semibold))
                    Text("1. 点「开启画中画」，画面会缩成小窗；\n2. 上滑回桌面或打开微信等 App，小窗会一直浮在最上层；\n3. 拖动小窗可移动，点小窗上的按钮可放大 / 暂停 / 关闭；\n4. 开启后直接切到后台也会自动进入画中画。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Text("限制").font(.subheadline.weight(.semibold)).padding(.top, 6)
                    Text("• 画中画窗口的尺寸与位置由系统决定（约 2:1）；\n• 离开 App 后靠「音频后台 + 静音保活」维持，被系统回收时回 App 再点一次；\n• iOS 不允许第三方 App 向其它应用派发点击，所以这里只能显示、不能自动点抢购按钮。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(20)
        }
        .onAppear {
            refresh()
            PiPClockController.shared.prepareIfNeeded()
        }
        .onReceive(timer) { _ in
            refresh()
            PiPClockController.shared.refreshState()
        }
    }

    // MARK: - 文案

    private var pipStatusText: String {
        if !pip.supported { return "系统不支持" }
        if pip.active { return "运行中" }
        if pip.possible { return "就绪，可开启" }
        return "准备中…"
    }

    private var pipDebugText: String {
        "支持 \(pip.supported ? "是" : "否") · 可开启 \(pip.possible ? "是" : "否") · 运行中 \(pip.active ? "是" : "否")"
    }

    private func refresh() {
        let now = Date()
        let parts = BeijingTime.now(source: "beijing")
        let text = BeijingTime.clockText(parts)
        let pr = (Double(parts.second) + Double(parts.milli) / 1000) / 60
        if BeijingTime.remain(targetDate, now: now) <= 0 {
            targetDate = BeijingTime.nextBeijing(hour: 20, minute: 0, second: 0, from: now)
        }
        let cd = BeijingTime.countdownText(BeijingTime.remain(targetDate, now: now))
        if text != clockText { clockText = text }
        if cd != countdown { countdown = cd }
        if abs(pr - progress) > 0.0005 { progress = pr }
    }
}
