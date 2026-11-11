import Foundation

/// Настройки аккаунта с сервера (`GET /api/settings`). Хранятся словарями: набор полей
/// задаёт сайт, и клиент должен передавать их серверу без потерь.
struct ServerSettings {
    var shared: [String: Any] = [:]
    var modelConfigs: [String: Any] = [:]
    var modelProfiles: [String: Any] = [:]

    init() {}

    init(json: [String: Any]) {
        shared = ChatConfig.dict(json["settings"])
        modelConfigs = ChatConfig.dict(json["model_configs"])
        modelProfiles = ChatConfig.dict(json["model_profiles"])
    }
}

/// Параметры открытого чата, которые нужны при отправке.
struct ChatMeta {
    var overrides: [String: Any]
    var branch: String
}

struct ModelOption: Identifiable, Equatable {
    enum Group: Int, CaseIterable {
        case local, studio, subscription

        var title: String {
            switch self {
            case .local: return "Локальные"
            case .studio: return "AI Studio"
            case .subscription: return "Подписка"
            }
        }
    }

    let id: String
    let name: String
    let group: Group
    /// Локальная модель уже загружена в память.
    let loaded: Bool
}

/// Перенос логики сайта (`frontend/src/domain.ts`, `store.ts: inferencePayload`):
/// какие параметры уходят серверу вместе с сообщением. Менять только вместе с сайтом.
enum ChatConfig {
    static let fallbackModel = "muse-glimmer-30b"

    static let defaultPrompt = "You are a helpful, knowledgeable, and precise AI assistant. Provide concise, high-quality answers formatted in Markdown. When writing code, specify the language and follow modern best practices."

    /// Модели видео AI Studio (Omni). В нативном клиенте скрыты, пока нет показа видео (этап 6).
    static let mediaModels: Set<String> = [
        "aistudio/gemini-omni-1.2-flash", "aistudio/gemini-omni-1.1-flash",
    ]

    private static let studioNames: [String: String] = [
        "aistudio/gemini-nano-banana-2.1": "Nano Banana 2.1",
        "aistudio/gemini-3.1-flash-image": "Nano Banana 2",
        "aistudio/gemini-3.1-flash-lite-image": "Nano Banana 2 Lite",
        "aistudio/gemini-3-pro-image": "Nano Banana Pro",
        "aistudio/gemini-2.5-flash-image": "Nano Banana",
        "aistudio/gemma-4-31b-it": "Gemma 4 31B",
        "aistudio/gemma-4-26b-a4b-it": "Gemma 4 26B A4B",
        "aistudio/gemini-3.8-flash": "Gemini 3.8 Flash",
        "aistudio/gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
        "aistudio/gemini-4-argon": "Gemini 4 Argon",
        "aistudio/gemini-4-carbon": "Gemini 4 Carbon",
    ]

    private static let studioLevels: [String: [String]] = [
        "aistudio/gemma-4-31b-it": ["minimal", "high"],
        "aistudio/gemma-4-26b-a4b-it": ["minimal", "high"],
        "aistudio/gemini-3.8-flash": ["low", "medium", "high"],
        "aistudio/gemini-3.5-flash-lite": ["minimal", "low", "medium", "high"],
        "aistudio/gemini-4-argon": ["low", "medium", "high"],
        "aistudio/gemini-4-carbon": ["low", "medium", "high"],
    ]

    private static let studioDefaultStrength: [String: String] = [
        "aistudio/gemini-3.8-flash": "medium",
        "aistudio/gemini-3.5-flash-lite": "minimal",
        "aistudio/gemini-4-argon": "medium",
        "aistudio/gemini-4-carbon": "medium",
    ]

    /// Модели с выключателем размышлений (у остальных `thinking` всегда true).
    private static let toggleModels: Set<String> = [
        "gemma-31b-iq3", "gemma-26b-uncensored", "gemma-26b-qat", "gemma-12b-uncensored",
        "gemma-4-e4b-uncensored", "qwen-3.8-27b-it", "qwen-3.6-35b-a3b-mtp",
    ]

    private static let localNames: [String: String] = [
        "qwen-3.6-35b-a3b-mtp": "Qwen 3.6 35B-A3B MTP",
        "gemma-4-e4b-uncensored": "Gemma 4 E4B Uncensored",
        "gemma-12b-uncensored": "Gemma 12B Abliterix",
        "gemma-26b-uncensored": "Gemma 26B Abliterix V6",
    ]

