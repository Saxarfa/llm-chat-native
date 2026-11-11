import Foundation

/// Ветки диалога и варианты ответа — как `selectBranch`/`forkBranch`/`chooseVariant` в `store.ts`.
/// Сервер принимает изменение, только если клиент знает текущую ветку (`expected_branch_id`),
/// и отвечает чатом целиком; его и показываем.
extension AppModel {
    var activeBranches: [ChatBranch] {
        guard let id = activeChatID else { return [] }
        return chatMeta[id]?.branches ?? []
    }

    var activeBranchID: String {
        guard let id = activeChatID else { return "main" }
        return chatMeta[id]?.branch ?? "main"
    }

    var activeBranchName: String {
        activeBranches.first { $0.id == activeBranchID }?.name ?? "Основная"
    }

    /// Менять историю можно, когда модель не отвечает и не идёт другое изменение.
    var canChangeHistory: Bool {
        guard let id = activeChatID else { return false }
        return lives[id] == nil && !branchBusy && preview == nil
    }

    /// Показать другой сохранённый вариант ответа.
    func selectVariant(_ message: FeedMessage, index: Int) async {
        guard index >= 0, index < message.variantCount, index != message.variantIndex,
              let id = activeChatID else { return }
        Haptics.tap()
        await change(id, path: "/api/chats/\(APIClient.pathSafe(id))/variant", method: "PATCH",
                     body: ["message_id": message.rawID, "index": index])
    }

    /// Переключиться на другую ветку диалога.
    func switchBranch(_ branchID: String) async {
        guard let id = activeChatID, branchID != activeBranchID else { return }
        Haptics.tap()
        if await change(id, path: "/api/chats/\(APIClient.pathSafe(id))/branch", method: "PATCH",
                        body: ["branch_id": branchID]) {
            Haptics.success()
        }
    }

    /// Новая ветка от этого сообщения: всё после него остаётся в прежней ветке.
    func forkBranch(at message: FeedMessage) async {
        guard let id = activeChatID else { return }
        Haptics.tap()
        if await change(id, path: "/api/chats/\(APIClient.pathSafe(id))/branches", method: "POST",
                        body: ["message_id": message.rawID]) {
            Haptics.success()
        }
    }

    func deleteBranch(_ branchID: String) async {
        guard let id = activeChatID else { return }
        if await change(id, path: "/api/chats/\(APIClient.pathSafe(id))/branches/\(APIClient.pathSafe(branchID))",
                        method: "DELETE", body: [:]) {
            Haptics.success()
        }
    }

    func deleteMessage(_ message: FeedMessage) async {
        guard let id = activeChatID else { return }
        if await change(id, path: "/api/chats/\(APIClient.pathSafe(id))/messages/\(APIClient.pathSafe(message.rawID))",
                        method: "DELETE", body: [:]) {
            Haptics.success()
        }
    }

    /// Отправляет изменение истории и показывает чат, который вернул сервер.
    @discardableResult
    private func change(_ id: String, path: String, method: String, body: [String: Any]) async -> Bool {
        guard canChangeHistory, let api else { return false }
        branchBusy = true
        defer { branchBusy = false }
        var payload = body
        payload["expected_branch_id"] = chatMeta[id]?.branch ?? "main"
        do {
            let answer = try await api.json(path, method: method, body: payload, timeout: 30)
            if let chat = answer["chat"] as? [String: Any] {
                await apply(chat: chat, to: id)
            } else if activeChatID == id {
                await loadThread()
            }
            return true
        } catch is CancellationError {
            return false
        } catch {
            if let failure = error as? APIError, failure.status == 401 {
                await logout()
                return false
            }
            sendError = (error as? APIError)?.message ?? "Не удалось изменить историю чата."
            Haptics.error()
            // Ветку поменяли на другом устройстве — показать актуальную.
            if (error as? APIError)?.status == 409, activeChatID == id {
                threadCache[id] = nil
                await loadThread()
            }
            return false
        }
    }
}
