import Foundation

/// Память аккаунта (`GET /api/memory`, `user_memory.py`).
struct MemorySnapshot: Equatable {
    var enabled = true
    var autoSave = true
    var version = 0
    var facts: [MemoryFact] = []

    init() {}

    init(json: [String: Any]) {
        enabled = (json["enabled"] as? Bool) ?? true
        autoSave = (json["auto_save"] as? Bool) ?? true
        version = (json["version"] as? NSNumber)?.intValue ?? 0
        facts = ((json["memories"] as? [[String: Any]]) ?? []).compactMap(MemoryFact.init(json:))
    }
}

struct MemoryFact: Identifiable, Equatable {
    let id: String
    /// Пусто — личная память; иначе id пресета, в чатах которого факт действует.
    let scope: String
    let text: String
    let version: Int
    /// `manual` — записано вручную, `model` — запомнила модель.
    let origin: String

    init(id: String, scope: String = "", text: String, version: Int = 1, origin: String = "manual") {
        self.id = id
        self.scope = scope
        self.text = text
        self.version = version
        self.origin = origin
    }

    init?(json: [String: Any]) {
        guard let id = json["id"] as? String, let text = json["text"] as? String else { return nil }
        self.init(id: id, scope: (json["scope"] as? String) ?? "", text: text,
                  version: (json["version"] as? NSNumber)?.intValue ?? 1,
                  origin: (json["origin"] as? String) ?? "manual")
    }
}

/// База знаний (`/api/knowledge/libraries`, `knowledge.py`).
struct KnowledgeLibrary: Identifiable, Equatable {
    let id: String
    let name: String
    let description: String
    let version: Int
    let documents: Int

    init(id: String, name: String, description: String = "", version: Int = 1, documents: Int = 0) {
        self.id = id
        self.name = name
        self.description = description
        self.version = version
        self.documents = documents
    }

    init?(json: [String: Any]) {
        guard let id = json["id"] as? String else { return nil }
        self.init(id: id, name: (json["name"] as? String) ?? "База", description: (json["description"] as? String) ?? "",
                  version: (json["version"] as? NSNumber)?.intValue ?? 1,
                  documents: (json["documents"] as? NSNumber)?.intValue ?? 0)
    }
}

struct KnowledgeDocument: Identifiable, Equatable {
    let id: String
    let title: String
    let status: String
    let error: String
    let version: Int
    let progress: Double
    let chunks: Int

    init(id: String, title: String, status: String = "ready", error: String = "", version: Int = 1,
         progress: Double = 100, chunks: Int = 0) {
        self.id = id
        self.title = title
        self.status = status
        self.error = error
        self.version = version
        self.progress = progress
        self.chunks = chunks
    }

    init?(json: [String: Any]) {
        guard let id = json["id"] as? String else { return nil }
        let title = (json["title"] as? String) ?? (json["filename"] as? String) ?? "Документ"
        self.init(id: id, title: title, status: (json["status"] as? String) ?? "",
                  error: (json["error"] as? String) ?? "",
                  version: (json["version"] as? NSNumber)?.intValue ?? 1,
                  progress: (json["progress"] as? NSNumber)?.doubleValue ?? 0,
                  chunks: (json["chunk_count"] as? NSNumber)?.intValue ?? 0)
    }

    /// Документ ещё обрабатывается — список стоит обновлять.
    var working: Bool { status == "queued" || status == "indexing" }

    var statusText: String {
        switch status {
        case "queued": return "В очереди"
        case "indexing":
            // Сервер хранит прогресс в процентах (0–100).
            let percent = Int(progress.rounded())
            return percent > 0 ? "Обрабатывается · \(percent)%" : "Обрабатывается"
        case "ready": return Plural.knowledge(chunks, .chunk)
        case "error": return error.isEmpty ? "Ошибка" : error
        case "interrupted": return "Прервано"
        default: return status
        }
    }
}

/// Выбор баз знаний для чата (`overrides.knowledge`): как `knowledgeSelection` на сайте.
struct KnowledgeSelection: Equatable {
    var enabled = false
    var collections: [String] = []
    var strict = false

    init() {}

    init(_ value: Any?) {
        let json = (value as? [String: Any]) ?? [:]
        enabled = (json["enabled"] as? Bool) ?? false
        strict = (json["strict"] as? Bool) ?? false
        var seen = Set<String>()
        collections = ((json["collections"] as? [Any]) ?? []).compactMap { $0 as? String }.filter { seen.insert($0).inserted }
    }

    var json: [String: Any] {
        ["enabled": enabled, "collections": collections, "strict": strict]
    }
}

enum Plural {
    enum Noun { case document, chunk, library }

    static func knowledge(_ count: Int, _ noun: Noun) -> String {
        let forms: [String]
        switch noun {
        case .document: forms = ["документ", "документа", "документов"]
        case .chunk: forms = ["фрагмент", "фрагмента", "фрагментов"]
        case .library: forms = ["база", "базы", "баз"]
        }
        let tail = count % 100
        let form = (11...14).contains(tail) ? forms[2]
            : count % 10 == 1 ? forms[0]
            : (2...4).contains(count % 10) ? forms[1] : forms[2]
        return "\(count) \(form)"
    }
}
