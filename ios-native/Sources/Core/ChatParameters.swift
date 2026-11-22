import Foundation

/// Вариант выбора: значение для сервера и подпись.
struct Choice: Hashable, Identifiable {
    let value: String
    let label: String

    init(_ value: String, _ label: String) {
        self.value = value
        self.label = label
    }

    var id: String { value }
}

/// Числовой параметр генерации: подпись, пределы, шаг.
struct ParameterSpec: Identifiable {
    let key: String
    let label: String
    let min: Double
    let max: Double
    let step: Double
    /// Значение, которое показывать, пока параметр нигде не задан (у моделей телефона — умолчание движка).
    var fallback: Double?

    var id: String { key }
    var isInteger: Bool { step >= 1 }
}

/// Какие параметры показывать для модели. Перенос `frontend/src/domain.ts`
/// (`parameterSupported`, `reasoningKind`, `reasoningLevels`, `nano*`) и списков из
/// `Settings.tsx`/`NanoChatParameters.tsx`. Менять только вместе с сайтом.
enum ChatParameters {
    /// Названия параметров генерации не переводятся (решение пользователя 16.11.2026): так их знает llama.cpp.
    static let specs: [ParameterSpec] = [
        ParameterSpec(key: "temperature", label: "Temperature", min: 0, max: 2, step: 0.05),
        ParameterSpec(key: "top_p", label: "Top-P", min: 0, max: 1, step: 0.05),
        ParameterSpec(key: "min_p", label: "Min-P", min: 0, max: 1, step: 0.01),
        ParameterSpec(key: "max_tokens", label: "Max tokens", min: 1, max: 131072, step: 1),
        ParameterSpec(key: "top_k", label: "Top-K", min: 0, max: 1000, step: 1),
        ParameterSpec(key: "repeat_penalty", label: "Repeat penalty", min: 0, max: 3, step: 0.05),
        ParameterSpec(key: "presence_penalty", label: "Presence penalty", min: -2, max: 2, step: 0.05),
        ParameterSpec(key: "frequency_penalty", label: "Frequency penalty", min: -2, max: 2, step: 0.05),
    ]

    /// Остальные параметры выборки llama.cpp. Есть только у моделей на телефоне: ими управляет
    /// `LlamaRunner.makeSampler`, а сервер ПК их не знает. Умолчания — как у движка (`fallback`).
    static let phoneSpecs: [ParameterSpec] = [
        ParameterSpec(key: "repeat_last_n", label: "Repeat last N", min: 0, max: 4096, step: 1,
                      fallback: 64),
        ParameterSpec(key: "typical_p", label: "Typical-P", min: 0, max: 1, step: 0.01,
                      fallback: 1),
        ParameterSpec(key: "top_n_sigma", label: "Top-N sigma", min: 0, max: 5, step: 0.1,
                      fallback: 0),
        ParameterSpec(key: "xtc_probability", label: "XTC probability", min: 0, max: 1, step: 0.01,
                      fallback: 0),
        ParameterSpec(key: "xtc_threshold", label: "XTC threshold", min: 0, max: 0.5, step: 0.01,
                      fallback: 0.1),
        ParameterSpec(key: "dry_multiplier", label: "DRY multiplier", min: 0, max: 5, step: 0.05,
                      fallback: 0),
        ParameterSpec(key: "dry_base", label: "DRY base", min: 1, max: 4, step: 0.05,
                      fallback: 1.75),
        ParameterSpec(key: "dry_allowed_length", label: "DRY allowed length", min: 1, max: 20, step: 1,
                      fallback: 2),
        ParameterSpec(key: "dry_penalty_last_n", label: "DRY penalty last N", min: 0, max: 8192, step: 1,
                      fallback: 512),
        ParameterSpec(key: "seed", label: "Seed", min: -1, max: 2147483647, step: 1,
                      fallback: -1),
    ]

    /// Все параметры генерации, которые есть у модели в приложении. У моделей телефона — все (их выборкой
    /// управляет `LlamaRunner`, в том числе длиной ответа); у остальных — только те, что принимает сервер.
    static func allSpecs(for model: String, onPhone: Bool) -> [ParameterSpec] {
        onPhone ? specs + phoneSpecs : specs.filter { supported(model, $0.key) }
    }

    /// Главные параметры показываются сразу, остальные — в «Расширенных».
    static let mainKeys: Set<String> = ["temperature", "max_tokens"]

    /// Ключи рассуждений.
    static let reasoningKeys: Set<String> = ["thinking", "reasoning_effort", "reasoning_strength"]