    // MARK: - Разбор JSON

    /// Значение без `null`: как `??` в JavaScript.
    static func present(_ value: Any?) -> Any? {
        guard let value, !(value is NSNull) else { return nil }
        return value
    }

    static func dict(_ value: Any?) -> [String: Any] {
        (value as? [String: Any]) ?? [:]
    }

    static func text(_ value: Any?) -> String? {
        guard let string = value as? String, !string.isEmpty else { return nil }
        return string
    }

    // MARK: - Имена и группы моделей

    static func group(of id: String) -> ModelOption.Group {
        if id.hasPrefix("aistudio/") { return .studio }
        if id.hasPrefix("google-subscription/") || id.hasPrefix("gemini-web/") { return .subscription }
        return .local
    }

    static func modelName(_ id: String, profiles: [String: Any]) -> String {
        if let alias = text(dict(profiles[id])["alias"]) { return alias }
        if id.hasPrefix("gemini-web/") {
            return ("Gemini " + titleCased(String(id.dropFirst("gemini-web/".count))))
                .replacingOccurrences(of: "Flash Lite", with: "Flash-Lite")
        }
        if id.hasPrefix("aistudio/") {
            return studioNames[id] ?? String(id.dropFirst("aistudio/".count))
        }
        if let known = localNames[id] { return known }
        var prefix = ""
        var rest = id
        if rest.hasPrefix("google-subscription/") {
            prefix = "Подписка · "
            rest = String(rest.dropFirst("google-subscription/".count))
        } else if rest.hasPrefix("google/") {
            prefix = "Google · "
            rest = String(rest.dropFirst("google/".count))
        }
        var name = titleCased(rest)
        name = name.replacingOccurrences(of: "\\b(\\d+)b\\b", with: "$1B", options: [.regularExpression, .caseInsensitive])
        name = name.replacingOccurrences(of: "\\bqat\\b", with: "QAT", options: [.regularExpression, .caseInsensitive])
        name = name.replacingOccurrences(of: "\\biq(\\d)", with: "IQ$1", options: [.regularExpression, .caseInsensitive])
        return prefix + name
    }

