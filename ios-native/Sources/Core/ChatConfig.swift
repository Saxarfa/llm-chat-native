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
        modelProfiles = PhoneProfiles.merged(ChatConfig.dict(json["model_profiles"]))
    }
}

/// Имя и фото моделей телефона хранятся и на самом телефоне: так они видны без связи с ПК
/// и не теряются, если ПК не ответил. На ПК они уходят обычным профилем модели.
enum PhoneProfiles {
    private static let key = "phoneModelProfiles"

    static var all: [String: [String: Any]] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return json.compactMapValues { $0 as? [String: Any] }
    }

    static func save(_ id: String, _ patch: [String: Any]) {
        var profiles = all
        profiles[id] = (profiles[id] ?? [:]).merging(patch) { _, new in new }
        if let data = try? JSONSerialization.data(withJSONObject: profiles) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    /// Профили с ПК, а поверх — сохранённые на телефоне для его моделей.
    static func merged(_ server: [String: Any]) -> [String: Any] {
        var result = server
        for (id, local) in all {
            result[id] = ChatConfig.dict(result[id]).merging(local) { _, phone in phone }
        }
        return result
    }
}

/// Параметры открытого чата, которые нужны при отправке.
struct ChatMeta {
    var overrides: [String: Any]
    var branch: String
    /// Ветки сессии; у чата без веток — пусто или одна «Основная».
    var branches: [ChatBranch] = []
}

/// Ветка диалога (`branches` в ответе `/api/chats/{id}`), без сообщений.
struct ChatBranch: Identifiable, Equatable {
    let id: String
    let name: String
    let parentID: String?
    let messageCount: Int

    init(id: String, name: String, parentID: String? = nil, messageCount: Int = 0) {
        self.id = id
        self.name = name
        self.parentID = parentID
        self.messageCount = messageCount
    }

