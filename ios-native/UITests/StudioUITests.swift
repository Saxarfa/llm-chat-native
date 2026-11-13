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

    /// Сетка истории: квадратные ячейки в три колонки, без наложений (в 0.7 миниатюры раздувались).
    private func checkHistoryGrid(_ app: XCUIApplication) {
        let cells = app.buttons.matching(identifier: "studio.history.cell")
        XCTAssertGreaterThanOrEqual(cells.count, 3)
        let column = (app.windows.firstMatch.frame.width - 32) / 3 + 1
        var frames: [CGRect] = []
        for index in 0..<min(cells.count, 6) {
            let frame = cells.element(boundBy: index).frame
            XCTAssertLessThanOrEqual(frame.width, column, "ячейка \(index) шире колонки: \(frame)")
            XCTAssertEqual(frame.width, frame.height, accuracy: 2, "ячейка \(index) не квадратная: \(frame)")
            frames.append(frame)
        }
        for a in frames.indices {
            for b in frames.indices where b > a {
                XCTAssertFalse(frames[a].insetBy(dx: 1, dy: 1).intersects(frames[b]),
                               "ячейки \(a) и \(b) наложились: \(frames[a]) / \(frames[b])")
            }
        }
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
        XCTAssertTrue(app.buttons["Настройки модели"].firstMatch.waitForExistence(timeout: 5)
            || app.buttons["Новый чат"].firstMatch.waitForExistence(timeout: 5))
    }

    /// Промпт → «Создать» → ход генерации → готовый арт на сцене.
    func testGenerateArt() {
        let app = launch("studio")
        let prompt = element(app, "studio.prompt")
        XCTAssertTrue(prompt.waitForExistence(timeout: 10))
        prompt.tap()
        prompt.typeText(", дракон в облаках")
        // Пока набирается промпт, сцены нет, а последний арт — миниатюрой в строке чипов (как на сайте).
        XCTAssertTrue(element(app, "studio.thumb").waitForExistence(timeout: 3))
        sleep(1)
        XCTAssertFalse(element(app, "studio.canvas").exists, "сцена должна прятаться на время набора")
        snap("ui-03-typing")
        let done = app.buttons["Скрыть клавиатуру"].firstMatch
        XCTAssertTrue(done.isHittable, "«Готово» должна быть видна без прокрутки ленты")
        done.tap()
        XCTAssertTrue(element(app, "studio.canvas").waitForExistence(timeout: 3))

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

        // Свайп вправо по ленте артов листает её, а не вытягивает боковое меню.
        // Открытое меню сдвигает экран студии вправо — по этому и проверяем.
        let strip = element(app, "studio.filmstrip")
        XCTAssertTrue(strip.waitForExistence(timeout: 5))
        let left = format.frame.minX
        strip.swipeRight()
        sleep(1)
        snap("ui-05b-swipe-strip")
        XCTAssertTrue(format.exists && abs(format.frame.minX - left) < 2,
                      "свайп по ленте артов сдвинул экран (открылось меню): \(format.frame.minX) vs \(left)")

        // Контроль: свайп по сцене меню открывает, иначе проверка выше ничего не доказывает.
        element(app, "studio.canvas").swipeRight()
        sleep(1)
        snap("ui-05c-swipe-stage")
        XCTAssertTrue(!format.exists || format.frame.minX > left + 100, "свайп по сцене не открыл меню")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
        sleep(1)
        XCTAssertTrue(format.waitForExistence(timeout: 3))
        let deadline = Date().addingTimeInterval(3)
        while abs(format.frame.minX - left) > 2, Date() < deadline { usleep(200_000) }
        XCTAssertEqual(format.frame.minX, left, accuracy: 2, "меню не закрылось")

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
        checkHistoryGrid(app)
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

    /// Арт на весь экран: фон размыт, смахивание вниз закрывает просмотр (с 0.13).
    func testViewerSwipeToClose() {
        let app = launch("studioArt")
        let close = app.buttons["Закрыть"].firstMatch
        XCTAssertTrue(close.waitForExistence(timeout: 10))
        sleep(1)
        snap("ui-12-viewer-blur")
        let window = app.windows.firstMatch
        let start = window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45))
        start.press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.9)))
        wait(close, "exists == false", timeout: 5)
        XCTAssertTrue(element(app, "studio.canvas").waitForExistence(timeout: 3), "после смахивания — снова студия")
        snap("ui-13-viewer-closed")
    }
}
