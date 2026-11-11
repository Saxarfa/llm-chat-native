import Foundation

/// Экран для снимка в симуляторе: `--preview=<имя>`. Данные вымышленные, сети нет.
enum PreviewScene: String, CaseIterable {
    case connect, login, offline, chat, sidebar
    /// Лента: `thread` — у последнего сообщения, `threadTop` — с начала.
    case thread, threadTop

    static var current: PreviewScene? {
        for argument in ProcessInfo.processInfo.arguments where argument.hasPrefix("--preview=") {
            return PreviewScene(rawValue: String(argument.dropFirst("--preview=".count)))
        }
        return nil
    }

    static let user = User(id: 1, username: "demo", avatar: nil, displayName: "Демо")

    static let chats: [ChatSummary] = [
        ChatSummary(id: "1", title: "План поездки на выходные", pinned: true),
        ChatSummary(id: "2", title: "Разбор ошибки в скрипте резервного копирования"),
        ChatSummary(id: "3", title: "Идеи для обложки альбома"),
        ChatSummary(id: "4", title: "Сравнение локальных моделей"),
        ChatSummary(id: "5", title: "Перевод письма на английский"),
        ChatSummary(id: "6", title: "Рецепт плова"),
        ChatSummary(id: "7", title: "Как устроен WAL в SQLite"),
    ]

    static let feed: [FeedMessage] = FeedMessage.build(from: [
        ChatMessage(id: "a", role: "user", content: "Объясни коротко, как устроен WAL в SQLite и когда его включать."),
        ChatMessage(id: "b", role: "assistant", content: #"""
        ## Журнал упреждающей записи

        В режиме **WAL** изменения сначала дописываются в отдельный файл `app.db-wal`, а основная база меняется позже — при *контрольной точке*. Подробнее — в [документации SQLite](https://sqlite.org/wal.html).

        Что это даёт:

        - читатели не блокируют писателя, а писатель — читателей;
        - запись быстрее: это последовательное дописывание в конец файла;
          без случайных обращений к диску;
        - после сбоя база восстанавливается по журналу.

        Порядок работы:

        1. Писатель добавляет кадры в WAL.
        2. Читатели видят снимок на момент начала чтения.
        3. Контрольная точка переносит кадры в основной файл.

        > Файл базы нельзя копировать «как есть», пока она открыта: часть данных лежит в журнале.
        """#, model: "gemma-3-27b", reasoning: "Нужно объяснить кратко: что такое WAL, преимущества, порядок работы и предупреждение о копировании."),
        ChatMessage(id: "c", role: "user", content: "Покажи, как включить, и сравни с обычным журналом.", attachmentNames: ["schema.sql"]),
        ChatMessage(id: "d", role: "assistant", content: #"""
        Включается одной командой — режим сохраняется в файле базы:

        ```python
        import sqlite3

        conn = sqlite3.connect("app.db")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")  # быстрее, для WAL это безопасно
        ```

        ### Сравнение

        | Свойство | DELETE (обычный) | WAL |
        |---|---|---|
        | Чтение во время записи | нет | да |
        | Скорость записи | ниже | выше |
        | Файлов на диске | 1–2 | 3 (`-wal`, `-shm`) |
        | Сетевые диски | работает | не поддерживается |

        ---

        Для локального приложения с одним писателем WAL — почти всегда верный выбор.
        """#, model: "gemma-3-27b"),
    ])
}
