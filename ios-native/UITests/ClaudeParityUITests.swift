import XCTest

/// 0.16: аудит по приложению Claude — «Инкогнито», источники и варианты продолжения под ответом,
/// облачные модели во «Других моделях», точка непрочитанного ответа, «Поделиться» в меню сессии.
final class ClaudeParityUITests: XCTestCase {
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

    /// Призрак в шапке новой сессии включает «Инкогнито»: заголовок, пояснение вместо приветствия,
    /// светлый круг; повторное нажатие возвращает обычную сессию. Кнопки шапки — круги 44 pt.
    func testIncognitoToggle() {
        let app = launch("chat")
        let ghost = element(app, "chat.incognito")
        XCTAssertTrue(ghost.waitForExistence(timeout: 10), "призрак в шапке новой сессии")
        let menu = app.buttons["Меню"].firstMatch
        XCTAssertEqual(menu.frame.width, 44, accuracy: 1, "круглые кнопки шапки — 44 pt, как у Claude")
        ghost.tap()
        XCTAssertTrue(element(app, "chat.incognitoTitle").waitForExistence(timeout: 5), "заголовок «Инкогнито»")
        XCTAssertTrue(element(app, "chat.incognitoWelcome").exists, "пояснение вместо приветствия")
        sleep(1)
        snap("ui-i1-incognito")
        element(app, "chat.incognitoOff").tap()
        let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: element(app, "chat.incognitoTitle"))
        wait(for: [gone], timeout: 5)
        XCTAssertTrue(element(app, "chat.incognito").waitForExistence(timeout: 5))
    }

    /// Под ответом — «Источники» (лист со списком) и «Продолжить разговор».
    func testSourcesAndSuggestions() {
        let app = launch("sources")
        let sources = element(app, "answer.sources")
        XCTAssertTrue(sources.waitForExistence(timeout: 10), "кнопка источников под ответом")
        XCTAssertTrue(sources.label.contains("4"), "источников четыре: \(sources.label)")
        XCTAssertTrue(element(app, "answer.suggestion").exists, "варианты продолжения под последним ответом")
        XCTAssertTrue(app.buttons["Ещё варианты"].exists, "третий вариант спрятан, как на телефоне на сайте")
        sleep(1)
        snap("ui-i2-sources")
        sources.tap()
        XCTAssertTrue(element(app, "sources.sheet").waitForExistence(timeout: 5))
        XCTAssertTrue(button(app, containing: "SQLite Release 3.50.0").waitForExistence(timeout: 5))
        XCTAssertTrue(button(app, containing: "news.ycombinator.com").exists, "сайт переадресации Google — по названию")
        sleep(1)
        snap("ui-i3-sources-sheet")
    }

    /// Строки списков — кнопки: их тексты видны только в общей подписи кнопки.
    private func button(_ app: XCUIApplication, containing text: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    /// Модели NVIDIA, OpenRouter и Groq — во «Других моделях», разделом на сервис.
    func testHostedModels() {
        let app = launch("models")
        let other = element(app, "picker.other")
        XCTAssertTrue(other.waitForExistence(timeout: 10))
        other.tap()
        XCTAssertTrue(app.staticTexts["NVIDIA"].waitForExistence(timeout: 5))
        XCTAssertTrue(button(app, containing: "Qwen3.5 122B A10B").exists, "имя как на сайте")
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["Groq"].waitForExistence(timeout: 5))
        XCTAssertTrue(button(app, containing: "GPT OSS 120B").exists)
        sleep(1)
        snap("ui-i4-hosted")
    }

    /// Синяя точка у сессии с непрочитанным ответом; меню сессии — с «Поделиться».
    func testUnreadDotAndShareItem() {
        let app = launch("sidebar")
        let dotted = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Новый ответ")).firstMatch
        XCTAssertTrue(dotted.waitForExistence(timeout: 10), "строка с точкой непрочитанного ответа")
        sleep(1)
        snap("ui-i5-unread")
        dotted.press(forDuration: 1.2)
        XCTAssertTrue(app.buttons["Поделиться"].firstMatch.waitForExistence(timeout: 5), "«Поделиться» в меню сессии")
        XCTAssertTrue(app.buttons["Переименовать"].firstMatch.exists)
        sleep(1)
        snap("ui-i6-session-menu")
    }
}
