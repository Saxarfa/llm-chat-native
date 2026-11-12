import SwiftUI

/// Боковое меню: логотип, список диалогов, внизу аккаунт и «Новый чат».
struct SidebarView: View {
    @Environment(AppModel.self) private var model
    let onClose: () -> Void
    @State private var renaming: ChatSummary?
    @State private var deleting: ChatSummary?
    @State private var newTitle = ""
    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Wordmark(size: 26)
                Spacer()
            }
            .padding(.horizontal, 20)
            .frame(height: 56)

            if model.offline {
                OfflineBanner()
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
            }

            studioRow
                .padding(.horizontal, 8)
                .padding(.bottom, 4)

            list
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            footer
        }
        .background(Theme.rail.ignoresSafeArea())
        .alert("Название чата", isPresented: renameShown) {
            TextField("Название", text: $newTitle)
            Button("Сохранить") {
                if let chat = renaming {
                    Task { await model.rename(chat, to: newTitle) }
                }
                renaming = nil
            }
            Button("Отмена", role: .cancel) { renaming = nil }
        }
        .confirmationDialog("Удалить чат?", isPresented: deleteShown, titleVisibility: .visible) {
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
        .alert("Не получилось", isPresented: noticeShown) {
            Button("Понятно", role: .cancel) { model.chatsNotice = nil }
        } message: {
            Text(model.chatsNotice ?? "")
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
        }
        .onAppear {
            if model.preview == .settings || model.preview == .memory || model.preview == .knowledge { showSettings = true }
        }
    }

    private var renameShown: Binding<Bool> {
        Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })
    }

    private var deleteShown: Binding<Bool> {
        Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })
    }

    private var noticeShown: Binding<Bool> {
        Binding(get: { model.chatsNotice != nil }, set: { if !$0 { model.chatsNotice = nil } })
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
                let pinned = model.chats.filter { $0.pinned }
                LazyVStack(alignment: .leading, spacing: 2) {
                    if !pinned.isEmpty {
                        sectionTitle("Закреплённые")
                        ForEach(pinned) { chat in
                            row(chat)
                        }
                    }
                    sectionTitle("Недавние")
                    ForEach(model.chats.filter { !$0.pinned }) { chat in
                        row(chat)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.bottom, 12)
            }
            .refreshable { await model.refreshChats() }
        }
    }

    /// Студия картинок — отдельный экран, как пункт «Генерация» на сайте.
    private var studioRow: some View {
        let active = model.screen == .studio
        return Button {
            model.screen = .studio
            onClose()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "photo.on.rectangle.angled")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 22)
                Text("Студия картинок")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                Spacer(minLength: 0)
                if model.studio.pendingJob != nil {
                    ProgressView().controlSize(.mini).tint(Theme.muted)
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(active ? Theme.fillActive : Color.clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .accessibilityIdentifier("sidebar.studio")
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Theme.subtle)
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 6)
    }

    private func row(_ chat: ChatSummary) -> some View {
        let active = chat.id == model.activeChatID && model.screen == .chat
        return Button {
            model.activeChatID = chat.id
            model.screen = .chat
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
        .contextMenu {
            Button {
                newTitle = chat.title
                renaming = chat
            } label: {
                Label("Переименовать", systemImage: "pencil")
            }
            Button {
                Task { await model.setPinned(chat, !chat.pinned) }
            } label: {
                Label(chat.pinned ? "Открепить" : "Закрепить", systemImage: chat.pinned ? "pin.slash" : "pin")
            }
            Button(role: .destructive) {
                deleting = chat
            } label: {
                Label("Удалить", systemImage: "trash")
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            Menu {
                Button("Настройки", systemImage: "gearshape") {
                    showSettings = true
                }
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
                model.screen = .chat
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
