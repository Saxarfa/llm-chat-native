import SwiftUI
import UIKit

/// Переименование и удаление чата: одинаковые окна в шторке, на экране «Недавние» и в «⋯» шапки чата.
struct ChatActions: ViewModifier {
    @Environment(AppModel.self) private var model
    @Binding var renaming: ChatSummary?
    @Binding var deleting: ChatSummary?
    @State private var newTitle = ""

    func body(content: Content) -> some View {
        content
            .onChange(of: renaming?.id) { _, _ in
                if let chat = renaming { newTitle = chat.title }
            }
            .alert("Название сессии", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
                TextField("Название", text: $newTitle)
                Button("Сохранить") {
                    if let chat = renaming {
                        let title = newTitle
                        Task { await model.rename(chat, to: title) }
                    }
                    renaming = nil
                }
                Button("Отмена", role: .cancel) { renaming = nil }
            }
            .confirmationDialog("Удалить сессию?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                                titleVisibility: .visible) {
                Button("Удалить", role: .destructive) {
                    if let chat = deleting {
                        Task { await model.delete(chat) }
                    }
                    deleting = nil
                }
                Button("Отмена", role: .cancel) { deleting = nil }
            } message: {
                Text("«\(deleting?.title ?? "")» переместится в корзину. Вернуть сессию можно на сайте.")
            }
    }
}

extension View {
    func chatActions(renaming: Binding<ChatSummary?>, deleting: Binding<ChatSummary?>) -> some View {
        modifier(ChatActions(renaming: renaming, deleting: deleting))
    }
}

/// Пункты меню сессии, как у Claude: «Закрепить», затем «Поделиться» и «Переименовать», внизу красная
/// «Удалить». «Поделиться» отдаёт переписку текстом (ссылок на сессии у сайта нет);
/// «Добавить в проект» не показывается: проектов у сайта нет.
struct ChatMenuItems: View {
    @Environment(AppModel.self) private var model
    let chat: ChatSummary
    let onRename: () -> Void
    let onDelete: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            Task { await model.setPinned(chat, !chat.pinned) }
        } label: {
            Label(chat.pinned ? "Открепить" : "Закрепить", systemImage: chat.pinned ? "pin.slash" : "pin")
        }
        Divider()
        Button {
            Task { await ChatShare.share(chat, model: model) }
        } label: {
            Label("Поделиться", systemImage: "square.and.arrow.up")
        }
        Button(action: onRename) {
            Label("Переименовать", systemImage: "pencil")
        }
        Divider()
        Button(role: .destructive, action: onDelete) {
            Label("Удалить", systemImage: "trash")
        }
    }
}

/// «Поделиться» сессией: вся переписка Markdown-текстом через системное меню «Поделиться».
enum ChatShare {
    @MainActor
    static func share(_ chat: ChatSummary, model: AppModel) async {
        guard let text = await model.transcript(of: chat) else { return }
        Haptics.tap()
        present(text)
    }

    /// Системное окно «Поделиться» поверх самого верхнего экрана (меню и шторки тоже экраны).
    @MainActor
    static func present(_ text: String) {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.first?.windows.first,
              var top = window.rootViewController else { return }
        while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
        let sheet = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = top.view
        top.present(sheet, animated: true)
    }
}

extension AppModel {
    /// Переписка сессии текстом: из открытой ленты, кэша или с сервера.
    func transcript(of chat: ChatSummary) async -> String? {
        var messages: [FeedMessage] = threadChatID == chat.id && !thread.isEmpty ? thread : (threadCache[chat.id] ?? [])
        if messages.isEmpty, preview == nil, let api,
           let status = try? await api.json("/api/chat/status/\(APIClient.pathSafe(chat.id))"),
           let raw = (status["chat"] as? [String: Any])?["messages"] as? [[String: Any]] {
            messages = await Task.detached(priority: .userInitiated) {
                FeedMessage.build(from: raw.map { ChatMessage(json: $0) })
            }.value
        }
        guard !messages.isEmpty else {
            chatsNotice = "Не удалось получить переписку этой сессии."
            return nil
        }
        var parts = ["# \(chat.title)"]
        for message in messages {
            let who = message.isUser
                ? (user?.shownName ?? "Вы")
                : (message.model.isEmpty ? "Модель" : ChatConfig.modelName(message.model, profiles: settings.modelProfiles))
            var body = message.text
            let files = message.attachments.map { "Вложение: \($0.name)" }
            if !files.isEmpty { body += (body.isEmpty ? "" : "\n\n") + files.joined(separator: "\n") }
            parts.append("**\(who):**\n\n\(body)")
        }
        return parts.joined(separator: "\n\n")
    }
}

