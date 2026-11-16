import XCTest
@testable import LLMChat

/// Раскрытые рассуждения делятся на шаги с заголовками (вариант B, 16.11.2026).
final class ReasoningStepsTests: XCTestCase {
    func testHeadingsWithBody() {
        let steps = ReasoningSteps.parse("**Разбираю вопрос**\n\nПользователь спрашивает про WAL.\n\n**Проверяю ограничения**\n\nОдин писатель за раз.")
        XCTAssertEqual(steps.map(\.heading), ["Разбираю вопрос", "Проверяю ограничения"])
        XCTAssertEqual(steps.map(\.body), ["Пользователь спрашивает про WAL.", "Один писатель за раз."])
    }

    func testHeadingOnSameParagraph() {
        let steps = ReasoningSteps.parse("**Шаг один**\nТекст сразу под заголовком.\n\n## Шаг два\nЕщё текст.")
        XCTAssertEqual(steps.count, 2)
        XCTAssertEqual(steps[0].heading, "Шаг один")
        XCTAssertEqual(steps[0].body, "Текст сразу под заголовком.")
        XCTAssertEqual(steps[1].heading, "Шаг два")
    }

    func testPlainParagraphsHaveNoHeadings() {
        let steps = ReasoningSteps.parse("Сначала разберусь с вопросом.\n\nПотом соберу ответ.")
        XCTAssertEqual(steps.count, 2)
        XCTAssertNil(steps[0].heading)
        XCTAssertEqual(steps[1].body, "Потом соберу ответ.")
    }

    func testSingleBlockAndEmpty() {
        XCTAssertEqual(ReasoningSteps.parse("Одна мысль без абзацев.").count, 1)
        XCTAssertTrue(ReasoningSteps.parse("  \n\n ").isEmpty)
        // Заголовок без текста в конце (стрим оборвался) не теряется.
        let tail = ReasoningSteps.parse("**Готовлю пример**")
        XCTAssertEqual(tail.first?.heading, "Готовлю пример")
        XCTAssertEqual(tail.first?.body, "")
    }
}
