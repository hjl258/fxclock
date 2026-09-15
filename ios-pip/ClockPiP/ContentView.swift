import SwiftUI

struct ContentView: View {

    @State private var clockText = "--:--:--.-"
    @State private var hhmm = "--:--"
    @State private var countdown = "--:--:--:0"
    @State private var pipActive = false
    @State private var supported = true

    private let timer = Timer.publish(every: 0.1, on: .main, in: .common).autoconnect()

    private var target: Date { BeijingTime.nextBeijing(hour: 20, minute: 0, second: 0) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {

                Text("悬浮时钟 · 画中画")
                    .font(.title2.weight(.bold))

                Text("毫秒级走时 + 抢购倒计时，开启画中画后可浮在桌面与其它 App 之上")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                VStack(alignment: .leading, spacing: 6) {
                    Text(clockText)
                        .font(.system(size: 52, weight: .bold, design: .default))
                        .monospacedDigit()
                    Text("北京时间")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 14)

                HStack {
                    Text("距下一场 20:00")
                    Spacer()
                    Text(countdown).monospacedDigit().fontWeight(.semibold)
                }
                .font(.callout)
                .padding(14)
                .background(Color.secondary.opacity(0.10), in: RoundedRectangle(cornerRadius: 14))

                if supported {
                    Button {
                        if PiPClockController.shared.isActive {
                            PiPClockController.shared.stop()
                        } else {
                            PiPClockController.shared.start()
                        }
                        refreshPiPState()
                    } label: {
                        Text(pipActive ? "关闭画中画" : "开启画中画")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 4)
                    }
                    .buttonStyle(.borderedProminent)
                } else {
                    Text("当前设备不支持画中画")
                        .foregroundStyle(.red)
                }

                Text(pipStatusText)
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Divider().padding(.vertical, 6)

                VStack(alignment: .leading, spacing: 8) {
                    Text("用法").font(.subheadline.weight(.semibold))
                    Text("1. 点「开启画中画」，画中画窗口出现；\n2. 上滑回到桌面 / 打开微信等其它 App，时钟会一直浮在最上层；\n3. 拖动窗口可移动位置，点窗口上的按钮可放大、暂停或关闭；\n4. 也可以在开启后直接切到后台，会自动进入画中画。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("说明").font(.subheadline.weight(.semibold))
                    Text("• 画中画窗口由系统控制尺寸与位置（约 2:1 比例），内容按 10Hz 刷新，毫秒十分位实时跳动；\n• 离开 App 后画中画靠「音频后台 + 静音保活」维持；若系统回收，请重新打开 App 再点一次；\n• 倒计时以北京时间为准，与小程序、Android 版完全一致；\n• 画中画窗口的暂停/播放按钮会暂停或恢复刷新。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(22)
        }
        .onAppear {
            supported = PiPClockController.shared.isSupported
            PiPClockController.shared.prepareIfNeeded()
            refresh()
        }
        .onReceive(timer) { _ in
            refresh()
            refreshPiPState()
        }
    }

    private var pipStatusText: String {
        let c = PiPClockController.shared
        if !c.isSupported { return "画中画：系统不支持" }
        if c.isActive { return "画中画：运行中（可浮在桌面与其它 App 之上）" }
        if c.isPossible { return "画中画：就绪，点上方按钮开启" }
        return "画中画：准备中…（保持 App 在前台片刻）"
    }

    private func refresh() {
        let now = Date()
        let parts = BeijingTime.now(source: "beijing")
        clockText = BeijingTime.clockText(parts)
        hhmm = BeijingTime.hhmm(parts)
        countdown = BeijingTime.countdownText(BeijingTime.remain(target, now: now))
    }

    private func refreshPiPState() {
        pipActive = PiPClockController.shared.isActive
    }
}