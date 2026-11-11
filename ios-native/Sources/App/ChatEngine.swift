import Foundation

/// Работа чата: загрузка ленты, отправка, живой ответ по потоку событий, остановка, выбор модели.
/// Сервер ведёт генерацию сам; клиент отправляет вопрос и слушает `/api/sync/events`.
extension AppModel {
    // MARK: - Модель

    var activeModelID: String {
        if let chat = activeChat, !chat.modelID.isEmpty { return chat.modelID }
        if !draftModel.isEmpty { return draftModel }
        return ChatConfig.text(settings.shared["model"]) ?? ChatConfig.fallbackModel
    }

    var activeModelName: String {
        ChatConfig.modelName(activeModelID, profiles: settings.modelProfiles)
    }

    var activeLive: LiveState? {
        guard let id = activeChatID else { return nil }
        return lives[id]
    }

    /// После входа: настройки аккаунта, список моделей и поток событий.
    func startSession() {
        guard preview == nil else { return }
        Task {
            await loadSettings()
            await refreshModels()
        }
        restartEvents()
    }

    /// Приложение вернулось на экран: соединение могло умереть, пока оно спало.
    func resumed() {
        guard preview == nil, phase == .ready else { return }
        restartEvents()
    }

    func loadSettings() async {
        guard let api, let json = try? await api.json("/api/settings") else { return }
        settings = ServerSettings(json: json)
    }

    func refreshModels() async {
        guard preview == nil, let api else { return }
        modelsLoading = true
        defer { modelsLoading = false }
        let probe: [String: Any] = [
            "endpoint": "",
            "apiKey": (settings.shared["apiKey"] as? String) ?? "",
            "kind": "models",
        ]
        async let local = try? await api.json("/api/inference/probe", method: "POST", body: probe)
        async let subscription = try? await api.json("/api/providers/google-subscription")
        async let studio = try? await api.json("/api/providers/aistudio")
        async let web = try? await api.json("/api/providers/gemini-web")
        let answers = await [local, subscription, studio, web]

        var entries: [[String: Any]] = []
        var catalog: [String: [String: Any]] = [:]
        if let raw = answers[0]?["raw"] as? [String: Any], let data = raw["data"] as? [[String: Any]] {
            entries += data
        }
        for answer in answers.dropFirst() {
            entries += (answer?["models"] as? [[String: Any]]) ?? []
            // Модели картинок AI Studio (Nano Banana) сервер отдаёт отдельным списком.
            for item in (answer?["image_models"] as? [Any]) ?? [] {
                if let entry = item as? [String: Any] {
                    entries.append(entry)
                    if let id = entry["id"] as? String { catalog[id] = entry }
                } else if let id = item as? String {
                    entries.append(["id": id])
                }
            }
        }

        var seen = Set<String>()
        var result: [ModelOption] = []
        for entry in entries {
            guard let id = entry["id"] as? String, !id.isEmpty,
                  !ChatConfig.mediaModels.contains(id), seen.insert(id).inserted else { continue }
            var state = entry["status"] as? String
            if let status = entry["status"] as? [String: Any] { state = status["value"] as? String }
            result.append(ModelOption(id: id, name: ChatConfig.modelName(id, profiles: settings.modelProfiles),
                                      group: ChatConfig.group(of: id), loaded: state == "loaded"))
        }
        // Пустой ответ при сбое связи не должен стирать уже показанный список.
        if !result.isEmpty || answers.contains(where: { $0 != nil }) {
            models = result
        }
        if answers[2] != nil { imageCatalog = catalog }
    }

