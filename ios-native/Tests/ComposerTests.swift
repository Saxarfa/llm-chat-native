import XCTest
@testable import LLMChat

/// 0.10: память под контекст по заголовку GGUF, скорость загрузки, настройки за моделью,
/// очередь вопросов и оценка контекста.
final class ComposerTests: XCTestCase {
    // MARK: - Память

    func testKVBytesFromHeader() {
        let info = GGUFInfo(architecture: "llama", layers: 2, heads: 8, kvHeads: [2], keyLength: 64, valueLength: 64)
        // 2 слоя × 2 головы × (64 + 64) × 2 байта × 1000 токенов.
        XCTAssertEqual(info.kvBytes(context: 1000), 1_024_000)
        var sliding = info
        sliding.slidingWindow = 100
        sliding.slidingPattern = [true, false]
        // Слой с окном хранит 100 + 512 токенов, а не 1000.
        XCTAssertEqual(sliding.kvBytes(context: 1000), 2 * 128 * 2 * 612 + 512_000)
        XCTAssertNil(GGUFInfo(architecture: "llama").kvBytes(context: 1000))
        let fromEmbedding = GGUFInfo(layers: 1, heads: 4, kvHeads: [], embedding: 256)
        XCTAssertEqual(fromEmbedding.kvBytes(context: 10), 4 * 128 * 2 * 10)
    }

    func testHeaderReadsPerLayerHeads() {
        func u32(_ value: UInt32) -> Data { withUnsafeBytes(of: value.littleEndian) { Data($0) } }
        func u64(_ value: UInt64) -> Data { withUnsafeBytes(of: value.littleEndian) { Data($0) } }
        func string(_ text: String) -> Data { u64(UInt64(text.utf8.count)) + Data(text.utf8) }
        func pair(_ key: String, _ type: UInt32, _ value: Data) -> Data { string(key) + u32(type) + value }
        var data = Data("GGUF".utf8) + u32(3) + u64(0) + u64(6)
        data += pair("general.architecture", 8, string("gemma4"))
        data += pair("gemma4.block_count", 4, u32(2))
        data += pair("gemma4.attention.head_count_kv", 9, u32(4) + u64(2) + u32(1) + u32(2))
        data += pair("gemma4.attention.key_length", 4, u32(64))
        data += pair("gemma4.attention.sliding_window", 4, u32(100))
        data += pair("gemma4.attention.sliding_window_pattern", 9, u32(7) + u64(2) + Data([1, 0]))
        let info = GGUFInfo.parse(data)
        XCTAssertEqual(info?.layers, 2)
        XCTAssertEqual(info?.kvHeads, [1, 2])
        XCTAssertEqual(info?.slidingPattern, [true, false])
        // Слой 0: 1 голова, окно 612 токенов; слой 1: 2 головы, весь контекст.
        XCTAssertEqual(info?.kvBytes(context: 1000), Int64(1 * 128 * 2 * 612 + 2 * 128 * 2 * 1000))
    }

    func testMemoryUsesHeaderEstimate() {
        let rough = PhoneMemory.needed(fileSize: 4_000_000_000, context: 32_768)
        let exact = PhoneMemory.needed(fileSize: 4_000_000_000, context: 32_768, kv: 1_000_000_000)
        XCTAssertEqual(exact, 5_400_000_000)
        XCTAssertLessThan(exact, rough, "грубая оценка с запасом, по заголовку — меньше")
        XCTAssertEqual(PhoneMemory.fit(fileSize: 4_000_000_000, available: 6_000_000_000, context: 32_768,
                                       kv: 1_000_000_000), .tight)
        XCTAssertEqual(PhoneMemory.fit(fileSize: 4_000_000_000, available: 6_000_000_000, context: 32_768), .tooBig)
    }

    // MARK: - Скорость загрузки

