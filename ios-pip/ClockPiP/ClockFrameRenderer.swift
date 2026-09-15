import UIKit
import CoreVideo

/// 把「毫秒时间 + 抢购倒计时」画进 CVPixelBuffer，供 PiP 的 AVSampleBufferDisplayLayer 使用。
/// 尺寸 2:1（480x240），与画中画窗口比例接近。
struct ClockFrameRenderer {

    static let size = CGSize(width: 480, height: 240)

    static let backgroundColor = UIColor(red: 0.02, green: 0.03, blue: 0.05, alpha: 1.0)
    static let timeColor = UIColor.white
    static let metaColor = UIColor(red: 0.56, green: 0.85, blue: 1.0, alpha: 1.0)

    private static let mono = UIFont.monospacedDigitSystemFont(ofSize: 68, weight: .bold)
    private static let meta = UIFont.monospacedDigitSystemFont(ofSize: 22, weight: .medium)

    /// 渲染一帧图像
    static func image(clockText: String, sourceLabel: String, countdownText: String, alert: Bool) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.image { ctx in
            let cg = ctx.cgContext
            let rect = CGRect(origin: .zero, size: size)
            backgroundColor.setFill()
            cg.fill(rect)

            // 左侧状态点
            let dotColor = alert ? UIColor.systemRed : UIColor(red: 0.24, green: 0.86, blue: 0.52, alpha: 1)
            dotColor.setFill()
            UIBezierPath(ovalIn: CGRect(x: 26, y: size.height / 2 - 7, width: 14, height: 14)).fill()

            // 主时间
            let timeAttrs: [NSAttributedString.Key: Any] = [
                .font: mono,
                .foregroundColor: timeColor
            ]
            let timeStr = NSAttributedString(string: clockText, attributes: timeAttrs)
            let timeSize = timeStr.size()
            timeStr.draw(at: CGPoint(x: 56, y: (size.height - timeSize.height) / 2 - 14))

            // 副标题：时间源 + 倒计时
            let metaAttrs: [NSAttributedString.Key: Any] = [
                .font: meta,
                .foregroundColor: metaColor
            ]
            let metaStr = NSAttributedString(string: "\(sourceLabel) | \(countdownText)", attributes: metaAttrs)
            metaStr.draw(at: CGPoint(x: 58, y: size.height / 2 + 44))
        }
    }

    /// 渲染并写入像素缓冲
    static func render(into pixelBuffer: CVPixelBuffer, clockText: String, sourceLabel: String, countdownText: String, alert: Bool) {
        let img = image(clockText: clockText, sourceLabel: sourceLabel, countdownText: countdownText, alert: alert)
        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }

        guard let base = CVPixelBufferGetBaseAddress(pixelBuffer),
              let cgImage = img.cgImage else { return }

        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue

        guard let context = CGContext(
            data: base,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
            space: colorSpace,
            bitmapInfo: bitmapInfo
        ) else { return }

        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    }
}