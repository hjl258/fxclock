import AVFoundation
import AVKit
import CoreMedia
import UIKit

/// 画中画悬浮时钟：把自定义内容渲染进 AVSampleBufferDisplayLayer，
/// 通过 AVPictureInPictureController 的 ContentSource 显示在画中画窗口里
/// —— 画中画窗口可以浮在桌面和其它 App 之上（iOS 15+ 支持非视频内容）。
final class PiPClockController: NSObject {

    static let shared = PiPClockController()

    /// 抢购目标：每天 20:00（北京时间）
    var targetHour = 20
    var targetMinute = 0

    private let displayLayer = AVSampleBufferDisplayLayer()
    private var pipController: AVPictureInPictureController?
    private var pixelBufferPool: CVPixelBufferPool?
    private var timer: Timer?
    private var frameIndex: Int64 = 0
    private var target: Date = BeijingTime.nextBeijing(hour: 20, minute: 0, second: 0)
    private var prepared = false

    private override init() { super.init() }

    var isActive: Bool { pipController?.isPictureInPictureActive ?? false }
    var isPossible: Bool { pipController?.isPictureInPicturePossible ?? false }
    var isSupported: Bool { AVPictureInPictureController.isPictureInPictureSupported() }

    /// 准备画中画控制器（App 启动即可调用，不消耗额外资源）
    func prepareIfNeeded() {
        guard !prepared else { return }
        guard isSupported else { return }

        displayLayer.frame = CGRect(origin: .zero, size: ClockFrameRenderer.size)
        displayLayer.videoGravity = .resizeAspect

        let source = AVPictureInPictureController.ContentSource(
            sampleBufferDisplayLayer: displayLayer,
            playbackDelegate: self
        )
        let controller = AVPictureInPictureController(contentSource: source)
        controller.delegate = self
        // 切到后台时自动进入画中画（要求音频会话已激活）
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        pipController = controller

        createPixelBufferPool()
        SilenceAudioKeepAlive.shared.start()
        enqueueFrame()   // 先喂一帧，避免画中画窗口一片黑
        prepared = true
    }

    /// 由用户操作触发（按钮点击 / 切后台自动）
    func start() {
        prepareIfNeeded()
        guard let controller = pipController else { return }
        guard !controller.isPictureInPictureActive else { return }
        controller.startPictureInPicture()
    }

    func stop() {
        pipController?.stopPictureInPicture()
        stopTicking()
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

    func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        startTicking()
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        stopTicking()
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        print("画中画启动失败: \(error)")
        stopTicking()
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