    func selectModel(_ id: String) async {
        guard id != activeModelID else { return }
        Haptics.tap()
        guard let chatID = activeChatID, let index = chats.firstIndex(where: { $0.id == chatID }) else {
            draftModel = id
            UserDefaults.standard.set(id, forKey: AppModel.draftModelKey)
            return
        }
        let previous = chats[index].modelID
        chats[index].modelID = id
        guard preview == nil, let api else { return }
        do {
            _ = try await api.json("/api/chats/\(APIClient.pathSafe(chatID))/metadata", method: "PATCH",
                                   body: ["model_id": id])
        } catch {
            if let position = chats.firstIndex(where: { $0.id == chatID }) { chats[position].modelID = previous }
            sendError = (error as? APIError)?.message ?? "Не удалось сменить модель."
        }
    }

    // MARK: - Лента

    /// Загружает ленту активного чата. Вызывается экраном при смене `activeChatID`.
    func loadThread() async {
        guard let id = activeChatID else {
            thread = []
            threadState = .idle
            threadChatID = nil
            return
        }
        if preview != nil {
            threadChatID = id
            threadState = .loaded
            return
        }
        guard let api else { return }
        prepareLiveBlocks()
        if threadChatID == id, lives[id] != nil, !thread.isEmpty {
            // Только что отправленный вопрос уже в ленте — не сбрасываем её на загрузку.
        } else if let cached = threadCache[id] {
            thread = cached
            threadState = .loaded
        } else {
            thread = []
            threadState = .loading
        }
        threadChatID = id
        do {
            let status = try await api.json("/api/chat/status/\(APIClient.pathSafe(id))")
            guard activeChatID == id else { return }
            if let chat = status["chat"] as? [String: Any] {
                await apply(chat: chat, to: id)
            }
            guard activeChatID == id else { return }
            if (status["is_generating"] as? Bool) == true {
                applyLive(id, event: ChatConfig.dict(status["snapshot"]), instant: true)
                watch(id)
            } else if lives[id]?.sending != true {
                lives[id] = nil
                liveRaw[id] = nil
            }
            threadState = .loaded
        } catch is CancellationError {
            return
        } catch let error as APIError where error.status == 401 {
            await logout()
        } catch {
            // Чат, который только создаётся отправкой, сервер ещё может не знать.
            guard activeChatID == id, thread.isEmpty, lives[id] == nil else { return }
            threadState = .failed((error as? APIError)?.message ?? "Не удалось загрузить чат.")
        }
    }

    /// Принимает чат с сервера: параметры для отправки и сообщения для ленты.
    func apply(chat: [String: Any], to id: String) async {
        chatMeta[id] = ChatMeta(overrides: ChatConfig.dict(chat["overrides"]),
                                branch: ChatConfig.text(chat["active_branch_id"]) ?? "main",
                                branches: ChatBranch.list(chat["branches"]))
        update(summary: id, from: chat)
        let raw = (chat["messages"] as? [[String: Any]]) ?? []
        // Ответ, снятый до того как сервер сохранил только что отправленный вопрос,
        // не должен стирать этот вопрос из ленты.
        if let pending = lives[id]?.pendingUserID, !raw.contains(where: { ($0["id"] as? String) == pending }) {
            return
        }
        // Разбор Markdown длинного чата — вне главного потока.
        let items = await Task.detached(priority: .userInitiated) {
            FeedMessage.build(from: raw.map { ChatMessage(json: $0) })
        }.value
        threadCache[id] = items
        guard activeChatID == id else { return }
        if lives[id]?.pendingUserID != nil { lives[id]?.pendingUserID = nil }
        if items != thread { thread = items }
        threadChatID = id
    }

    private func update(summary id: String, from chat: [String: Any]) {
        guard let index = chats.firstIndex(where: { $0.id == id }) else { return }
        var item = chats[index]
        if let title = ChatConfig.text(chat["title"]) { item.title = title }
        if let model = ChatConfig.text(chat["model_id"]) { item.modelID = model }
        if let pinned = chat["pinned"] as? Bool { item.pinned = pinned }
        if let updated = (chat["updatedAt"] as? Double) ?? (chat["updated_at"] as? Double) { item.updatedAt = updated }
        if item != chats[index] { chats[index] = item }
    }

    // MARK: - Отправка и остановка

