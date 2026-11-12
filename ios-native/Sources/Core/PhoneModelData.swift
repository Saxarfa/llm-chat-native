import Foundation

/// Модели, которые работают прямо на iPhone (этап 8): файлы GGUF и движок llama.cpp.
/// В чатах такая модель записывается как `phone/<имя файла>`.
enum PhoneModelID {
    static let prefix = "phone/"

    static func isPhone(_ id: String) -> Bool { id.hasPrefix(prefix) }

    static func make(file: String) -> String { prefix + file }

    static func file(of id: String) -> String { String(id.dropFirst(prefix.count)) }
}

/// Скачанная или добавленная модель. Список хранится рядом с файлами (`models.json`).
struct PhoneModel: Codable, Identifiable, Equatable {
    /// Имя файла в папке моделей — оно же часть id в чатах.
    var file: String
    /// Откуда скачана (`автор/репозиторий` на Hugging Face); `nil` — добавлена из «Файлов».
    var repo: String?
    var size: Int64
    var added: Double

    var id: String { file }
    var chatID: String { PhoneModelID.make(file: file) }
    var name: String { PhoneModelNames.title(file) }
    var quant: String? { PhoneModelNames.quant(file) }
}

/// Репозиторий в поиске Hugging Face.
struct HFRepo: Identifiable, Equatable {
    let id: String
    let downloads: Int
    let likes: Int

    init(id: String, downloads: Int = 0, likes: Int = 0) {
        self.id = id
        self.downloads = downloads
        self.likes = likes
    }

    init?(json: [String: Any]) {
        guard let id = json["id"] as? String, !id.isEmpty else { return nil }
        self.id = id
        downloads = (json["downloads"] as? NSNumber)?.intValue ?? 0
        likes = (json["likes"] as? NSNumber)?.intValue ?? 0
    }

    var author: String { id.split(separator: "/").first.map(String.init) ?? "" }
    var name: String { id.split(separator: "/").dropFirst().joined(separator: "/") }
}

/// Файл GGUF в репозитории.
struct HFFile: Identifiable, Equatable {
    /// Путь внутри репозитория (бывает в подпапке, например `Q4_K_M/model.gguf`).
    let path: String
    let size: Int64

    var id: String { path }
    var file: String { (path as NSString).lastPathComponent }
    var quant: String? { PhoneModelNames.quant(file) }

    /// Из дерева репозитория — только цельные GGUF модели: без проекторов картинок (`mmproj`)
    /// и без частей многофайловых моделей (`-00001-of-00003`), их llama.cpp так не загрузит.
    static func list(_ tree: [[String: Any]]) -> [HFFile] {
        tree.compactMap { item -> HFFile? in
            guard (item["type"] as? String) == "file", let path = item["path"] as? String,
                  isUsable(path) else { return nil }
            let lfs = item["lfs"] as? [String: Any]
            let size = (lfs?["size"] as? NSNumber)?.int64Value ?? (item["size"] as? NSNumber)?.int64Value ?? 0
            return HFFile(path: path, size: size)
        }
        .sorted { $0.size < $1.size }
    }

    static func isUsable(_ path: String) -> Bool {
        let name = (path as NSString).lastPathComponent.lowercased()
        guard name.hasSuffix(".gguf") else { return false }
        if name.contains("mmproj") { return false }
        if name.range(of: #"-\d{5}-of-\d{5}\.gguf$"#, options: .regularExpression) != nil { return false }
        return true
    }
}

enum PhoneModelNames {
    private static let quantPattern = #"(?i)(?:^|[-_.])((?:I?Q\d(?:_[A-Z0-9]+)*)|BF16|F16|F32|MXFP4(?:_MOE)?)(?=\.gguf$|[-_.])"#

    /// Квантование из имени файла: `Q4_K_M`, `IQ3_XXS`, `Q8_0`, `F16`.
    static func quant(_ file: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: quantPattern) else { return nil }
        let range = NSRange(file.startIndex..., in: file)
        guard let match = regex.matches(in: file, range: range).last,
              let found = Range(match.range(at: 1), in: file) else { return nil }
        return file[found].uppercased()
    }

