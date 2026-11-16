import XCTest
@testable import LLMChat

/// Подписи этапов ответа: короткие, без технических слов и без текста запросов и ошибок.
final class LiveStatusTests: XCTestCase {
    func testStartAndWriting() {
        XCTAssertEqual(LiveStatus.label("Подготовка запроса…"), "Думаю")
        XCTAssertEqual(LiveStatus.label("Обработка запроса…"), "Думаю")
        XCTAssertEqual(LiveStatus.label("Ожидание видеопамяти…"), "Жду своей очереди")
        XCTAssertEqual(LiveStatus.label("Загрузка модели…"), "Загружаю модель")
        XCTAssertEqual(LiveStatus.label("Загружаю модель в память…"), "Загружаю модель")
        XCTAssertEqual(LiveStatus.label("Генерация ответа…"), "Пишу ответ")
    }

    func testSearchHidesQuery() {
        XCTAssertEqual(LiveStatus.label("Подготовка поискового запроса…"), "Ищу в интернете")
        XCTAssertEqual(LiveStatus.label("Поиск: цена видеокарты 5070"), "Ищу в интернете")
        XCTAssertEqual(LiveStatus.label("Чтение найденных страниц…"), "Читаю источники")
        XCTAssertEqual(LiveStatus.label("Поиск в базе знаний…"), "Ищу в базе знаний")
    }

    func testFinalPhrasesKeepPreviousLabel() {
        for phase in ["Поиск завершён", "Источник прочитан", "База знаний проверена", "Источники Google Search получены"] {
            XCTAssertNil(LiveStatus.label(phase), phase)
        }
    }

    func testImagesAndErrors() {
        XCTAssertEqual(LiveStatus.label("Освобождение памяти LLM…"), "Рисую")
        XCTAssertEqual(LiveStatus.label("Nano Banana создаёт изображение…"), "Рисую")
        XCTAssertEqual(LiveStatus.label("Nano Banana продумывает изображение…"), "Думаю")
        XCTAssertEqual(LiveStatus.label("Генерация видео…"), "Создаю видео")
        XCTAssertEqual(LiveStatus.label("Сохранение изображения…"), "Сохраняю")
        XCTAssertEqual(LiveStatus.label("Ошибка инструмента: Traceback (most recent call last)"), "Не вышло, пробую иначе")
        XCTAssertEqual(LiveStatus.label("Что-то совсем новое"), LiveStatus.fallback)
    }
}
