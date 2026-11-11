import SwiftUI

/// Экран чата: шапка, лента сообщений (или приветствие нового чата) и поле ввода у клавиатуры.
/// Отправка появляется на следующем этапе.
struct ChatScreen: View {
    @Environment(AppModel.self) private var model
    let onMenu: () -> Void
    @State private var draft = ""

    var body: some View {
        Group {
            if model.activeChatID == nil {
                ScrollView {
                    welcome
                        .padding(.horizontal, 24)
                        .frame(maxWidth: .infinity)
                        .containerRelativeFrame(.vertical, alignment: .center)
                }
                .scrollDismissesKeyboard(.interactively)
                .scrollBounceBehavior(.basedOnSize)
            } else {
                MessageFeed()
                    // Свой экземпляр ленты на каждый чат: позиция прокрутки не переносится.
                    .id(model.activeChatID)
            }
        }
        // Нажатие на пустое место или на текст ленты убирает клавиатуру.
        .contentShape(Rectangle())
        .onTapGesture { Keyboard.hide() }
        .safeAreaInset(edge: .top, spacing: 0) {
            header
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ComposerBar(text: $draft)
        }
        .task(id: model.activeChatID) {
            await model.loadThread()
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            CircleIconButton(symbol: "line.3.horizontal", label: "Меню", action: onMenu)
            if let chat = model.activeChat {
                Text(chat.title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity)
                CircleIconButton(symbol: "square.and.pencil", label: "Новый чат") {
                    model.activeChatID = nil
                }
            } else {
                Spacer()
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 52)
        .background(Theme.canvas)
    }

    private var welcome: some View {
        VStack(spacing: 14) {
            Wordmark(size: 34)
            Text(greeting)
                .font(Theme.display(24))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
    }

    private var greeting: String {
        guard let name = model.user?.shownName, !name.isEmpty else { return "Чем займёмся?" }
        return "Чем займёмся, \(name)?"
    }
}

/// Поле ввода. Прикреплено к нижней безопасной зоне, поэтому поднимается вместе с клавиатурой.
/// Слева — выбор модели, справа — отправка; пока модель отвечает, вместо отправки «Стоп».
struct ComposerBar: View {
    @Environment(AppModel.self) private var model
    @Binding var text: String
    @FocusState private var focused: Bool
    @State private var showModels = false

    private var hasText: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        let live = model.activeLive
        VStack(spacing: 8) {
            if let error = model.sendError {
                Button {
                    model.sendError = nil
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Image(systemName: "exclamationmark.circle")
                        Text(error)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                    }
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.danger)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityHint("Скрыть сообщение")
                .transition(.opacity)
            }

            VStack(alignment: .leading, spacing: 10) {
                TextField("", text: $text, prompt: Text("Сообщение").foregroundStyle(Theme.subtle), axis: .vertical)
                    .lineLimit(1...8)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.ink)
                    .focused($focused)
                    .padding(.horizontal, 6)
                    .padding(.top, 4)

                HStack(spacing: 8) {
                    modelButton
                    Spacer(minLength: 8)
                    if live != nil {
                        actionButton(symbol: "stop.fill", label: "Остановить ответ", active: live?.stopping != true) {
                            Task { await model.stop() }
                        }
                    } else {
                        actionButton(symbol: "arrow.up", label: "Отправить", active: hasText, action: submit)
                    }
                }
            }
            .padding(10)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Theme.line))
            .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .onTapGesture { focused = true }
        }
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .padding(.bottom, 8)
        .background(Theme.canvas)
        .animation(.easeOut(duration: 0.18), value: model.sendError)
        .sheet(isPresented: $showModels) {
            ModelPickerSheet()
        }
        .onAppear {
            if model.preview == .models { showModels = true }
        }
    }

    private var modelButton: some View {
        Button {
            Keyboard.hide()
            Haptics.tap()
            showModels = true
        } label: {
            HStack(spacing: 5) {
                Text(model.activeModelName)
                    .font(.system(size: 14, weight: .medium))
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 12)
            .frame(height: 36)
            .background(Theme.fill, in: Capsule())
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Модель: \(model.activeModelName)")
        .accessibilityHint("Выбрать модель")
    }

    private func actionButton(symbol: String, label: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: symbol == "stop.fill" ? 13 : 16, weight: .semibold))
                .foregroundStyle(Theme.buttonPrimaryText)
                .frame(width: 36, height: 36)
                .background(Theme.buttonPrimary.opacity(active ? 1 : 0.25), in: Circle())
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!active)
        .accessibilityLabel(label)
    }

    private func submit() {
        let message = text
        guard hasText else { return }
        text = ""
        Task {
            // Не ушло — возвращаем текст, если пользователь не начал писать новый.
            let sent = await model.send(message)
            if !sent, text.isEmpty {
                text = message
            }
        }
    }
}
