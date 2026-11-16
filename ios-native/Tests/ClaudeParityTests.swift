import XCTest
@testable import LLMChat

/// 0.16: облачные модели (перенос `domain.ts`), источники ответа (`webSources.ts`), отбор файлов GGUF
/// и имена моделей телефона, временные сессии («Инкогнито»).
final class ClaudeParityTests: XCTestCase {
    func testHostedNamesLikeServer() {
        // Как `hosted_providers.display_name` и `hostedName` сайта.
        XCTAssertEqual(HostedService.name("openrouter/nvidia/nemotron-3-ultra-550b-a55b:free"), "Nemotron 3 Ultra 550B A55B")
        XCTAssertEqual(HostedService.name("nvidia/qwen/qwen3.5-122b-a10b"), "Qwen3.5 122B A10B")
        XCTAssertEqual(HostedService.name("groq/openai/gpt-oss-120b"), "GPT OSS 120B")
        XCTAssertEqual(HostedService.of("groq/openai/gpt-oss-120b"), .groq)
        XCTAssertNil(HostedService.of("gemma-26b-qat"))
        XCTAssertEqual(ChatConfig.group(of: "nvidia/qwen/qwen3.5-122b-a10b"), .hosted)
        XCTAssertEqual(ChatConfig.modelName("groq/openai/gpt-oss-120b", profiles: [:]), "GPT OSS 120B")
    }

    func testHostedParametersAndThinking() {
        // `parameterSupported`: у Groq нет штрафов, у NVIDIA и OpenRouter есть; top_k ни у кого.
        XCTAssertTrue(ChatParameters.supported("nvidia/qwen/qwen3.5-122b-a10b", "presence_penalty"))
        XCTAssertFalse(ChatParameters.supported("groq/openai/gpt-oss-120b", "presence_penalty"))
        XCTAssertTrue(ChatParameters.supported("groq/openai/gpt-oss-120b", "temperature"))
        XCTAssertFalse(ChatParameters.supported("openrouter/x/y:free", "top_k"))
        if case .toggle? = ChatParameters.reasoning("openrouter/x/y:free") {} else { XCTFail("у облачных моделей — выключатель рассуждений") }

        var settings = ServerSettings()
        settings.modelConfigs["groq/openai/gpt-oss-120b"] = ["thinking": false]
        let off = ChatConfig.payload(chatID: "c", model: "groq/openai/gpt-oss-120b", settings: settings, overrides: nil,
                                     branch: "main", serverURL: nil, message: "hi", messageID: "m")
        XCTAssertEqual(off["thinking"] as? Bool, false, "выключенные рассуждения уходят серверу")
        let values = off["settings"] as? [String: Any] ?? [:]
        XCTAssertEqual(values["temperature"] as? Double, 0.6, "умолчание облачной модели, как на сайте")
        let on = ChatConfig.payload(chatID: "c", model: "nvidia/qwen/qwen3.5-122b-a10b", settings: ServerSettings(),
                                    overrides: nil, branch: "main", serverURL: nil, message: "hi", messageID: "m")
        XCTAssertEqual(on["thinking"] as? Bool, true)
    }

    func testRecommendedReasoningLevel() {
        XCTAssertEqual(ChatParameters.recommendedLevel("aistudio/gemini-4-hydrogen"), "high")
        XCTAssertEqual(ChatParameters.recommendedLevel("aistudio/gemini-4-argon"), "medium")
        XCTAssertEqual(ChatParameters.recommendedLevel("muse-glimmer-30b"), "high")
    }

    func testSourcesLikeSite() {
        let raw: [[String: Any]] = [
            ["title": "Release", "url": "https://www.sqlite.org/releaselog/3_50_0.html"],
            ["title": "youtube.com", "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/X"],
            ["title": "Пример", "url": "https://vertexaisearch.cloud.google.com/r", "resolved_url": "https://example.org/a"],
            ["kind": "knowledge", "title": "Отчёт.pdf", "site_name": "Документы", "heading": "Итоги", "page": 2],
            ["title": "", "url": "javascript:alert(1)"],
        ]
        let list = FeedSource.list(raw)
        XCTAssertEqual(list.count, 4, "ссылка без http и без названия отброшена")
        XCTAssertEqual(list[0].host, "sqlite.org", "без www")
        XCTAssertEqual(list[1].host, "youtube.com", "у переадресации Google сайт — из названия")
        XCTAssertNotNil(list[1].url, "переадресация открывается как есть")
        XCTAssertEqual(list[2].host, "example.org", "настоящий адрес важнее переадресации")
        XCTAssertTrue(list[3].knowledge)
        XCTAssertNil(list[3].url, "источник из базы знаний по ссылке не открывается")
        XCTAssertEqual(list[3].note, "Итоги · стр. 2")
        XCTAssertEqual(list[0].favicon?.absoluteString, "https://www.sqlite.org/favicon.ico")
        XCTAssertEqual(SourcesButton.count(1), "1 источник")
        XCTAssertEqual(SourcesButton.count(3), "3 источника")
        XCTAssertEqual(SourcesButton.count(11), "11 источников")
        XCTAssertEqual(SourcesButton.count(21), "21 источник")
    }

