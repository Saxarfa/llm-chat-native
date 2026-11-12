import Foundation

/// Параметры чата и общие настройки аккаунта. Повторяет `saveOverrides`, `saveReasoning`,
/// `saveSettings` и `saveProfile` из `frontend/src/store.ts`.
extension AppModel {
    /// Параметры открытого чата (или нового — до первой отправки).
    var activeOverrides: [String: Any] {
        guard let id = activeChatID else { return draftOverrides }
        return chatMeta[id]?.overrides ?? [:]
    }

    /// Итоговые параметры активной модели: профиль, сохранённое для модели и правки чата.
    var activeConfig: [String: Any] {
        ChatConfig.config(model: activeModelID, settings: settings, overrides: activeOverrides)
    }

    /// Параметры, изменённые именно в этом чате.
    var activeChatChanges: [String: Any] {
        ChatConfig.dict(activeOverrides[activeModelID])
    }

    /// Сохраняет параметры чата целиком. Экран меняется сразу; при ошибке — откат.
    func saveOverrides(_ value: [String: Any]) async {
        guard let id = activeChatID else {
            draftOverrides = value
            return
        }
        let previous = chatMeta[id]
        chatMeta[id] = ChatMeta(overrides: value, branch: previous?.branch ?? "main",
                                branches: previous?.branches ?? [])
        guard preview == nil, let api else { return }
        do {
            _ = try await api.json("/api/chats/\(APIClient.pathSafe(id))/overrides", method: "PUT",
                                   body: ["overrides": value])
        } catch {
            if let previous { chatMeta[id] = previous } else { chatMeta[id] = nil }
            settingsNotice = (error as? APIError)?.message ?? "Не удалось сохранить параметры чата."
            Haptics.error()
        }
    }

    /// Один параметр активной модели в этом чате; `nil` — вернуть значение профиля.
    func setParameter(_ key: String, _ value: Any?) async {
        let model = activeModelID
        if let value, ChatParameters.reasoningKeys.contains(key) {
            var patch: [String: Any] = [key: value]
            // У AI Studio выбор уровня включает рассуждения.
            if model.hasPrefix("aistudio/"), key == "reasoning_strength" { patch["thinking"] = true }
            await saveReasoning(model: model, patch: patch)
            return
        }
        var all = activeOverrides
        var values = ChatConfig.dict(all[model])
        if let value { values[key] = value } else { values.removeValue(forKey: key) }
        all[model] = values
        await saveOverrides(all)
    }

    /// Рассуждения запоминаются и для модели, и для этого чата.
    private func saveReasoning(model: String, patch: [String: Any]) async {
        var all = activeOverrides
        all[model] = ChatConfig.dict(all[model]).merging(patch) { _, new in new }
        guard activeChatID != nil else {
            draftOverrides = all
            return
        }
        await saveOverrides(all)
        await saveModelConfig(model: model, patch: patch)
    }

    /// Убирает правки этого чата: снова действуют параметры профиля модели.
    func resetChatParameters() async {
        var all = activeOverrides
        all.removeValue(forKey: activeModelID)
        all.removeValue(forKey: "thinking")
        await saveOverrides(all)
    }

    // MARK: - Настройки аккаунта

    /// Значение по умолчанию для всех чатов с моделью; `nil` — убрать (сервер хранит `null`,
    /// `ChatConfig.config` его не учитывает).
    func setModelDefault(model: String, key: String, value: Any?) async {
        await saveModelConfig(model: model, patch: [key: value ?? NSNull()])
    }

    private func saveModelConfig(model: String, patch: [String: Any]) async {
        let previous = settings.modelConfigs[model]
        var merged = ChatConfig.dict(previous).merging(patch) { _, new in new }
        for (key, value) in patch where value is NSNull { merged.removeValue(forKey: key) }
        settings.modelConfigs[model] = merged
        do {
            try await postSettings(["model_configs": [model: patch]])
        } catch {
            settings.modelConfigs[model] = previous
            settingsNotice = (error as? APIError)?.message ?? "Не удалось сохранить параметры модели."
        }
    }

    /// Общие настройки (`settings` на сервере): сохраняются только переданные поля.
    func saveShared(_ patch: [String: Any]) async -> Bool {
        let previous = settings.shared
        settings.shared.merge(patch) { _, new in new }
        do {
            try await postSettings(["settings": patch])
            return true
        } catch {
            settings.shared = previous
            settingsNotice = (error as? APIError)?.message ?? "Не удалось сохранить настройки."
            Haptics.error()
            return false
        }
    }

    /// Инструкция модели: как «Профиль модели → Инструкции» на сайте, пишется и в профиль,
    /// и в параметры модели (там она главнее профиля).
    func saveModelInstruction(_ text: String, model chosen: String? = nil) async -> Bool {
        let model = chosen ?? activeModelID
        let profile = settings.modelProfiles[model]
        let config = settings.modelConfigs[model]
        settings.modelProfiles[model] = ChatConfig.dict(profile).merging(["systemPrompt": text]) { _, new in new }
        settings.modelConfigs[model] = ChatConfig.dict(config).merging(["systemPrompt": text]) { _, new in new }
        do {
            try await postSettings(["model_profiles": [model: ["systemPrompt": text]],
                                    "model_configs": [model: ["systemPrompt": text]]])
            return true
        } catch {
            settings.modelProfiles[model] = profile
            settings.modelConfigs[model] = config
            settingsNotice = (error as? APIError)?.message ?? "Не удалось сохранить инструкцию."
            Haptics.error()
            return false
        }
    }

    private func postSettings(_ body: [String: Any]) async throws {
        guard preview == nil else { return }
        guard let api else { throw APIError.unreachable }
        _ = try await api.json("/api/settings", method: "POST", body: body)
    }
}
