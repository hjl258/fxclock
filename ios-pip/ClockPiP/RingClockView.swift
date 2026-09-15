import SwiftUI

/// 环形时钟（与小程序端同一套设计）：60 格刻度（每 5 格加长）、淡紫进度弧、
/// 四色定位点、中心闹钟徽标 + 毫秒级大字。用 SwiftUI Canvas 画，纯矢量、不依赖图片资源。
struct RingClockView: View {

    var clockText: String
    var subText: String
    /// 0…1：当前分钟内已走过的比例（进度弧扫过的比例）
    var progress: Double

    var side: CGFloat = 250

    var body: some View {
        ZStack {
            Canvas { ctx, canvasSize in
                let c = CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2)
                let R = min(canvasSize.width, canvasSize.height) / 2 - 4

                // 1. 外盘（线性渐变）
                let faceRect = CGRect(x: c.x - R, y: c.y - R, width: R * 2, height: R * 2)
                ctx.fill(Path(ellipseIn: faceRect), with: .linearGradient(
                    Gradient(colors: [
                        Color(red: 1.00, green: 1.00, blue: 1.00),
                        Color(red: 0.984, green: 0.988, blue: 0.996),
                        Color(red: 0.910, green: 0.925, blue: 0.961)
                    ]),
                    startPoint: CGPoint(x: c.x - R, y: c.y - R),
                    endPoint: CGPoint(x: c.x + R, y: c.y + R)
                ))

                // 2. 内盘（径向渐变，高光偏上）
                let rIn = R * 0.88
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - rIn, y: c.y - rIn, width: rIn * 2, height: rIn * 2)),
                         with: .radialGradient(
                            Gradient(colors: [
                                Color(red: 1.00, green: 1.00, blue: 1.00),
                                Color(red: 0.969, green: 0.973, blue: 0.988),
                                Color(red: 0.933, green: 0.945, blue: 0.973)
                            ]),
                            center: CGPoint(x: c.x, y: c.y - rIn * 0.22),
                            startRadius: rIn * 0.12,
                            endRadius: rIn * 1.04
                         ))

                // 3. 内外盘之间的高光分隔线
                let rLine = rIn + (R - rIn) * 0.42
                ctx.stroke(Path(ellipseIn: CGRect(x: c.x - rLine, y: c.y - rLine, width: rLine * 2, height: rLine * 2)),
                           with: .color(Color.white.opacity(0.85)), lineWidth: 1)

                // 4. 刻度：60 格，每 5 格加长
                let outer = R * 0.982
                for i in 0..<60 {
                    let a = -Double.pi / 2 + Double(i) * 2 * Double.pi / 60
                    let major = i % 5 == 0
                    let inner = outer - (major ? R * 0.062 : R * 0.036)
                    var tick = Path()
                    tick.move(to: CGPoint(x: c.x + CGFloat(cos(a)) * outer, y: c.y + CGFloat(sin(a)) * outer))
                    tick.addLine(to: CGPoint(x: c.x + CGFloat(cos(a)) * inner, y: c.y + CGFloat(sin(a)) * inner))
                    ctx.stroke(tick,
                               with: .color(Color(red: 0.282, green: 0.329, blue: 0.486).opacity(major ? 0.34 : 0.15)),
                               style: StrokeStyle(lineWidth: major ? max(2, R * 0.0135) : max(1.2, R * 0.0075),
                                                  lineCap: .round))
                }

                // 5. 进度弧（当前分钟内走过的比例）
                if progress > 0.004 {
                    let rArc = R * 0.862
                    var arc = Path()
                    arc.addArc(center: c,
                               radius: rArc,
                               startAngle: .degrees(-90),
                               endAngle: .degrees(-90 + min(359.9, progress * 360)),
                               clockwise: false)
                    ctx.stroke(arc, with: .linearGradient(
                        Gradient(colors: [
                            Color(red: 0.776, green: 0.804, blue: 0.965),
                            Color(red: 0.706, green: 0.741, blue: 0.949),
                            Color(red: 0.639, green: 0.686, blue: 0.941)
                        ]),
                        startPoint: CGPoint(x: c.x - R, y: c.y - R),
                        endPoint: CGPoint(x: c.x + R * 0.7, y: c.y + R)
                    ), style: StrokeStyle(lineWidth: max(3, R * 0.026), lineCap: .round))
                }

                // 6. 四色定位点
                let dots: [(Double, Color)] = [
                    (-90, Color(red: 0.310, green: 0.831, blue: 0.910)),
                    (0, Color(red: 0.545, green: 0.486, blue: 0.878)),
                    (90, Color(red: 0.310, green: 0.831, blue: 0.910)),
                    (180, Color(red: 0.949, green: 0.635, blue: 0.722))
                ]
                for (deg, color) in dots {
                    let a = deg * Double.pi / 180
                    let r = max(2.6, R * 0.022)
                    let pt = CGPoint(x: c.x + CGFloat(cos(a)) * R * 0.93, y: c.y + CGFloat(sin(a)) * R * 0.93)
                    ctx.fill(Path(ellipseIn: CGRect(x: pt.x - r, y: pt.y - r, width: r * 2, height: r * 2)),
                             with: .color(color))
                }
            }
            .frame(width: side, height: side)

            // 中心内容（与小程序一致：徽标 + 大字 + 副标题）
            VStack(spacing: 0) {
                Image(systemName: "alarm")
                    .font(.system(size: 22, weight: .regular))
                    .foregroundStyle(Color(red: 0.561, green: 0.584, blue: 0.776))
                    .frame(width: 44, height: 44)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(LinearGradient(colors: [
                                Color(red: 0.949, green: 0.957, blue: 1.0),
                                Color(red: 0.914, green: 0.925, blue: 0.984)
                            ], startPoint: .top, endPoint: .bottom))
                    )
                    .padding(.bottom, 10)

                Text(clockText)
                    .font(.system(size: 34, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(Color(red: 0.106, green: 0.122, blue: 0.165))

                Text(subText)
                    .font(.system(size: 13))
                    .foregroundStyle(Color(red: 0.596, green: 0.627, blue: 0.702))
                    .padding(.top, 6)
            }
        }
        .frame(width: side, height: side)
    }
}