    /// Отправляет вопрос. `false` — не ушло (текст нужно вернуть в поле ввода).
    func send(_ rawText: String, attachments: [DraftAttachment] = []) async -> Bool {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !attachments.isEmpty, preview == nil, let api else { return false }
        let isNew = activeChatID == nil
        let id = activeChatID ?? "chat_" + UUID().uuidString.lowercased()
        guard lives[id] == nil else { return false }

        let model = activeModelID
        let now = Date().timeIntervalSince1970 * 1000
        let messageID = "user_\(Int(now))_\(String(UInt32.random(in: 0...UInt32.max), radix: 36))"
        // Картинки кладём под тем же ключом, под каким их потом пришлёт сервер.
        let files = attachments.enumerated().map { index, item -> FeedAttachment in
            let key = ChatMessage.attachmentKey(message: messageID, index: index)
            if item.kind == .image, let bytes = ImageStore.data(item.storeKey) { ImageStore.put(bytes, key: key) }
            return FeedAttachment(id: key, name: item.name, kind: item.kind)
        }
        let question = FeedMessage(id: "\(thread.count)-\(messageID)", rawID: messageID, isUser: true, text: text,
                                   blocks: [], reasoning: "", model: "", attachments: files, arts: [])
        var live = LiveState()
        live.sending = true
        live.pendingUserID = messageID
        lives[id] = live
        sendError = nil
        if isNew {
            chats.insert(ChatSummary(id: id, title: text.isEmpty ? "Новый чат" : String(text.prefix(42)),
                                     updatedAt: now, modelID: model), at: 0)
            thread = [question]
            threadChatID = id
            threadState = .loaded
            activeChatID = id
        } else {
            thread.append(question)
            threadState = .loaded
        }
        Haptics.tap()

        if isNew {
            // Параметры, выбранные до первой отправки, становятся параметрами чата.
            chatMeta[id] = ChatMeta(overrides: draftOverrides, branch: "main")
            draftOverrides = [:]
        }
        let meta = chatMeta[id]
        let body = ChatConfig.payload(chatID: id, model: model, settings: settings,
                                      overrides: meta?.overrides, branch: meta?.branch ?? "main",
                                      serverURL: serverURL, message: text, messageID: messageID,
                                      attachments: attachments.map { ["name": $0.name, "dataUrl": $0.dataURL] })
        do {
            _ = try await api.json("/api/chat/generate", method: "POST", body: body, timeout: 60)
            lives[id]?.sending = false
            lastEventAt[id] = Date()
            if eventsTask == nil { restartEvents() }
            watch(id)
            return true
        } catch {
            lives[id] = nil
            liveRaw[id] = nil
            if let failure = error as? APIError, failure.status == 401 {
                await logout()
                return false
            }
            sendError = (error as? APIError)?.message ?? "Не удалось отправить сообщение."
            Haptics.error()
            if isNew {
                draftOverrides = chatMeta.removeValue(forKey: id)?.overrides ?? [:]
                chats.removeAll { $0.id == id }
                if activeChatID == id { activeChatID = nil }
            } else if threadChatID == id {
                thread.removeAll { $0.rawID == messageID }
            }
            return false
        }
    }

    /// Просит модель ответить заново. Прежний ответ остаётся на сервере вариантом.
    func regenerate(_ message: FeedMessage) async {
        guard let id = activeChatID, lives[id] == nil, preview == nil else { return }
        var live = LiveState()
        live.sending = true
        live.replacingID = message.rawID
        lives[id] = live
        sendError = nil
        Haptics.tap()
        var body = requestBody(for: id)
        body["message_id"] = message.rawID
        _ = await launch(id, path: "/api/chat/regenerate", body: body)
    }

