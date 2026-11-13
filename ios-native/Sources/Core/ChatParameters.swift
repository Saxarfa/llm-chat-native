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

/// Числовой параметр генерации: подпись, пределы, шаг, пояснение.
struct ParameterSpec: Identifiable {
    let key: String
    let label: String
    let min: Double
    let max: Double
    let step: Double
    let hint: String

    var id: String { key }
    var isInteger: Bool { step >= 1 }
}

/// Какие параметры показывать для модели. Перенос `frontend/src/domain.ts`
/// (`parameterSupported`, `reasoningKind`, `reasoningLevels`, `nano*`) и списков из
/// `Settings.tsx`/`NanoChatParameters.tsx`. Менять только вместе с сайтом.
enum ChatParameters {
    static let specs: [ParameterSpec] = [
        ParameterSpec(key: "temperature", label: "Температура", min: 0, max: 2, step: 0.05,
                      hint: "Меньше — более предсказуемый выбор токенов. Больше — больше разнообразия."),
        ParameterSpec(key: "top_p", label: "Top-P", min: 0, max: 1, step: 0.05,
                      hint: "Оставляет токены с суммарной вероятностью до этого порога. 1 отключает фильтр."),
        ParameterSpec(key: "min_p", label: "Min-P", min: 0, max: 1, step: 0.01,
                      hint: "Порог относительно наиболее вероятного токена. 0 отключает фильтр."),
        ParameterSpec(key: "max_tokens", label: "Длина ответа", min: 1, max: 131072, step: 1,
                      hint: "Максимум новых токенов, включая рассуждения."),
        ParameterSpec(key: "top_k", label: "Top-K", min: 0, max: 1000, step: 1,
                      hint: "Оставляет K наиболее вероятных токенов. 0 отключает фильтр."),
        ParameterSpec(key: "repeat_penalty", label: "Штраф за повторы", min: 0, max: 3, step: 0.05,
                      hint: "1 отключает штраф. Повышение может уменьшить повторы, но и исказить текст."),
        ParameterSpec(key: "presence_penalty", label: "Presence penalty", min: -2, max: 2, step: 0.05,
                      hint: "Штраф за появление токена в контексте."),
        ParameterSpec(key: "frequency_penalty", label: "Frequency penalty", min: -2, max: 2, step: 0.05,
                      hint: "Штраф пропорционально частоте токена."),
    ]

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

    static func supported(_ model: String, _ key: String) -> Bool {
        if isNano(model) { return false }
        if (model == "aistudio/gemini-4-argon" || model == "aistudio/gemini-4-carbon") && key != "max_tokens" {
            return false
        }
        return !model.hasPrefix("aistudio/") || ["temperature", "top_p", "top_k", "max_tokens"].contains(key)
    }

    static func studioOutputLimit(_ model: String) -> Int {
        ["aistudio/gemini-4-hydrogen", "aistudio/gemini-3.5-flash-lite"].contains(model) ? 65536 : 32768
    }

    /// Пределы параметра для этой модели (у AI Studio длина ответа ограничена самой моделью).
    static func spec(_ spec: ParameterSpec, for model: String) -> ParameterSpec {
        guard spec.key == "max_tokens", model.hasPrefix("aistudio/") else { return spec }
        let limit = studioOutputLimit(model)
        return ParameterSpec(key: spec.key, label: spec.label, min: spec.min, max: Double(limit), step: 1,
                             hint: "До \(limit.formatted()) токенов вместе с рассуждениями.")
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
        "aistudio/gemini-4-hydrogen": [Choice("low", "Низкий"), Choice("medium", "Средний"), Choice("high", "Высокий"), Choice("xhigh", "Максимальный")],
        "aistudio/gemini-3.5-flash-lite": [Choice("minimal", "Минимальный"), Choice("low", "Низкий"), Choice("medium", "Средний"), Choice("high", "Высокий")],
        "aistudio/gemini-4-argon": [Choice("low", "Низкий"), Choice("medium", "Средний"), Choice("high", "Высокий")],
        "aistudio/gemini-4-carbon": [Choice("low", "Низкий"), Choice("medium", "Средний"), Choice("high", "Высокий")],
    ]

    private static let toggleModels: Set<String> = [
        "gemma-31b-iq3", "gemma-26b-uncensored", "gemma-26b-qat", "gemma-12b-uncensored",
        "gemma-4-e4b-uncensored", "qwen-3.8-27b-it", "qwen-3.6-35b-a3b-mtp",
    ]

    static func reasoning(_ model: String) -> Reasoning? {
        if let levels = studioLevels[model] { return .levels(levels) }
        if toggleModels.contains(model) { return .toggle }
        if model == "muse-glimmer-30b" {
            return .levels([Choice("low", "Минимальные"), Choice("medium", "Средние"), Choice("high", "Высокие"), Choice("xhigh", "Максимальные")])
        }
        return nil
    }

    // MARK: - Nano Banana

    static let nanoSpecs: [String: ParameterSpec] = [
        "nano_temperature": ParameterSpec(key: "nano_temperature", label: "Температура", min: 0, max: 2, step: 0.05,
                                          hint: "Меньше — изображения ближе к описанию и друг к другу. Больше — больше разнообразия."),
        "nano_top_p": ParameterSpec(key: "nano_top_p", label: "Top-P", min: 0, max: 1, step: 0.05,
                                    hint: "Оставляет варианты с суммарной вероятностью до этого порога. 1 отключает фильтр."),
        "nano_max_output_tokens": ParameterSpec(key: "nano_max_output_tokens", label: "Длина ответа", min: 1, max: 65536, step: 1,
                                                hint: "Вместе с рассуждениями и изображением. Слишком малое значение может оборвать картинку."),
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

    static let omniTaskHints: [String: String] = [
        "auto": "Модель выбирает задачу по вашему сообщению.",
        "text_to_video": "Опишите сцену, движение и звук.",
        "image_to_video": "Добавьте картинку и опишите, как её оживить.",
        "reference_to_video": "Добавьте изображения или MP4 как образцы и опишите новую сцену.",
        "edit": "Добавьте MP4 или используйте ролик из прошлого ответа. Размер и длительность сохраняются.",
        "extend": "Добавьте MP4 или используйте ролик из прошлого ответа. Опишите, что произойдёт дальше.",
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
