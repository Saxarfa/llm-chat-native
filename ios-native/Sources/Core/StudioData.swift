import Foundation

/// Данные студии картинок — те же, что у сайта (`studioTypes.ts`, `useImageDraft.ts`,
/// `imageModels.tsx`, `imageLoras.ts`). Менять вместе с сайтом.

/// LoRA в черновике: имя файла в ComfyUI и сила для модели и CLIP.
struct StudioLora: Equatable, Identifiable {
    var name: String
    var strength: Double = 1
    var strengthClip: Double?

    var id: String { name }
    var clip: Double { strengthClip ?? strength }

    init(name: String, strength: Double = 1, strengthClip: Double? = 1) {
        self.name = name
        self.strength = strength
        self.strengthClip = strengthClip
    }

    init?(json: Any?) {
        guard let item = json as? [String: Any], let name = item["name"] as? String, !name.isEmpty else { return nil }
        self.name = name
        strength = StudioValue.double(item["strength"]) ?? 1
        strengthClip = StudioValue.double(item["strength_clip"])
    }

    var json: [String: Any] {
        var item: [String: Any] = ["name": name, "strength": strength]
        item["strength_clip"] = strengthClip ?? strength
        return item
    }

    static func list(_ raw: Any?) -> [StudioLora] {
        ((raw as? [Any]) ?? []).compactMap(StudioLora.init(json:))
    }
}

/// Настройки генерации — общий черновик аккаунта (`/api/images/settings`).
struct StudioDraft: Equatable {
    var prompt = ""
    var negative = ""
    var model = "anima_baseV10.safetensors"
    var sampler = "er_sde"
    var scheduler = "normal"
    var denoise: Double = 1
    var size = "1024x1024"
    var width = "1024"
    var height = "1024"
    var steps = 30
    var cfg: Double = 4
    var seed = "-1"
    var loras: [StudioLora] = []

    init() {}

    init(json: [String: Any]) {
        self.init()
        apply(json)
    }

    mutating func apply(_ values: [String: Any]) {
        if let text = values["prompt"] as? String { prompt = text }
        if let text = values["negative"] as? String { negative = text }
        if let text = values["model"] as? String, !text.isEmpty { model = text }
        if let text = values["sampler"] as? String, !text.isEmpty { sampler = text }
        if let text = values["scheduler"] as? String, !text.isEmpty { scheduler = text }
        if let number = StudioValue.double(values["denoise"]) { denoise = number }
        if let text = values["size"] as? String, !text.isEmpty { size = text }
        if let text = StudioValue.text(values["width"]) { width = text }
        if let text = StudioValue.text(values["height"]) { height = text }
        if let number = StudioValue.double(values["steps"]) { steps = Int(number) }
        if let number = StudioValue.double(values["cfg"]) { cfg = number }
        if let text = StudioValue.text(values["seed"]) { seed = text }
        if values.keys.contains("loras") { loras = StudioLora.list(values["loras"]) }
    }

    /// Ширина и высота, которые уйдут на сервер.
    var dimensions: (Int, Int) {
        if size == "custom" { return (Int(width) ?? 0, Int(height) ?? 0) }
        let parts = size.split(separator: "x").compactMap { Int($0) }
        return parts.count == 2 ? (parts[0], parts[1]) : (1024, 1024)
    }

    /// Тело `POST /api/images` и параметров цикла.
    var parameters: [String: Any] {
        let (w, h) = dimensions
        return [
            "prompt": prompt, "negative": negative, "model": model, "sampler": sampler,
            "scheduler": scheduler, "denoise": denoise, "loras": loras.map(\.json),
            "width": w, "height": h, "steps": steps, "cfg": cfg, "seed": Int(seed) ?? -1,
        ]
    }

    /// Ошибка параметров словами сайта (`ImageStudio.tsx`, `localParameterError`).
    func problem(models: [String]?) -> String? {
        let (w, h) = dimensions
        let align = StudioModels.alignment(model)
        if ![w, h].allSatisfy({ $0 >= 256 && $0 <= 4096 && $0 % align == 0 }) {
            return "Размеры должны быть от 256 до 4096 px и кратны \(align)."
        }
        if !(1...80).contains(steps) { return "Шаги: целое число от 1 до 80." }
        if !(0...20).contains(cfg) { return "CFG должен быть от 0 до 20." }
        if !(0...1).contains(denoise) { return "Denoise должен быть от 0 до 1." }
        guard let number = Int(seed), number >= -1, number <= 9_007_199_254_740_991 else {
            return "Seed: -1 или целое число до 9007199254740991."
        }
        if let models, !models.isEmpty, !models.contains(model) {
            return "Выбранный чекпоинт недоступен. Выбери установленную модель."
        }
        return nil
    }
}

