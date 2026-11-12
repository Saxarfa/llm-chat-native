import XCTest

/// Этап 8.2: настройки модели телефона (ползунки с вводом числа, рассуждения, контекст),
/// «Параметры чата» для неё и работа без ПК — в режиме снимков, без сети и llama.cpp.
final class PhoneSettingsUITests: XCTestCase {
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

    private func number(_ field: XCUIElement) -> Double? {
        Double(((field.value as? String) ?? "").replacingOccurrences(of: ",", with: "."))
    }

    /// «Модели на телефоне» → кнопка настроек у модели: рассуждения, контекст, температура
    /// вводом с клавиатуры и кнопкой «+».
    func testModelSettings() {
        let app = launch("phoneModels")
        let gear = app.buttons.matching(identifier: "phone.settings").firstMatch
        XCTAssertTrue(gear.waitForExistence(timeout: 10), "у модели есть видимая кнопка настроек")
        sleep(1)
        gear.tap()
        XCTAssertTrue(app.staticTexts["Настройки модели"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.switches.matching(NSPredicate(format: "label CONTAINS %@", "Рассуждения")).firstMatch
            .waitForExistence(timeout: 5), "Qwen3 умеет выключать рассуждения — переключатель есть")
        XCTAssertTrue(app.staticTexts["Контекст"].exists)
        sleep(1)
        snap("ui-s1-model-settings")

        let field = element(app, "param.temperature.field")
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        // Курсор — в конец поля (текст выровнен вправо), старое значение стираем.
        field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3), "нажатие по полю открывает клавиатуру")
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 8) + "1.25")
        snap("ui-s2-typing")
        let done = app.buttons["Готово"].firstMatch
        XCTAssertTrue(done.waitForExistence(timeout: 3), "рядом с полем есть «Готово»")
        done.tap()
        XCTAssertEqual(number(field) ?? -1, 1.25, accuracy: 0.001, "вбитое число принято")

        let plus = app.buttons["Увеличить: Температура"].firstMatch
        XCTAssertTrue(plus.exists)
        plus.tap()
        XCTAssertEqual(number(field) ?? -1, 1.3, accuracy: 0.001, "«+» шагает на 0,05")
        XCTAssertTrue(text(app, contains: "Своё значение").exists, "изменённое значение помечено")
        sleep(1)
        snap("ui-s3-after")
    }

    /// «Параметры чата» модели телефона: рассуждения есть, веб-поиска и баз знаний нет.
    func testChatParametersOnPhone() {
        let app = launch("phoneParameters")
        XCTAssertTrue(app.staticTexts["Параметры чата"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.switches.matching(NSPredicate(format: "label CONTAINS %@", "Рассуждения")).firstMatch
            .waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Веб-поиск"].exists, "веб-поиск модели телефона недоступен")
        XCTAssertFalse(text(app, contains: "Базы знаний").exists)
        XCTAssertTrue(element(app, "param.temperature.field").exists, "у температуры есть поле ввода")
        sleep(1)
        snap("ui-s4-chat-parameters")
    }

    /// Без ПК: плашка, лента из копии на телефоне, в шторке — чаты телефона; новый вопрос отвечает модель телефона.
    func testOffline() {
        let app = launch("phoneOffline")
        XCTAssertTrue(element(app, "offline.banner").waitForExistence(timeout: 10))
        XCTAssertTrue(text(app, contains: "рюкзак").waitForExistence(timeout: 5), "чат открылся из копии на телефоне")
        sleep(1)
        snap("ui-o1-offline-chat")

        let input = element(app, "chat.input")
        input.tap()
        input.typeText("Что взять из еды?")
        app.buttons["Отправить"].firstMatch.tap()
        XCTAssertTrue(text(app, contains: "Работаю прямо на телефоне").waitForExistence(timeout: 8))
        let stop = app.buttons["Остановить ответ"].firstMatch
        let finished = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: stop)
        wait(for: [finished], timeout: 15)
        XCTAssertTrue(text(app, contains: "Что взять из еды").exists, "вопрос остался в ленте")
        XCTAssertFalse(text(app, contains: "не сохран").exists, "без ПК нет тревожной ошибки сохранения")
        sleep(1)
        snap("ui-o2-offline-answer")

        // Сначала убрать клавиатуру: иначе первое нажатие на «Меню» уходит на неё.
        if app.keyboards.firstMatch.exists {
            text(app, contains: "Работаю прямо на телефоне").tap()
            _ = app.keyboards.firstMatch.waitForNonExistence(timeout: 3)
        }
        app.buttons["Меню"].firstMatch.tap()
        let other = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Перевод письма")).firstMatch
        XCTAssertTrue(other.waitForExistence(timeout: 5), "в шторке чаты телефона")
        sleep(1)
        snap("ui-o3-offline-sidebar")
    }
}
