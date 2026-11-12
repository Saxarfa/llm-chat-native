import SwiftUI

/// Система будит приложение, когда фоновая загрузка модели закончилась.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String,
                     completionHandler: @escaping () -> Void) {
        guard identifier == DownloadCenter.identifier else {
            completionHandler()
            return
        }
        DownloadCenter.shared.backgroundCompletion = completionHandler
        // Сессию нужно создать заново, иначе события не придут; файл переносит сам делегат,
        // а список моделей сверится с папкой при следующем открытии.
        DownloadCenter.shared.reattach()
    }
}

@main
struct LLMChatApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .tint(Theme.ink)
                .task { await model.bootstrap() }
        }
    }
}

/// Выбирает экран по состоянию: адрес ПК, вход, нет связи или сам чат.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            Theme.canvas.ignoresSafeArea()
            switch model.phase {
            case .launching:
                Wordmark(size: 34)
            case .needsServer:
                ConnectView()
                    .transition(.opacity)
            case .needsLogin:
                LoginView()
                    .transition(.opacity)
            case .offline:
                OfflineView()
                    .transition(.opacity)
            case .ready:
                MainView(startOpen: model.preview == .sidebar)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: model.phase)
        .onChange(of: model.appearance, initial: true) { _, appearance in
            appearance.apply()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.resumed() }
        }
    }
}