/// Задание студии: арт, апскейл или правка.
struct StudioJob: Identifiable, Equatable {
    let id: String
    var prompt = ""
    var status = "queued"
    var width = 1024
    var height = 1024
    var steps: Int?
    var seed: Int?
    var created: Double = 0
    var favorite = false
    var model = ""
    var provider = ""
    var negative: String?
    var cfg: Double?
    var sampler: String?
    var scheduler: String?
    var denoise: Double?
    var loras: [StudioLora]?
    var error: String?
    var progress: Int?
    var images = 0
    var operation: String?
    var upscaleScale: Int?
    var imageSize: String?
    var sourceWidth: Int?
    var sourceHeight: Int?

    init(id: String) { self.id = id }

    init?(json: [String: Any]) {
        guard let id = json["id"] as? String else { return nil }
        self.id = id
        prompt = json["prompt"] as? String ?? ""
        status = json["status"] as? String ?? "queued"
        width = StudioValue.int(json["width"]) ?? 1024
        height = StudioValue.int(json["height"]) ?? 1024
        steps = StudioValue.int(json["steps"])
        seed = StudioValue.int(json["seed"])
        created = StudioValue.double(json["created"]) ?? 0
        favorite = (json["favorite"] as? Bool) == true
        model = json["model"] as? String ?? ""
        provider = json["provider"] as? String ?? ""
        negative = json["negative"] as? String
        cfg = StudioValue.double(json["cfg"])
        sampler = json["sampler"] as? String
        scheduler = json["scheduler"] as? String
        denoise = StudioValue.double(json["denoise"])
        loras = json["loras"] == nil ? nil : StudioLora.list(json["loras"])
        error = json["error"] as? String
        progress = StudioValue.int(json["progress"])
        images = (json["images"] as? [Any])?.count ?? 0
        operation = json["operation"] as? String
        upscaleScale = StudioValue.int(json["upscale_scale"])
        imageSize = json["image_size"] as? String
        sourceWidth = StudioValue.int(json["source_width"])
        sourceHeight = StudioValue.int(json["source_height"])
    }

    var isActive: Bool { ["queued", "preparing", "generating"].contains(status) }
    var isDone: Bool { status == "done" && images > 0 }
    var isCloud: Bool { provider == "aistudio" || model.hasPrefix("aistudio/") }

    /// Подпись хода работы, как в мобильной студии сайта.
    var statusText: String {
        if operation == "upscale", status == "generating" { return "Увеличиваю арт" }
        switch status {
        case "queued": return "В очереди"
        case "preparing": return "Подготовка"
        case "generating": return "Создаю арт"
        case "error": return "Ошибка"
        case "cancelled": return "Остановлено"
        default: return "Генерация"
        }
    }
}

/// Состояние ComfyUI и списки для выбора (`/api/images/config`).
struct StudioConfig: Equatable {
    var online = false
    var model = ""
    var models: [String] = []
    var samplers: [String] = []
    var schedulers: [String] = []

    init() {}

    init(json: [String: Any]) {
        online = (json["online"] as? Bool) == true
        model = json["model"] as? String ?? ""
        models = json["models"] as? [String] ?? []
        samplers = json["samplers"] as? [String] ?? []
        schedulers = json["schedulers"] as? [String] ?? []
    }
}

/// LoRA из ComfyUI (`/api/images/loras`) с карточкой из библиотеки.
struct LoraEntry: Identifiable, Equatable {
    let name: String
    var description = ""
    var triggers = ""
    var favorite = false

    var id: String { name }
    var title: String { StudioModels.loraName(name) }
}

/// Сохранённый набор LoRA (`/api/lora-library`).
struct LoraSet: Identifiable, Equatable {
    let id: String
    let name: String
    let architecture: String
    let loras: [StudioLora]
}

/// Готовые форматы мобильной студии.
struct StudioFormat: Identifiable {
    let value: String
    let name: String
    let width: Int
    let height: Int
    var id: String { value }