    /// Имя для списка: без `.gguf` и квантования, с пробелами вместо дефисов.
    static func title(_ file: String) -> String {
        var name = file
        if name.lowercased().hasSuffix(".gguf") { name = String(name.dropLast(5)) }
        if let quant = quant(file), let range = name.range(of: quant, options: [.caseInsensitive, .backwards]) {
            name.removeSubrange(range)
        }
        name = name.replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " ")
        name = name.split(separator: " ").joined(separator: " ")
        return name.isEmpty ? file : name
    }

    /// Имя в выборе модели и в чате: `Qwen3 4B Instruct · Q4_K_M`.
    static func display(_ id: String) -> String {
        let file = PhoneModelID.file(of: id)
        guard let quant = quant(file) else { return title(file) }
        return title(file) + " · " + quant
    }
}

enum PhoneMemory {
    /// Сколько памяти нужно модели: веса целиком плюс запас на контекст и буферы Metal.
    static func needed(fileSize: Int64, context: Int = 4096) -> Int64 {
        let kvAndBuffers = Int64(context) * 160_000 + 300_000_000
        return fileSize + kvAndBuffers
    }

    enum Fit: Equatable {
        case fits, tight, tooBig
    }

    /// `available` — сколько ещё может занять приложение (`os_proc_available_memory`),
    /// плюс то, что уже занимает загруженная модель.
    static func fit(fileSize: Int64, available: Int64) -> Fit {
        guard available > 0 else { return .tight }
        let need = needed(fileSize: fileSize)
        if need <= available * 85 / 100 { return .fits }
        if need <= available { return .tight }
        return .tooBig
    }

    static func gigabytes(_ bytes: Int64) -> String {
        let value = Double(bytes) / 1_000_000_000
        if value >= 10 { return String(format: "%.0f ГБ", value) }
        if value >= 1 { return String(format: "%.1f ГБ", value).replacingOccurrences(of: ".", with: ",") }
        return String(format: "%.0f МБ", value * 1000)
    }
}

/// Делит вывод модели на размышления (`<think>…</think>`) и ответ — как это делает сервер.
enum ThinkSplitter {
    static func split(_ raw: String) -> (reasoning: String, text: String) {
        var body = raw
        let trimmed = body.drop { $0.isWhitespace }
        guard trimmed.hasPrefix("<think>") else {
            // Шаблон Qwen сам открывает размышление — в выводе остаётся только закрывающий тег.
            if let close = body.range(of: "</think>") {
                return (String(body[..<close.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines),
                        String(body[close.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines))
            }
            return ("", raw)
        }
        body = String(trimmed.dropFirst("<think>".count))
        if let close = body.range(of: "</think>") {
            return (String(body[..<close.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines),
                    String(body[close.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines))
        }
        // Размышление ещё идёт.
        return (body.trimmingCharacters(in: .whitespacesAndNewlines), "")
    }
}

/// Параметры выборки токенов — из тех же «Параметров чата», что и у моделей на ПК.
struct PhoneSampling: Equatable {
    var temperature: Float = 0.7
    var topP: Float = 0.9
    var topK: Int32 = 40
    var minP: Float = 0.05
    var repeatPenalty: Float = 1.1
    var presencePenalty: Float = 0
    var frequencyPenalty: Float = 0
    /// `-1` — до конца контекста.
    var maxTokens: Int = -1
    var stop: [String] = []

    init() {}

    init(config: [String: Any]) {
        func number(_ key: String) -> Double? { ChatParameters.number(config[key]) }
        if let value = number("temperature") { temperature = Float(value) }
        if let value = number("top_p") { topP = Float(value) }
        if let value = number("top_k") { topK = Int32(max(0, value)) }
        if let value = number("min_p") { minP = Float(value) }
        if let value = number("repeat_penalty") { repeatPenalty = Float(value) }
        if let value = number("presence_penalty") { presencePenalty = Float(value) }
        if let value = number("frequency_penalty") { frequencyPenalty = Float(value) }
        if let value = number("max_tokens") { maxTokens = Int(value) }
        stop = ((config["stop"] as? [Any]) ?? []).compactMap { $0 as? String }.filter { !$0.isEmpty }
    }
}
