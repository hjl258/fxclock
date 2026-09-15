import SwiftUI
import AVFoundation
import AVKit

/// 把 PiPClockController 的 AVSampleBufferDisplayLayer 挂到一个真实视图上。
///
/// ⚠️ 这一步是画中画能开启的**前提**（上一版就是漏了它，所以点「开启画中画」没反应）：
/// AVPictureInPictureController.ContentSource(sampleBufferDisplayLayer:) 要求这个 layer
/// 已经加在**屏幕上真实存在的视图层级**里，否则 isPictureInPicturePossible 会一直是 false，
/// 而 startPictureInPicture() 在 possible 为 false 时是**静默无副作用**的 —— 看起来就是「点了没反应」。
///
/// 顺便它也充当画中画的「同屏预览」：这里看到什么，画中画窗口里就是什么。
struct PiPDisplayLayerView: UIViewRepresentable {

    let displayLayer: AVSampleBufferDisplayLayer

    func makeUIView(context: Context) -> HostView {
        HostView(displayLayer: displayLayer)
    }

    func updateUIView(_ uiView: HostView, context: Context) {
        uiView.attach(displayLayer)
    }

    final class HostView: UIView {

        private var hosted: AVSampleBufferDisplayLayer?

        init(displayLayer: AVSampleBufferDisplayLayer) {
            super.init(frame: .zero)
            backgroundColor = .black
            clipsToBounds = true
            layer.cornerRadius = 12
            layer.cornerCurve = .continuous
            attach(displayLayer)
        }

        required init?(coder: NSCoder) {
            fatalError("init(coder:) has not been implemented")
        }

        func attach(_ displayLayer: AVSampleBufferDisplayLayer) {
            hosted = displayLayer
            if displayLayer.superlayer !== self.layer {
                displayLayer.removeFromSuperlayer()
                self.layer.addSublayer(displayLayer)
            }
            displayLayer.videoGravity = .resizeAspect
            displayLayer.isHidden = false
            setNeedsLayout()
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            guard let hosted = hosted else { return }
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            hosted.frame = bounds
            CATransaction.commit()
        }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            // layer 进入窗口之后才可能开启画中画；离开窗口要取消准备状态
            PiPClockController.shared.layerHosted(window != nil)
        }
    }
}
