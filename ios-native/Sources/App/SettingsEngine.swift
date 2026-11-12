import Foundation

/// Настройки моделей, параметры чата и общие настройки аккаунта. Повторяет `saveOverrides`,
/// `saveSettings` и `saveProfile` из `frontend/src/store.ts`.
///
/// В отличие от сайта, параметры модели в приложении не бывают «только для этого чата»:
/// всё сохраняется за моделью (`model_configs`), старые правки отдельных чатов
/// (`overrides[model]`) не учитываются и убираются из чата при следующей правке.
/// У чата свои только веб-поиск (`searchMode`) и базы знаний (`knowledge`).
extension AppModel {
    /// Параметры открытого чата (или нового — до первой отправки).
    var activeOverrides: [String: Any] {
        guard let id = activeChatID else { return draftOverrides }
        return chatMeta[id]?.overrides ?? [:]
    }

    /// Итоговые параметры активной модели.
    var activeConfig: [String: Any] {
        modelConfig(activeModelID)
    }

    /// Итоговые параметры модели: общие умолчания, умолчания модели, профиль и её настройки.
    func modelConfig(_ id: String) -> [String: Any] {
        ChatConfig.config(model: id, settings: settings, overrides: [:])
    }

    /// Что пользователь поменял в настройках модели (без сброшенных `null`).
    func savedModelValues(_ id: String) -> [String: Any] {
        ChatConfig.dict(settings.modelConfigs[id]).filter { !($0.value is NSNull) }
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

    /// Один параметр модели для всех её чатов; `nil` — вернуть значение по умолчанию.
    func setModelValue(_ key: String, _ value: Any?, model chosen: String? = nil) async {
        let model = chosen ?? activeModelID
        var patch: [String: Any] = [key: value ?? NSNull()]
        // У AI Studio выбор уровня включает рассуждения.
        if value != nil, model.hasPrefix("aistudio/"), key == "reasoning_strength" { patch["thinking"] = true }
        await saveModelConfig(model: model, patch: patch)
        await dropChatValues(Array(patch.keys), model: model)
    }

    /// Возвращает значения по умолчанию для этих параметров модели.
    func resetModelValues(_ keys: [String], model: String) async {
        let saved = savedModelValues(model)
        let patch = Dictionary(uniqueKeysWithValues: keys.filter { saved[$0] != nil }.map { ($0, NSNull() as Any) })
        if !patch.isEmpty { await saveModelConfig(model: model, patch: patch) }
        await dropChatValues(keys, model: model)
    }

    /// Старые правки «только для этого чата» больше не действуют: убираем их из открытого чата,
    /// чтобы и сайт показывал в нём настройки модели.
    private func dropChatValues(_ keys: [String], model: String) async {
        var all = activeOverrides
        var values = ChatConfig.dict(all[model])
        let thinking = keys.contains("thinking") && all["thinking"] != nil
        guard thinking || keys.contains(where: { values[$0] != nil }) else { return }
        for key in keys { values.removeValue(forKey: key) }
        if thinking { all.removeValue(forKey: "thinking") }
        if values.isEmpty { all.removeValue(forKey: model) } else { all[model] = values }
        await saveOverrides(all)
    }

    /// Веб-поиск этого чата: «disabled», «auto» или «forced».
    var activeSearchMode: String {
        ChatConfig.text(activeOverrides["searchMode"]) ?? ChatConfig.text(settings.shared["searchMode"]) ?? "auto"
    }

    func setSearchMode(_ mode: String) async {
        var all = activeOverrides
        all["searchMode"] = mode
        await saveOverrides(all)
    }

    /// Память модели: может ли модель читать и менять сохранённые факты (для всех её чатов).
    func memoryEnabled(_ model: String) -> Bool {
        (ChatConfig.dict(settings.modelConfigs[model])["memoryEnabled"] as? Bool) != false
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