    /// Меняет текст своего сообщения; всё, что было после него, сервер убирает в отдельную ветку.
    func edit(_ message: FeedMessage, text rawText: String) async -> Bool {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let id = activeChatID, lives[id] == nil, preview == nil else { return false }
        guard !text.isEmpty || !message.attachments.isEmpty else { return false }
        var live = LiveState()
        live.sending = true
        lives[id] = live
        sendError = nil
        Haptics.tap()
        if let index = thread.firstIndex(where: { $0.rawID == message.rawID }) {
            var kept = Array(thread.prefix(index))
            kept.append(FeedMessage(id: message.id, rawID: message.rawID, isUser: true, text: text, blocks: [],
                                    reasoning: "", model: "", attachments: message.attachments, arts: []))
            thread = kept
        }
        var body = requestBody(for: id)
        body["message_id"] = message.rawID
        body["new_content"] = text
        let sent = await launch(id, path: "/api/chat/edit", body: body)
        if !sent, activeChatID == id {
            threadCache[id] = nil
            await loadThread()
        }
        return sent
    }

    /// Параметры генерации открытого чата — те же, что уходят с новым сообщением.
    private func requestBody(for id: String) -> [String: Any] {
        let meta = chatMeta[id]
        var body = ChatConfig.payload(chatID: id, model: activeModelID, settings: settings, overrides: meta?.overrides,
                                      branch: meta?.branch ?? "main", serverURL: serverURL, message: "", messageID: "")
        for key in ["message", "message_id", "attachments"] { body.removeValue(forKey: key) }
        return body
    }

    /// Запускает на сервере правку или перегенерацию и принимает обновлённую ленту.
    private func launch(_ id: String, path: String, body: [String: Any]) async -> Bool {
        guard let api else { return false }
        do {
            let answer = try await api.json(path, method: "POST", body: body, timeout: 60)
            lives[id]?.sending = false
            lastEventAt[id] = Date()
            if let chat = answer["chat"] as? [String: Any] { await apply(chat: chat, to: id) }
            if eventsTask == nil { restartEvents() }
            watch(id)
            return true
        } catch {
            lives[id] = nil
            liveRaw[id] = nil
            if let failure = error as? APIError, failure.status == 401 {
                await logout()
                return false
            }
            sendError = (error as? APIError)?.message ?? "Не удалось выполнить запрос."
            Haptics.error()
            return false
        }
    }

    func stop() async {
        guard let id = activeChatID, lives[id] != nil, lives[id]?.stopping != true, let api else { return }
        lives[id]?.stopping = true
        Haptics.tap()
        do {
            // Сервер отвечает, когда уже сохранил написанную часть ответа.
            _ = try await api.json("/api/chat/stop", method: "POST", body: ["chat_id": id], timeout: 60)
            pendingFinish[id] = nil
            lives[id] = nil
            liveRaw[id] = nil
            if activeChatID == id { await loadThread() }
        } catch {
            lives[id]?.stopping = false
            sendError = (error as? APIError)?.message ?? "Не удалось остановить ответ."
        }
    }

