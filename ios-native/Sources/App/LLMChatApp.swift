import SwiftUI

@main
struct LLMChatApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(.dark)
                .tint(Theme.ink)
                .task { await model.bootstrap() }
        }
    }
}

/// Выбирает экран по состоянию: адрес ПК, вход, нет связи или сам чат.
struct RootView: View {
    @Environment(AppModel.self) private var model

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
    }
}
