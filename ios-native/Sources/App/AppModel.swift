import Foundation
import Observation

/// Состояние приложения: адрес ПК, вход, список диалогов.
@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable {
        case launching, needsServer, needsLogin, offline, ready
    }

    var phase: Phase = .launching
    var serverURL: URL?
    var user: User?
    var chats: [ChatSummary] = []
    var chatsLoading = false
    var chatsError: String?
    var activeChatID: String?

    let preview: PreviewScene?
    @ObservationIgnored private var api: APIClient?

    private static let serverKey = "server_url"
    private static let tokenKey = "token"

    init(preview: PreviewScene? = PreviewScene.current) {
        self.preview = preview
    }

    var activeChat: ChatSummary? {
        chats.first { $0.id == activeChatID }
    }

    /// Адрес без схемы — для подписи на экране входа.
    var serverLabel: String {
        guard let url = serverURL, let host = url.host else { return "" }
        if let port = url.port { return "\(host):\(port)" }
        return host
    }

    func bootstrap() async {
        if let preview {
            applyPreview(preview)
            return
        }
        guard let saved = UserDefaults.standard.string(forKey: Self.serverKey),
              let url = APIClient.normalize(saved) else {
            phase = .needsServer
            return
        }
        serverURL = url
        guard let token = Keychain.get(Self.tokenKey), !token.isEmpty else {
            api = APIClient(baseURL: url)
            phase = .needsLogin
            return
        }
        api = APIClient(baseURL: url, token: token)
        await restoreSession()
    }

    /// Проверяет сохранённый вход; сервер заодно выдаёт свежий токен.
    func restoreSession() async {
        guard let api else {
            phase = .needsServer
            return
        }
        do {
            let auth = try await api.me()
            accept(auth)
            await refreshChats()
        } catch let error as APIError where error.status == 401 {
            Keychain.set(nil, for: Self.tokenKey)
            api.token = nil
            phase = .needsLogin
        } catch {
            phase = .offline
        }
    }

    func connect(to raw: String) async throws {
        guard let url = APIClient.normalize(raw) else {
            throw APIError(status: 0, message: "Введите адрес компьютера, например 192.168.1.5:8000.")
        }
        let client = APIClient(baseURL: url)
        try await client.probe()
        UserDefaults.standard.set(url.absoluteString, forKey: Self.serverKey)
        Keychain.set(nil, for: Self.tokenKey)
        serverURL = url
        api = client
        phase = .needsLogin
    }

    func login(username: String, password: String) async throws {
        guard let api else { throw APIError.unreachable }
        let auth = try await api.login(username: username, password: password)
        accept(auth)
        await refreshChats()
    }

    func logout() async {
        await api?.logout()
        Keychain.set(nil, for: Self.tokenKey)
        api?.token = nil
        user = nil
        chats = []
        activeChatID = nil
        phase = .needsLogin
    }

    func changeServer() {
        phase = .needsServer
    }

    func refreshChats() async {
        guard preview == nil, let api else { return }
        chatsLoading = true
        defer { chatsLoading = false }
        do {
            chats = try await api.chats()
            chatsError = nil
            if let active = activeChatID, !chats.contains(where: { $0.id == active }) {
                activeChatID = nil
            }
        } catch let error as APIError where error.status == 401 {
            await logout()
        } catch {
            chatsError = (error as? APIError)?.message ?? "Не удалось загрузить диалоги."
        }
    }

    private func accept(_ auth: AuthResponse) {
        api?.token = auth.token
        Keychain.set(auth.token, for: Self.tokenKey)
        user = auth.user
        phase = .ready
    }

    private func applyPreview(_ scene: PreviewScene) {
        serverURL = URL(string: "http://192.168.1.5:8000")
        switch scene {
        case .connect:
            phase = .needsServer
        case .login:
            phase = .needsLogin
        case .offline:
            phase = .offline
        case .chat, .sidebar:
            user = PreviewScene.user
            chats = PreviewScene.chats
            phase = .ready
        }
    }
}
