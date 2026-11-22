import XCTest
@testable import LLMChat

/// 0.17: модели Claude по API и уровни усилий (перенос `domain.ts`), параметры генерации только там, где их
/// принимает сервер, вывод ответа словами и «Стоимость» сессии (перенос `modelPrices.ts`).
final class ClaudeApiTests: XCTestCase {
    private let opus = "claude/claude-opus-5-5"

    func testClaudeNamesAndGroup() {
        // Как `hostedName` сайта и `claude_name` в Rust.
        XCTAssertEqual(HostedService.name(opus), "Claude Opus 5.5")
        XCTAssertEqual(HostedService.name("claude/claude-fable-5-2"), "Claude Fable 5.2")
        XCTAssertEqual(HostedService.name("claude/claude-haiku-4-5-20251001"), "Claude Haiku 4.5", "дата снимка отбрасывается")
        XCTAssertEqual(HostedService.of(opus), .claude)
        XCTAssertEqual(ChatConfig.group(of: opus), .claude)
        XCTAssertEqual(ChatConfig.group(of: "groq/openai/gpt-oss-120b"), .hosted, "остальные сервисы — по-прежнему «API»")
        XCTAssertEqual(ChatConfig.modelName("claude/claude-sonnet-5-5", profiles: [:]), "Claude Sonnet 5.5")
    }

    func testClaudeOrderLikeClaudeApp() {
        let ids = ["claude/claude-haiku-5-5", "claude/claude-sonnet-5-5", "claude/claude-opus-4-8",
                   "claude/claude-opus-5-5", "claude/claude-fable-5-2"]
        let sorted = ids.sorted { a, b in
            let x = HostedService.claudeOrder(a), y = HostedService.claudeOrder(b)
            return x.family != y.family ? x.family < y.family : y.version.lexicographicallyPrecedes(x.version)
        }
        XCTAssertEqual(sorted, ["claude/claude-fable-5-2", "claude/claude-opus-5-5", "claude/claude-opus-4-8",
                                "claude/claude-sonnet-5-5", "claude/claude-haiku-5-5"])
    }

    func testClaudeEffortLevels() {
        // Параметров выборки нет (текущие модели их отвергают) — только уровни рассуждений.
        for key in ["temperature", "top_p", "top_k", "min_p", "max_tokens", "presence_penalty", "repeat_penalty"] {
            XCTAssertFalse(ChatParameters.supported(opus, key), key)
        }
        XCTAssertTrue(ChatParameters.allSpecs(for: opus, onPhone: false).isEmpty)
        guard case .levels(let levels)? = ChatParameters.reasoning(opus) else { return XCTFail("у Claude — уровни усилий") }
        XCTAssertEqual(levels.map(\.value), ["low", "medium", "high", "xhigh", "max"])
        XCTAssertEqual(levels.map(\.label), ["Низкий", "Средний", "Высокий", "Очень высокий", "Максимальный"])

        // Умолчание — «Средний», при выключенных рассуждениях — «Низкий», неизвестный уровень — «Средний».
        XCTAssertEqual(ChatConfig.config(model: opus, settings: ServerSettings(), overrides: [:])["reasoning_strength"] as? String,
                       "medium")
        var settings = ServerSettings()
        settings.modelConfigs[opus] = ["thinking": false]
        XCTAssertEqual(ChatConfig.config(model: opus, settings: settings, overrides: [:])["reasoning_strength"] as? String, "low")
        settings.modelConfigs[opus] = ["reasoning_strength": "minimal"]
        XCTAssertEqual(ChatConfig.config(model: opus, settings: settings, overrides: [:])["reasoning_strength"] as? String, "medium")

        // Выбранный уровень уходит серверу, рассуждения в запросе включены (`inferencePayload`: kind «effort»).
        settings.modelConfigs[opus] = ["reasoning_strength": "max", "thinking": true]
        let body = ChatConfig.payload(chatID: "c", model: opus, settings: settings, overrides: nil, branch: "main",
                                      serverURL: nil, message: "Привет", messageID: "u1")
        XCTAssertEqual(body["thinking"] as? Bool, true)
        XCTAssertEqual(ChatConfig.dict(body["settings"])["reasoning_strength"] as? String, "max")
    }

