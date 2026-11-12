import Foundation

/// Работа без ПК (этап 8.2): чаты с моделями телефона хранятся на телефоне (`PhoneStore`),
/// приложение запускается по снимку входа, а когда ПК снова отвечает — неотправленное
/// уходит туда (`PUT /api/chats/{id}`).
extension AppModel {
    /// Чем закончилась отправка снимка чата на ПК.
    enum PushResult {
        case saved([String: Any])
        case failed(String)
        /// ПК не отвечает — ничего страшного, чат ждёт на телефоне.
        case unreachable
    }

    // MARK: - Запуск без ПК

    /// ПК не ответил при запуске. `false` — входа на этом телефоне ещё не было.
    func enterOffline() -> Bool {
        guard let session = store.loadSession() else { return false }
        user = session.user
        settings = ServerSettings(json: session.settings)
        chats = store.summaries
        chatsError = nil
        offline = true
        phase = .ready
        phone.start()
        scheduleReconnect()
        return true
    }

    /// Раз в 10 секунд проверяет, не появился ли ПК.
    func scheduleReconnect() {
        guard reconnectTask == nil, preview == nil else { return }
        reconnectTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                guard let self, self.offline else { return }
                if await self.tryReconnect() { return }
            }
        }
    }

    /// `true` — связь с ПК вернулась и сессия запущена как обычно.
    @discardableResult
    func tryReconnect() async -> Bool {
        guard offline else { return true }
        guard preview == nil, let api else { return false }
        do {
            let auth = try await api.me()
            reconnectTask?.cancel()
            reconnectTask = nil
            offline = false
            accept(auth)
            await refreshChats()
            startSession()
            if let id = activeChatID { threadCache[id] = nil }
            await loadThread()
            return true
        } catch let error as APIError where error.status == 401 {
            await logout()
            return false
        } catch {
            return false
        }
    }

    // MARK: - Локальная копия

    /// Сохраняет переписку чата телефона на телефоне. `dirty` — на ПК её ещё нет.
    func persistPhone(_ id: String, model: String, dirty: Bool) {
        guard let entry = rawChats[id] else { return }
        let old = store.chats[id]
        let now = Date().timeIntervalSince1970 * 1000
        store.put(LocalChat(id: id,
                            title: entry.title ?? old?.title ?? chats.first(where: { $0.id == id })?.title ?? "Новый диалог",
                            model: model, messages: entry.messages,
                            overrides: chatMeta[id]?.overrides ?? old?.overrides ?? [:],
                            created: old?.created ?? now, serverUpdatedAt: entry.updatedAt,
                            changed: dirty ? now : max(entry.updatedAt, old?.changed ?? 0), dirty: dirty,
                            pinned: chats.first(where: { $0.id == id })?.pinned ?? old?.pinned ?? false))
    }

    /// Показывает чат из локальной копии. `false` — её нет.
    @discardableResult
    func showLocal(_ id: String) -> Bool {
        guard let local = store.chats[id] else { return false }
        rawChats[id] = RawChat(messages: local.messages, updatedAt: local.serverUpdatedAt, title: local.title)
        if chatMeta[id] == nil { chatMeta[id] = ChatMeta(overrides: local.overrides, branch: "main") }
        let items = FeedMessage.build(from: local.messages.map { ChatMessage(json: $0) })
        threadCache[id] = items
        guard activeChatID == id else { return true }
        if items != thread { thread = items }
        threadChatID = id
        threadState = .loaded
        return true
    }

    /// Чаты с ПК плюс те, что есть только на телефоне (ещё не дошли до ПК).
    /// Чат, который ПК уже видел, а теперь в списке его нет, удалён на ПК — убираем и копию.
    func mergeLocal(_ server: [ChatSummary]) -> [ChatSummary] {
        let known = Set(server.map(\.id))
        var extra: [ChatSummary] = []
        for local in store.chats.values where !known.contains(local.id) {
            if local.dirty || local.serverUpdatedAt == 0 {
                extra.append(local.summary)
            } else {
                store.remove(local.id)
            }
        }
        return extra.sorted { $0.updatedAt > $1.updatedAt } + server
    }

    // MARK: - Отправка на ПК

    /// Снимок чата — на ПК. При конфликте (чат на ПК менялся с другого устройства) переписка
    /// с телефона сохраняется отдельным чатом «… (с телефона)», чтобы ничего не потерялось.
    func push(_ local: LocalChat) async -> PushResult {
        guard preview == nil, !offline, let api else { return .unreachable }
        var body: [String: Any] = [
            "id": local.id,
            "title": local.title,
            "messages": local.messages,
            "model_id": local.model,
            "expected_branch_id": chatMeta[local.id]?.branch ?? "main",
        ]
        if local.serverUpdatedAt > 0 {
            body["updatedAt"] = Int(local.serverUpdatedAt)
        } else {
            body["createdAt"] = Int(local.created)
            body["overrides"] = local.overrides
        }
        do {
            let answer = try await api.json("/api/chats/\(APIClient.pathSafe(local.id))", method: "PUT", body: body, timeout: 30)
            guard let chat = answer["chat"] as? [String: Any] else { return .failed("ПК не вернул сохранённый чат.") }
            var saved = local
            saved.dirty = false
            saved.serverUpdatedAt = Self.updatedAt(chat)
            if let messages = chat["messages"] as? [[String: Any]] { saved.messages = messages }
            if let title = ChatConfig.text(chat["title"]) { saved.title = title }
            // Пока снимок летел, на телефоне могли дописать ещё — тогда копия остаётся «грязной».
            if let current = store.chats[local.id], current.changed > local.changed {
                saved.messages = current.messages
                saved.dirty = true
            }
            store.put(saved)
            rawChats[local.id] = RawChat(messages: saved.messages, updatedAt: saved.serverUpdatedAt, title: saved.title)
            return .saved(chat)
        } catch let error as APIError where error.status == 401 {
            await logout()
            return .unreachable
        } catch let error as APIError where error.status == 409 {
            return await fork(local)
        } catch let error as APIError where error.status == 0 {
            return .unreachable
        } catch {
            return .failed((error as? APIError)?.message ?? "Не удалось сохранить чат на ПК.")
        }
    }

    private func fork(_ local: LocalChat) async -> PushResult {
        var copy = local
        copy.id = "chat_" + UUID().uuidString.lowercased()
        copy.title = local.title + " (с телефона)"
        copy.serverUpdatedAt = 0
        copy.dirty = true
        store.remove(local.id)
        store.put(copy)
        rawChats[local.id] = nil
        threadCache[local.id] = nil
        if !chats.contains(where: { $0.id == copy.id }) { chats.insert(copy.summary, at: 0) }
        if activeChatID == local.id { activeChatID = copy.id }
        guard copy.serverUpdatedAt == 0 else { return .unreachable }
        return await push(copy)
    }

    /// Отправляет на ПК всё, что накопилось без связи.
    func syncPhoneChats() async {
        guard preview == nil, !offline, !syncing else { return }
        syncing = true
        defer { syncing = false }
        for local in store.dirty where !phoneRuns.contains(local.id) {
            switch await push(local) {
            case .saved(let chat):
                if activeChatID == local.id, lives[local.id] == nil { await apply(chat: chat, to: local.id) }
            case .unreachable:
                return
            case .failed:
                continue
            }
        }
        await refreshChats()
    }
}
