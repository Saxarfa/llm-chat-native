import Foundation

/// Чат с моделью телефона, сохранённый на самом телефоне (этап 8.2): так он открывается
/// и продолжается без связи с ПК, а при связи уходит туда снимком (`PUT /api/chats/{id}`).
struct LocalChat {
    var id: String
    var title: String
    var model: String
    /// Сообщения в том виде, как их хранит сервер.
    var messages: [[String: Any]]
    var overrides: [String: Any]
    var created: Double
    /// `updatedAt` чата на ПК; 0 — ПК этот чат ещё не видел.
    var serverUpdatedAt: Double
    /// Последнее изменение на телефоне — для порядка в списке.
    var changed: Double
    /// Есть изменения, которых нет на ПК.
    var dirty: Bool
    var pinned = false

    var summary: ChatSummary {
        ChatSummary(id: id, title: title, pinned: pinned, updatedAt: max(changed, serverUpdatedAt), modelID: model)
    }

    var json: [String: Any] {
        ["id": id, "title": title, "model": model, "messages": messages, "overrides": overrides,
         "created": created, "serverUpdatedAt": serverUpdatedAt, "changed": changed, "dirty": dirty, "pinned": pinned]
    }

    init(id: String, title: String, model: String, messages: [[String: Any]], overrides: [String: Any],
         created: Double, serverUpdatedAt: Double, changed: Double, dirty: Bool, pinned: Bool = false) {
        self.id = id
        self.title = title
        self.model = model
        self.messages = messages
        self.overrides = overrides
        self.created = created
        self.serverUpdatedAt = serverUpdatedAt
        self.changed = changed
        self.dirty = dirty
        self.pinned = pinned
    }

    init?(json: [String: Any]) {
        guard let id = json["id"] as? String, !id.isEmpty else { return nil }
        self.id = id
        title = (json["title"] as? String) ?? "Новый диалог"
        model = (json["model"] as? String) ?? ""
        messages = (json["messages"] as? [[String: Any]]) ?? []
        overrides = (json["overrides"] as? [String: Any]) ?? [:]
        created = (json["created"] as? NSNumber)?.doubleValue ?? 0
        serverUpdatedAt = (json["serverUpdatedAt"] as? NSNumber)?.doubleValue ?? 0
        changed = (json["changed"] as? NSNumber)?.doubleValue ?? 0
        dirty = (json["dirty"] as? Bool) ?? false
        pinned = (json["pinned"] as? Bool) ?? false
    }
}

/// Хранилище чатов телефона и снимка входа: папка `Application Support/PhoneChats`,
/// по файлу на чат плюс `session.json` (пользователь и настройки аккаунта для запуска без ПК).
@MainActor
final class PhoneStore {
    private(set) var chats: [String: LocalChat] = [:]
    private let folder: URL?

    /// `folder == nil` — только в памяти (режим снимков и модульные тесты).
    init(folder: URL? = PhoneStore.defaultFolder) {
        self.folder = folder
        load()
    }

    nonisolated static var defaultFolder: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PhoneChats", isDirectory: true)
    }

    private var chatsFolder: URL? { folder?.appendingPathComponent("chats", isDirectory: true) }

    private func load() {
        guard let chatsFolder else { return }
        let names = (try? FileManager.default.contentsOfDirectory(atPath: chatsFolder.path)) ?? []
        for name in names where name.hasSuffix(".json") {
            let url = chatsFolder.appendingPathComponent(name)
            guard let data = try? Data(contentsOf: url),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let chat = LocalChat(json: json) else { continue }
            chats[chat.id] = chat
        }
    }

    /// Чаты для шторки — новые сверху.
    var summaries: [ChatSummary] {
        chats.values.map(\.summary).sorted { $0.updatedAt > $1.updatedAt }
    }

    var dirty: [LocalChat] {
        chats.values.filter(\.dirty).sorted { $0.changed < $1.changed }
    }

    func put(_ chat: LocalChat) {
        chats[chat.id] = chat
        guard let chatsFolder else { return }
        try? FileManager.default.createDirectory(at: chatsFolder, withIntermediateDirectories: true)
        guard let data = try? JSONSerialization.data(withJSONObject: chat.json) else { return }
        try? data.write(to: chatsFolder.appendingPathComponent(Self.fileName(chat.id)), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func remove(_ id: String) {
        chats[id] = nil
        guard let chatsFolder else { return }
        try? FileManager.default.removeItem(at: chatsFolder.appendingPathComponent(Self.fileName(id)))
    }

    /// Имя файла из id чата — без символов, недопустимых в пути.
    nonisolated static func fileName(_ id: String) -> String {
        let safe = id.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) || $0 == "_" || $0 == "-" ? String($0) : "_" }.joined()
        return safe + ".json"
    }

    // MARK: - Снимок входа

    struct Session {
        var user: User
        var settings: [String: Any]
    }

    func saveSession(user: User, settings: [String: Any]?) {
        guard let folder else { return }
        var json: [String: Any] = [:]
        if let data = try? JSONEncoder().encode(user),
           let object = try? JSONSerialization.jsonObject(with: data) { json["user"] = object }
        if let settings { json["settings"] = settings } else if let old = loadSession()?.settings { json["settings"] = old }
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        guard let data = try? JSONSerialization.data(withJSONObject: json) else { return }
        try? data.write(to: folder.appendingPathComponent("session.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func loadSession() -> Session? {
        guard let folder,
              let data = try? Data(contentsOf: folder.appendingPathComponent("session.json")),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let userObject = json["user"],
              let userData = try? JSONSerialization.data(withJSONObject: userObject),
              let user = try? JSONDecoder().decode(User.self, from: userData) else { return nil }
        return Session(user: user, settings: (json["settings"] as? [String: Any]) ?? [:])
    }

    /// Выход из аккаунта: чаты и снимок входа принадлежат прежнему пользователю.
    func clear() {
        chats = [:]
        guard let folder else { return }
        try? FileManager.default.removeItem(at: folder)
    }

    /// Для режима снимков.
    func seed(_ list: [LocalChat]) {
        for chat in list { chats[chat.id] = chat }
    }
}