    static let all: [StudioFormat] = [
        StudioFormat(value: "1024x1024", name: "Квадрат", width: 1024, height: 1024),
        StudioFormat(value: "832x1216", name: "Портрет", width: 832, height: 1216),
        StudioFormat(value: "1216x832", name: "Альбом", width: 1216, height: 832),
        StudioFormat(value: "512x512", name: "Маленький", width: 512, height: 512),
        StudioFormat(value: "1248x1824", name: "Большой портрет", width: 1248, height: 1824),
    ]
}

/// Названия чекпоинтов и их движки — перенос `imageModels.tsx`.
enum StudioModels {
    private static func file(_ model: String) -> String {
        model.replacingOccurrences(of: "\\", with: "/").split(separator: "/").last.map(String.init)?.lowercased() ?? ""
    }

    static let sdxlNames: [String: String] = [
        "waiillustrioussdxl_v170.safetensors": "WAI Illustrious · v17.0",
        "prefectillustriousxl_v8.safetensors": "Prefect Illustrious XL · v8",
        "cyberrealisticpony_v180coreshift.safetensors": "CyberRealistic Pony · v18.0 CoreShift",
    ]

    static func isNoctQ(_ model: String) -> Bool { file(model) == "noctqa_v1_int8_convrot.safetensors" }
    static func isAnima29B(_ model: String) -> Bool { file(model) == "anima-2.9b-preview-v1.safetensors" }
    static func isAnima38B(_ model: String) -> Bool { file(model) == "anima-3.8b-v1.1.safetensors" }
    static func isMiaoMiao(_ model: String) -> Bool { file(model) == "miaomiaorealskin_cknepsve10.safetensors" }
    static func isSDXL(_ model: String) -> Bool { isMiaoMiao(model) || sdxlNames[file(model)] != nil }

    static func engine(_ model: String) -> String {
        isNoctQ(model) ? "noct-q" : isSDXL(model) ? "sdxl" : isAnima38B(model) ? "anima-38b" : isAnima29B(model) ? "anima-29b" : "anima"
    }

    static func alignment(_ model: String) -> Int { isNoctQ(model) ? 32 : 8 }

    static func name(_ model: String) -> String {
        if let sdxl = sdxlNames[file(model)] { return sdxl }
        if model == "MiaoMiao_Harem_Anima_v1.6.safetensors" { return "MiaoMiao Harem · Anima 1.6" }
        if isNoctQ(model) { return "Noct Q Anime · INT8" }
        if isMiaoMiao(model) { return "MiaoMiao RealSkin · EPS VE1.0" }
        if isAnima38B(model) { return "Anima 3.8B · v1.1" }
        if isAnima29B(model) { return "Anima 2.9B · Preview V1" }
        return model.replacingOccurrences(of: ".safetensors", with: "", options: [.caseInsensitive, .anchored, .backwards])
    }

    /// Группы для выбора чекпоинта, как `ImageModelOptions`.
    struct ModelGroup: Identifiable {
        let title: String
        let models: [String]
        var id: String { title }
    }

    static func groups(_ models: [String]) -> [ModelGroup] {
        [
            ModelGroup(title: "Anima", models: models.filter { !isNoctQ($0) && !isSDXL($0) }),
            ModelGroup(title: "SDXL · Illustrious / Pony", models: models.filter(isSDXL)),
            ModelGroup(title: "Noct Q · Qwen Image 2.1", models: models.filter(isNoctQ)),
        ].filter { !$0.models.isEmpty }
    }

    static func loraName(_ name: String) -> String {
        if name == "Amona_Jeane_Illustrious.safetensors" { return "Амона Джин · Illustrious" }
        if name == "Alya_Kujou_Official_Art_Anima.safetensors" { return "Аля Кудзё · официальный арт" }
        return name.replacingOccurrences(of: ".safetensors", with: "", options: [.caseInsensitive, .anchored, .backwards])
            .replacingOccurrences(of: "_", with: " ")
    }
}

/// Сервер присылает числа то строкой, то числом.
enum StudioValue {
    static func double(_ raw: Any?) -> Double? {
        if let number = raw as? NSNumber, !(raw is Bool) { return number.doubleValue }
        if let text = raw as? String { return Double(text) }
        return nil
    }

    static func int(_ raw: Any?) -> Int? {
        double(raw).flatMap { $0.isFinite ? Int($0) : nil }
    }

    static func text(_ raw: Any?) -> String? {
        if let text = raw as? String { return text }
        if let number = double(raw) { return number == number.rounded() ? String(Int(number)) : String(number) }
        return nil
    }
}
