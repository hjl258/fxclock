import AVFoundation
import AVKit
import CoreMedia
import UIKit

/// 画中画悬浮时钟：把自绘内容渲染进 AVSampleBufferDisplayLayer，
/// 通过 AVPictureInPictureController 的 ContentSource 显示在画中画窗口里
/// —— 画中画窗口可以浮在桌面和其它 App 之上（iOS 15+ 支持非视频内容）。
///
/// ⚠️ 关键前提：ContentSource(sampleBufferDisplayLayer:) 要求这个 layer 已经挂在
/// 屏幕上的视图层级里（见 PiPDisplayLayerView），否则 isPictureInPicturePossible
/// 恒为 false，startPictureInPicture() 静默无效 —— 这就是「点了没反应」的根因。
final class PiPClockController: NSObject, ObservableObject {

    static let shared = PiPClockController()

    // MARK: - 对外状态（界面直接绑这些，出问题一眼能看出来）

    @Published private(set) var supported: Bool = AVPictureInPictureController.isPictureInPictureSupported()
    @Published private(set) var possible = false
    @Published private(set) var active = false
    @Published private(set) var lastError: String?

    /// 抢购目标：每天 20:00（北京时间）
    var targetHour = 20
    var targetMinute = 0

    /// 交给界面挂载：PiPDisplayLayerView 会把它 addSublayer 到自己身上
    let displayLayer = AVSampleBufferDisplayLayer()

    private var pipController: AVPictureInPictureController?
    private var pixelBufferPool: CVPixelBufferPool?
    private var timer: Timer?
    private var frameIndex: Int64 = 0
    private var target: Date = BeijingTime.nextBeijing(hour: 20, minute: 0, second: 0)
    private var prepared = false
    private var hosted = false
    private var retryLeft = 0

    private override init() { super.init() }

    // MARK: - 生命周期

    /// 显示层被挂上/移出窗口时由宿主视图通知
    func layerHosted(_ inWindow: Bool) {
        hosted = inWindow
        if inWindow {
            prepareIfNeeded()
        } else {
            // 离开窗口（例如页面被销毁）时，控制器要重新准备
            prepared = false
        }
    }

    /// 准备好控制器（幂等）。只有在显示层已经挂到界面上之后调用才有意义。
    func prepareIfNeeded() {
        guard !prepared, hosted, supported else { return }

        displayLayer.videoGravity = .resizeAspect
        if displayLayer.frame == .zero {
            displayLayer.frame = CGRect(origin: .zero, size: ClockFrameRenderer.size)
        }

        let source = AVPictureInPictureController.ContentSource(
            sampleBufferDisplayLayer: displayLayer,
            playbackDelegate: self
        )
        let controller = AVPictureInPictureController(contentSource: source)
        controller.delegate = self
        // 切到后台时自动进入画中画（要求音频会话已激活，见 SilenceAudioKeepAlive）
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        pipController = controller

        createPixelBufferPool()
        SilenceAudioKeepAlive.shared.start()
        enqueueFrame()   // 先喂一帧，避免画中画窗口一片黑
        prepared = true
        startTicking()   // 同屏预览也要实时跳动
        refreshState()
    }

    /// 界面定时器调用：刷新 possible / active
    func refreshState() {
        possible = pipController?.isPictureInPicturePossible ?? false
        active = pipController?.isPictureInPictureActive ?? false
    }

    /// 由用户操作触发（按钮点击 / 切后台自动）
    func start() {
        lastError = nil
        prepareIfNeeded()

        guard supported else {
            lastError = "这台设备/系统不支持画中画"
            return
        }
        guard hosted else {
            lastError = "画面还没挂到界面上，稍后重试"
            return
        }
        guard let controller = pipController else {
            lastError = "画中画控制器未就绪，稍后重试"
            return
        }
        guard !controller.isPictureInPictureActive else { return }

        if controller.isPictureInPicturePossible {
            controller.startPictureInPicture()
        } else {
            // 刚启动/刚从后台回来时 possible 可能还没置位，自动重试几次，别让用户以为没反应
            lastError = "画中画还没就绪，正在重试…"
            retryLeft = 6
            retryStart()
        }
    }

