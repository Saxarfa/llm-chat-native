import XCTest

/// Сценарии с нажатиями в симуляторе. Приложение запускается в режиме снимков
/// (`--preview=<сцена>`): данные вымышленные, сети нет, генерация в студии изображается.
/// Каждый шаг снимается: PNG кладётся в папку из `SCREENS_DIR` (workflow передаёт её
/// через `TEST_RUNNER_SCREENS_DIR`) и прикладывается к результату теста.
final class StudioUITests: XCTestCase {
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

    private func text(_ app: XCUIApplication, beginsWith prefix: String) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
    }

    private func button(_ app: XCUIApplication, contains part: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", part)).firstMatch
    }

    private func wait(_ element: XCUIElement, _ format: String, timeout: TimeInterval = 10) {
        let done = expectation(for: NSPredicate(format: format), evaluatedWith: element)
        wait(for: [done], timeout: timeout)
    }

    private func closeSheet(_ app: XCUIApplication) {
        app.swipeDown(velocity: .fast)
        sleep(1)
    }

    /// Шторка → «Студия картинок» → обратно в чат.
    func testOpenStudioFromSidebar() {
        let app = launch("chat")
        let menu = app.buttons["Меню"].firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout: 10))
        menu.tap()
        let row = element(app, "sidebar.studio")
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        sleep(1)
        snap("ui-01-sidebar")
        row.tap()
        XCTAssertTrue(element(app, "studio.create").waitForExistence(timeout: 5))
        sleep(1)
        snap("ui-02-studio")
        app.buttons["Вернуться в чат"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Параметры чата"].firstMatch.waitForExistence(timeout: 5)
            || app.buttons["Новый чат"].firstMatch.waitForExistence(timeout: 5))
    }

    /// Промпт → «Создать» → ход генерации → готовый арт на сцене.
    func testGenerateArt() {
        let app = launch("studio")
        let prompt = element(app, "studio.prompt")
        XCTAssertTrue(prompt.waitForExistence(timeout: 10))
        prompt.tap()
        prompt.typeText(", дракон в облаках")
        snap("ui-03-typing")
        let done = app.buttons["Скрыть клавиатуру"].firstMatch
        if done.exists { done.tap() }

        let create = element(app, "studio.create")
        XCTAssertTrue(create.isEnabled)
        create.tap()
        XCTAssertTrue(text(app, beginsWith: "Создаю арт").waitForExistence(timeout: 5))
        snap("ui-04-generating")
        wait(create, "label CONTAINS 'Создать'", timeout: 15)
        sleep(1)
        snap("ui-05-done")
    }

    /// Формат, настройки, LoRA, история, сведения об арте и просмотр на весь экран.
    func testStudioPanels() {
        let app = launch("studio")
        let format = element(app, "studio.format")
        XCTAssertTrue(format.waitForExistence(timeout: 10))

        format.tap()
        XCTAssertTrue(app.staticTexts["Формат изображения"].waitForExistence(timeout: 5))
        snap("ui-06-format")
        button(app, contains: "Портрет").tap()
        wait(format, "label CONTAINS 'Портрет'")

        element(app, "studio.settings").tap()
        XCTAssertTrue(app.staticTexts["Настройки генерации"].waitForExistence(timeout: 5))
        sleep(1)
        snap("ui-07-settings")
        closeSheet(app)

        element(app, "studio.loras").tap()
        XCTAssertTrue(text(app, beginsWith: "Выбрано").waitForExistence(timeout: 5))
        sleep(1)
        snap("ui-08-loras")
        closeSheet(app)

        element(app, "studio.history").tap()
        XCTAssertTrue(app.staticTexts["История артов"].waitForExistence(timeout: 5))
        sleep(1)
        snap("ui-09-history")
        closeSheet(app)

        element(app, "studio.details").tap()
        XCTAssertTrue(app.staticTexts["Об этом арте"].waitForExistence(timeout: 5))
        sleep(1)
        snap("ui-10-details")
        button(app, contains: "На весь экран").tap()
        XCTAssertTrue(app.buttons["Закрыть"].firstMatch.waitForExistence(timeout: 5))
        sleep(1)
        snap("ui-11-viewer")
        app.buttons["Закрыть"].firstMatch.tap()
    }
}
