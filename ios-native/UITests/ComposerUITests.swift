import XCTest

/// 0.10: капсула ввода — меню «+», очередь вопросов, линия контекста; «Настройки модели» из шапки.
final class ComposerUITests: XCTestCase {
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

    /// «+» открывает шторку: вложения плитками, поиск, рассуждения, память, базы знаний.
    func testToolsMenu() {
        let app = launch("thread")
        let plus = element(app, "composer.tools")
        XCTAssertTrue(plus.waitForExistence(timeout: 10))
        plus.tap()
        XCTAssertTrue(element(app, "tools.photo").waitForExistence(timeout: 5), "кнопка «Фото» в заголовке")
        XCTAssertTrue(element(app, "tools.camera").exists, "плитка «Камера»")
        XCTAssertTrue(element(app, "tools.file").exists, "строка «Добавить файлы»")
        XCTAssertTrue(app.staticTexts["Добавление в чат"].exists)
        XCTAssertTrue(app.switches.matching(NSPredicate(format: "label CONTAINS %@", "Память")).firstMatch.exists)
        sleep(1)
        snap("ui-c1-tools")

        // Поиск — для этого чата: выбор из меню сразу виден в строке.
        element(app, "tools.search").tap()
        let always = app.buttons["Всегда"].firstMatch
        XCTAssertTrue(always.waitForExistence(timeout: 3))
        always.tap()
        XCTAssertTrue(app.staticTexts["Всегда"].waitForExistence(timeout: 3), "в строке поиска — «Всегда»")

        element(app, "tools.knowledge").tap()
        XCTAssertTrue(app.staticTexts["Использовать базу знаний"].waitForExistence(timeout: 5), "экран баз знаний")
        sleep(1)
        snap("ui-c2-knowledge")
        app.buttons["Назад"].firstMatch.tap()
        XCTAssertTrue(element(app, "tools.knowledge").waitForExistence(timeout: 5))
    }

    /// Пока модель отвечает, набранный вопрос встаёт в очередь; его можно убрать.
    func testQueue() {
        let app = launch("streaming")
        let input = element(app, "chat.input")
        XCTAssertTrue(input.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Остановить ответ"].firstMatch.exists)
        input.tap()
        input.typeText("А что с водой?")
        let queue = app.buttons["Добавить в очередь"].firstMatch
        XCTAssertTrue(queue.waitForExistence(timeout: 3), "рядом со «Стоп» — кнопка очереди")
        queue.tap()
        XCTAssertTrue(text(app, contains: "В очереди").waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Остановить ответ"].firstMatch.exists, "ответ идёт дальше")
        sleep(1)
        snap("ui-c3-queue")
        app.buttons["Убрать из очереди"].firstMatch.tap()
        let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: text(app, contains: "В очереди"))
        wait(for: [gone], timeout: 3)
    }

    /// Линия контекста под капсулой: нажатие показывает, сколько занято и сколько свободно.
    func testContextDetails() {
        let app = launch("thread")
        let line = element(app, "composer.context")
        XCTAssertTrue(line.waitForExistence(timeout: 10))
        line.tap()
        XCTAssertTrue(app.staticTexts["Контекст модели"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Свободно"].exists)
        sleep(1)
        snap("ui-c4-context")
    }

    /// «⋯» в шапке открывает «Настройки модели»: значения сохраняются за моделью.
    func testModelSettingsFromHeader() {
        let app = launch("thread")
        let more = app.buttons["Ещё"].firstMatch
        XCTAssertTrue(more.waitForExistence(timeout: 10))
        more.tap()
        let button = app.buttons["Настройки модели"].firstMatch
        XCTAssertTrue(button.waitForExistence(timeout: 5))
        button.tap()
        XCTAssertTrue(app.staticTexts["Настройки модели"].waitForExistence(timeout: 5))
        XCTAssertFalse(text(app, contains: "только для этого чата").exists, "надписей про временные настройки нет")
        XCTAssertFalse(app.staticTexts["Веб-поиск"].exists, "поиск переехал в меню «+»")
        let plus = app.buttons["Увеличить: Температура"].firstMatch
        XCTAssertTrue(plus.waitForExistence(timeout: 5))
        plus.tap()
        XCTAssertTrue(text(app, contains: "Своё значение").waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Вернуть значения по умолчанию"].firstMatch.exists)
        sleep(1)
        snap("ui-c5-model-settings")
    }
}
