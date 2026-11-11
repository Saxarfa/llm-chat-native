import Foundation

/// Экран для снимка в симуляторе: `--preview=<имя>`. Данные вымышленные, сети нет.
enum PreviewScene: String, CaseIterable {
    case connect, login, offline, chat, sidebar

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
}
