import Foundation

struct APIError: LocalizedError, Equatable {
    let status: Int
    let message: String
    var errorDescription: String? { message }

    static let unreachable = APIError(status: 0, message: "Не удалось подключиться к компьютеру. Проверьте адрес и что сервер запущен.")
    static let notOurServer = APIError(status: 0, message: "По этому адресу отвечает не LLM Chat.")

    /// Сетевой сбой с понятной причиной: по одному «не удалось подключиться» не разобрать,
    /// что случилось — нет сети, молчит компьютер или запрос запретила сама iOS.
    static func network(_ error: Error) -> APIError {
        guard let code = (error as? URLError)?.code else { return unreachable }
        let reason: String
        switch code {
        case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed:
            reason = "Телефон не в сети. Если подключаетесь через Tailscale — проверьте, что он включён."
        case .timedOut:
            reason = "Компьютер не ответил вовремя. Проверьте, что сервер запущен, а Tailscale включён на обоих устройствах."
        case .cannotConnectToHost:
            reason = "Компьютер найден, но сервер не принимает подключение. Проверьте, что LLM Chat запущен и порт указан верно."
        case .cannotFindHost, .dnsLookupFailed:
            reason = "Адрес не найден. Проверьте, как он написан."
        case .appTransportSecurityRequiresSecureConnection:
            reason = "iOS запретила незашифрованное подключение к этому адресу."
        case .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate,
             .serverCertificateNotYetValid, .serverCertificateHasUnknownRoot:
            reason = "Не удалось установить защищённое соединение. Попробуйте адрес с http://."
        default:
            reason = "Не удалось подключиться к компьютеру. Проверьте адрес и что сервер запущен."
        }
        return APIError(status: 0, message: "\(reason) (код \(code.rawValue))")
    }
}

/// Запросы к серверу LLM Chat на ПК. Вход — по bearer-токену, как у сайта.
final class APIClient: @unchecked Sendable {
    let baseURL: URL
    var token: String?
    private let session: URLSession
    /// Отдельная сессия для долгого потока событий: без общего предела времени.
    private let streamSession: URLSession

    init(baseURL: URL, token: String? = nil) {
        self.baseURL = baseURL
        self.token = token
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.waitsForConnectivity = false
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        session = URLSession(configuration: config)
        let streaming = URLSessionConfiguration.default
        streaming.timeoutIntervalForRequest = 45
        streaming.timeoutIntervalForResource = 60 * 60 * 24
        streaming.httpCookieStorage = nil
        streaming.httpShouldSetCookies = false
        streaming.requestCachePolicy = .reloadIgnoringLocalCacheData
        streamSession = URLSession(configuration: streaming)
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
            // Отменённый запрос (пользователь ушёл в другой чат) — не сбой связи.
            if Task.isCancelled || (error as? URLError)?.code == .cancelled { throw CancellationError() }
            throw APIError.network(error)
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

    /// Запрос с ответом-словарём: для разделов, где сервер отдаёт произвольный JSON
    /// (настройки, параметры чата) и строгая модель только мешала бы.
    func json(_ path: String, method: String = "GET", body: [String: Any]? = nil,
              timeout: TimeInterval? = nil) async throws -> [String: Any] {
        var request = try makeRequest(path, method: method, json: body)
        if let timeout { request.timeoutInterval = timeout }
        let data: Data
        let status: Int
        do {
            let (payload, response) = try await session.data(for: request)
            data = payload
            status = (response as? HTTPURLResponse)?.statusCode ?? 0
        } catch {
            if Task.isCancelled || (error as? URLError)?.code == .cancelled { throw CancellationError() }
            throw APIError.network(error)
        }
        guard (200..<300).contains(status) else {
            throw APIError(status: status, message: Self.detail(from: data) ?? "Сервер ответил ошибкой \(status).")
        }
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw APIError(status: status, message: "Сервер прислал неожиданный ответ.")
        }
        return object
    }

    /// Файл с сервера (картинка), как есть.
    func data(_ path: String, timeout: TimeInterval = 60) async throws -> Data {
        var request = try makeRequest(path, method: "GET", json: nil)
        request.setValue("*/*", forHTTPHeaderField: "Accept")
        request.timeoutInterval = timeout
        do {
            let (payload, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(status) else {
                throw APIError(status: status, message: "Не удалось загрузить изображение.")
            }
            return payload
        } catch let error as APIError {
            throw error
        } catch {
            if Task.isCancelled || (error as? URLError)?.code == .cancelled { throw CancellationError() }
            throw APIError.network(error)
        }
    }

    static func pathSafe(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-_.~"))) ?? value
    }

    /// Поток событий сервера (`/api/sync/events`): живой ответ модели, смена названий и т.п.
    /// Каждое событие — одна строка `data: {json}`; строки `: heartbeat` раз в 15 секунд
    /// не дают соединению считаться зависшим.
    func events() -> AsyncThrowingStream<[String: Any], Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = try self.makeRequest("/api/sync/events", method: "GET", json: nil)
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    request.timeoutInterval = 45
                    let (bytes, response) = try await self.streamSession.bytes(for: request)
                    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                    guard status == 200 else {
                        throw APIError(status: status, message: "Соединение недоступно.")
                    }
                    // Разбор по байту перевода строки: готовый `lines` режет ещё и по
                    // редким символам-разделителям внутри текста ответа.
                    var buffer = Data()
                    let prefix = Data("data:".utf8)
                    for try await byte in bytes {
                        if byte != 0x0A {
                            buffer.append(byte)
                            continue
                        }
                        if buffer.starts(with: prefix),
                           let object = try? JSONSerialization.jsonObject(with: Data(buffer.dropFirst(prefix.count))) as? [String: Any] {
                            continuation.yield(object)
                        }
                        buffer.removeAll(keepingCapacity: true)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
