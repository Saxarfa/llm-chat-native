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
