import Foundation

/// Профиль, профили моделей и «Компьютер» в настройках — те же запросы, что у сайта
/// (`Settings.tsx`: «Профиль», «Модели»; `ProjectSettings.tsx: SystemSettings`).
extension AppModel {
    // MARK: - Профиль

    /// Имя и фото профиля (`POST /api/auth/profile`); `nil` — не менять.
    func updateProfile(name: String? = nil, avatar: String? = nil) async -> Bool {
        guard let user else { return false }
        var body: [String: Any] = [:]
        if let name { body["display_name"] = name }
        if let avatar { body["avatar"] = avatar }
        guard !body.isEmpty else { return true }
        let previous = user
        self.user = User(id: user.id, username: user.username, avatar: avatar ?? user.avatar,
                         displayName: name ?? user.displayName)
        guard preview == nil else { return true }
        do {
            guard let api else { throw APIError.unreachable }
            let json = try await api.json("/api/auth/profile", method: "POST", body: body)
            let fresh = ChatConfig.dict(json["user"])
            if !fresh.isEmpty, let data = try? JSONSerialization.data(withJSONObject: fresh),
               let decoded = try? JSONDecoder().decode(User.self, from: data) {
                self.user = decoded
            }
            if let current = self.user { store.saveSession(user: current, settings: nil) }
            return true
        } catch {
            self.user = previous
            settingsNotice = (error as? APIError)?.message ?? "Не удалось сохранить профиль."
            Haptics.error()
            return false
        }
    }

    // MARK: - Профили моделей

    /// Название, описание и аватар модели (`model_profiles` в настройках).
    func saveModelProfile(_ id: String, _ patch: [String: Any]) async {
        let previous = settings.modelProfiles[id]
        settings.modelProfiles[id] = ChatConfig.dict(previous).merging(patch) { _, new in new }
        guard preview == nil else { return }
        // Модель телефона: имя и фото сохраняются на телефоне сразу, ПК — когда ответит.
        let onPhone = PhoneModelID.isPhone(id)
        if onPhone {
            PhoneProfiles.save(id, patch)
            if offline { return }
        }
        do {
            guard let api else { throw APIError.unreachable }
            _ = try await api.json("/api/settings", method: "POST", body: ["model_profiles": [id: patch]])
        } catch {
            if onPhone { return }
            settings.modelProfiles[id] = previous
            settingsNotice = (error as? APIError)?.message ?? "Не удалось сохранить профиль модели."
            Haptics.error()
        }
    }

    /// Модели для раздела «Модели»: доступные сейчас и те, у кого уже есть профиль.
    var profileModels: [String] {
        var seen = Set<String>()
        var result: [String] = []
        for id in allModels.map(\.id) + settings.modelProfiles.keys.sorted() where seen.insert(id).inserted {
            result.append(id)
        }
        return result
    }

    // MARK: - Компьютер

    func systemOverview() async throws -> SystemOverview {
        if preview != nil { return PreviewScene.overview }
        guard let api else { throw APIError.unreachable }
        return SystemOverview(json: try await api.json("/api/system/overview"))
    }

    /// Остановить задачу: ответ в чате, арт, видео; вопрос из очереди приложения просто убирается.
    func stopTask(_ task: SystemTask) async throws {
        switch task.kind {
        case "client":
            for (chat, items) in queued {
                if let item = items.first(where: { $0.id.uuidString == task.id }) {
                    queued[chat]?.removeAll { $0.id == item.id }
                }
            }
            return
        default:
            break
        }
        guard preview == nil else { return }
        guard let api else { throw APIError.unreachable }
        switch task.kind {
        case "chat":
            _ = try await api.json("/api/chat/stop", method: "POST", body: ["chat_id": task.id])
        case "image":
            _ = try await api.json("/api/images/\(APIClient.pathSafe(task.id))/stop", method: "POST", body: [:])
        case "video":
            _ = try await api.json("/api/videos/\(APIClient.pathSafe(task.id))/stop", method: "POST", body: [:])
        default:
            break
        }
    }

    /// Вопросы из очереди приложения — тоже задачи, как на сайте.
    var queuedTasks: [SystemTask] {
        queued.values.flatMap { $0 }.map { item in
            SystemTask(kind: "client", id: item.id.uuidString, title: item.text,
                       phase: item.failed ? "Не ушло" : "Сообщение ожидает ответа", progress: nil)
        }
    }
}

/// Состояние компьютера: сервисы, процессор, память, видеокарты, загруженные модели, задачи.
struct SystemOverview: Equatable {
    struct Service: Equatable, Identifiable {
        let name: String
        let online: Bool
        var id: String { name }
    }

    struct GPU: Equatable, Identifiable {
        let name: String
        let usedMB: Double
        let totalMB: Double
        let utilization: Int
        var id: String { name }
    }

    var services: [Service] = []
    var cpuPercent: Double = 0
    var ramUsedMB: Double = 0
    var ramTotalMB: Double = 0
    var gpus: [GPU] = []
    var loadedModels: [String] = []
    var tasks: [SystemTask] = []
    var gpuBusy = false

    init() {}

    init(json: [String: Any]) {
        services = (json["services"] as? [[String: Any]] ?? []).map {
            Service(name: ChatConfig.text($0["name"]) ?? "Сервис", online: ($0["online"] as? Bool) ?? false)
        }
        cpuPercent = ChatParameters.number(json["cpu_percent"]) ?? 0
        let ram = ChatConfig.dict(json["ram"])
        ramUsedMB = ChatParameters.number(ram["used_mb"]) ?? 0
        ramTotalMB = ChatParameters.number(ram["total_mb"]) ?? 0
        gpus = (json["gpus"] as? [[String: Any]] ?? []).map {
            GPU(name: ChatConfig.text($0["name"]) ?? "GPU", usedMB: ChatParameters.number($0["used_mb"]) ?? 0,
                totalMB: ChatParameters.number($0["total_mb"]) ?? 0,
                utilization: Int(ChatParameters.number($0["utilization"]) ?? 0))
        }
        loadedModels = (json["loaded_models"] as? [Any] ?? []).compactMap { item in
            if let text = item as? String { return text }
            let entry = ChatConfig.dict(item)
            return ChatConfig.text(entry["model"]) ?? ChatConfig.text(entry["id"]) ?? ChatConfig.text(entry["name"])
        }
        tasks = (json["tasks"] as? [[String: Any]] ?? []).map {
            SystemTask(kind: ChatConfig.text($0["kind"]) ?? "", id: ChatConfig.text($0["id"]) ?? String(describing: $0["id"] ?? ""),
                       title: ChatConfig.text($0["title"]) ?? "",
                       phase: ChatConfig.text($0["phase"]) ?? ChatConfig.text($0["status"]) ?? "",
                       progress: ChatParameters.number($0["progress"]).map { Int($0) })
        }
        gpuBusy = (json["gpu_busy"] as? Bool) ?? false
    }
}

struct SystemTask: Equatable, Identifiable {
    let kind: String
    let id: String
    let title: String
    let phase: String
    let progress: Int?

    var kindTitle: String {
        switch kind {
        case "chat": return "Чат"
        case "image": return "Арт"
        case "video": return "Видео"
        case "knowledge": return "Документ"
        default: return "Сообщение"
        }
    }

    /// Документы в базе знаний обрабатываются на ПК до конца, остановить их нельзя (как на сайте).
    var stoppable: Bool { kind != "knowledge" }
}
