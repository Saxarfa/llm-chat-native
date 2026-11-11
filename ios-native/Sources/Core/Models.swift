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
    let title: String
    let pinned: Bool
    let updatedAt: Double

    enum CodingKeys: String, CodingKey {
        case id, title, pinned, updatedAt
        case updatedAtSnake = "updated_at"
    }

    init(id: String, title: String, pinned: Bool = false, updatedAt: Double = 0) {
        self.id = id
        self.title = title
        self.pinned = pinned
        self.updatedAt = updatedAt
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
    }
}

struct ChatListResponse: Decodable {
    let chats: [ChatSummary]
}

/// Сообщение в том виде, в каком его хранит сервер. Читаются только поля, нужные ленте;
/// содержимое вложений (base64) намеренно не разбирается.
struct ChatMessage: Decodable {
    let id: String
    let role: String
    let content: String
    let model: String?
    let reasoning: String?
    let attachmentNames: [String]
    let imageCount: Int

    private struct Named: Decodable {
        let name: String?
    }

    private struct Ignored: Decodable {
        init(from decoder: Decoder) throws {}
    }

    enum CodingKeys: String, CodingKey {
        case id, role, content, model, reasoning, attachments
        case generatedImages = "generated_images"
        case webImages = "web_images"
    }

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

    init(from decoder: Decoder) throws {
        let box = try decoder.container(keyedBy: CodingKeys.self)
        id = ((try? box.decodeIfPresent(String.self, forKey: .id)) ?? nil) ?? UUID().uuidString
        role = ((try? box.decodeIfPresent(String.self, forKey: .role)) ?? nil) ?? "assistant"
        content = ((try? box.decodeIfPresent(String.self, forKey: .content)) ?? nil) ?? ""
        model = (try? box.decodeIfPresent(String.self, forKey: .model)) ?? nil
        reasoning = (try? box.decodeIfPresent(String.self, forKey: .reasoning)) ?? nil
        let files = ((try? box.decodeIfPresent([Named].self, forKey: .attachments)) ?? nil) ?? []
        attachmentNames = files.map { ($0.name ?? "").isEmpty ? "Файл" : ($0.name ?? "") }
        let generated = ((try? box.decodeIfPresent([Ignored].self, forKey: .generatedImages)) ?? nil) ?? []
        let web = ((try? box.decodeIfPresent([Ignored].self, forKey: .webImages)) ?? nil) ?? []
        imageCount = generated.count + web.count
    }
}

struct ChatDetailResponse: Decodable {
    struct Detail: Decodable {
        let messages: [ChatMessage]
    }

    let chat: Detail
}

/// Сообщение, подготовленное для ленты: Markdown разобран один раз при загрузке.
struct FeedMessage: Identifiable, Equatable {
    let id: String
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
