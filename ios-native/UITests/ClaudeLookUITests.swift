import XCTest

/// 0.11: вид как в приложении Claude — настройки с разделами и темой, «Недавние» с поиском,
/// «⋯» в шапке чата, ряд действий под ответом.
final class ClaudeLookUITests: XCTestCase {
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

    /// Настройки: плитки темы переключают тему, «Компьютер» показывает задачи и останавливает их,
    /// «Модели» ведут в профиль модели.
    func testSettingsPages() {
        let app = launch("settings")
        XCTAssertTrue(element(app, "settings.root").waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Внешний вид"].exists || app.staticTexts["Аккаунт"].exists)
        sleep(1)
        snap("ui-l1-settings")

        let root = element(app, "settings.root")
        root.swipeUp()
        let light = app.buttons["Тема: Светлая"].firstMatch
        XCTAssertTrue(light.waitForExistence(timeout: 5))
        light.tap()
        XCTAssertTrue(light.isSelected, "светлая тема выбрана")
        sleep(1)
        snap("ui-l2-settings-light")
        app.buttons["Тема: Тёмная"].firstMatch.tap()
        root.swipeDown()

        element(app, "settings.computer").tap()
        XCTAssertTrue(app.staticTexts["Сервисы"].waitForExistence(timeout: 5))
        let stops = app.buttons.matching(identifier: "computer.stop")
        XCTAssertEqual(stops.count, 2, "две задачи можно остановить")
        sleep(1)
        snap("ui-l3-computer")
        stops.firstMatch.tap()
        let one = expectation(for: NSPredicate(format: "count == 1"), evaluatedWith: stops)
        wait(for: [one], timeout: 5)
        app.buttons["Назад"].firstMatch.tap()

        element(app, "settings.models").tap()
        let row = app.buttons.matching(identifier: "models.row").firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        row.tap()
        XCTAssertTrue(app.staticTexts["Профиль модели"].waitForExistence(timeout: 5))
        XCTAssertTrue(element(app, "profile.parameters").exists, "«Параметры ответа»")
        sleep(1)
        snap("ui-l4-model-profile")
    }

    /// Поиск в шторке открывает «Недавние»: список со временем, поиск по названию.
    func testRecentsSearch() {
        let app = launch("sidebar")
        let search = app.buttons["Поиск чатов"].firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10))
        search.tap()
        let field = element(app, "recents.search")
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        XCTAssertGreaterThan(app.buttons.matching(identifier: "recents.row").count, 5)
        sleep(1)
        snap("ui-l5-recents")
        field.tap()
        field.typeText("плов")
        let rows = app.buttons.matching(identifier: "recents.row")
        let filtered = expectation(for: NSPredicate(format: "count == 1"), evaluatedWith: rows)
        wait(for: [filtered], timeout: 5)
    }

    /// Капсула: без клавиатуры — строка без модели, с клавиатурой — карточка с моделью,
    /// с текстом «Отправить» становится доступной.
    func testComposerStates() {
        let app = launch("chat")
        let input = element(app, "chat.input")
        XCTAssertTrue(input.waitForExistence(timeout: 10))
        let chip = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Модель:")).firstMatch
        let send = app.buttons["Отправить"].firstMatch
        XCTAssertFalse(chip.exists, "в строке-капсуле модели нет")
        XCTAssertTrue(send.exists)
        XCTAssertFalse(send.isEnabled, "отправлять нечего")
        sleep(1)
        snap("ui-k1-pill")
        input.tap()
        XCTAssertTrue(chip.waitForExistence(timeout: 5), "с клавиатурой — карточка с моделью")
        sleep(1)
        snap("ui-k2-keyboard")
        input.typeText("Привет")
        XCTAssertTrue(send.isEnabled)
        sleep(1)
        snap("ui-k3-text")
    }

    /// Лента уходит под шапку; когда она отлистана вверх, над полем ввода есть кнопка «вниз».
    func testFeedDownButtonAndKeyboard() {
        let app = launch("threadTop")
        let down = element(app, "feed.down")
        XCTAssertTrue(down.waitForExistence(timeout: 10), "лента не у низа — кнопка «вниз»")
        sleep(1)
        snap("ui-k4-thread-top")
        down.tap()
        let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: down)
        wait(for: [gone], timeout: 5)
        element(app, "chat.input").tap()
        sleep(1)
        snap("ui-k5-thread-keyboard")
    }

    /// «⋯» в шапке чата и ряд значков под ответом.
    func testHeaderMenuAndAnswerActions() {
        let app = launch("thread")
        XCTAssertTrue(app.buttons["Поделиться"].firstMatch.waitForExistence(timeout: 10), "«Поделиться» под ответом")
        XCTAssertTrue(app.buttons["Прочитать вслух"].firstMatch.exists)
        XCTAssertTrue(element(app, "composer.mic").exists, "микрофон для диктовки")
        app.buttons["Ещё"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Переименовать"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Ветки диалога"].firstMatch.exists)
        sleep(1)
        snap("ui-l6-header-menu")
    }

    /// Выбор модели как у Claude: аватарки и главная карточка, «Другие модели» отдельной страницей.
    func testModelPickerPages() {
        let app = launch("models")
        let other = element(app, "picker.other")
        XCTAssertTrue(other.waitForExistence(timeout: 10))
        sleep(1)
        snap("ui-m1-picker")
        other.tap()
        XCTAssertTrue(element(app, "phone.manage").waitForExistence(timeout: 5), "модели телефона — во «Других моделях»")
        sleep(1)
        snap("ui-m2-other")
    }
}