    @MainActor
    func testChoosingLevelTurnsThinkingOn() async {
        let app = AppModel(preview: .chat)
        await app.setModelValue("reasoning_strength", "high", model: opus)
        XCTAssertEqual(app.savedModelValues(opus)["reasoning_strength"] as? String, "high")
        XCTAssertEqual(app.savedModelValues(opus)["thinking"] as? Bool, true, "как на сайте: выбор уровня включает рассуждения")
    }

    func testGenerationSettingsOnlyWhereSupported() {
        // Длины ответа нет ни у одной модели ПК и облака (сайт всегда шлёт −1); у телефона — есть.
        XCTAssertFalse(ChatParameters.supported("gemma-26b-qat", "max_tokens"))
        XCTAssertTrue(ChatParameters.supported("gemma-26b-qat", "top_k"))
        XCTAssertTrue(ChatParameters.allSpecs(for: "aistudio/gemini-4-argon", onPhone: false).isEmpty,
                      "у Gemini 4 Argon и Carbon параметров выборки нет")
        XCTAssertEqual(ChatParameters.allSpecs(for: "aistudio/gemini-4-hydrogen", onPhone: false).map(\.key),
                       ["temperature", "top_p", "top_k"])
        XCTAssertTrue(ChatParameters.allSpecs(for: "phone/model.gguf", onPhone: true).contains { $0.key == "max_tokens" })

        var settings = ServerSettings()
        settings.modelConfigs["gemma-26b-qat"] = ["max_tokens": 512]
        XCTAssertEqual(ChatParameters.number(ChatConfig.config(model: "gemma-26b-qat", settings: settings,
                                                               overrides: [:])["max_tokens"]), -1,
                       "сохранённый в прежних версиях предел больше не уходит серверу")
        settings.modelConfigs["phone/model.gguf"] = ["max_tokens": 512]
        XCTAssertEqual(ChatParameters.number(ChatConfig.config(model: "phone/model.gguf", settings: settings,
                                                               overrides: [:])["max_tokens"]), 512)
    }

    func testRevealStopsAtWordEnd() {
        let text = "Привет, как дела у тебя"
        XCTAssertEqual(AppModel.wordEnd(text, from: 3, total: text.count), 7, "до пробела после «Привет,»")
        XCTAssertEqual(AppModel.wordEnd(text, from: 7, total: text.count), 7, "уже на границе слова")
        let tail = "Привет мир"
        XCTAssertEqual(AppModel.wordEnd(tail, from: 8, total: tail.count), 10, "недописанное слово — до конца полученного")
        let long = String(repeating: "a", count: 40) + " b"
        XCTAssertEqual(AppModel.wordEnd(long, from: 2, total: long.count), 2, "длинное «слово» не ждём")
        XCTAssertEqual(AppModel.wordEnd(text, from: 0, total: text.count), 0)
    }

    func testChatCostLikeSite() {
        XCTAssertEqual(ChatCost.money(0), "$0")
        XCTAssertEqual(ChatCost.money(0.000607), "$0,000607", "меньше доллара — три значащие цифры")
        XCTAssertEqual(ChatCost.money(0.0213), "$0,0213")
        XCTAssertEqual(ChatCost.money(1.5), "$1,50")
        XCTAssertEqual(ChatCost.compact(9_999).filter(\.isNumber), "9999")
        XCTAssertEqual(ChatCost.compact(125_500), "125,5 тыс.")
        XCTAssertEqual(ChatCost.compact(999_950), "1 млн")
        XCTAssertEqual(ChatCost.tokensWord(21), "21 токен")
        XCTAssertEqual(ChatCost.tokensWord(3), "3 токена")
        XCTAssertEqual(ChatCost.tokensWord(11), "11 токенов")

        let cost = ChatCost(json: ChatCostSheet.sample)
        XCTAssertEqual(cost.models.map(\.model), ["claude/claude-opus-5-5", "claude/claude-haiku-5-5"])
        XCTAssertEqual(cost.models.first?.requests, 1)
        XCTAssertEqual(cost.lines.first?.part, .output, "дорогие части выше")
        XCTAssertFalse(cost.lines.contains { $0.part == .cacheWrite1h }, "части без трат не показываются")
        XCTAssertEqual(ChatCost.tokenTotal(cost.tokens), 8_420 + 3_115 + 61_200 + 9_400)
        XCTAssertEqual(ChatCost.modelTitle(opus, profiles: [:]), "Claude Opus 5.5")
        XCTAssertEqual(ChatCost.modelTitle("groq/openai/gpt-oss-120b", profiles: [:]), "GPT OSS 120B · Groq")
    }
}
