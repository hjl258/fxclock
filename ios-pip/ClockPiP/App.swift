import SwiftUI

@main
struct ClockPiPApp: App {

    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .onChange(of: scenePhase) { _, phase in
            // 进入后台时确保音频会话与画中画控制器已就绪，
            // 这样 canStartPictureInPictureAutomaticallyFromInline 才能自动进入画中画
            if phase == .background {
                PiPClockController.shared.prepareIfNeeded()
            }
        }
    }
}