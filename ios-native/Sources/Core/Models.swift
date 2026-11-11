import Foundation

struct User: Decodable, Equatable {
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
        title = cleaned.isEmpty ? "Новый чат" : cleaned
        pinned = ((try? box.decodeIfPresent(Bool.self, forKey: .pinned)) ?? nil) ?? false
        let camel = (try? box.decodeIfPresent(Double.self, forKey: .updatedAt)) ?? nil
        let snake = (try? box.decodeIfPresent(Double.self, forKey: .updatedAtSnake)) ?? nil
        updatedAt = camel ?? snake ?? 0
        modelID = ((try? box.decodeIfPresent(String.self, forKey: .modelID)) ?? nil) ?? ""
    }
}

struct ChatListResponse: Decodable {
    let chats: [ChatSummary]
}

/// Сообщение в том виде, в каком его хранит сервер. Читаются только поля, нужные ленте;
/// содержимое вложений (base64) намеренно не трогается.
struct ChatMessage {
    let id: String
    let role: String
    let content: String
    let model: String?
    let reasoning: String?
    let attachmentNames: [String]
    let imageCount: Int

    init(id: String, role: String, content: String, model: String? = nil, reasoning: String? = nil,
         attachmentNames: [String] = [], imageCount: Int = 0) {
        self.id = id
        self.role = role
        self.content = content
        self.model = model
        self.reasoning = reasoning
        self.attachmentNames = attachmentNames
        self.imageCount = imageCount
    }

    init(json: [String: Any]) {
        id = (json["id"] as? String) ?? UUID().uuidString
        role = (json["role"] as? String) ?? "assistant"
        content = (json["content"] as? String) ?? ""
        model = json["model"] as? String
        reasoning = json["reasoning"] as? String
        let files = (json["attachments"] as? [[String: Any]]) ?? []
        attachmentNames = files.map { file in
            let name = (file["name"] as? String) ?? ""
            return name.isEmpty ? "Файл" : name
        }
        let generated = (json["generated_images"] as? [Any])?.count ?? 0
        let web = (json["web_images"] as? [Any])?.count ?? 0
        imageCount = generated + web
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
    let attachmentNames: [String]
    let imageCount: Int

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
                attachmentNames: message.attachmentNames,
                imageCount: message.imageCount
            ))
        }
        return result
    }
}