    private func retryStart() {
        guard retryLeft > 0 else {
            lastError = "画中画开启失败：画面尚未就绪。请保持 App 在前台，再点一次。"
            return
        }
        retryLeft -= 1
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            guard let self = self, let controller = self.pipController else { return }
            guard !controller.isPictureInPictureActive else { return }
            if controller.isPictureInPicturePossible {
                self.lastError = nil
                controller.startPictureInPicture()
            } else {
                self.refreshState()
                self.retryStart()
            }
        }
    }

    func stop() {
        pipController?.stopPictureInPicture()
        refreshState()
    }

    // MARK: - 帧渲染

    private func createPixelBufferPool() {
        let width = Int(ClockFrameRenderer.size.width)
        let height = Int(ClockFrameRenderer.size.height)
        let attrs: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
            kCVPixelBufferIOSurfacePropertiesKey as String: [:]
        ]
        var pool: CVPixelBufferPool?
        CVPixelBufferPoolCreate(kCFAllocatorDefault, nil, attrs as CFDictionary, &pool)
        pixelBufferPool = pool
    }

    private func enqueueFrame() {
        guard let pool = pixelBufferPool else { return }
        var pixelBufferOut: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pixelBufferOut) == kCVReturnSuccess,
              let pixelBuffer = pixelBufferOut else { return }

        let now = Date()
        let parts = BeijingTime.now(source: "beijing")
        if BeijingTime.remain(target, now: now) <= 0 {
            target = BeijingTime.nextBeijing(hour: targetHour, minute: targetMinute, second: 0, from: now)
        }
        let remain = BeijingTime.remain(target, now: now)
        let alert = remain <= 60

        ClockFrameRenderer.render(
            into: pixelBuffer,
            clockText: BeijingTime.clockText(parts),
            sourceLabel: "北京时间",
            countdownText: BeijingTime.countdownText(remain),
            alert: alert
        )

        guard let sampleBuffer = makeSampleBuffer(from: pixelBuffer) else { return }
        if displayLayer.status == .failed { displayLayer.flush() }
        displayLayer.enqueue(sampleBuffer)
    }

    private func makeSampleBuffer(from pixelBuffer: CVPixelBuffer) -> CMSampleBuffer? {
        var formatOut: CMVideoFormatDescription?
        guard CMVideoFormatDescriptionCreateForImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescriptionOut: &formatOut
        ) == noErr, let format = formatOut else { return nil }

        frameIndex += 1
        let fps: Int32 = 30
        var timing = CMSampleTimingInfo(
            duration: CMTime(value: 1, timescale: fps),
            presentationTimeStamp: CMTime(value: frameIndex, timescale: fps),
            decodeTimeStamp: .invalid
        )

        var sampleBufferOut: CMSampleBuffer?
        guard CMSampleBufferCreateReadyWithImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescription: format,
            sampleTiming: &timing,
            sampleBufferOut: &sampleBufferOut
        ) == noErr, let sampleBuffer = sampleBufferOut else { return nil }

        // 立即显示（不等时间轴），这样 10Hz 的刷新就能直接反映到画中画窗口
        if let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: true),
           CFArrayGetCount(attachments) > 0 {
            let dict = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
            CFDictionarySetValue(
                dict,
                Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
                Unmanaged.passUnretained(kCFBooleanTrue).toOpaque()
            )
        }
        return sampleBuffer
    }

    // MARK: - 定时刷新

    private func startTicking() {
        guard timer == nil else { return }
        let t = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.enqueueFrame()
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func stopTicking() {
        timer?.invalidate()
        timer = nil
    }
}

// MARK: - AVPictureInPictureControllerDelegate

extension PiPClockController: AVPictureInPictureControllerDelegate {

    func pictureInPictureControllerWillStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        lastError = nil
        refreshState()
    }

    func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        startTicking()
        refreshState()
    }

    func pictureInPictureControllerWillStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        refreshState()
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        refreshState()
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        lastError = "画中画启动失败：" + error.localizedDescription
        refreshState()
        print("画中画启动失败: \(error)")
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(true)
    }
}

// MARK: - AVPictureInPictureSampleBufferPlaybackDelegate

extension PiPClockController: AVPictureInPictureSampleBufferPlaybackDelegate {

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        setPlaying playing: Bool
    ) {
        if playing { startTicking() } else { stopTicking() }
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        didTransitionToRenderSize newRenderSize: CMVideoDimensions
    ) {
        // 画中画窗口尺寸变化，帧缓冲固定 2:1，交给 videoGravity 自适应
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        skipByInterval skipInterval: CMTime,
        completion completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }

    func pictureInPictureControllerTimeRangeForPlayback(
        _ pictureInPictureController: AVPictureInPictureController
    ) -> CMTimeRange {
        // 无限时长：画中画窗口的进度条不显示结束状态
        CMTimeRange(start: .negativeInfinity, duration: .positiveInfinity)
    }

    func pictureInPictureControllerIsPlaybackPaused(
        _ pictureInPictureController: AVPictureInPictureController
    ) -> Bool {
        false
    }
}
