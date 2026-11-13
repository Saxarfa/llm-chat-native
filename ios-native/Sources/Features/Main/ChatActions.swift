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
            .alert("Название чата", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
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
            .confirmationDialog("Удалить чат?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                                titleVisibility: .visible) {
                Button("Удалить", role: .destructive) {
                    if let chat = deleting {
                        Task { await model.delete(chat) }
                    }
                    deleting = nil
                }
                Button("Отмена", role: .cancel) { deleting = nil }
            } message: {
                Text("«\(deleting?.title ?? "")» переместится в корзину. Вернуть чат можно на сайте.")
            }
    }
}

extension View {
    func chatActions(renaming: Binding<ChatSummary?>, deleting: Binding<ChatSummary?>) -> some View {
        modifier(ChatActions(renaming: renaming, deleting: deleting))
    }
}

/// Пункты меню чата: переименовать, закрепить, удалить.
struct ChatMenuItems: View {
    @Environment(AppModel.self) private var model
    let chat: ChatSummary
    let onRename: () -> Void
    let onDelete: () -> Void

    var body: some View {
        Button(action: onRename) {
            Label("Переименовать", systemImage: "pencil")
        }
        Button {
            Task { await model.setPinned(chat, !chat.pinned) }
        } label: {
            Label(chat.pinned ? "Открепить" : "Закрепить", systemImage: chat.pinned ? "pin.slash" : "pin")
        }
        Button(role: .destructive, action: onDelete) {
            Label("Удалить", systemImage: "trash")
        }
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
struct ChatRowLabel: View {
    let chat: ChatSummary
    var showTime = false

    var body: some View {
        HStack(alignment: showTime ? .top : .center, spacing: 10) {
            Image(systemName: chat.pinned ? "pin" : "message")
                .font(.system(size: 15, weight: .light))
                .foregroundStyle(Theme.ink.opacity(0.8))
                .frame(width: 22)
                .padding(.top, showTime ? 1 : 0)
            VStack(alignment: .leading, spacing: 4) {
                Text(chat.title)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                if showTime {
                    let time = RelativeTime.text(chat.updatedAt)
                    if !time.isEmpty {
                        Text(time)
                            .font(.system(size: 12.5))
                            .foregroundStyle(Theme.subtle)
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }
}
