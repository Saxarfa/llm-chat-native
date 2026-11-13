import SwiftUI

/// Боковое меню, как в приложении Claude: логотип и поиск, разделы, недавние чаты
/// («Показать все» — отдельный экран), внизу поверх списка — фото профиля (настройки) и «Новый чат».
struct SidebarView: View {
    @Environment(AppModel.self) private var model
    let onClose: () -> Void
    @State private var renaming: ChatSummary?
    @State private var deleting: ChatSummary?
    @State private var showSettings = false
    @State private var showPhone = false

    /// Сколько недавних чатов видно в шторке; остальные — на экране «Недавние».
    private static let recentLimit = 12

    var body: some View {
        // Нижние кнопки стоят чуть ниже безопасной зоны, у полосы «домой», как у Claude.
        let resting: CGFloat = Screen.bottomInset > 0 ? -8 : 8
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 3) {
                if model.offline {
                    OfflineBanner()
                        .padding(.bottom, 6)
                }
                navRow("Студия картинок", symbol: "photo.on.rectangle.angled", active: model.screen == .studio,
                       busy: model.studio.pendingJob != nil) {
                    open(.studio)
                }
                .accessibilityIdentifier("sidebar.studio")
                navRow("Модели на телефоне", symbol: "iphone", active: false,
                       busy: !model.phone.downloads.isEmpty) {
                    showPhone = true
                }
                .accessibilityIdentifier("sidebar.phone")
                chatList
            }
            .padding(.horizontal, 14)
            .padding(.top, 6)
            .padding(.bottom, 24)
        }
        .refreshable { await model.refreshChats() }
        // Шапка и нижние кнопки без подложки: список уходит под них и затухает.
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack {
                Wordmark(size: 23)
                Spacer()
                CircleIconButton(symbol: "magnifyingglass", label: "Поиск чатов") {
                    model.focusRecentsSearch = true
                    open(.recents)
                }
            }
            .padding(.leading, 15)
            .padding(.trailing, 12)
            .frame(height: 44)
            .padding(.top, -6)
            .padding(.bottom, 4)
            // Под шапкой список размывается, как в шторке Claude (было простое затемнение).
            .background(alignment: .top) {
                Theme.edgeBlur(Theme.rail, from: .top)
                    .padding(.bottom, -20)
                    .ignoresSafeArea(edges: .top)
                    .allowsHitTesting(false)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            footer
                .padding(.bottom, resting)
                .background(alignment: .bottom) {
                    Theme.edgeBlur(Theme.rail, from: .bottom)
                        .padding(.top, -26)
                        .ignoresSafeArea(edges: .bottom)
                        .allowsHitTesting(false)
                }
        }
        .background(Theme.rail.ignoresSafeArea())
        .chatActions(renaming: $renaming, deleting: $deleting)
        .alert("Не получилось", isPresented: noticeShown) {
            Button("Понятно", role: .cancel) { model.chatsNotice = nil }
        } message: {
            Text(model.chatsNotice ?? "")
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
        }
        .sheet(isPresented: $showPhone) {
            PhoneModelsSheet { id in
                Task { await model.selectModel(id) }
                showPhone = false
                model.activeChatID = nil
                model.screen = .chat
                onClose()
            }
            .environment(model)
        }
        .onAppear {
            let settingsScenes: [PreviewScene] = [.settings, .settingsLight, .memory, .knowledge, .computer, .modelProfile]
            if let preview = model.preview, settingsScenes.contains(preview) { showSettings = true }
        }
    }

    private var noticeShown: Binding<Bool> {
        Binding(get: { model.chatsNotice != nil }, set: { if !$0 { model.chatsNotice = nil } })
    }

    private func open(_ screen: MainScreen) {
        model.screen = screen
        onClose()
    }

    @ViewBuilder
    private var chatList: some View {
        if model.chats.isEmpty {
            VStack(spacing: 12) {
                if model.chatsLoading {
                    ProgressView().tint(Theme.muted)
                } else if let error = model.chatsError {
                    Text(error)
                        .font(.system(size: 14))
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
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 40)
            .frame(maxWidth: .infinity)
        } else {
            let pinned = model.chats.filter { $0.pinned }
            let recent = model.chats.filter { !$0.pinned }
            if !pinned.isEmpty {
                sectionTitle("Закреплённые")
                ForEach(pinned) { chat in
                    row(chat)
                }
            }
            sectionTitle("Недавние")
            ForEach(recent.prefix(Self.recentLimit)) { chat in
                row(chat)
            }
            Button {
                Haptics.tap()
                open(.recents)
            } label: {
                HStack(spacing: 5) {
                    Text("Показать все")
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .medium))
                }
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.subtle)
                .padding(.horizontal, 8)
                .frame(minHeight: 40)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityIdentifier("sidebar.all")
        }
    }

    private func navRow(_ title: String, symbol: String, active: Bool, busy: Bool,
                        action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: symbol)
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(Theme.ink.opacity(0.9))
                    .frame(width: 22)
                Text(title)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Spacer(minLength: 0)
                if busy {
                    ProgressView().controlSize(.mini).tint(Theme.muted)
                }
            }
            .padding(.leading, 7)
            .padding(.trailing, 10)
            .frame(minHeight: 42)
            .background(active ? Theme.fillActive : Color.clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12.5))
            .foregroundStyle(Theme.subtle)
            .padding(.horizontal, 8)
            .padding(.top, 14)
            .padding(.bottom, 5)
    }

    private func row(_ chat: ChatSummary) -> some View {
        let active = chat.id == model.activeChatID && model.screen == .chat
        return Button {
            model.activeChatID = chat.id
            open(.chat)
        } label: {
            ChatRowLabel(chat: chat)
                .padding(.leading, 7)
                .padding(.trailing, 10)
                .frame(minHeight: 42)
                .background(active ? Theme.fillActive : Color.clear,
                            in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .contextMenu {
            ChatMenuItems(chat: chat, onRename: { renaming = chat }, onDelete: { deleting = chat })
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            Button {
                Haptics.tap()
                showSettings = true
            } label: {
                AvatarView(image: model.user?.avatar, name: model.user?.shownName ?? "?", size: 38)
                    .overlay(Circle().strokeBorder(Theme.line))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Настройки")

            Spacer()

            Button {
                model.activeChatID = nil
                open(.chat)
            } label: {
                HStack(spacing: 7) {
                    Image(systemName: "plus")
                        .font(.system(size: 13, weight: .regular))
                    Text("Новый чат")
                        .font(.system(size: 14, weight: .medium))
                }
                .foregroundStyle(Theme.buttonPrimaryText)
                .padding(.horizontal, 16)
                .frame(height: 42)
                .background(Theme.buttonPrimary, in: Capsule())
                .shadow(color: .black.opacity(0.25), radius: 10, y: 3)
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Новый чат")
        }
        .padding(.leading, 24)
        .padding(.trailing, 25)
        .padding(.top, 6)
    }
}

struct RowPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Theme.fill : Color.clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
