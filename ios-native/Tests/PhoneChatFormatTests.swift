import XCTest
@testable import LLMChat

/// Формат Gemma 4 и остановка на метках границ реплик (баг 0.8: модель писала `<|im_end|>`
/// и продолжала диалог за пользователя).
final class PhoneChatFormatTests: XCTestCase {
    func testGemma4Prompt() {
        let template = "{{ bos_token }}{{- '<|turn>system\n' -}}…{{- '<|turn>model\n' -}}"
        let prompt = PhoneChatFormat.render(template: template, messages: [
            (role: "system", content: "Ты помощник. "),
            (role: "user", content: "Привет"),
            (role: "assistant", content: "Здравствуйте!"),
            (role: "user", content: "Как дела?"),
        ])
        XCTAssertEqual(prompt, "<|turn>system\nТы помощник.<turn|>\n<|turn>user\nПривет<turn|>\n"
            + "<|turn>model\nЗдравствуйте!<turn|>\n<|turn>user\nКак дела?<turn|>\n<|turn>model\n")
        XCTAssertNil(PhoneChatFormat.render(template: "<|im_start|>", messages: []))
        XCTAssertNil(PhoneChatFormat.render(template: nil, messages: []))
    }

    func testStopAcrossPieces() {
        var scanner = StopScanner(stops: PhoneChatFormat.turnMarkers)
        var shown = ""
        for piece in ["Привет! Чем могу", " помочь?\n<|", "im", "_end|>\n<|im_start|>user"] {
            shown += scanner.feed(piece)
        }
        XCTAssertTrue(scanner.stopped)
        XCTAssertEqual(shown, "Привет! Чем могу помочь?\n")
        XCTAssertEqual(scanner.flush(), "")
    }

    func testHeldTailIsFlushed() {
        var scanner = StopScanner(stops: ["<|im_end|>"])
        XCTAssertEqual(scanner.feed("a < b"), "a < b")
        XCTAssertEqual(scanner.feed(" и <|"), " и ")
        XCTAssertEqual(scanner.feed("x"), "<|x")
        XCTAssertEqual(scanner.feed(" конец <"), " конец ")
        XCTAssertFalse(scanner.stopped)
        XCTAssertEqual(scanner.flush(), "<")
    }

    func testCleanOldAnswer() {
        XCTAssertEqual(PhoneChatFormat.clean("Ответ.\n<|im_end|>\n<|im_start|>user\nещё"), "Ответ.\n")
        XCTAssertEqual(PhoneChatFormat.clean("Обычный ответ"), "Обычный ответ")
    }
}