    static func list(_ value: Any?) -> [ChatBranch] {
        ((value as? [[String: Any]]) ?? []).compactMap { item in
            guard let id = item["id"] as? String, !id.isEmpty else { return nil }
            let name = ((item["name"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return ChatBranch(id: id, name: name.isEmpty ? "Основная" : name,
                              parentID: item["parent_id"] as? String,
                              messageCount: (item["message_count"] as? NSNumber)?.intValue ?? 0)
        }
    }
}

struct ModelOption: Identifiable, Equatable {
    enum Group: Int, CaseIterable {
        /// `claude` — модели Claude по API (с 0.17): в окне выбора они первые, как у приложения Claude.
        case local, phone, studio, hosted, claude

        var title: String {
            switch self {
            case .local: return "Локальные"
            case .phone: return "На телефоне"
            case .studio: return "AI Studio"
            case .hosted: return "API"
            case .claude: return "Claude"
            }
        }
    }

    let id: String
    let name: String
    let group: Group
    /// Локальная модель уже загружена в память.
    let loaded: Bool
}

/// Облачные сервисы по API: OpenAI-совместимые (`hosted_providers.py`) и Claude (только Rust:
/// `server-rs/src/hosted.rs` + `claude.rs`, Messages API). На сайте — вкладка «API» и
/// `hostedProviders`/`hostedName` в `domain.ts`; модель — `<сервис>/<id каталога>`.
/// Ключи и выбор моделей настраиваются на сайте; приложение только показывает включённые модели.
enum HostedService: String, CaseIterable {
    case nvidia, openrouter, groq, claude, gemini

    var title: String {
        switch self {
        case .nvidia: return "NVIDIA"
        case .openrouter: return "OpenRouter"
        case .groq: return "Groq"
        case .claude: return "Claude"
        case .gemini: return "Google"
        }
    }

    static func of(_ id: String) -> HostedService? {
        allCases.first { id.hasPrefix($0.rawValue + "/") }
    }

    /// Как `hosted_providers.display_name`: «openrouter/nvidia/nemotron-3-ultra-550b-a55b:free» →
    /// «Nemotron 3 Ultra 550B A55B»; Claude — как `hostedName` сайта и `claude_name` в Rust:
    /// «claude/claude-opus-5-5» → «Claude Opus 5.5».
    static func name(_ id: String) -> String {
        if let slash = id.firstIndex(of: "/") {
            let rest = id[id.index(after: slash)...]
            if rest.hasPrefix("claude-") { return claudeName(String(rest.dropFirst("claude-".count))) }
        }
        let last = id.split(separator: "/").last.map(String.init) ?? id
        var name = String(last.split(separator: ":", maxSplits: 1).first ?? Substring(last))
        name = name.replacingOccurrences(of: "-", with: " ").replacingOccurrences(of: "_", with: " ")
        name = name.replacingOccurrences(of: "\\b(\\d+(?:\\.\\d+)?)b\\b", with: "$1B",
                                         options: [.regularExpression, .caseInsensitive])
        name = name.replacingOccurrences(of: "\\ba(\\d+)b\\b", with: "A$1B", options: [.regularExpression, .caseInsensitive])
        let upper: Set<String> = ["gpt", "oss", "it", "vl", "moe", "r1"]
        return name.split(whereSeparator: \.isWhitespace).map { word in
            upper.contains(word.lowercased()) ? word.uppercased() : word.prefix(1).uppercased() + word.dropFirst()
        }.joined(separator: " ")
    }

    /// «opus-5-5» → «Claude Opus 5.5»: числа до двух знаков — версия через точку, дата снимка
    /// («-20251001») отбрасывается (`claudeName` в `domain.ts`).
    static func claudeName(_ rest: String) -> String {
        var words = ["Claude"]
        var version: [String] = []
        for part in rest.split(separator: "-") {
            let piece = String(part)
            if piece.allSatisfy({ $0.isASCII && $0.isNumber }) {
                if piece.count <= 2 { version.append(piece) }
                continue
            }
            if !version.isEmpty {
                words.append(version.joined(separator: "."))
                version = []
            }
            words.append(piece.prefix(1).uppercased() + piece.dropFirst())
        }
        if !version.isEmpty { words.append(version.joined(separator: ".")) }
        return words.joined(separator: " ")
    }

    /// Порядок моделей Claude в окне выбора, как у приложения Claude: Fable, Mythos, Opus, Sonnet, Haiku,
    /// внутри семейства — новые выше.
    static func claudeOrder(_ id: String) -> (family: Int, version: [Int]) {
        let rest = id.split(separator: "/", maxSplits: 1).last.map(String.init) ?? id
        let parts = rest.split(separator: "-").map(String.init)
        let families = ["fable", "mythos", "opus", "sonnet", "haiku"]
        let family = parts.compactMap { families.firstIndex(of: $0.lowercased()) }.first ?? families.count
        let version = parts.compactMap { part -> Int? in
            guard part.count <= 2, part.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
            return Int(part)
        }
        return (family, version)
    }
}

/// Перенос логики сайта (`frontend/src/domain.ts`, `store.ts: inferencePayload`):
/// какие параметры уходят серверу вместе с сообщением. Менять только вместе с сайтом.
enum ChatConfig {
    static let fallbackModel = "muse-glimmer-30b"

    static let defaultPrompt = ""

    /// Модели, скрытые в списке выбора. С этапа 6 (видео Omni) пусто: показываются все.
    static let mediaModels: Set<String> = []

    private static let studioNames: [String: String] = [
        "aistudio/gemini-omni-1.2-flash": "Gemini Omni 1.2 Flash",
        "aistudio/gemini-omni-1.1-flash": "Gemini Omni 1.1 Flash",
        "aistudio/gemini-nano-banana-2.1": "Nano Banana 2.1",
        "aistudio/gemini-3.1-flash-image": "Nano Banana 2",
        "aistudio/gemini-3.1-flash-lite-image": "Nano Banana 2 Lite",
        "aistudio/gemini-3-pro-image": "Nano Banana Pro",
        "aistudio/gemini-2.5-flash-image": "Nano Banana",
        "aistudio/gemma-4-31b-it": "Gemma 4 31B",
        "aistudio/gemma-4-26b-a4b-it": "Gemma 4 26B A4B",
        "aistudio/gemini-4-neon": "Gemini 4 Neon",
        "aistudio/gemini-4-hydrogen": "Gemini 4 Hydrogen",
        "aistudio/gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
        "aistudio/gemini-4-argon": "Gemini 4 Argon",
        "aistudio/gemini-4-carbon": "Gemini 4 Carbon",
    ]

    private static let studioLevels: [String: [String]] = [
        "aistudio/gemma-4-31b-it": ["minimal", "high"],
        "aistudio/gemma-4-26b-a4b-it": ["minimal", "high"],
        "aistudio/gemini-4-neon": ["low", "medium", "high", "xhigh"],
        "aistudio/gemini-4-hydrogen": ["low", "medium", "high", "xhigh"],
        "aistudio/gemini-3.5-flash-lite": ["minimal", "low", "medium", "high"],
        "aistudio/gemini-4-argon": ["low", "medium", "high"],
        "aistudio/gemini-4-carbon": ["low", "medium", "high"],
    ]

    private static let studioDefaultStrength: [String: String] = [
        "aistudio/gemini-4-neon": "high",
        "aistudio/gemini-4-hydrogen": "high",
        "aistudio/gemini-3.5-flash-lite": "minimal",
        "aistudio/gemini-4-argon": "medium",
        "aistudio/gemini-4-carbon": "medium",
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

    static func selectable(_ id: String) -> Bool {
        !id.hasPrefix("google-subscription/") && !id.hasPrefix("gemini-web/") && !id.hasPrefix("google/") && id != "aistudio/gemini-3.8-flash"
    }

    static func group(of id: String) -> ModelOption.Group {
        if PhoneModelID.isPhone(id) { return .phone }
        if id.hasPrefix("aistudio/") { return .studio }
        if HostedService.of(id) == .claude { return .claude }
        if HostedService.of(id) != nil { return .hosted }
        return .local
    }

    static func modelName(_ id: String, profiles: [String: Any]) -> String {
        if let alias = text(dict(profiles[id])["alias"]) { return alias }
        if PhoneModelID.isPhone(id) { return PhoneModelNames.display(id) }
        if HostedService.of(id) != nil { return HostedService.name(id) }

        if id.hasPrefix("aistudio/") {
            return studioNames[id] ?? String(id.dropFirst("aistudio/".count))
        }
        if let known = localNames[id] { return known }
        var prefix = ""
        var rest = id
        if rest.hasPrefix("google/") {
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
            return ["temperature": 1, "top_p": 0.95, "top_k": 64, "thinking": true, "max_tokens": -1]
        }
        // Сервер не передаёт параметры выборки этим двум сервисам.
        if model.hasPrefix("claude/") || model.hasPrefix("gemini/") {
            return ["thinking": true, "max_tokens": -1]
        }
        // Облачные сервисы, как `modelDefaults` в `domain.ts`: Groq — без штрафов (отвергает лишние поля).
        if model.hasPrefix("groq/") {
            return ["temperature": 0.6, "top_p": 0.95, "thinking": true, "max_tokens": -1]
        }
        if HostedService.of(model) != nil {
            return ["temperature": 0.6, "top_p": 0.95, "presence_penalty": 0, "frequency_penalty": 0,
                    "thinking": true, "max_tokens": -1]
        }
        switch model {
        case "gemma-12b-uncensored":
            return ["temperature": 0.7, "top_p": 0.9, "min_p": 0.05, "top_k": 64, "repeat_penalty": 1]
        case "gemma-26b-uncensored":
            return ["temperature": 1, "top_p": 0.95, "min_p": 0, "top_k": 64, "repeat_penalty": 1]
        case "gemma-4-e4b-uncensored":
            return ["temperature": 1, "top_p": 0.95, "min_p": 0, "top_k": 64, "repeat_penalty": 1,
                    "presence_penalty": 0, "frequency_penalty": 0, "thinking": true, "max_tokens": -1]
        case "qwen-3.6-35b-a3b-mtp":
            return ["temperature": 1, "top_p": 0.95, "min_p": 0, "top_k": 20, "repeat_penalty": 1,
                    "presence_penalty": 1.5, "frequency_penalty": 0, "max_tokens": -1, "thinking": true]
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
        let lowFloor: Set<String> = ["aistudio/gemini-4-neon", "aistudio/gemini-4-hydrogen", "aistudio/gemini-4-argon", "aistudio/gemini-4-carbon"]
        if lowFloor.contains(model), strength == "minimal" { strength = "low" }
        else if model.hasPrefix("aistudio/gemma-4-"), strength == "low" { strength = "minimal" }
        else { strength = "high" }
        return strength
    }

    /// Усилия Claude (`reasoningStrength` сайта): выбранный уровень, иначе «Средний», а при выключенных
    /// рассуждениях — «Низкий». Уровень, которого у модели нет, сервер опускает до ближайшего ниже (`claude::clamp`).
    private static func claudeStrength(saved: [String: Any]) -> String {
        let chosen = text(saved["reasoning_strength"]) ?? ((saved["thinking"] as? Bool) == false ? "low" : "medium")
        return ChatParameters.claudeLevels.contains { $0.value == chosen } ? chosen : "medium"
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
        // Своя инструкция модели, иначе встроенная. «Общей инструкции» больше нет (удалена 13.11.2026).
        config["systemPrompt"] = present(profile["systemPrompt"]) ?? defaultPrompt
        // `null` на сервере — значение сброшено: действует профиль.
        let saved = dict(settings.modelConfigs[model]).merging(dict(overrides[model])) { _, new in new }
            .filter { !($0.value is NSNull) }
        config.merge(saved) { _, new in new }

        if studioLevels[model] != nil {
            config["reasoning_strength"] = reasoningStrength(model, saved: saved)
        } else if model.hasPrefix("claude/") {
            config["reasoning_strength"] = claudeStrength(saved: saved)
        }
        // Длина ответа не ограничивается, как на сайте (`configFor` всегда ставит −1): сохранённый предел
        // из прежних версий приложения больше не уходит серверу. Предел есть только у моделей телефона.
        if !PhoneModelID.isPhone(model) { config["max_tokens"] = -1 }
        // У Nano Banana 2.1 и Omni 1.2 длина текста — всегда наибольшая (на сайте ползунка нет), у остальных поля нет.
        if ChatParameters.nanoSampling(model).textLimits {
            config["nano_max_output_tokens"] = -1
        } else {
            config.removeValue(forKey: "nano_max_output_tokens")
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
        // Параметры модели в приложении общие для всех её чатов: правки отдельного чата
        // (`overrides[model]`, их ставит только сайт) не учитываются.
        var values = config(model: model, settings: settings, overrides: [:])

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
        // Как `inferencePayload`: выключатель решает только у моделей с выключателем (`reasoningKind == 'toggle'`);
        // у моделей с уровнями (AI Studio, Claude) рассуждения включены, глубину задаёт `reasoning_strength`.
        var thinking = true
        if case .toggle? = ChatParameters.reasoning(model) {
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
