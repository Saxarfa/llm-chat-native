import XCTest

/// Этап 8: окно «Модели на телефоне» и чат с моделью телефона в режиме снимков
/// (модели, поиск и ответ вымышленные — сети и llama.cpp в тесте нет).
final class PhoneModelsUITests: XCTestCase {
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

    private func text(_ app: XCUIApplication, contains part: String) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", part)).firstMatch
    }

    /// Выбор модели → «Модели на телефоне»: установленные, память, загрузка; репозиторий → «Скачать».
    func testPhoneModelsWindow() {
        let app = launch("phoneModels")
        XCTAssertTrue(app.staticTexts["Модели на телефоне"].waitForExistence(timeout: 10))
        sleep(1)
        snap("ui-p1-models")
        XCTAssertEqual(app.buttons.matching(identifier: "phone.installed").count, 3)
        XCTAssertTrue(app.staticTexts["Не влезет"].exists, "модель на 7,3 ГБ должна быть помечена как не влезающая")
        XCTAssertTrue(element(app, "phone.download").exists, "идущая загрузка видна в окне")

        let repo = app.buttons.matching(identifier: "phone.repo").firstMatch
        XCTAssertTrue(repo.waitForExistence(timeout: 5))
        app.swipeUp()
        sleep(1)
        snap("ui-p2-search")
        repo.tap()
        XCTAssertTrue(app.staticTexts["Q4_K_M"].waitForExistence(timeout: 5))
        XCTAssertTrue(text(app, contains: "На телефоне").exists, "уже скачанный файл отмечен")
        sleep(1)
        snap("ui-p3-repo")
        let download = app.buttons["Скачать Q2_K"].firstMatch
        XCTAssertTrue(download.exists)
        download.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "[0-9]+%")).firstMatch
            .waitForExistence(timeout: 3))
        snap("ui-p4-download")
    }

    /// Чат с моделью телефона: вопрос → ответ печатается → остаётся в ленте.
    func testPhoneChat() {
        let app = launch("phoneChat")
        let input = element(app, "chat.input")
        XCTAssertTrue(input.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Модель: Qwen3")).firstMatch.exists,
                      "в чате выбрана модель телефона")
        input.tap()
        input.typeText("Ты работаешь без интернета?")
        app.buttons["Отправить"].firstMatch.tap()
        XCTAssertTrue(text(app, contains: "Работаю прямо на телефоне").waitForExistence(timeout: 8))
        snap("ui-p5-streaming")
        let stop = app.buttons["Остановить ответ"].firstMatch
        let finished = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: stop)
        wait(for: [finished], timeout: 15)
        XCTAssertTrue(text(app, contains: "20 токенов в секунду").waitForExistence(timeout: 5))
        XCTAssertTrue(text(app, contains: "Ты работаешь без интернета").exists, "вопрос остался в ленте")
        sleep(1)
        snap("ui-p6-answer")
    }
}