    func testTransferMeter() {
        var meter = TransferMeter()
        meter.add(bytes: 0, at: 100)
        meter.add(bytes: 1_000_000, at: 101)
        XCTAssertEqual(meter.bytesPerSecond, 1_000_000, accuracy: 1)
        meter.add(bytes: 3_000_000, at: 102)
        XCTAssertEqual(meter.bytesPerSecond, 1_300_000, accuracy: 1, "сглаживание: 0,7 старого + 0,3 нового")
        XCTAssertFalse(meter.stalled(at: 104))
        XCTAssertTrue(meter.stalled(at: 108), "больше 5 с без данных")
        XCTAssertEqual(meter.line(received: 3_000_000, total: 3_000_000, at: 108), "3 МБ из 3 МБ · нет данных…")
        XCTAssertEqual(TransferMeter.speed(12_500_000), "12,5 МБ/с")
        XCTAssertEqual(TransferMeter.speed(850_000), "850 КБ/с")
        XCTAssertEqual(TransferMeter.speed(120_000_000), "120 МБ/с")
        XCTAssertEqual(TransferMeter.remaining(30), "~30 с")
        XCTAssertEqual(TransferMeter.remaining(240), "~4 мин")
        XCTAssertEqual(TransferMeter.remaining(3_900), "~1 ч 5 мин")
        XCTAssertEqual(TransferMeter(bytesPerSecond: 12_500_000).line(received: 1_100_000_000, total: 4_800_000_000, at: 0),
                       "1,1 ГБ из 4,8 ГБ · 12,5 МБ/с · осталось ~5 мин")
    }

    // MARK: - Настройки за моделью

    @MainActor
    func testModelValueReplacesChatValue() async {
        let app = AppModel(preview: .chat)
        app.activeChatID = "7"
        let model = app.activeModelID
        app.chatMeta["7"] = ChatMeta(overrides: [model: ["temperature": 0.9, "top_k": 12] as [String: Any], "searchMode": "forced"],
                                     branch: "main")
        XCTAssertNotEqual(ChatParameters.number(app.activeConfig["top_k"]), 12, "правки отдельного чата не действуют")

        await app.setModelValue("temperature", 1.2)
        XCTAssertEqual(ChatParameters.number(app.savedModelValues(model)["temperature"]), 1.2)
        XCTAssertEqual(ChatParameters.number(app.activeConfig["temperature"]), 1.2)
        let chat = ChatConfig.dict(app.activeOverrides[model])
        XCTAssertNil(chat["temperature"], "старая правка чата убрана")
        XCTAssertEqual(chat["top_k"] as? Int, 12, "остальное в чате не трогаем")
        XCTAssertEqual(app.activeSearchMode, "forced", "поиск остаётся настройкой чата")

        await app.resetModelValues(["temperature", "top_p"], model: model)
        XCTAssertNil(app.savedModelValues(model)["temperature"])
        XCTAssertEqual(ChatParameters.number(app.activeConfig["temperature"]),
                       ChatParameters.number(ChatConfig.config(model: model, settings: ServerSettings(), overrides: [:])["temperature"]))

        XCTAssertTrue(app.memoryEnabled(model))
        await app.setModelValue("memoryEnabled", false)
        XCTAssertFalse(app.memoryEnabled(model))
    }

    func testPayloadUsesModelSettings() {
        var settings = ServerSettings()
        settings.modelConfigs["m"] = ["temperature": 0.3]
        let body = ChatConfig.payload(chatID: "c", model: "m", settings: settings,
                                      overrides: ["m": ["temperature": 1.5], "searchMode": "forced"],
                                      branch: "main", serverURL: nil, message: "Привет", messageID: "u1")
        XCTAssertEqual(ChatParameters.number(ChatConfig.dict(body["settings"])["temperature"]), 0.3)
        XCTAssertEqual(body["search_mode"] as? String, "forced")
        XCTAssertNotNil(body["overrides"], "параметры чата по-прежнему сохраняются на сервере")
    }

    // MARK: - Капсула

    @MainActor
    func testQueue() {
        let app = AppModel(preview: .streaming)
        XCTAssertNotNil(app.activeLive)
        app.enqueue("Второй вопрос", attachments: [])
        app.enqueue("Третий", attachments: [])
        XCTAssertEqual(app.activeQueue.map(\.text), ["Второй вопрос", "Третий"])
        app.runQueue()
        XCTAssertEqual(app.activeQueue.count, 2, "пока модель отвечает, очередь ждёт")
        app.cancelQueued(app.activeQueue[0])
        XCTAssertEqual(app.activeQueue.map(\.text), ["Третий"])
    }

    func testContextUsage() {
        XCTAssertEqual(ContextUsage.estimate(["abcdef", "a"]), 3)
        XCTAssertEqual(ContextUsage(used: 8_192, capacity: 32_768, estimated: false).fraction, 0.25)
        XCTAssertNil(ContextUsage(used: 10, capacity: nil, estimated: true).fraction)
        XCTAssertEqual(ContextUsage(used: 40_000, capacity: 32_768, estimated: false).fraction, 1)
        XCTAssertEqual(Plural.knowledge(2, .library), "2 базы")
        XCTAssertEqual(Plural.knowledge(5, .library), "5 баз")
    }
}
