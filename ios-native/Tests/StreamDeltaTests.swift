import XCTest
@testable import LLMChat

/// Дельты живого ответа `/api/sync/events?delta=1` (`StreamDeltas`, 20.11.2026) — те же случаи,
/// что у сайта (`frontend/src/streamDelta.test.ts`). События разбираются из JSON, как в `APIClient.events()`.
final class StreamDeltaTests: XCTestCase {
    private func event(_ json: String) -> [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] ?? [:]
    }

    private func chunk(_ fields: String, chat: String = "c") -> [String: Any] {
        let rest = fields.isEmpty ? "" : "," + fields
        return event(#"{"type":"stream_chunk","chat_id":"\#(chat)"\#(rest)}"#)
    }

    /// Разобрать событие; `nil` — пропуск базы (`Gap`).
    private func expand(_ deltas: inout StreamDeltas, _ value: [String: Any]) -> [String: Any]? {
        var value = value
        do {
            try deltas.expand(&value)
            return value
        } catch is StreamDeltas.Gap {
            return nil
        } catch {
            XCTFail("неожиданная ошибка \(error)")
            return nil
        }
    }

    func testRebuildsAppendedAndTrimmedTails() {
        var deltas = StreamDeltas()
        let first = expand(&deltas, chunk(#""text":"Ответ","reasoning":"Думаю","phase":"p""#))
        XCTAssertEqual(first?["text"] as? String, "Ответ")
        XCTAssertEqual(first?["reasoning"] as? String, "Думаю")

        let next = expand(&deltas, chunk(#""text_offset":5,"text_append":" готов","reasoning_offset":5,"reasoning_append":" дальше","phase":"p""#))
        XCTAssertEqual(next?["text"] as? String, "Ответ готов")
        XCTAssertEqual(next?["reasoning"] as? String, "Думаю дальше")
        XCTAssertEqual(next?["phase"] as? String, "p")
        for key in ["text_offset", "text_append", "reasoning_offset", "reasoning_append"] {
            XCTAssertNil(next?[key], "поле дельты \(key) осталось в событии")
        }

        // Укороченное значение оставляет только начало (обрезанный или переписанный хвост).
        XCTAssertEqual(expand(&deltas, chunk(#""text_offset":3,"text_append":"ет.""#))?["text"] as? String, "Ответ.")
        // Событие без поля его не меняет.
        let phase = expand(&deltas, event(#"{"type":"stream_phase","chat_id":"c","phase":"Поиск"}"#))
        XCTAssertNil(phase?["text"])
        XCTAssertEqual(expand(&deltas, chunk(#""text_offset":6,"text_append":"!""#))?["text"] as? String, "Ответ.!")
        // Рассуждения не трогались с прошлого раза.
        XCTAssertEqual(expand(&deltas, chunk(#""reasoning_offset":12,"reasoning_append":"…""#))?["reasoning"] as? String, "Думаю дальше…")
    }

    /// Смещение считается в единицах UTF-16, как на сервере: эмодзи — две единицы.
    func testCountsOffsetsInUTF16Units() {
        var deltas = StreamDeltas()
        XCTAssertEqual(expand(&deltas, chunk(#""text":"Привет 👋""#))?["text"] as? String, "Привет 👋")
        XCTAssertEqual(expand(&deltas, chunk(#""text_offset":9,"text_append":" мир 🦔""#))?["text"] as? String, "Привет 👋 мир 🦔")
        XCTAssertEqual(expand(&deltas, chunk(#""text_offset":7,"text_append":"🙂""#))?["text"] as? String, "Привет 🙂")
        // Полная длина после дельты — тоже в UTF-16: «Привет 🙂» = 9 единиц.
        XCTAssertEqual(expand(&deltas, chunk(#""text_offset":9,"text_append":"!""#))?["text"] as? String, "Привет 🙂!")
    }

    func testKeepsBasePerChatAndDropsItWhenAnswerEnds() {
        var deltas = StreamDeltas()
        XCTAssertNotNil(expand(&deltas, chunk(#""text":"Первый""#, chat: "a")))
        XCTAssertNotNil(expand(&deltas, chunk(#""text":"Второй""#, chat: "b")))
        XCTAssertEqual(expand(&deltas, chunk(#""text_offset":6,"text_append":" чат""#, chat: "a"))?["text"] as? String, "Первый чат")
        XCTAssertNotNil(expand(&deltas, event(#"{"type":"stream_end","chat_id":"a","final_message":{"content":"Первый чат"}}"#)))
        XCTAssertNil(expand(&deltas, chunk(#""text_offset":6,"text_append":"!""#, chat: "a")))
        XCTAssertEqual(expand(&deltas, chunk(#""text_offset":6,"text_append":" чат""#, chat: "b"))?["text"] as? String, "Второй чат")
        XCTAssertNotNil(expand(&deltas, event(#"{"type":"stream_stop","chat_id":"b"}"#)))
        XCTAssertNil(expand(&deltas, chunk(#""text_offset":0,"text_append":"x""#, chat: "b")))
    }

    func testReportsDeltaWithMissingOrShortBase() {
        var deltas = StreamDeltas()
        XCTAssertNil(expand(&deltas, chunk(#""text_offset":0,"text_append":"x""#)))
        XCTAssertNotNil(expand(&deltas, chunk(#""text":"abc""#)))
        XCTAssertNil(expand(&deltas, chunk(#""text_offset":4,"text_append":"x""#)))
        XCTAssertNil(expand(&deltas, chunk(#""text_offset":-1,"text_append":"x""#)))
        XCTAssertNil(expand(&deltas, chunk(#""text_offset":"1","text_append":"x""#)))
        XCTAssertNil(expand(&deltas, chunk(#""text_offset":1.5,"text_append":"x""#)))
        // У рассуждений своей базы ещё нет.
        XCTAssertNil(expand(&deltas, chunk(#""reasoning_offset":0,"reasoning_append":"x""#)))
        // После пропусков база текста цела.
        XCTAssertEqual(expand(&deltas, chunk(#""text_offset":3,"text_append":"d""#))?["text"] as? String, "abcd")
    }

    func testLeavesOtherEventsUntouched() {
        var deltas = StreamDeltas()
        let other = expand(&deltas, event(#"{"type":"chat_updated","chat_id":"c","text":"не живое поле"}"#))
        XCTAssertEqual(other?["text"] as? String, "не живое поле")
        // Базу задают только события живого ответа: у этой дельты её нет.
        XCTAssertNil(expand(&deltas, chunk(#""text_offset":0,"text_append":"x""#)))
        for json in [#"{"type":"connected"}"#, #"{"type":"stream_chunk","text":"без чата"}"#, #"{"type":"stream_tool","chat_id":"c","tool_events":[]}"#] {
            XCTAssertNotNil(expand(&deltas, event(json)), json)
        }
        // `connected` не сбрасывает базу: сервер сам пришлёт значение целиком.
        XCTAssertNotNil(expand(&deltas, chunk(#""text":"abc""#)))
        XCTAssertNotNil(expand(&deltas, event(#"{"type":"connected"}"#)))
        XCTAssertEqual(expand(&deltas, chunk(#""text_offset":3,"text_append":"d""#))?["text"] as? String, "abcd")
    }
}
