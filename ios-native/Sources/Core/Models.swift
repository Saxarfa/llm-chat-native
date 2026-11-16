import Foundation

struct User: Codable, Equatable {
    let id: Int
    let username: String
    let avatar: String?
    let displayName: String?

    enum CodingKeys: String, CodingKey {
        case id, username, avatar
        case displayName = "display_name"
    }

    /// Имя для приветствия: отображаемое, иначе логин.
    var shownName: String {
        let name = (displayName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? username : name
    }
}

struct AuthResponse: Decodable {
    let token: String
    let user: User
}

/// Строка списка диалогов. Сервер отдаёт больше полей — здесь только нужные списку.
struct ChatSummary: Decodable, Identifiable, Equatable {
    let id: String
    var title: String
    var pinned: Bool
    var updatedAt: Double
    var modelID: String
    /// Сессия «Инкогнито» (временный чат сервера `temp_…`): живёт только в памяти сервера,
    /// в списки шторки, «Недавних» и поиска не попадает.
    var temporary = false

    enum CodingKeys: String, CodingKey {
        case id, title, pinned, updatedAt
        case updatedAtSnake = "updated_at"
        case modelID = "model_id"
    }

    init(id: String, title: String, pinned: Bool = false, updatedAt: Double = 0, modelID: String = "") {
        self.id = id
        self.title = title
        self.pinned = pinned
        self.updatedAt = updatedAt
        self.modelID = modelID
    }

    init(from decoder: Decoder) throws {
        let box = try decoder.container(keyedBy: CodingKeys.self)
        if let text = try? box.decode(String.self, forKey: .id) {
            id = text
        } else {
            id = String(try box.decode(Int.self, forKey: .id))
        }
        let rawTitle = (try? box.decodeIfPresent(String.self, forKey: .title)) ?? nil
        let cleaned = (rawTitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        // Сервер называет пустой чат «Новый чат» (и сайт показывает так же); в приложении это «Новая сессия».
        title = cleaned.isEmpty || cleaned == "Новый чат" ? "Новая сессия" : cleaned
        pinned = ((try? box.decodeIfPresent(Bool.self, forKey: .pinned)) ?? nil) ?? false
        let camel = (try? box.decodeIfPresent(Double.self, forKey: .updatedAt)) ?? nil
        let snake = (try? box.decodeIfPresent(Double.self, forKey: .updatedAtSnake)) ?? nil
        updatedAt = camel ?? snake ?? 0
        modelID = ((try? box.decodeIfPresent(String.self, forKey: .modelID)) ?? nil) ?? ""
        temporary = id.hasPrefix("temp_")
    }
}

struct ChatListResponse: Decodable {
    let chats: [ChatSummary]
}

/// Сообщение в том виде, в каком его хранит сервер. Читаются только поля, нужные ленте.
/// Байты вложений-картинок уходят в `ImageStore`, в самом сообщении остаётся только ключ.
struct ChatMessage {
    let id: String
    let role: String
    let content: String
    let model: String?
    let reasoning: String?
    let attachments: [FeedAttachment]
    let arts: [FeedArt]
    /// Варианты ответа (после «Ответить заново»): сколько их и какой показан.
    var variantCount = 0
    var variantIndex = 0
    /// Источники веб-поиска и баз знаний (`sources` сообщения, как «Источники ответа» на сайте).
    var sources: [FeedSource] = []
    /// Варианты продолжения разговора (`suggestions`, сервер пишет их последнему ответу).
    var suggestions: [String] = []

    init(id: String, role: String, content: String, model: String? = nil, reasoning: String? = nil,
         attachments: [FeedAttachment] = [], arts: [FeedArt] = []) {
        self.id = id
        self.role = role
        self.content = content
        self.model = model
        self.reasoning = reasoning
        self.attachments = attachments
        self.arts = arts
    }

    init(json: [String: Any]) {
        let messageID = (json["id"] as? String) ?? UUID().uuidString
        id = messageID
        role = (json["role"] as? String) ?? "assistant"
        content = (json["content"] as? String) ?? ""
        model = json["model"] as? String
        reasoning = json["reasoning"] as? String
        let files = (json["attachments"] as? [[String: Any]]) ?? []
        attachments = files.enumerated().map { index, file in
            let name = (file["name"] as? String) ?? ""
            let url = (file["dataUrl"] as? String) ?? ""
            let key = ChatMessage.attachmentKey(message: messageID, index: index)
            let kind = FeedAttachment.kind(ofDataURL: url)
            if kind == .image, ImageStore.data(key) == nil, let bytes = ImageStore.decode(dataURL: url) {
                ImageStore.put(bytes, key: key)
            }
            return FeedAttachment(id: key, name: name.isEmpty ? "Файл" : name, kind: kind)
        }
        arts = FeedArt.list(json["generated_images"])
        let variants = (json["variants"] as? [Any])?.count ?? 0
        variantCount = variants
        let chosen = (json["current_variant_index"] as? NSNumber)?.intValue ?? (variants - 1)
        variantIndex = max(0, min(chosen, variants - 1))
        sources = FeedSource.list(json["sources"])
        suggestions = ((json["suggestions"] as? [Any]) ?? []).compactMap { item in
            guard let text = (item as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
            return text
        }
    }

    static func attachmentKey(message: String, index: Int) -> String {
        "att:\(message):\(index)"
    }
}

/// Сообщение, подготовленное для ленты: Markdown разобран один раз при загрузке.
struct FeedMessage: Identifiable, Equatable {
    let id: String
    /// Идентификатор сообщения на сервере (в `id` к нему добавлен номер в ленте).
    let rawID: String
    let isUser: Bool
    let text: String
    let blocks: [MarkdownBlock]
    let reasoning: String
    let model: String
    let attachments: [FeedAttachment]
    let arts: [FeedArt]
    var variantCount = 0
    var variantIndex = 0
    var sources: [FeedSource] = []
    var suggestions: [String] = []

