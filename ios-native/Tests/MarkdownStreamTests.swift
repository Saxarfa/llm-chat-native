import XCTest
@testable import LLMChat

/// Разбор живого ответа по хвосту (`MarkdownStream`, аудит 20.11.2026) даёт то же, что полный разбор,
/// на каждом шаге дописывания — иначе после конца ответа сохранённое сообщение отличалось бы от живого.
final class MarkdownStreamTests: XCTestCase {
    private let samples = [
        "## Журнал\n\nВ режиме **WAL** изменения идут в `app.db-wal`.\n\n- читатели не ждут\n- запись быстрее\n\n- пункт после пустой строки\n\nКонец.",
        "Включается одной командой:\n\n```python\nimport sqlite3\n\nconn = sqlite3.connect(\"app.db\")\n```\n\nПосле этого рядом с базой появятся файлы.",
        "| Свойство | DELETE (обычный) | WAL |\n|---|---|---|\n| Чтение | нет | да |\n| Скорость | ниже | выше |\n\nДля одного писателя WAL — верный выбор.",
        "> цитата\n> вторая строка\n\n1. первый\n2. второй\n   продолжение пункта\n\n---\n\n* звёздочка\n* ещё одна",
        "Абзац\nв две строки\n| не таблица\n\n- [ ] задача\n- [x] сделано\n\n~~~\nкод тильдами\n~~~\n\n### Итог ###",
        "Текст | с чертой\n|--\nи дальше\n\n-\n- пункт\n\n```\nнезакрытый код",
    ]

    /// Каждый символ — новый шаг вывода.
    func testStreamMatchesFullParseOnEveryPrefix() {
        for sample in samples {
            var stream = MarkdownStream()
            var shown = ""
            for character in sample {
                shown.append(character)
                XCTAssertEqual(stream.update(shown), MarkdownParser.parse(shown), "префикс: \(shown.debugDescription)")
            }
        }
    }

    /// Текст приходит кусками разной длины (AI Studio — крупными).
    func testStreamMatchesFullParseOnChunks() {
        for sample in samples {
            let characters = Array(sample)
            for step in [3, 7, 19] {
                var stream = MarkdownStream()
                var end = 0
                while end < characters.count {
                    end = min(characters.count, end + step)
                    let shown = String(characters[..<end])
                    XCTAssertEqual(stream.update(shown), MarkdownParser.parse(shown), "шаг \(step): \(shown.debugDescription)")
                }
            }
        }
    }

    /// Сервер переписал ответ заново (вызов инструмента, проверка языка) — разбор с нуля.
    func testRewrittenTextIsParsedFromScratch() {
        var stream = MarkdownStream()
        _ = stream.update("# Один\n\nдва\n\nтри\n\nчетыре")
        let rewritten = "Совсем другой\n\n- текст\n- ответа"
        XCTAssertEqual(stream.update(rewritten), MarkdownParser.parse(rewritten))
        XCTAssertEqual(stream.update(""), [])
    }

    /// Переводы строк Windows разбираются целиком, как и раньше.
    func testCarriageReturnsFallBackToFullParse() {
        var stream = MarkdownStream()
        let text = "Абзац\r\n\r\n- пункт\r\n- ещё"
        XCTAssertEqual(stream.update(text), MarkdownParser.parse(text))
        XCTAssertEqual(stream.update(text + "\r\n\r\nКонец"), MarkdownParser.parse(text + "\r\n\r\nКонец"))
    }
}