    private static func titleCased(_ raw: String) -> String {
        raw.replacingOccurrences(of: "-", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
            .map { word in word.prefix(1).uppercased() + word.dropFirst() }
            .joined(separator: " ")
    }

    // MARK: - Параметры генерации

    private static func modelDefaults(_ model: String) -> [String: Any] {
        if model.hasPrefix("aistudio/") {
            return ["temperature": 1, "top_p": 0.95, "top_k": 64, "thinking": true, "max_tokens": 32768]
        }
        switch model {
        case "gemma-12b-uncensored":
            return ["temperature": 0.7, "top_p": 0.9, "min_p": 0.05, "top_k": 64, "repeat_penalty": 1]
        case "gemma-26b-uncensored":
            return ["temperature": 1, "top_p": 0.95, "min_p": 0, "top_k": 64, "repeat_penalty": 1]
        case "gemma-4-e4b-uncensored":
            return ["temperature": 1, "top_p": 0.95, "min_p": 0, "top_k": 64, "repeat_penalty": 1,
                    "presence_penalty": 0, "frequency_penalty": 0, "thinking": true, "max_tokens": 512]
        case "qwen-3.6-35b-a3b-mtp":
            return ["temperature": 1, "top_p": 0.95, "min_p": 0, "top_k": 20, "repeat_penalty": 1,
                    "presence_penalty": 1.5, "frequency_penalty": 0, "max_tokens": 16384, "thinking": true]
        default:
            return [:]
        }
    }

    private static func reasoningStrength(_ model: String, saved: [String: Any]) -> String {
        let levels = studioLevels[model]
        let studio = levels != nil
        let thinking = saved["thinking"] as? Bool
        var strength: String
        if studio, thinking == false {
            strength = "minimal"
        } else if let chosen = text(saved["reasoning_strength"]) {
            strength = chosen
        } else if studio, thinking != true, let fallback = studioDefaultStrength[model] {
            strength = fallback
        } else {
            strength = "high"
        }
        guard let levels, !levels.contains(strength) else { return strength }
        let lowFloor: Set<String> = ["aistudio/gemini-3.8-flash", "aistudio/gemini-4-argon", "aistudio/gemini-4-carbon"]
        if lowFloor.contains(model), strength == "minimal" { strength = "low" }
        else if model.hasPrefix("aistudio/gemma-4-"), strength == "low" { strength = "minimal" }
        else { strength = "high" }
        return strength
    }

    /// Итоговые параметры модели: общие умолчания ← умолчания модели ← профиль ← параметры чата.
    static func config(model: String, settings: ServerSettings, overrides: [String: Any]) -> [String: Any] {
        var config: [String: Any] = [
            "temperature": 0.7, "top_p": 0.9, "min_p": 0.05, "top_k": 40, "repeat_penalty": 1.1,
            "presence_penalty": 0, "frequency_penalty": 0, "max_tokens": -1,
            "systemPrompt": defaultPrompt, "stop": [String](),
        ]
        config.merge(modelDefaults(model)) { _, new in new }
        let profile = dict(settings.modelProfiles[model])
        config["systemPrompt"] = present(profile["systemPrompt"]) ?? present(settings.shared["systemPrompt"]) ?? defaultPrompt
        let saved = dict(settings.modelConfigs[model]).merging(dict(overrides[model])) { _, new in new }
        config.merge(saved) { _, new in new }

        if model.hasPrefix("google-subscription/") || model.hasPrefix("gemini-web/"), text(config["reasoning_strength"]) == nil {
            let suffix = ["low", "medium", "high"].first { model.hasSuffix("-" + $0) }
            config["reasoning_strength"] = suffix ?? "high"
        }
        if studioLevels[model] != nil {
            config["reasoning_strength"] = reasoningStrength(model, saved: saved)
        }
        for retired in ["mirostat", "mirostat_tau", "mirostat_eta"] {
            config.removeValue(forKey: retired)
        }

        var stop: Any? = config["stop"]
        if let list = stop as? [Any], list.isEmpty { stop = config["stop_tokens"] }
        if stop == nil || stop is NSNull { stop = config["stop_tokens"] }
        if let list = stop as? [Any] {
            config["stop"] = list
        } else if let line = stop as? String {
            config["stop"] = line.split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
        } else {
            config["stop"] = [String]()
        }
        return config
    }

    /// Тело `POST /api/chat/generate`. `overrides == nil` — параметры чата ещё не загружены:
    /// тогда поле не отправляется вовсе, чтобы сервер не затёр сохранённые.
    static func payload(chatID: String, model: String, settings: ServerSettings, overrides: [String: Any]?,
                        branch: String, serverURL: URL?, message: String, messageID: String,
                        attachments: [[String: Any]] = []) -> [String: Any] {
        let over = overrides ?? [:]
        let shared = settings.shared
        var values = config(model: model, settings: settings, overrides: over)

        // Адрес самого сайта означает «модель по умолчанию на сервере» — как пустая строка.
        var endpoint = (shared["endpoint"] as? String) ?? ""
        let own = (serverURL?.absoluteString ?? "") + "/v1"
        let normalized = endpoint.hasSuffix("/") ? String(endpoint.dropLast()) : endpoint
        if normalized == own || normalized == "http://localhost:8000/v1" || normalized == "http://127.0.0.1:8000/v1" {
            endpoint = ""
        }
        values["endpoint"] = endpoint
        values["apiKey"] = (shared["apiKey"] as? String) ?? ""

        let mode = text(over["searchMode"]) ?? text(shared["searchMode"]) ?? "auto"
        var thinking = true
        if toggleModels.contains(model) {
            thinking = (values["thinking"] as? Bool) ?? (over["thinking"] as? Bool) ?? true
        }

        var body: [String: Any] = [
            "chat_id": chatID,
            "expected_branch_id": branch,
            "model": model,
            "settings": values,
            "system_prompt": present(values["systemPrompt"]) ?? defaultPrompt,
            "client_timezone": TimeZone.current.identifier,
            "client_utc_offset_minutes": TimeZone.current.secondsFromGMT() / 60,
            "thinking": thinking,
            "web_search": mode != "disabled",
            "search_mode": mode,
            "search_provider": text(shared["searchProvider"]) ?? "searxng",
            "searxng_url": text(shared["searxngUrl"]) ?? "http://127.0.0.1:8080",
            "tavily_api_key": (shared["tavilyApiKey"] as? String) ?? "",
            "search_max_results": (shared["searchMaxResults"] as? Int) ?? 5,
            "search_blacklist": (shared["searchBlacklist"] as? String) ?? "",
            "message": message,
            "message_id": messageID,
            "attachments": attachments,
        ]
        if let overrides { body["overrides"] = overrides }
        return body
    }
}
