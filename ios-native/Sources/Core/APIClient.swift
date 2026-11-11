import Foundation

struct APIError: LocalizedError, Equatable {
    let status: Int
    let message: String
    var errorDescription: String? { message }

    static let unreachable = APIError(status: 0, message: "Не удалось подключиться к компьютеру. Проверьте адрес и что сервер запущен.")
    static let notOurServer = APIError(status: 0, message: "По этому адресу отвечает не LLM Chat.")
}

/// Запросы к серверу LLM Chat на ПК. Вход — по bearer-токену, как у сайта.
final class APIClient {
    let baseURL: URL
    var token: String?
    private let session: URLSession

    init(baseURL: URL, token: String? = nil) {
        self.baseURL = baseURL
        self.token = token
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.waitsForConnectivity = false
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        session = URLSession(configuration: config)
    }

    /// Приводит ввод вроде `192.168.1.5:8000` к адресу со схемой и без хвостового `/`.
    static func normalize(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.lowercased().hasPrefix("http://") && !text.lowercased().hasPrefix("https://") {
            text = "http://" + text
        }
        while text.hasSuffix("/") { text.removeLast() }
        guard let url = URL(string: text), let host = url.host, !host.isEmpty else { return nil }
        return url
    }

    private func makeRequest(_ path: String, method: String, json: [String: Any]?) throws -> URLRequest {
        guard let url = URL(string: baseURL.absoluteString + path) else { throw APIError.unreachable }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let json {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        return request
    }

    /// Возвращает тело и код ответа; сетевые сбои превращает в понятную ошибку.
    private func raw(_ path: String, method: String, json: [String: Any]?) async throws -> (Data, Int) {
        let request = try makeRequest(path, method: method, json: json)
        do {
            let (data, response) = try await session.data(for: request)
            return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw APIError.unreachable
        }
    }

    /// Текст ошибки FastAPI: `{"detail": "..."}` или список проверок.
    private static func detail(from data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        if let text = object["detail"] as? String { return text }
        if let items = object["detail"] as? [[String: Any]], let first = items.first?["msg"] as? String { return first }
        return nil
    }

    func send<T: Decodable>(_ path: String, method: String = "GET", json: [String: Any]? = nil) async throws -> T {
        let (data, status) = try await raw(path, method: method, json: json)
        guard (200..<300).contains(status) else {
            throw APIError(status: status, message: Self.detail(from: data) ?? "Сервер ответил ошибкой \(status).")
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError(status: status, message: "Сервер прислал неожиданный ответ.")
        }
    }

    /// Проверка адреса без входа: `/api/auth/me` отвечает 401 с JSON — значит, это наш сервер.
    func probe() async throws {
        let (data, status) = try await raw("/api/auth/me", method: "GET", json: nil)
        let isJSON = (try? JSONSerialization.jsonObject(with: data)) is [String: Any]
        guard isJSON, status == 401 || (200..<300).contains(status) else { throw APIError.notOurServer }
    }

    func login(username: String, password: String) async throws -> AuthResponse {
        try await send("/api/auth/login", method: "POST", json: ["username": username, "password": password])
    }

    func me() async throws -> AuthResponse {
        try await send("/api/auth/me")
    }

    func logout() async {
        _ = try? await raw("/api/auth/logout", method: "POST", json: nil)
    }

    func chats() async throws -> [ChatSummary] {
        let response: ChatListResponse = try await send("/api/chats")
        return response.chats
    }
}