/// Сколько времени назад менялся чат: «2 минуты назад», «вчера», «3 недели назад».
enum RelativeTime {
    private static let formatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.unitsStyle = .full
        formatter.dateTimeStyle = .named
        return formatter
    }()

    /// `millis` — время сервера в миллисекундах.
    static func text(_ millis: Double, now: Date = Date()) -> String {
        guard millis > 0 else { return "" }
        let date = Date(timeIntervalSince1970: millis / 1000)
        if now.timeIntervalSince(date) < 60 { return "только что" }
        return formatter.localizedString(for: date, relativeTo: now)
    }
}

/// Фото профиля (с сайта приходит как `data:image/...;base64,...`) или первая буква имени.
struct AvatarView: View {
    let image: String?
    let name: String
    var size: CGFloat = 40

    var body: some View {
        Group {
            if let picture = AvatarCache.image(image) {
                Image(uiImage: picture)
                    .resizable()
                    .scaledToFill()
            } else {
                Text(String(name.prefix(1)).uppercased())
                    .font(.system(size: size * 0.42, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Theme.fillActive)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }
}

/// Раскодированные аватары: одна и та же строка не разбирается заново при каждой отрисовке.
enum AvatarCache {
    private static let cache = NSCache<NSString, UIImage>()

    static func image(_ source: String?) -> UIImage? {
        guard let source, source.hasPrefix("data:"), let comma = source.firstIndex(of: ",") else { return nil }
        let key = NSString(string: String(source.suffix(64)) + "\(source.count)")
        if let cached = cache.object(forKey: key) { return cached }
        guard let data = Data(base64Encoded: String(source[source.index(after: comma)...]), options: .ignoreUnknownCharacters),
              let image = UIImage(data: data) else { return nil }
        cache.setObject(image, forKey: key)
        return image
    }

    /// Квадрат 256×256 из середины снимка, как `avatarFile` на сайте; JPEG, чтобы строка была короткой.
    static func encode(_ image: UIImage) -> String? {
        let side = min(image.size.width, image.size.height)
        guard side > 0 else { return nil }
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 256, height: 256))
        let square = renderer.image { _ in
            let scale = 256 / side
            let width = image.size.width * scale, height = image.size.height * scale
            image.draw(in: CGRect(x: (256 - width) / 2, y: (256 - height) / 2, width: width, height: height))
        }
        guard let data = square.jpegData(compressionQuality: 0.85) else { return nil }
        return "data:image/jpeg;base64," + data.base64EncodedString()
    }
}

/// Строка чата со значком: в шторке — одна строка, на экране «Недавние» — со временем.
/// Размеры — по снимкам Claude 16.11.2026: название 17 pt, время 15 pt, значок ~19 pt в рамке 26.
struct ChatRowLabel: View {
    static let iconSize: CGFloat = 18
    static let iconFrame: CGFloat = 26
    /// Рамка значка → текст: в шторке текст начинается в 60,5 pt от края экрана.
    static let drawerGap: CGFloat = 11.5

    let chat: ChatSummary
    var showTime = false
    /// Ответ пришёл, пока сессию не открывали: синяя точка справа, как у Claude.
    var unread = false
    var gap: CGFloat = ChatRowLabel.drawerGap

    var body: some View {
        HStack(alignment: showTime ? .top : .center, spacing: gap) {
            Image(systemName: chat.pinned ? "pin" : "message")
                .font(.system(size: Self.iconSize, weight: .regular))
                .foregroundStyle(Theme.ink.opacity(0.88))
                .frame(width: Self.iconFrame)
                .padding(.top, showTime ? 2 : 0)
            VStack(alignment: .leading, spacing: 5) {
                Text(chat.title)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                if showTime {
                    let time = RelativeTime.text(chat.updatedAt)
                    if !time.isEmpty {
                        Text(time)
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.subtle)
                    }
                }
            }
            Spacer(minLength: 0)
            if unread {
                Circle()
                    .fill(Theme.unread)
                    .frame(width: 8, height: 8)
                    .padding(.top, showTime ? 8 : 0)
                    .transition(.scale.combined(with: .opacity))
                    .accessibilityLabel("Новый ответ")
            }
        }
        .animation(Theme.spring, value: unread)
    }
}
