import Foundation

/// Сведения из заголовка файла GGUF — без загрузки модели: шаблон чата, обучающий контекст,
/// архитектура. Файл отображается в память, читаются только нужные ключи.
struct GGUFInfo: Equatable, Sendable {
    var architecture: String?
    var chatTemplate: String?
    /// Обучающий контекст (`<arch>.context_length`).
    var trainContext: Int?

    var thinking: PhoneThinking { PhoneThinking.kind(template: chatTemplate) }

    static func read(url: URL) -> GGUFInfo? {
        guard let data = try? Data(contentsOf: url, options: .alwaysMapped) else { return nil }
        return parse(data)
    }

    static func parse(_ data: Data) -> GGUFInfo? {
        var reader = Reader(data: data)
        guard reader.bytes(4) == Data("GGUF".utf8),
              let version = reader.u32(), version >= 2,
              reader.u64() != nil, let count = reader.u64() else { return nil }
        var info = GGUFInfo()
        var contexts: [String: Int] = [:]
        for _ in 0..<min(count, 100_000) {
            guard let key = reader.string(), let type = reader.u32() else { return nil }
            switch key {
            case "general.architecture":
                guard type == 8, let value = reader.string() else { return nil }
                info.architecture = value
            case "tokenizer.chat_template":
                guard type == 8, let value = reader.string() else { return nil }
                info.chatTemplate = value
            case _ where key.hasSuffix(".context_length") && [4, 5, 10, 11].contains(type):
                guard let value = reader.integer(type: type) else { return nil }
                contexts[key] = value
            default:
                guard reader.skip(type: type) else { return nil }
            }
        }
        if let arch = info.architecture { info.trainContext = contexts[arch + ".context_length"] }
        if info.trainContext == nil { info.trainContext = contexts.values.first }
        return info
    }

    private struct Reader {
        let data: Data
        var offset: Int

        init(data: Data) {
            self.data = data
            offset = data.startIndex
        }

        mutating func bytes(_ count: Int) -> Data? {
            guard count >= 0, offset + count <= data.endIndex else { return nil }
            defer { offset += count }
            return data[offset..<offset + count]
        }

        mutating func u32() -> UInt32? {
            guard let raw = bytes(4) else { return nil }
            return raw.reversed().reduce(0) { $0 << 8 | UInt32($1) }
        }

        mutating func u64() -> UInt64? {
            guard let raw = bytes(8) else { return nil }
            return raw.reversed().reduce(0) { $0 << 8 | UInt64($1) }
        }

        mutating func string() -> String? {
            guard let length = u64(), length < 64_000_000, let raw = bytes(Int(length)) else { return nil }
            return String(decoding: raw, as: UTF8.self)
        }

        /// Размер значения скалярного типа GGUF.
        static func size(_ type: UInt32) -> Int? {
            switch type {
            case 0, 1, 7: return 1      // u8, i8, bool
            case 2, 3: return 2         // u16, i16
            case 4, 5, 6: return 4      // u32, i32, f32
            case 10, 11, 12: return 8   // u64, i64, f64
            default: return nil
            }
        }

        mutating func integer(type: UInt32) -> Int? {
            switch type {
            case 4: return u32().map { Int($0) }
            case 5: return u32().map { Int(Int32(bitPattern: $0)) }
            case 10: return u64().map { Int(clamping: $0) }
            case 11: return u64().map { Int(Int64(bitPattern: $0)) }
            default: return nil
            }
        }

        mutating func skip(type: UInt32) -> Bool {
            if type == 8 {
                guard let length = u64(), length < 64_000_000 else { return false }
                return bytes(Int(length)) != nil
            }
            if type == 9 {
                guard let element = u32(), let count = u64(), count < 50_000_000 else { return false }
                if element == 8 {
                    for _ in 0..<count {
                        guard let length = u64(), bytes(Int(length)) != nil else { return false }
                    }
                    return true
                }
                guard let size = Self.size(element) else { return false }
                return bytes(Int(count) * size) != nil
            }
            guard let size = Self.size(type) else { return false }
            return bytes(size) != nil
        }
    }
}

/// Как модель рассуждает — по её шаблону чата.
enum PhoneThinking: Equatable, Sendable {
    /// Не рассуждает.
    case none
    /// Gemma 4: рассуждения включает метка `<|think|>` в начале системной реплики.
    case gemma4
    /// Qwen3 и похожие: шаблон знает `enable_thinking`; выключение — пустой блок `<think></think>`.
    case switchable
    /// Рассуждает всегда (DeepSeek-R1, Qwen3 Thinking): выключить нельзя.
    case always

    var canToggle: Bool { self == .gemma4 || self == .switchable }

    static func kind(template: String?) -> PhoneThinking {
        guard let template else { return .none }
        if template.contains("<|think|>") { return .gemma4 }
        if template.contains("enable_thinking") { return .switchable }
        if template.contains("<think>") { return .always }
        return .none
    }
}
