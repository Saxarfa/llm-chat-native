import XCTest

/// 0.17.5: нажатие по тексту раскрытых размышлений сворачивает их там, где человек читает:
/// шапка встаёт к верху ленты, ответ подъезжает под неё (выбор пользователя 28.11.2026).
final class ReasoningUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func launch(_ scene: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--preview=\(scene)"]
        app.launch()
        return app
    }

    private func snap(_ name: String) {
        let shot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let folder = ProcessInfo.processInfo.environment["SCREENS_DIR"], !folder.isEmpty {
            let url = URL(fileURLWithPath: folder, isDirectory: true)
            try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            try? shot.pngRepresentation.write(to: url.appendingPathComponent(name + ".png"))
        }
    }

    private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    /// Размышления первого ответа длиннее двух экранов (`PreviewScene.reasoning`). Раскрыли, долистали до середины —
    /// шапка за верхом экрана, нажали по тексту: блок свернулся, шапка вернулась к верху ленты, под ней — ответ.
    func testTapOnTextFoldsInPlace() {
        let app = launch("threadTop")
        let header = element(app, "reasoning.header")
        XCTAssertTrue(header.waitForExistence(timeout: 10))
        header.tap()
        let step = app.staticTexts["Контрольная точка"]
        XCTAssertTrue(step.waitForExistence(timeout: 5), "размышления раскрылись")
        sleep(1)

        let height = app.frame.height
        for _ in 0..<5 where header.frame.maxY > height * 0.1 {
            app.swipeUp(velocity: .slow)
            sleep(1)
        }
        XCTAssertLessThan(header.frame.maxY, height * 0.1, "шапка размышлений ушла за верх экрана")
        // Лента стоит дольше четверти секунды: касание не примут за остановку прокрутки.
        sleep(1)
        snap("ui-r1-reasoning-middle")

        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let folded = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: step)
        wait(for: [folded], timeout: 5)
        sleep(1)
        snap("ui-r2-reasoning-folded")

        XCTAssertTrue(header.isHittable, "шапка снова на экране")
        XCTAssertGreaterThan(header.frame.minY, height * 0.05, "шапка под верхней панелью, а не за ней")
        XCTAssertLessThan(header.frame.minY, height * 0.3, "шапка у верха ленты")
        let answer = app.staticTexts["Журнал упреждающей записи"]
        XCTAssertTrue(answer.exists, "ответ на экране")
        XCTAssertGreaterThan(answer.frame.minY, header.frame.maxY - 1, "ответ под шапкой")
        XCTAssertLessThan(answer.frame.minY, height * 0.5, "ответ подъехал к шапке")
    }
}
