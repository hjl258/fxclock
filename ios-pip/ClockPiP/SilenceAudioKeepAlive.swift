import AVFoundation

/// 画中画 + 后台渲染要求 App 具备 audio 后台能力，并且有活跃的音频会话。
/// 这里循环播放一段全 0 的音频（输出音量为 0），只用于保活，不会真的出声。
final class SilenceAudioKeepAlive {

    static let shared = SilenceAudioKeepAlive()

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var buffer: AVAudioPCMBuffer?
    private var running = false

    private init() {}

    func start() {
        guard !running else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .moviePlayback, options: [.mixWithOthers])
            try session.setActive(true)

            guard let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1) else { return }
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: format)

            let frames = AVAudioFrameCount(44100)
            guard let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return }
            buf.frameLength = frames
            if let ch = buf.floatChannelData {
                for i in 0..<Int(frames) { ch[0][i] = 0 }
            }
            buffer = buf

            engine.mainMixerNode.outputVolume = 0
            try engine.start()
            player.scheduleBuffer(buf, at: nil, options: [.loops], completionHandler: nil)
            player.play()
            running = true
        } catch {
            print("静音音频保活启动失败: \(error)")
        }
    }

    func stop() {
        guard running else { return }
        player.stop()
        engine.stop()
        running = false
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }
}