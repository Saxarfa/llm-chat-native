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
    /// Сколько памяти нужно модели: веса целиком, кэш контекста и буферы Metal.
    /// `kv` — точный размер кэша из заголовка GGUF (`GGUFInfo.kvBytes`); без него — грубая оценка.
    static func needed(fileSize: Int64, context: Int = 4096, kv: Int64? = nil) -> Int64 {
        let cache = kv ?? Int64(context) * 160_000
        return fileSize + cache + 400_000_000
    }

    enum Fit: Equatable {
        case fits, tight, tooBig
    }

    /// `available` — сколько ещё может занять приложение (`os_proc_available_memory`),
    /// плюс то, что уже занимает загруженная модель.
    static func fit(fileSize: Int64, available: Int64, context: Int = 4096, kv: Int64? = nil) -> Fit {
        guard available > 0 else { return .tight }
        let need = needed(fileSize: fileSize, context: context, kv: kv)
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

/// Скорость загрузки: сглаженная за последние секунды, чтобы цифра не прыгала.
struct TransferMeter: Equatable {
    private(set) var bytesPerSecond: Double
    private var lastBytes: Int64 = 0
    private var lastTime: TimeInterval = 0
    /// Когда байты прибавлялись в последний раз.
    private var changedAt: TimeInterval = 0

    init(bytesPerSecond: Double = 0) {
        self.bytesPerSecond = bytesPerSecond
    }

    mutating func add(bytes: Int64, at time: TimeInterval) {
        if lastTime == 0 || bytes < lastBytes {
            lastBytes = bytes
            lastTime = time
            changedAt = time
            return
        }
        if bytes > lastBytes { changedAt = time }
        let elapsed = time - lastTime
        guard elapsed >= 0.5 else { return }
        let rate = Double(bytes - lastBytes) / elapsed
        bytesPerSecond = bytesPerSecond == 0 ? rate : bytesPerSecond * 0.7 + rate * 0.3
        lastBytes = bytes
        lastTime = time
    }

    /// Данные давно не приходят: скорость и время уже неправда.
    func stalled(at time: TimeInterval) -> Bool {
        changedAt > 0 && time - changedAt > 5
    }

    /// Строка под полосой загрузки.
    func line(received: Int64, total: Int64, at time: TimeInterval) -> String {
        var parts = ["\(PhoneMemory.gigabytes(received)) из \(PhoneMemory.gigabytes(total))"]
        if stalled(at: time) {
            parts.append("нет данных…")
        } else if bytesPerSecond > 0 {
            parts.append(Self.speed(bytesPerSecond))
            if total > received { parts.append("осталось " + Self.remaining(Double(total - received) / bytesPerSecond)) }
        } else if total > 0 {
            parts.append("\(Int(Double(received) / Double(total) * 100))%")
        }
        return parts.joined(separator: " · ")
    }

    static func speed(_ bytesPerSecond: Double) -> String {
        let megabytes = bytesPerSecond / 1_000_000
        if megabytes >= 100 { return String(format: "%.0f МБ/с", megabytes) }
        if megabytes >= 1 { return String(format: "%.1f МБ/с", megabytes).replacingOccurrences(of: ".", with: ",") }
        return String(format: "%.0f КБ/с", bytesPerSecond / 1000)
    }

    static func remaining(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds > 0 else { return "—" }
        if seconds < 60 { return "~\(max(1, Int(seconds.rounded()))) с" }
        let minutes = Int((seconds / 60).rounded())
        if minutes < 60 { return "~\(minutes) мин" }
        let hours = minutes / 60
        let rest = minutes % 60
        return rest == 0 ? "~\(hours) ч" : "~\(hours) ч \(rest) мин"
    }
}

/// Делит вывод модели на размышления (`<think>…</think>`) и ответ — как это делает сервер.
enum ThinkSplitter {
    static func split(_ raw: String) -> (reasoning: String, text: String) {
        let parts = splitTags(raw)
        return (stripHeader(parts.reasoning), parts.text)
    }

    /// Gemma 4 начинает размышление строкой «thought».
    private static func stripHeader(_ reasoning: String) -> String {
        guard reasoning.hasPrefix("thought") else { return reasoning }
        let rest = reasoning.dropFirst("thought".count)
        guard rest.isEmpty || rest.first?.isNewline == true else { return reasoning }
        return rest.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func splitTags(_ raw: String) -> (reasoning: String, text: String) {
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
    /// Рассуждать перед ответом (если модель умеет).
    var thinking = false

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
        thinking = (config["thinking"] as? Bool) ?? false
    }
}

/// Промпт для моделей, чей шаблон llama.cpp без Jinja не знает.
/// Gemma 4: `<|turn>роль\n…<turn|>\n`, ответ модели — роль `model` (сверено с шаблоном из её GGUF).
enum PhoneChatFormat {
    static func render(template: String?, messages: [(role: String, content: String)], thinking: Bool = false) -> String? {
        guard let template, template.contains("<|turn>") else { return nil }
        var rest = messages[...]
        var out = ""
        var system: String?
        if let first = rest.first, first.role == "system" {
            system = first.content.trimmingCharacters(in: .whitespacesAndNewlines)
            rest = rest.dropFirst()
        }
        // Рассуждения включает метка в самом начале системной реплики (как enable_thinking в шаблоне).
        if system != nil || thinking {
            out += "<|turn>system\n" + (thinking ? "<|think|>" : "") + (system ?? "") + "<turn|>\n"
        }
        for message in rest {
            let role = message.role == "assistant" ? "model" : message.role
            out += "<|turn>\(role)\n\(message.content.trimmingCharacters(in: .whitespacesAndNewlines))<turn|>\n"
        }
        return out + "<|turn>model\n"
    }

    /// Служебные токены размышлений Gemma 4 → теги, которые понимает `ThinkSplitter`.
    static let thinkTags = ["<|channel>": "<think>", "<channel|>": "</think>"]

    /// Окончание промпта, выключающее рассуждения у моделей вроде Qwen3 (как enable_thinking=false).
    static let thinkingOff = "<think>\n\n</think>\n\n"

    /// Метки границ реплик у распространённых шаблонов: если модель их пишет, ответ закончен.
    static let turnMarkers = ["<|im_end|>", "<|im_start|>", "<end_of_turn>", "<start_of_turn>",
                              "<turn|>", "<|turn>", "<|eot_id|>", "<|start_header_id|>",
                              "<|end|>", "<|endoftext|>", "</s>"]

    /// Старый ответ без хвоста, где модель продолжала писать за собеседника (до 0.8.1).
    static func clean(_ text: String) -> String {
        guard let cut = turnMarkers.compactMap({ text.range(of: $0)?.lowerBound }).min() else { return text }
        return String(text[..<cut])
    }
}

/// Ищет стоп-строки в потоке кусков: придерживает хвост, который может оказаться началом
/// стоп-строки, чтобы её части не успели попасть на экран.
struct StopScanner {
    let stops: [String]
    private var held = ""
    private(set) var stopped = false

    init(stops: [String]) {
        self.stops = stops.filter { !$0.isEmpty }
    }

    /// Возвращает текст, который уже можно показать.
    mutating func feed(_ text: String) -> String {
        guard !stopped else { return "" }
        held += text
        if let cut = stops.compactMap({ held.range(of: $0)?.lowerBound }).min() {
            stopped = true
            let out = String(held[..<cut])
            held = ""
            return out
        }
        // Самый длинный хвост, совпадающий с началом какой-нибудь стоп-строки, придерживаем.
        var keep = 0
        for stop in stops {
            var length = min(stop.count - 1, held.count)
            while length > keep {
                if stop.hasPrefix(held.suffix(length)) { keep = length; break }
                length -= 1
            }
        }
        let out = String(held.dropLast(keep))
        held = String(held.suffix(keep))
        return out
    }

    /// Остаток в конце ответа.
    mutating func flush() -> String {
        defer { held = "" }
        return stopped ? "" : held
    }
}
