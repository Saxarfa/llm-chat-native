import Foundation

/// Сколько контекста модели занимает чат.
struct ContextUsage: Equatable {
    var used: Int
    /// `nil` — лимит неизвестен.
    var capacity: Int?
    /// Оценка по длине текста, а не подсчёт токенизатором модели.
    var estimated: Bool

    var fraction: Double? {
        guard let capacity, capacity > 0 else { return nil }
        return min(1, Double(used) / Double(capacity))
    }

    /// Грубая оценка без токенизатора — как `estimate_tokens` на сервере: ~3 символа на токен.
    static func estimate(_ texts: [String]) -> Int {
        texts.reduce(0) { $0 + ($1.count + 2) / 3 }
    }
}

/// Вопрос, отправленный, пока модель ещё отвечала: уйдёт сразу после ответа.
struct QueuedMessage: Identifiable, Equatable {
    let id = UUID()
    let text: String
    let attachments: [DraftAttachment]
    /// Отправка не удалась: ждёт повтора.
    var failed = false
}

/// Капсула ввода: контекст модели и очередь вопросов (`ContextIndicator.tsx`, `runQueue` в `store.ts`).
extension AppModel {
    // MARK: - Контекст

    var activeContext: ContextUsage? {
        guard let id = activeChatID else { return nil }
        return contextUsage[id]
    }

    /// Пересчитывает контекст открытого чата. Сервер считает токенизатором модели
    /// (`POST /api/chats/{id}/context/usage`, без поиска и загрузки модели); модель телефона —
    /// по длине переписки и размеру её контекста.
    func measureContext() async {
        guard let id = activeChatID, lives[id] == nil else { return }
        let model = activeModelID
        if preview != nil {
            contextUsage[id] = ContextUsage(used: 9_840, capacity: 32_768, estimated: false)
            return
        }
        if PhoneModelID.isPhone(model) {
            let file = PhoneModelID.file(of: model)
            let system = (ChatConfig.present(modelConfig(model)["systemPrompt"]) as? String) ?? ""
            let used = ContextUsage.estimate([system] + thread.map { $0.text })
            let capacity = phone.loadedFile == file && phone.contextSize > 0 ? phone.contextSize : phone.wantedContext(file)
            contextUsage[id] = ContextUsage(used: used, capacity: capacity, estimated: true)
            return
        }
        guard !offline, let api, let meta = chatMeta[id] else { return }
        let body = ChatConfig.payload(chatID: id, model: model, settings: settings, overrides: meta.overrides,
                                      branch: meta.branch, serverURL: serverURL, message: "", messageID: "")
        guard let json = try? await api.json("/api/chats/\(APIClient.pathSafe(id))/context/usage", method: "POST",
                                             body: body, timeout: 20),
              let used = (json["used"] as? NSNumber)?.intValue, used >= 0 else { return }
        var capacity = (json["capacity"] as? NSNumber)?.intValue
        if capacity == nil || capacity == 0 {
            let settingsBody = ChatConfig.dict(body["settings"])
            let probe = try? await api.json("/api/inference/probe", method: "POST", body: [
                "kind": "props", "model": model,
                "endpoint": settingsBody["endpoint"] ?? "", "apiKey": settingsBody["apiKey"] ?? "",
            ], timeout: 10)
            capacity = (probe?["n_ctx"] as? NSNumber)?.intValue
        }
        // Пока шёл запрос, пользователь мог открыть другой чат или начать новый ответ.
        guard lives[id] == nil else { return }
        contextUsage[id] = ContextUsage(used: used, capacity: capacity.flatMap { $0 > 0 ? $0 : nil },
                                        estimated: (json["estimated"] as? Bool) == true)
    }

    // MARK: - Очередь

    var activeQueue: [QueuedMessage] {
        guard let id = activeChatID else { return [] }
        return queued[id] ?? []
    }

    /// Вопрос в очередь открытого чата: уйдёт, когда модель допишет ответ.
    func enqueue(_ text: String, attachments: [DraftAttachment]) {
        guard let id = activeChatID else { return }
        queued[id, default: []].append(QueuedMessage(text: text, attachments: attachments))
        Haptics.tap()
    }

    func cancelQueued(_ item: QueuedMessage) {
        guard let id = activeChatID else { return }
        queued[id]?.removeAll { $0.id == item.id }
        if queued[id]?.isEmpty == true { queued[id] = nil }
    }

    func retryQueued(_ item: QueuedMessage) {
        guard let id = activeChatID, let index = queued[id]?.firstIndex(where: { $0.id == item.id }) else { return }
        queued[id]?[index].failed = false
        runQueue()
    }

    /// Отправляет следующий вопрос открытого чата, если модель свободна.
    func runQueue() {
        guard let id = activeChatID, lives[id] == nil, var list = queued[id],
              let next = list.first, !next.failed else { return }
        list.removeFirst()
        queued[id] = list.isEmpty ? nil : list
        Task {
            let sent = await send(next.text, attachments: next.attachments)
            if !sent {
                var failed = next
                failed.failed = true
                queued[id, default: []].insert(failed, at: 0)
            }
        }
    }
}