    /// Страховка от пропущенного события конца ответа: если поток молчит, спросить сервер.
    private func watch(_ id: String) {
        guard watching.insert(id).inserted else { return }
        Task {
            defer { watching.remove(id) }
            while lives[id] != nil, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                guard lives[id] != nil, lives[id]?.sending != true else { continue }
                if Date().timeIntervalSince(lastEventAt[id] ?? .distantPast) < 20 { continue }
                lastEventAt[id] = Date()
                guard let api,
                      let status = try? await api.json("/api/chat/status/\(APIClient.pathSafe(id))") else { continue }
                if (status["is_generating"] as? Bool) == true {
                    applyLive(id, event: ChatConfig.dict(status["snapshot"]), instant: true)
                } else {
                    finish(id, chat: status["chat"] as? [String: Any], error: nil, notify: false)
                    return
                }
            }
        }
    }

    // MARK: - Поток событий

    func restartEvents() {
        eventsTask?.cancel()
        eventsTask = nil
        guard preview == nil, phase == .ready, let api else { return }
        eventsTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    for try await event in api.events() {
                        guard let self else { return }
                        self.handle(event)
                    }
                } catch let error as APIError where error.status == 401 {
                    await self?.logout()
                    return
                } catch {
                    // Обрыв связи: ниже пауза и новая попытка.
                }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }

    private func handle(_ event: [String: Any]) {
        let type = (event["type"] as? String) ?? ""
        switch type {
        case "connected":
            // Первое соединение идёт сразу после загрузки; догонять нужно только после обрыва.
            if eventsConnectedOnce {
                Task {
                    await refreshChats()
                    await loadThread()
                }
            }
            eventsConnectedOnce = true
            return
        case "auth_expired":
            Task { await logout() }
            return
        case "settings_updated":
            Task { await loadSettings() }
            return
        case "provider_models_updated", "model_runtime_updated":
            Task { await refreshModels() }
            return
        case "all_chats_cleared", "project_data_restored":
            Task { await refreshChats() }
            return
        case "memory_updated":
            memoryRevision += 1
            return
        case "knowledge_updated":
            knowledgeRevision += 1
            return
        default:
            break
        }

        guard let id = event["chat_id"] as? String, !id.isEmpty else { return }
        lastEventAt[id] = Date()
        switch type {
        case "chat_deleted":
            chats.removeAll { $0.id == id }
            lives[id] = nil
            liveRaw[id] = nil
            threadCache[id] = nil
            if activeChatID == id { activeChatID = nil }
        case "stream_start":
            let known = lives[id] != nil
            var live = lives[id] ?? LiveState()
            if let phase = ChatConfig.text(event["phase"]) { live.phase = phase }
            if (event["is_regenerate"] as? Bool) == true, let target = ChatConfig.text(event["target_message_id"]) {
                live.replacingID = target
            }
            lives[id] = live
            if !chats.contains(where: { $0.id == id }) {
                Task { await refreshChats() }
            } else {
                update(summary: id, from: ["title": event["title"] ?? NSNull()])
            }
            // Вопрос задан с другого устройства — подтянуть его в открытую ленту.
            if !known, activeChatID == id {
                Task { await loadThread() }
            }
            watch(id)
        case "stream_chunk", "stream_phase", "stream_tool", "stream_image":
            applyLive(id, event: event)
        case "stream_end", "stream_stop":
            let message = event["final_message"] as? [String: Any]
            let failure = ChatConfig.text(ChatConfig.dict(message?["metrics"])["error"])
            finish(id, chat: event["chat"] as? [String: Any], error: failure, notify: type == "stream_end")
        case "chat_updated":
            if activeChatID == id, lives[id] == nil {
                if let chat = event["chat"] as? [String: Any] {
                    Task { await apply(chat: chat, to: id) }
                } else {
                    Task { await loadThread() }
                }
            } else {
                threadCache[id] = nil
            }
        case "chat_metadata":
            update(summary: id, from: event)
        case "chat_preferences":
            if let overrides = event["overrides"] as? [String: Any] { chatMeta[id]?.overrides = overrides }
        default:
            break
        }
    }

    /// Ответ закончен или остановлен: убрать живую строку и показать сохранённые сообщения.
    private func finish(_ id: String, chat: [String: Any]?, error: String?, notify: Bool) {
        // Последний кусок текста ещё не допоказан — сначала плавно дописать его, потом закончить.
        if error == nil, id == activeChatID, let live = lives[id], !live.stopping,
           let raw = liveRaw[id], raw.text != live.text {
            pendingFinish[id] = (chat: chat, notify: notify)
            startReveal()
            return
        }
        pendingFinish[id] = nil
        let wasLive = lives[id] != nil
        lives[id] = nil
        liveRaw[id] = nil
        if let index = chats.firstIndex(where: { $0.id == id }), index != 0, !chats[index].pinned {
            let item = chats.remove(at: index)
            chats.insert(item, at: 0)
        }
        if let chat {
            Task { await apply(chat: chat, to: id) }
        } else if activeChatID == id {
            Task { await loadThread() }
        } else {
            threadCache[id] = nil
        }
        guard activeChatID == id else { return }
        if let error {
            sendError = error
            Haptics.error()
        } else if notify, wasLive {
            Haptics.success()
        }
    }

    private func applyLive(_ id: String, event: [String: Any], instant: Bool = false) {
        var raw = liveRaw[id] ?? (text: lives[id]?.text ?? "", reasoning: lives[id]?.reasoning ?? "")
        if let text = event["text"] as? String { raw.text = text }
        if let reasoning = event["reasoning"] as? String { raw.reasoning = reasoning }
        liveRaw[id] = raw

        var live = lives[id] ?? LiveState()
        if let phase = ChatConfig.text(event["phase"]) { live.phase = phase }
        if let thinking = event["is_thinking"] as? Bool { live.isThinking = thinking }
        if event["generated_images"] != nil { live.arts = FeedArt.list(event["generated_images"]) }
        if (event["is_regenerate"] as? Bool) == true, let target = ChatConfig.text(event["target_message_id"]) {
            live.replacingID = target
        }
        if instant {
            // Снимок уже идущего ответа показываем целиком, а не печатаем заново.
            live.reasoning = raw.reasoning
            if live.text != raw.text {
                live.text = raw.text
                live.blocks = id == activeChatID ? MarkdownParser.parse(raw.text) : []
            }
        }
        if live != lives[id] { lives[id] = live }
        startReveal()
    }

    /// Текст приходит рывками (AI Studio — крупными кусками), а в ленту выводится плавно:
    /// ~30 раз в секунду показывается ещё часть накопленного.
    private func startReveal() {
        guard !liveFlushScheduled else { return }
        liveFlushScheduled = true
        Task {
            while revealStep() {
                try? await Task.sleep(nanoseconds: 33_000_000)
            }
            liveFlushScheduled = false
        }
    }

    /// Один шаг вывода. `true` — на экране ещё не весь полученный текст.
    private func revealStep() -> Bool {
        var more = false
        for (id, raw) in liveRaw {
            guard var live = lives[id] else { continue }
            let firstText = live.text.isEmpty && !raw.text.isEmpty
            live.reasoning = raw.reasoning
            if live.text != raw.text {
                if id == activeChatID {
                    let total = raw.text.count
                    let shown = min(live.text.count, total)
                    // Чем больше накопилось, тем быстрее догоняем; после конца ответа — ещё быстрее.
                    let closing = pendingFinish[id] != nil
                    let share = Double(total - shown) * (closing ? 0.25 : 0.1)
                    let next = min(total, shown + max(closing ? 6 : 2, Int(share.rounded(.up))))
                    live.text = next == total ? raw.text : String(raw.text.prefix(next))
                    live.blocks = MarkdownParser.parse(live.text)
                    if next < total { more = true }
                } else {
                    // Разметку разбираем только для чата на экране.
                    live.text = raw.text
                    live.blocks = []
                }
            }
            if live != lives[id] { lives[id] = live }
            if firstText, id == activeChatID { Haptics.tap() }
        }
        // Ответы, которые сервер уже закончил, а лента только что допоказала.
        let ready = pendingFinish.keys.filter { id in
            lives[id] == nil || liveRaw[id] == nil || lives[id]?.text == liveRaw[id]?.text
        }
        for id in ready {
            guard let done = pendingFinish.removeValue(forKey: id), lives[id] != nil else { continue }
            finish(id, chat: done.chat, error: nil, notify: done.notify)
        }
        return more
    }

    /// Открыли чат с идущим ответом, разметка которого не разбиралась в фоне.
    func prepareLiveBlocks() {
        guard let id = activeChatID, var live = lives[id], live.blocks.isEmpty, !live.text.isEmpty else { return }
        live.blocks = MarkdownParser.parse(live.text)
        lives[id] = live
    }
}
