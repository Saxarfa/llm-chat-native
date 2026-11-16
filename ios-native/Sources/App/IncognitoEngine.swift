import Foundation

/// «Инкогнито» и непрочитанные ответы — как у приложения Claude.
///
/// «Инкогнито» — временный чат сервера (как «Временный чат» на сайте, `temporary_chats.py`): он живёт
/// в памяти сервера, не попадает в историю и поиск, модель в нём не пишет память и не создаёт картинки.
/// Доступ к нему есть только у того, кто прислал тот же заголовок `X-Temporary-Session`
/// (`APIClient.temporarySession`, один на запуск приложения), — в том числе к его событиям в потоке.
/// Сервер сам забывает такой чат через 6 часов без запросов.
extension AppModel {
    /// Призрак в шапке: в новой сессии включает и выключает режим, в открытой временной — закрывает её.
    func toggleIncognito() {
        Haptics.tap()
        if activeChat?.temporary == true {
            incognito = false
            activeChatID = nil
            return
        }
        incognito.toggle()
    }

    /// Создаёт временную сессию на сервере перед первым вопросом и открывает её.
    /// `nil` — не получилось (текст ошибки уже в `sendError`).
    func startTemporary(model: String) async -> String? {
        guard let api else { return nil }
        do {
            let answer = try await api.json("/api/temporary-chats", method: "POST", body: ["model": model], timeout: 30)
            guard let chat = answer["chat"] as? [String: Any], let id = ChatConfig.text(chat["id"]) else {
                throw APIError(status: 0, message: "Сервер не создал временную сессию.")
            }
            var summary = ChatSummary(id: id, title: "Инкогнито", updatedAt: Date().timeIntervalSince1970 * 1000,
                                      modelID: ChatConfig.text(chat["model_id"]) ?? model)
            summary.temporary = true
            chats.insert(summary, at: 0)
            chatMeta[id] = ChatMeta(overrides: draftOverrides, branch: "main")
            draftOverrides = [:]
            thread = []
            threadChatID = id
            threadState = .loaded
            activeChatID = id
            return id
        } catch let error as APIError where error.status == 401 {
            await logout()
            return nil
        } catch {
            sendError = (error as? APIError)?.message ?? "Не удалось начать сессию инкогнито."
            Haptics.error()
            return nil
        }
    }

    /// Закрывает временную сессию на сервере и забывает её на телефоне.
    func closeTemporary(_ id: String) {
        chats.removeAll { $0.id == id }
        lives[id] = nil
        liveRaw[id] = nil
        pendingFinish[id] = nil
        threadCache[id] = nil
        chatMeta[id] = nil
        queued[id] = nil
        contextUsage[id] = nil
        askedHere.remove(id)
        unread.remove(id)
        guard preview == nil, let api else { return }
        Task {
            _ = try? await api.json("/api/temporary-chats/\(APIClient.pathSafe(id))/close", method: "POST", timeout: 45)
        }
    }

    /// Ответ закончен: если он запрошен с этого телефона, а сессия сейчас не на экране — точка в списке.
    func markUnreadIfHidden(_ id: String) {
        guard askedHere.remove(id) != nil else { return }
        let visible = activeChatID == id && screen == .chat
        if !visible, chats.contains(where: { $0.id == id && !$0.temporary }) {
            unread.insert(id)
        }
    }

    /// Открытая на экране сессия прочитана.
    func markSeen() {
        guard screen == .chat, let id = activeChatID, unread.contains(id) else { return }
        unread.remove(id)
    }
}
