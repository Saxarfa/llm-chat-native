import Foundation

/// Сводка ответа из очереди движка — без гонок с главным потоком.
private final class StatsBox: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: PhoneRunStats?

    func set(_ value: PhoneRunStats) {
        lock.lock()
        stored = value
        lock.unlock()
    }

    var value: PhoneRunStats? {
        lock.lock()
        defer { lock.unlock() }
        return stored
    }
}

/// Чат с моделью телефона: отвечает llama.cpp на самом iPhone. Переписка хранится и на телефоне
/// (`PhoneStore`), и на ПК — вопрос и ответ уходят туда снимком (`PUT /api/chats/{id}`);
/// без связи снимок ждёт на телефоне (`OfflineEngine`).
extension AppModel {
    /// Вопрос уже в ленте. Загружает модель; `false` — ответа не будет (текст вернётся в поле).
    func startOnPhone(_ id: String, model: String, text: String, messageID: String, now: Double, isNew: Bool) async -> Bool {
        let file = PhoneModelID.file(of: model)
        phoneRuns.insert(id)
        let question: [String: Any] = ["id": messageID, "role": "user", "content": text, "attachments": [Any](),
                                       "timestamp": Int(now)]
        var entry = isNew ? RawChat(messages: [], updatedAt: 0) : (rawChats[id] ?? RawChat(messages: [], updatedAt: 0))
        if isNew { entry.title = Self.phoneTitle(text) }
        entry.messages.append(question)
        rawChats[id] = entry
        persistPhone(id, model: model, dirty: true)
        if phone.loadedFile != file { lives[id]?.phase = "Загружаю модель в память…" }
        do {
            try await phone.ensureLoaded(file)
        } catch {
            phoneRuns.remove(id)
            rawChats[id]?.messages.removeAll { ($0["id"] as? String) == messageID }
            lives[id] = nil
            liveRaw[id] = nil
            sendError = (error as? PhoneEngineError)?.message ?? error.localizedDescription
            Haptics.error()
            if isNew {
                draftOverrides = chatMeta.removeValue(forKey: id)?.overrides ?? [:]
                chats.removeAll { $0.id == id }
                rawChats[id] = nil
                store.remove(id)
                if activeChatID == id { activeChatID = nil }
            } else {
                persistPhone(id, model: model, dirty: true)
                if threadChatID == id { thread.removeAll { $0.rawID == messageID } }
            }
            return false
        }
        lives[id]?.sending = false
        lives[id]?.phase = "Генерация ответа…"
        Task { await runOnPhone(id, model: model) }
        return true
    }

    private func runOnPhone(_ id: String, model: String) async {
        // Вопрос — сразу на ПК: чат появится в списке и на сайте, ответ допишется следом.
        _ = await savePhoneChat(id, model: model)

        let config = ChatConfig.config(model: model, settings: settings, overrides: chatMeta[id]?.overrides ?? [:])
        let system = (ChatConfig.present(config["systemPrompt"]) as? String) ?? ChatConfig.defaultPrompt
        var prompt: [(role: String, content: String)] = []
        if !system.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { prompt.append((role: "system", content: system)) }
        for message in rawChats[id]?.messages ?? [] {
            guard let role = message["role"] as? String, role == "user" || role == "assistant",
                  let content = message["content"] as? String,
                  !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            prompt.append((role: role, content: role == "assistant" ? PhoneChatFormat.clean(content) : content))
        }

        phone.generating = true
        let box = StatsBox()
        var output = ""
        var failure: String?
        do {
            for try await piece in phone.stream(messages: prompt, sampling: PhoneSampling(config: config),
                                                stats: { box.set($0) }) {
                output += piece
                let parts = ThinkSplitter.split(output)
                applyLive(id, event: ["text": parts.text, "reasoning": parts.reasoning,
                                      "is_thinking": parts.text.isEmpty && !parts.reasoning.isEmpty])
            }
        } catch {
            failure = (error as? PhoneEngineError)?.message ?? error.localizedDescription
        }
        phone.generating = false

        let parts = ThinkSplitter.split(output)
        if !parts.text.isEmpty || !parts.reasoning.isEmpty {
            let stamp = Int(Date().timeIntervalSince1970 * 1000)
            var answer: [String: Any] = [
                "id": "asst_\(stamp)_\(String(format: "%08x", UInt32.random(in: 0...UInt32.max)))",
                "role": "assistant", "content": parts.text, "model": model, "timestamp": stamp,
            ]
            if !parts.reasoning.isEmpty { answer["reasoning"] = parts.reasoning }
            if let stats = box.value {
                answer["metrics"] = ["device": "iphone", "prompt_tokens": stats.promptTokens, "tokens": stats.tokens,
                                     "tokens_per_second": (stats.tokensPerSecond * 10).rounded() / 10] as [String: Any]
            }
            rawChats[id]?.messages.append(answer)
        }

        let saved = await savePhoneChat(id, model: model)
        phoneRuns.remove(id)
        if let chat = saved.chat {
            finish(id, chat: chat, error: failure, notify: failure == nil)
            return
        }
        // ПК недоступен (или режим снимков): ответ сохранён на телефоне и уйдёт на ПК, когда будет связь.
        pendingFinish[id] = nil
        lives[id] = nil
        liveRaw[id] = nil
        let items = FeedMessage.build(from: (rawChats[id]?.messages ?? []).map { ChatMessage(json: $0) })
        threadCache[id] = items
        if activeChatID == id {
            thread = items
            threadChatID = id
            threadState = .loaded
        }
        if let message = failure ?? saved.error {
            sendError = message
            Haptics.error()
        } else {
            Haptics.success()
        }
    }

    /// Снимок переписки — на телефон и на ПК. Возвращает сохранённый на ПК чат или текст для пользователя.
    private func savePhoneChat(_ id: String, model: String) async -> (chat: [String: Any]?, error: String?) {
        guard rawChats[id] != nil else { return (nil, nil) }
        persistPhone(id, model: model, dirty: true)
        guard let local = store.chats[id] else { return (nil, nil) }
        switch await push(local) {
        case .saved(let chat):
            return (chat, nil)
        case .unreachable:
            return (nil, offline || preview != nil ? nil : "ПК не отвечает — переписка сохранена на телефоне и уйдёт на ПК, когда связь появится.")
        case .failed(let message):
            return (nil, "Переписка сохранена на телефоне, но ПК её не принял: \(message)")
        }
    }

    nonisolated static func updatedAt(_ chat: [String: Any]) -> Double {
        (chat["updatedAt"] as? NSNumber)?.doubleValue ?? (chat["updated_at"] as? NSNumber)?.doubleValue ?? 0
    }

    /// Название нового чата — по тому же правилу, что у сервера: первая строка, 35 символов.
    nonisolated static func phoneTitle(_ text: String) -> String {
        let line = text.split(separator: "\n").first.map { String($0).trimmingCharacters(in: .whitespaces) } ?? ""
        guard !line.isEmpty else { return "Новый диалог" }
        return line.count > 35 ? String(line.prefix(35)) + "..." : line
    }

    /// Остановка ответа модели телефона: написанное сохраняется как обычно.
    func stopOnPhone(_ id: String) {
        lives[id]?.stopping = true
        Haptics.tap()
        phone.cancel()
    }
}
