import SwiftUI

/// Экран чата. На этом этапе — шапка, приветствие и поле ввода у клавиатуры;
/// лента сообщений и отправка появляются на следующих этапах.
struct ChatScreen: View {
    @Environment(AppModel.self) private var model
    let onMenu: () -> Void
    @State private var draft = ""

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 24)
                .frame(maxWidth: .infinity)
                .containerRelativeFrame(.vertical, alignment: .center)
        }
        .scrollDismissesKeyboard(.interactively)
        .scrollBounceBehavior(.basedOnSize)
        .safeAreaInset(edge: .top, spacing: 0) {
            header
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ComposerBar(text: $draft)
        }
    }

    private var header: some View {
        HStack {
            CircleIconButton(symbol: "line.3.horizontal", label: "Меню", action: onMenu)
            Spacer()
            if model.activeChatID != nil {
                CircleIconButton(symbol: "square.and.pencil", label: "Новый чат") {
                    model.activeChatID = nil
                }
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 52)
        .background(Theme.canvas)
    }

    @ViewBuilder
    private var content: some View {
        if let chat = model.activeChat {
            VStack(spacing: 10) {
                Text(chat.title)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .multilineTextAlignment(.center)
                Text("Лента сообщений появится на следующем этапе.")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
            }
        } else {
            VStack(spacing: 14) {
                Wordmark(size: 34)
                Text(greeting)
                    .font(Theme.display(24))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private var greeting: String {
        guard let name = model.user?.shownName, !name.isEmpty else { return "Чем займёмся?" }
        return "Чем займёмся, \(name)?"
    }
}

/// Поле ввода. Прикреплено к нижней безопасной зоне, поэтому поднимается вместе с клавиатурой.
struct ComposerBar: View {
    @Binding var text: String
    @FocusState private var focused: Bool

    private var hasText: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("", text: $text, prompt: Text("Сообщение").foregroundStyle(Theme.subtle), axis: .vertical)
                .lineLimit(1...8)
                .font(.system(size: 17))
                .foregroundStyle(Theme.ink)
                .focused($focused)
                .padding(.horizontal, 6)
                .padding(.top, 4)

            HStack(spacing: 8) {
                Image(systemName: "plus")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 36, height: 36)
                    .background(Theme.fill, in: Circle())
                    .accessibilityHidden(true)
                Spacer()
                // Отправка подключается на этапе 3, поэтому кнопка пока неактивна.
                Image(systemName: "arrow.up")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.buttonPrimaryText)
                    .frame(width: 36, height: 36)
                    .background(Theme.buttonPrimary.opacity(hasText ? 0.55 : 0.25), in: Circle())
                    .accessibilityLabel("Отправка появится позже")
            }
        }
        .padding(10)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Theme.line))
        .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .onTapGesture { focused = true }
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .padding(.bottom, 8)
        .background(Theme.canvas)
    }
}