    func testMessageSourcesAndSuggestions() {
        let message = ChatMessage(json: ["id": "a", "role": "assistant", "content": "Ответ",
                                         "sources": [["title": "S", "url": "https://s.example/x"]],
                                         "suggestions": ["Дальше?", " ", 5] as [Any]])
        let feed = FeedMessage.build(from: [message])
        XCTAssertEqual(feed.first?.sources.count, 1)
        XCTAssertEqual(feed.first?.suggestions, ["Дальше?"], "пустые и не строки отброшены")
    }

    func testPhoneFilesWithoutMTPHeads() {
        // Снимок пользователя 16.11.2026: «головы» MTP предлагались как модели.
        XCTAssertFalse(HFFile.isUsable("MTP/mtp-gemma-4-E2B-it-Artemis-Q4_0.gguf"))
        XCTAssertFalse(HFFile.isUsable("mtp-gemma-4-E2B-it-Artemis.gguf"))
        XCTAssertTrue(HFFile.isUsable("Qwen3.6-35B-A3B-MTP-Q4_K_M.gguf"), "модель со встроенным MTP остаётся")
        XCTAssertTrue(HFFile.isUsable("gemma-4-E2B-it-Artemis-Q3_K_M.gguf"))
    }

    func testPhoneNameWithoutTrailingDot() {
        // «Qwen3.5-9B.Q4_K_M.gguf» показывался как «Qwen3.5 9B. · Q4_K_M».
        XCTAssertEqual(PhoneModelNames.title("Qwen3.5-9B.Q4_K_M.gguf"), "Qwen3.5 9B")
        XCTAssertEqual(PhoneModelNames.display(PhoneModelID.make(file: "Qwen3.5-9B.Q4_K_M.gguf")), "Qwen3.5 9B · Q4_K_M")
        XCTAssertEqual(PhoneModelNames.title("Qwen3-4B-Instruct-2507-Q4_K_M.gguf"), "Qwen3 4B Instruct 2507")
    }

    func testTemporaryChatIDs() throws {
        let data = Data(#"{"chats":[{"id":"temp_abc","title":"Временный чат"},{"id":"chat_1","title":"Новый чат"}]}"#.utf8)
        let list = try JSONDecoder().decode(ChatListResponse.self, from: data).chats
        XCTAssertTrue(list[0].temporary, "id temp_… — временная сессия")
        XCTAssertFalse(list[1].temporary)
        XCTAssertEqual(list[1].title, "Новая сессия")
        // Ключ временных сессий подходит под проверку сервера `^[a-zA-Z0-9_-]{24,80}$`.
        let key = APIClient.temporarySession
        XCTAssertNotNil(key.range(of: "^[a-zA-Z0-9_-]{24,80}$", options: .regularExpression), key)
    }

    @MainActor
    func testUnreadOnlyForAnswersAskedHere() {
        let model = AppModel(preview: .chat)
        model.chats = [ChatSummary(id: "a", title: "A"), ChatSummary(id: "b", title: "B")]
        model.unread = []
        model.activeChatID = "a"
        model.askedHere = ["b"]
        model.markUnreadIfHidden("b")
        XCTAssertEqual(model.unread, ["b"], "ответ в скрытой сессии, запрошенный здесь, — с точкой")
        model.markUnreadIfHidden("b")
        XCTAssertEqual(model.unread, ["b"], "повторный конец ответа без нового вопроса ничего не меняет")
        model.askedHere = ["a"]
        model.markUnreadIfHidden("a")
        XCTAssertFalse(model.unread.contains("a"), "сессия на экране не помечается")
        model.activeChatID = "b"
        XCTAssertTrue(model.unread.isEmpty, "открытая сессия прочитана")
    }
}
