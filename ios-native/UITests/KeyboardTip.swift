import XCTest

extension XCUIApplication {
    /// На свежем симуляторе первая клавиатура показывает подсказку «Speed up your typing…»
    /// с кнопкой «Continue» поверх поля ввода — кнопки капсулы под ней не нажать.
    /// В CI подсказка выключена заранее (`build-ios-native.yml`), это — запасной путь.
    func skipKeyboardTip() {
        let button = buttons["Continue"].firstMatch
        if button.waitForExistence(timeout: 1.5), button.isHittable { button.tap() }
    }
}
