import SwiftUI

/// Боковое меню: логотип, список диалогов, внизу аккаунт и «Новый чат».
struct SidebarView: View {
    @Environment(AppModel.self) private var model
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Wordmark(size: 26)
                Spacer()
            }
            .padding(.horizontal, 20)
            .frame(height: 56)

            list
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            footer
        }
        .background(Theme.rail.ignoresSafeArea())
    }

    @ViewBuilder
    private var list: some View {
        if model.chats.isEmpty {
            VStack(spacing: 12) {
                if model.chatsLoading {
                    ProgressView().tint(Theme.muted)
                } else if let error = model.chatsError {
                    Text(error)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                    Button("Повторить") {
                        Task { await model.refreshChats() }
                    }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .frame(minHeight: 44)
                } else {
                    Text("Диалогов пока нет")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.muted)
                }
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    Text("Недавние")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.subtle)
                        .padding(.horizontal, 12)
                        .padding(.top, 8)
                        .padding(.bottom, 6)
                    ForEach(model.chats) { chat in
                        row(chat)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.bottom, 12)
            }
            .refreshable { await model.refreshChats() }
        }
    }

    private func row(_ chat: ChatSummary) -> some View {
        let active = chat.id == model.activeChatID
        return Button {
            model.activeChatID = chat.id
            onClose()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: chat.pinned ? "pin" : "bubble.left")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 22)
                Text(chat.title)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(active ? Theme.fillActive : Color.clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
    }

    private var footer: some View {
        HStack(spacing: 12) {
            Menu {
                Button("Сменить адрес компьютера", systemImage: "desktopcomputer") {
                    model.changeServer()
                }
                Button("Выйти", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                    Task { await model.logout() }
                }
            } label: {
                Text(String(model.user?.shownName.prefix(1) ?? "?").uppercased())
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .frame(width: 40, height: 40)
                    .background(Theme.fillActive, in: Circle())
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Аккаунт")

            Spacer()

            Button {
                model.activeChatID = nil
                onClose()
            } label: {
                Label("Новый чат", systemImage: "plus")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.buttonPrimaryText)
                    .padding(.horizontal, 18)
                    .frame(height: 44)
                    .background(Theme.buttonPrimary, in: Capsule())
            }
            .buttonStyle(PressScaleStyle())
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Theme.rail)
    }
}

struct RowPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Theme.fill : Color.clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
