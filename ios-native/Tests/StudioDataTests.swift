import XCTest
@testable import LLMChat

/// Разбор ответов студии так, как их отдаёт JSONSerialization (числа приходят как NSNumber).
final class StudioDataTests: XCTestCase {
    private func json(_ text: String) -> [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any] ?? [:]
    }

    /// 0 и 1 — числа, а не true/false: CLIP 0 не должен откатываться к силе модели.
    func testZeroAndOneAreNumbers() {
        let values = json(#"{"zero": 0, "one": 1, "half": 0.5, "flag": true, "off": false, "text": "1.25"}"#)
        XCTAssertEqual(StudioValue.double(values["zero"]), 0)
        XCTAssertEqual(StudioValue.double(values["one"]), 1)
        XCTAssertEqual(StudioValue.double(values["half"]), 0.5)
        XCTAssertNil(StudioValue.double(values["flag"]))
        XCTAssertNil(StudioValue.double(values["off"]))
        XCTAssertEqual(StudioValue.double(values["text"]), 1.25)
        XCTAssertEqual(StudioValue.int(values["one"]), 1)
    }

    func testLoraClipZeroSurvivesServerRoundTrip() {
        let values = json(#"{"name": "silvana-style-AB10-01.safetensors", "strength": 1, "strength_clip": 0}"#)
        let lora = StudioLora(json: values)
        XCTAssertEqual(lora?.strength, 1)
        XCTAssertEqual(lora?.strengthClip, 0)
        XCTAssertEqual(lora?.clip, 0)
        XCTAssertEqual(lora?.json["strength_clip"] as? Double, 0)
    }

    func testModelStrengthZeroIsKept() {
        let lora = StudioLora(json: json(#"{"name": "a.safetensors", "strength": 0, "strength_clip": 1}"#))
        XCTAssertEqual(lora?.strength, 0)
        XCTAssertEqual(lora?.clip, 1)
    }

    /// Клавиша «Готово» в промпте прячет клавиатуру; вставленный многострочный текст остаётся.
    func testPromptReturnPress() {
        XCTAssertTrue(StudioPromptInput.isReturnPress(old: "1girl, sky", new: "1girl, sky\n"))
        XCTAssertTrue(StudioPromptInput.isReturnPress(old: "1girl, sky", new: "1girl,\n sky"))
        XCTAssertTrue(StudioPromptInput.isReturnPress(old: "", new: "\n"))
        XCTAssertFalse(StudioPromptInput.isReturnPress(old: "1girl", new: "1girl,"))
        XCTAssertFalse(StudioPromptInput.isReturnPress(old: "a", new: "a\nb\nc"))
        XCTAssertFalse(StudioPromptInput.isReturnPress(old: "abc", new: "ab"))
    }

    /// Последние промпты: новый первым, повтор поднимается, пустые не запоминаются, не больше восьми.
    func testPromptHistory() {
        var list = StudioPromptHistory.add("закат", to: [])
        list = StudioPromptHistory.add("дракон", to: list)
        list = StudioPromptHistory.add("  закат  ", to: list)
        XCTAssertEqual(list, ["закат", "дракон"])
        XCTAssertEqual(StudioPromptHistory.add("   ", to: list), list)
        let many = (1...12).reduce([String]()) { StudioPromptHistory.add("p\($1)", to: $0) }
        XCTAssertEqual(many.count, StudioPromptHistory.limit)
        XCTAssertEqual(many.first, "p12")
    }

    /// Пресеты меняют только шаги; совпадение с черновиком — выбранный пресет, иначе «Свои».
    func testPresets() {
        var draft = StudioDraft()
        XCTAssertEqual(StudioPreset.match(draft)?.id, "balance", "умолчание 30 шагов — «Баланс»")
        draft.steps = 40
        XCTAssertEqual(StudioPreset.match(draft)?.id, "quality")
        draft.steps = 33
        XCTAssertNil(StudioPreset.match(draft))
        draft.model = "waiIllustriousSDXL_v170.safetensors"
        XCTAssertEqual(StudioPreset.list(for: draft.model).first { $0.id == "balance" }?.steps, 28)
    }

    /// Очередь, листание сцены и замок seed — в режиме снимков, без сервера.
    @MainActor
    func testQueueSwipeAndSeedLock() {
        let studio = StudioModel()
        studio.loadPreview()
        XCTAssertEqual(studio.selected?.id, "p0")
        XCTAssertFalse(studio.canStep(-1), "новее самого нового нет")
        studio.step(1)
        XCTAssertEqual(studio.selected?.id, "p1")
        studio.step(-1)
        XCTAssertEqual(studio.selected?.id, "p0")

        XCTAssertFalse(studio.seedLocked)
        studio.toggleSeedLock()
        XCTAssertTrue(studio.seedLocked)
        XCTAssertEqual(studio.draft.seed, String(418_204_771), "закрепляется seed арта на сцене")
        studio.toggleSeedLock()
        XCTAssertEqual(studio.draft.seed, "-1")

        var running = StudioJob(id: "r")
        running.status = "generating"
        running.created = 10
        var waiting = StudioJob(id: "w")
        waiting.status = "queued"
        waiting.created = 20
        studio.jobs.insert(contentsOf: [waiting, running], at: 0)
        XCTAssertEqual(studio.activeJobs.map(\.id), ["r", "w"])
        XCTAssertEqual(studio.pendingJob?.id, "r", "идёт тот, что не ждёт в очереди")
        XCTAssertFalse(studio.queueFull)
    }
}