    static let searchModes: [Choice] = [
        Choice("disabled", "Выкл"), Choice("auto", "Авто"), Choice("forced", "Всегда"),
    ]

    // MARK: - Модели

    private static let nanoModels: Set<String> = [
        "aistudio/gemini-nano-banana-2.1", "aistudio/gemini-3.1-flash-image",
        "aistudio/gemini-3.1-flash-lite-image", "aistudio/gemini-3-pro-image", "aistudio/gemini-2.5-flash-image",
        "aistudio/gemini-omni-1.2-flash", "aistudio/gemini-omni-1.1-flash",
    ]

    static func isNano(_ model: String) -> Bool { nanoModels.contains(model) }


    static func usesGoogleSearch(_ model: String) -> Bool {
        model.hasPrefix("aistudio/")
    }

    /// Перенос `parameterSupported` сайта. Длины ответа (`max_tokens`) нет ни у одной модели ПК и облака —
    /// сайт всегда шлёт −1; у Nano Banana, Gemini 4 Argon и Carbon параметров выборки нет вовсе, у Claude тоже
    /// (текущие модели отвергают temperature/top_p, остаются только уровни рассуждений).
    static func supported(_ model: String, _ key: String) -> Bool {
        if key == "max_tokens" || isNano(model) { return false }
        if model == "aistudio/gemini-4-argon" || model == "aistudio/gemini-4-carbon" { return false }
        // Облачные сервисы: Groq не принимает штрафы, Claude — ничего.
        if model.hasPrefix("groq/") { return ["temperature", "top_p"].contains(key) }
        if model.hasPrefix("claude/") { return false }
        if HostedService.of(model) != nil {
            return ["temperature", "top_p", "presence_penalty", "frequency_penalty"].contains(key)
        }
        return !model.hasPrefix("aistudio/") || ["temperature", "top_p", "top_k"].contains(key)
    }

    static func studioOutputLimit(_ model: String) -> Int {
        ["aistudio/gemini-4-neon", "aistudio/gemini-4-hydrogen", "aistudio/gemini-3.5-flash-lite"].contains(model) ? 65536 : 32768
    }

    /// Пределы параметра для этой модели (у AI Studio длина ответа ограничена самой моделью).
    static func spec(_ spec: ParameterSpec, for model: String) -> ParameterSpec {
        guard spec.key == "max_tokens", model.hasPrefix("aistudio/") else { return spec }
        let limit = studioOutputLimit(model)
        return ParameterSpec(key: spec.key, label: spec.label, min: spec.min, max: Double(limit), step: 1)
    }

    enum Reasoning {
        /// Выключатель «Рассуждения».
        case toggle
        /// Выбор уровня.
        case levels([Choice])
    }

    private static let studioLevels: [String: [Choice]] = [
        "aistudio/gemma-4-31b-it": [Choice("minimal", "Минимальный"), Choice("high", "Высокий")],
        "aistudio/gemma-4-26b-a4b-it": [Choice("minimal", "Минимальный"), Choice("high", "Высокий")],
        "aistudio/gemini-4-neon": [Choice("low", "Низкий"), Choice("medium", "Средний"), Choice("high", "Высокий"), Choice("xhigh", "Максимальный")],
        "aistudio/gemini-4-hydrogen": [Choice("low", "Низкий"), Choice("medium", "Средний"), Choice("high", "Высокий"), Choice("xhigh", "Максимальный")],
        "aistudio/gemini-3.5-flash-lite": [Choice("minimal", "Минимальный"), Choice("low", "Низкий"), Choice("medium", "Средний"), Choice("high", "Высокий")],
        "aistudio/gemini-4-argon": [Choice("low", "Низкий"), Choice("medium", "Средний"), Choice("high", "Высокий")],
        "aistudio/gemini-4-carbon": [Choice("low", "Низкий"), Choice("medium", "Средний"), Choice("high", "Высокий")],
    ]

    private static let toggleModels: Set<String> = [
        "gemma-31b-iq3", "gemma-26b-uncensored", "gemma-26b-qat", "gemma-12b-uncensored",
        "gemma-4-e4b-uncensored", "qwen-3.8-27b-it", "qwen-3.6-35b-a3b-mtp",
    ]

    /// Усилия Claude (`output_config.effort`, `claudeLevels` сайта). Каталог у моделей разный — уровень, которого
    /// у модели нет, сервер опускает до ближайшего ниже, поэтому список один для всех.
    static let claudeLevels: [Choice] = [
        Choice("low", "Низкий"), Choice("medium", "Средний"), Choice("high", "Высокий"),
        Choice("xhigh", "Очень высокий"), Choice("max", "Максимальный"),
    ]

