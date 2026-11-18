import SwiftUI

/// Боковое меню, как в приложении Claude: логотип и поиск, разделы, недавние чаты
/// («Показать все» — отдельный экран), внизу поверх списка — фото профиля (настройки) и «Новая сессия».
struct SidebarView: View {
    @Environment(AppModel.self) private var model
    let onClose: () -> Void
    @State private var renaming: ChatSummary?
    @State private var deleting: ChatSummary?
    @State private var showSettings = false
    @State private var showPhone = false
    @State private var showSearch = false

    /// Сколько недавних чатов видно в шторке; остальные — на экране «Недавние».
    private static let recentLimit = 12

    var body: some View {
        // Нижние кнопки стоят чуть ниже безопасной зоны, у полосы «домой», как у Claude.
        let resting: CGFloat = Screen.bottomInset > 0 ? -8 : 8
        // Замер снимков Claude 16.11.2026 (шторка 320 pt на экране 440): строки 17 pt с шагом 50 pt,
        // плашка выбранной — 48 pt от 18 pt до края минус 19, значок с центром в 36 pt, текст с 60 pt.
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 2) {
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
            .padding(.leading, 18)
            .padding(.trailing, 19)
            .padding(.top, 14 + Theme.headerOverhang)
            // Строки 50 pt: без запаса «Показать все» оставалось под фото профиля и «Новой сессией»
            // и не нажималось (UI-тест сборки 33).
            .padding(.bottom, 72)
        }
        .refreshable { await model.refreshChats() }
        // Штатное размытие прокрутки без тонированного Material поверх списка.
        .softEdgeBar(edge: .top, tint: Theme.rail, reach: Theme.headerReach, blurDepth: Theme.drawerBlurDepth) {
            HStack {
                Wordmark(size: 25)
                Spacer()
                CircleIconButton(symbol: "magnifyingglass", label: "Поиск сессий") {
                    guard !DrawerSwipe.blocksTaps else { return }
                    showSearch = true
                }
            }
            .padding(.leading, 16)
            .padding(.trailing, 16)
            .frame(height: Theme.headerButton)
        }
        .softEdgeBar(edge: .bottom, tint: Theme.rail) {
            footer
                .padding(.bottom, resting)
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
        .sheet(isPresented: $showSearch) {
            // Поиск, как у Claude: лист поверх шторки; выбранная сессия открывается, шторка закрывается.
            SessionSearchSheet { chat in
                model.activeChatID = chat.id
                open(.chat)
            }
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
        if model.listedChats.isEmpty {
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
                    Text("Сессий пока нет")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 40)
            .frame(maxWidth: .infinity)
        } else {
            let pinned = model.listedChats.filter { $0.pinned }
            let recent = model.listedChats.filter { !$0.pinned }
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
                guard !DrawerSwipe.blocksTaps else { return }
                Haptics.tap()
                open(.recents)
            } label: {
                HStack(spacing: 8) {
                    Text("Показать все")
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                }
                .font(.system(size: 17))
                .foregroundStyle(Theme.caption)
                .padding(.leading, 7)
                .frame(minHeight: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .padding(.top, 6)
            .accessibilityIdentifier("sidebar.all")
        }
    }

    private func navRow(_ title: String, symbol: String, active: Bool, busy: Bool,
                        action: @escaping () -> Void) -> some View {
        Button {
            guard !DrawerSwipe.blocksTaps else { return }
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: ChatRowLabel.drawerGap) {
                Image(systemName: symbol)
                    .font(.system(size: ChatRowLabel.iconSize, weight: .regular))
                    .foregroundStyle(Theme.ink.opacity(0.92))
                    .frame(width: ChatRowLabel.iconFrame)
                Text(title)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Spacer(minLength: 0)
                if busy {
                    // Модель отвечает в этой сессии — тот же «Атом», что у статусов ответа.
                    AtomIndicator(size: 16, orbits: true)
                }
            }
            .padding(.leading, 5)
            .padding(.trailing, 12)
            .frame(minHeight: 48)
            .background(active ? Theme.rowSelected : Color.clear,
                        in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
    }

    /// Подпись раздела, как «Недавние» у Claude: 15 pt светлым цветом, в 25 pt от края шторки.
    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 15))
            .foregroundStyle(Theme.caption)
            .padding(.horizontal, 7)
            .padding(.top, 18)
            .padding(.bottom, 9)
    }

    private func row(_ chat: ChatSummary) -> some View {
        let active = chat.id == model.activeChatID && model.screen == .chat
        return Button {
            // Палец, ведший шторку, мог лечь на эту строку: после свайпа она не открывается.
            guard !DrawerSwipe.blocksTaps else { return }
            model.activeChatID = chat.id
            open(.chat)
        } label: {
            ChatRowLabel(chat: chat, unread: model.unread.contains(chat.id))
                .padding(.leading, 5)
                .padding(.trailing, 12)
                .frame(minHeight: 48)
                .background(active ? Theme.rowSelected : Color.clear,
                            in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .accessibilityLabel(model.unread.contains(chat.id) ? "\(chat.title), Новый ответ" : chat.title)
        .contextMenu {
            ChatMenuItems(chat: chat, onRename: { renaming = chat }, onDelete: { deleting = chat })
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            Button {
                guard !DrawerSwipe.blocksTaps else { return }
                Haptics.tap()
                showSettings = true
            } label: {
                // Фото профиля 32 pt в стеклянном круге 48 pt, как у Claude.
                AvatarView(image: model.user?.avatar, name: model.user?.shownName ?? "?", size: 32)
                    .frame(width: 48, height: 48)
                    .glassChrome(Circle())
                    .contentShape(Circle())
            }
            .glassPressStyle()
            .accessibilityLabel("Настройки")

            Spacer()

            Button {
                guard !DrawerSwipe.blocksTaps else { return }
                model.activeChatID = nil
                open(.chat)
            } label: {
                HStack(spacing: 9) {
                    Image(systemName: "plus")
                        .font(.system(size: 17, weight: .regular))
                    Text("Новая сессия")
                        .font(.system(size: 17, weight: .medium))
                        .lineLimit(1)
                }
                // На узком экране (шторка 295 pt) надпись переносилась на две строки.
                .fixedSize()
                .foregroundStyle(Theme.buttonPrimaryText)
                .padding(.horizontal, 18)
                .frame(height: 46)
                .glassChrome(Capsule(), tint: Theme.buttonPrimary)
            }
            .glassPressStyle()
            .accessibilityLabel("Новая сессия")
        }
        .padding(.leading, 24)
        .padding(.trailing, 24)
        .padding(.top, 6)
    }
}

struct RowPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Theme.fill : Color.clear, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
    }
}
