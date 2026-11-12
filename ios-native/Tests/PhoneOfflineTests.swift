import XCTest
@testable import LLMChat

/// Этап 8.2: заголовок GGUF, рассуждения, хранилище чатов телефона, ввод чисел, сброс параметра.
final class PhoneOfflineTests: XCTestCase {
    // MARK: - GGUF

    private func gguf(_ pairs: [(String, UInt32, Data)]) -> Data {
        var data = Data("GGUF".utf8)
        func u32(_ value: UInt32) { withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) } }
        func u64(_ value: UInt64) { withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) } }
        u32(3)
        u64(0)
        u64(UInt64(pairs.count))
        for (key, type, value) in pairs {
            u64(UInt64(key.utf8.count))
            data.append(Data(key.utf8))
            u32(type)
            data.append(value)
        }
        return data
    }

    private func string(_ text: String) -> Data {
        var data = Data()
        withUnsafeBytes(of: UInt64(text.utf8.count).littleEndian) { data.append(contentsOf: $0) }
        data.append(Data(text.utf8))
        return data
    }

    func testGGUFHeader() {
        var tokens = Data()
        withUnsafeBytes(of: UInt32(8).littleEndian) { tokens.append(contentsOf: $0) }
        withUnsafeBytes(of: UInt64(2).littleEndian) { tokens.append(contentsOf: $0) }
        tokens.append(string("a"))
        tokens.append(string("bb"))
        var context = Data()
        withUnsafeBytes(of: UInt32(131_072).littleEndian) { context.append(contentsOf: $0) }
        let flag = Data([1])
        let data = gguf([
            ("general.architecture", 8, string("gemma4")),
            ("tokenizer.ggml.tokens", 9, tokens),
            ("general.flag", 7, flag),
            ("gemma4.context_length", 4, context),
            ("tokenizer.chat_template", 8, string("{{ bos_token }}{{- '<|turn>system\\n' -}}<|think|>")),
        ])
        let info = GGUFInfo.parse(data)
        XCTAssertEqual(info?.architecture, "gemma4")
        XCTAssertEqual(info?.trainContext, 131_072)
        XCTAssertEqual(info?.thinking, .gemma4)
        XCTAssertNil(GGUFInfo.parse(Data("NOPE".utf8)))
    }

    func testThinkingKinds() {
        XCTAssertEqual(PhoneThinking.kind(template: nil), .none)
        XCTAssertEqual(PhoneThinking.kind(template: "<|im_start|>"), .none)
        XCTAssertEqual(PhoneThinking.kind(template: "{% if enable_thinking %}<think>{% endif %}"), .switchable)
        XCTAssertEqual(PhoneThinking.kind(template: "<|Assistant|><think>\n"), .always)
        XCTAssertTrue(PhoneThinking.gemma4.canToggle)
        XCTAssertFalse(PhoneThinking.always.canToggle)
    }

    func testGemma4ThinkingPrompt() {
        let template = "<|turn>"
        XCTAssertEqual(PhoneChatFormat.render(template: template, messages: [(role: "user", content: "Привет")], thinking: true),
                       "<|turn>system\n<|think|><turn|>\n<|turn>user\nПривет<turn|>\n<|turn>model\n")
        XCTAssertEqual(PhoneChatFormat.render(template: template, messages: [(role: "system", content: "Кратко"),
                                                                            (role: "user", content: "Привет")], thinking: true),
                       "<|turn>system\n<|think|>Кратко<turn|>\n<|turn>user\nПривет<turn|>\n<|turn>model\n")
        XCTAssertEqual(PhoneChatFormat.render(template: template, messages: [(role: "user", content: "Привет")]),
                       "<|turn>user\nПривет<turn|>\n<|turn>model\n")
    }

    func testGemmaThoughtHeaderIsStripped() {
        let parts = ThinkSplitter.split("<think>thought\nСчитаю шаги</think>Ответ")
        XCTAssertEqual(parts.reasoning, "Считаю шаги")
        XCTAssertEqual(parts.text, "Ответ")
        XCTAssertEqual(ThinkSplitter.split("<think>thoughtful</think>Да").reasoning, "thoughtful")
    }

    func testSamplingThinkingDefaultsOff() {
        XCTAssertFalse(PhoneSampling(config: [:]).thinking)
        XCTAssertTrue(PhoneSampling(config: ["thinking": true]).thinking)
    }

    // MARK: - Ввод чисел

    func testTypedNumbers() {
        let spec = ChatParameters.specs.first { $0.key == "temperature" }!
        XCTAssertEqual(ParameterRow.parse("0,7"), 0.7)
        XCTAssertEqual(ParameterRow.parse(" 1.25 "), 1.25)
        XCTAssertEqual(ParameterRow.parse("\u{2212}0,5"), -0.5)
        XCTAssertNil(ParameterRow.parse(""))
        XCTAssertNil(ParameterRow.parse("abc"))
        XCTAssertEqual(ParameterRow.clampTyped(5, spec: spec, upper: spec.max), 2)
        XCTAssertEqual(ParameterRow.clampTyped(1.234, spec: spec, upper: spec.max), 1.234)
        XCTAssertEqual(ParameterRow.snap(1.27, spec: spec, upper: spec.max), 1.25)
        let topK = ChatParameters.specs.first { $0.key == "top_k" }!
        XCTAssertEqual(ParameterRow.clampTyped(40.6, spec: topK, upper: topK.max), 41)
    }

    func testResetValueFallsBackToProfile() {
        var settings = ServerSettings()
        settings.modelConfigs["phone/a.gguf"] = ["temperature": NSNull(), "top_k": 12]
        let config = ChatConfig.config(model: "phone/a.gguf", settings: settings, overrides: [:])
        XCTAssertEqual(ChatParameters.number(config["temperature"]), 0.7)
        XCTAssertEqual(ChatParameters.number(config["top_k"]), 12)
    }

    // MARK: - Хранилище

    @MainActor
    func testStoreSurvivesRestart() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("store-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = PhoneStore(folder: folder)
        let messages: [[String: Any]] = [["id": "u1", "role": "user", "content": "Привет", "timestamp": 1]]
        store.put(LocalChat(id: "chat/1?", title: "Привет", model: "phone/a.gguf", messages: messages,
                            overrides: ["phone/a.gguf": ["temperature": 0.5]], created: 1, serverUpdatedAt: 0,
                            changed: 2, dirty: true))
        store.put(LocalChat(id: "chat_2", title: "Старый", model: "phone/a.gguf", messages: [], overrides: [:],
                            created: 1, serverUpdatedAt: 5, changed: 5, dirty: false))
        let user = User(id: 7, username: "demo", avatar: nil, displayName: "Демо")
        store.saveSession(user: user, settings: ["settings": ["model": "phone/a.gguf"]])

        let again = PhoneStore(folder: folder)
        XCTAssertEqual(again.chats.count, 2)
        XCTAssertEqual(again.chats["chat/1?"]?.messages.first?["content"] as? String, "Привет")
        XCTAssertEqual(again.dirty.map(\.id), ["chat/1?"])
        XCTAssertEqual(again.summaries.first?.id, "chat_2", "новые сверху")
        XCTAssertEqual(again.loadSession()?.user, user)
        XCTAssertEqual(ChatConfig.dict(again.loadSession()?.settings["settings"])["model"] as? String, "phone/a.gguf")
        // Снимок входа без настроек сохраняет прежние.
        again.saveSession(user: user, settings: nil)
        XCTAssertNotNil(again.loadSession()?.settings["settings"])

        again.remove("chat_2")
        XCTAssertNil(PhoneStore(folder: folder).chats["chat_2"])
        again.clear()
        XCTAssertTrue(PhoneStore(folder: folder).chats.isEmpty)
        XCTAssertNil(PhoneStore(folder: folder).loadSession())
    }

    @MainActor
    func testMergeKeepsUnsentAndDropsDeleted() {
        let app = AppModel(preview: .chat)
        app.store.seed([
            LocalChat(id: "new", title: "Только на телефоне", model: "phone/a.gguf", messages: [], overrides: [:],
                      created: 1, serverUpdatedAt: 0, changed: 10, dirty: true),
            LocalChat(id: "gone", title: "Удалён на ПК", model: "phone/a.gguf", messages: [], overrides: [:],
                      created: 1, serverUpdatedAt: 5, changed: 5, dirty: false),
            LocalChat(id: "both", title: "Есть везде", model: "phone/a.gguf", messages: [], overrides: [:],
                      created: 1, serverUpdatedAt: 5, changed: 5, dirty: false),
        ])
        let merged = app.mergeLocal([ChatSummary(id: "both", title: "Есть везде", updatedAt: 5),
                                     ChatSummary(id: "pc", title: "С ПК", updatedAt: 4)])
        XCTAssertEqual(merged.map(\.id), ["new", "both", "pc"])
        XCTAssertNil(app.store.chats["gone"])
    }
}