    static func reasoning(_ model: String) -> Reasoning? {
        if let levels = studioLevels[model] { return .levels(levels) }
        if model.hasPrefix("claude/") { return .levels(claudeLevels) }
        if toggleModels.contains(model) || HostedService.of(model) != nil { return .toggle }
        if model == "muse-glimmer-30b" {
            return .levels([Choice("low", "Минимальные"), Choice("medium", "Средние"), Choice("high", "Высокие"), Choice("xhigh", "Максимальные")])
        }
        return nil
    }

    // MARK: - Nano Banana

    static let nanoSpecs: [String: ParameterSpec] = [
        "nano_temperature": ParameterSpec(key: "nano_temperature", label: "Temperature", min: 0, max: 2, step: 0.05),
        "nano_top_p": ParameterSpec(key: "nano_top_p", label: "Top-P", min: 0, max: 1, step: 0.05),
        "nano_max_output_tokens": ParameterSpec(key: "nano_max_output_tokens", label: "Max output tokens", min: 1, max: 65536, step: 1),
    ]

    static func nanoThinkingLevels(_ model: String) -> [Choice]? {
        switch model {
        case "aistudio/gemini-nano-banana-2.1":
            return [Choice("minimal", "Минимальные"), Choice("medium", "Средние"), Choice("high", "Глубокие")]
        case "aistudio/gemini-3.1-flash-image", "aistudio/gemini-3.1-flash-lite-image":
            return [Choice("minimal", "Минимальные"), Choice("high", "Глубокие")]
        case "aistudio/gemini-omni-1.1-flash":
            return [Choice("low", "Low"), Choice("high", "High")]
        default:
            return nil
        }
    }

    static func nanoDefaultThinking(_ model: String) -> String {
        if isOmni(model) { return "high" }
        return model == "aistudio/gemini-nano-banana-2.1" ? "medium" : "minimal"
    }

    // MARK: - Omni (видео)

    static let omni12 = "aistudio/gemini-omni-1.2-flash"

    static func isOmni(_ model: String) -> Bool {
        model == omni12 || model == "aistudio/gemini-omni-1.1-flash"
    }

    static let omniResolutions: [Choice] = [
        Choice("360p", "360p"), Choice("720p", "720p"), Choice("1080p", "1080p"), Choice("4k", "4K"),
    ]

    /// Длительность в секундах: у 1.2 — до 15, у 1.1 — до 10.
    static func omniDurations(_ model: String) -> [Int] {
        Array(3...(model == omni12 ? 15 : 10))
    }

    static let omniTasks: [Choice] = [
        Choice("auto", "Авто"), Choice("text_to_video", "Из текста"), Choice("image_to_video", "Из картинки"),
        Choice("reference_to_video", "По образцам"), Choice("edit", "Правка видео"), Choice("extend", "Продление видео"),
    ]

    /// Какие числовые параметры AI Studio даёт менять у модели картинок.
    static func nanoSampling(_ model: String) -> (temperature: Bool, topP: Bool, textLimits: Bool) {
        (["aistudio/gemini-3.1-flash-image", "aistudio/gemini-3.1-flash-lite-image",
          "aistudio/gemini-3-pro-image", "aistudio/gemini-2.5-flash-image"].contains(model),
         ["aistudio/gemini-3.1-flash-image", "aistudio/gemini-3-pro-image"].contains(model),
         model == "aistudio/gemini-nano-banana-2.1" || model == "aistudio/gemini-omni-1.2-flash")
    }

    static func nanoOutputFormat(_ model: String) -> Bool {
        ["aistudio/gemini-nano-banana-2.1", "aistudio/gemini-3.1-flash-image",
         "aistudio/gemini-3.1-flash-lite-image"].contains(model)
    }

    /// Число из JSON (`Int`, `Double` или `NSNumber`).
    static func number(_ value: Any?) -> Double? {
        if let value = value as? Double { return value }
        if let value = value as? Int { return Double(value) }
        if let value = value as? NSNumber { return value.doubleValue }
        return nil
    }

    /// Значение для сохранения: целое — как `Int`, дробное — округлённое до шага.
    static func stored(_ value: Double, spec: ParameterSpec) -> Any {
        if spec.isInteger { return Int(value.rounded()) }
        let rounded = (value / spec.step).rounded() * spec.step
        return (rounded * 1000).rounded() / 1000
    }
}