    static func build(from messages: [ChatMessage]) -> [FeedMessage] {
        var result: [FeedMessage] = []
        for message in messages where message.role == "user" || message.role == "assistant" {
            let isUser = message.role == "user"
            let text = message.content.trimmingCharacters(in: .whitespacesAndNewlines)
            result.append(FeedMessage(
                // Номер в начале защищает ленту от повторяющихся id в старых чатах.
                id: "\(result.count)-\(message.id)",
                rawID: message.id,
                isUser: isUser,
                text: text,
                blocks: isUser ? [] : MarkdownParser.parse(text),
                reasoning: (message.reasoning ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                model: message.model ?? "",
                attachments: message.attachments,
                arts: message.arts,
                variantCount: message.variantCount,
                variantIndex: message.variantIndex,
                sources: isUser ? [] : message.sources,
                suggestions: isUser ? [] : message.suggestions
            ))
        }
        return result
    }
}

/// Источник ответа — перенос `webSources.ts` сайта: настоящий сайт (у ссылок Google Search он только
/// в названии), заголовок, адрес для открытия. Источник из базы знаний открыть по ссылке нельзя.
struct FeedSource: Identifiable, Equatable {
    let id: Int
    let title: String
    let host: String
    let url: URL?
    let note: String?
    let knowledge: Bool

    private static let googleRedirect = "vertexaisearch.cloud.google.com"

    static func list(_ value: Any?) -> [FeedSource] {
        ((value as? [[String: Any]]) ?? []).enumerated().compactMap { index, raw in
            let knowledge = (raw["kind"] as? String) == "knowledge"
            let link = web(raw["resolved_url"]).flatMap { isRedirect($0) ? nil : $0 } ?? web(raw["url"])
            let siteName = ((raw["site_name"] as? String) ?? "").trimmingCharacters(in: .whitespaces)
            let title = ((raw["title"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            var host = ""
            if knowledge {
                host = siteName
            } else if let link, !isRedirect(link), let name = link.host {
                host = bare(name)
            } else {
                // Ссылка Google Search ведёт на переадресацию: сайт известен только по названию.
                host = [title, siteName].map(bare).first(where: domainLike) ?? ""
            }
            guard knowledge || link != nil || !title.isEmpty else { return nil }
            var note: String?
            if knowledge {
                let heading = ((raw["heading"] as? String) ?? "").trimmingCharacters(in: .whitespaces)
                let page = (raw["page"] as? NSNumber).map { "стр. \($0.intValue)" }
                let parts = [heading.isEmpty ? nil : heading, page].compactMap { $0 }
                note = parts.isEmpty ? nil : parts.joined(separator: " · ")
            }
            return FeedSource(id: index, title: title.isEmpty ? (host.isEmpty ? "Источник" : host) : title,
                              host: host, url: knowledge ? nil : link, note: note, knowledge: knowledge)
        }
    }

    /// Значок сайта — `/favicon.ico` на самом сайте (как у сайта LLM Chat); у переадресаций — по имени.
    var favicon: URL? {
        guard !knowledge, !host.isEmpty else { return nil }
        if let url, let scheme = url.scheme, let name = url.host, !Self.isRedirect(url) {
            return URL(string: "\(scheme)://\(name)/favicon.ico")
        }
        return URL(string: "https://\(host)/favicon.ico")
    }

    private static func web(_ value: Any?) -> URL? {
        guard let text = value as? String, let url = URL(string: text.trimmingCharacters(in: .whitespaces)),
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http", url.host != nil else { return nil }
        return url
    }

    private static func isRedirect(_ url: URL) -> Bool {
        let name = (url.host ?? "").lowercased()
        return name == googleRedirect || name.hasSuffix("." + googleRedirect)
    }

    private static func bare(_ value: String) -> String {
        let text = value.trimmingCharacters(in: .whitespaces).lowercased()
        return text.hasPrefix("www.") ? String(text.dropFirst(4)) : text
    }

    private static func domainLike(_ value: String) -> Bool {
        value.range(of: "^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$", options: .regularExpression) != nil
    }
}
