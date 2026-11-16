import SwiftUI

/// Что показывать на странице «Недавние»: пункты меню «⋯», как у Claude («Все», «Закрепленные»).
/// «Архивные» и «Выбрать сессии» не показываются: у нашего сайта архива и выбора нет.
enum RecentsFilter: String, CaseIterable, Identifiable {
    case all, pinned

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: return "Все"
        case .pinned: return "Закрепленные"
        }
    }

    var symbol: String {
        switch self {
        case .all: return "bubble.left.and.text.bubble.right"
        case .pinned: return "pin"
        }
    }
}

/// «Недавние» — все сессии со временем последнего изменения, как «Показать все» в приложении Claude:
/// справа в шапке «⋯» с фильтром, внизу строка поиска (открывает лист поиска), над ней — «Новая сессия».
struct RecentsScreen: View {
    @Environment(AppModel.self) private var model
    let onMenu: () -> Void
    @State private var filter: RecentsFilter = .all
    @State private var showSearch = false
    @State private var renaming: ChatSummary?
    @State private var deleting: ChatSummary?

    private var shown: [ChatSummary] {
        filter == .pinned ? model.listedChats.filter(\.pinned) : model.listedChats
    }

    var body: some View {
        // Поиск стоит как у Claude: низ капсулы на 5 pt ниже безопасной зоны, у полосы «домой».
        let resting: CGFloat = Screen.bottomInset > 0 ? -5 : 8
        ScrollView {
            // Замер снимков Claude: строка 71 pt (название 17, время 15), значок с центром в 40 pt,
            // текст с 68 pt от края экрана.
            LazyVStack(alignment: .leading, spacing: 0) {
                let chats = shown
                if chats.isEmpty {
                    Text(filter == .pinned ? "Закрепленных сессий нет" : "Сессий пока нет")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                }
                ForEach(chats) { chat in
                    Button {
                        // Свайп, открывающий шторку, начинается и на строке: после него строка не нажимается.
                        guard !DrawerSwipe.blocksTaps else { return }
                        model.activeChatID = chat.id
                        model.screen = .chat
                    } label: {
                        ChatRowLabel(chat: chat, showTime: true, unread: model.unread.contains(chat.id), gap: 15)
                            .padding(.leading, 13)
                            .padding(.trailing, 12)
                            .padding(.vertical, 12)
                            .frame(minHeight: 71)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(RowPressStyle())
                    .contextMenu {
                        ChatMenuItems(chat: chat, onRename: { renaming = chat }, onDelete: { deleting = chat })
                    }
                    .accessibilityIdentifier("recents.row")
                    .transition(.opacity)
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 12 + Theme.headerOverhang)
            .padding(.bottom, 80)
            // Переключение фильтра перестраивает список плавно, а не рывком.
            .animation(Theme.spring, value: shown.map(\.id))
        }
        .refreshable { await model.refreshChats() }
        .softEdgeBar(edge: .top, tint: Theme.page, reach: Theme.headerReach, blurDepth: Theme.drawerBlurDepth) {
            ZStack {
                Text("Недавние")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                HStack {
                    CircleIconButton(symbol: "line.3.horizontal", label: "Меню", action: onMenu)
                    Spacer()
                    filterMenu
                }
            }
            .padding(.horizontal, Theme.headerInset)
            .frame(height: Theme.headerButton)
        }
        .overlay(alignment: .bottomTrailing) {
            Button {
                guard !DrawerSwipe.blocksTaps else { return }
                model.activeChatID = nil
                model.screen = .chat
            } label: {
                HStack(spacing: 9) {
                    Image(systemName: "plus")
                        .font(.system(size: 17, weight: .regular))
                    Text("Новая сессия")
                        .font(.system(size: 17, weight: .medium))
                }
                .foregroundStyle(Theme.buttonPrimaryText)
                .padding(.horizontal, 20)
                .frame(height: 42)
                .glassChrome(Capsule(), tint: Theme.buttonPrimary)
            }
            .glassPressStyle()
            .accessibilityLabel("Новая сессия")
            .padding(.trailing, 24)
            .padding(.bottom, 13)
        }
        .softEdgeBar(edge: .bottom, tint: Theme.page) {
            // Поиск, как у Claude: стеклянная капсула 47 pt в 28 pt от краёв.
            Button {
                guard !DrawerSwipe.blocksTaps else { return }
                Haptics.tap()
                showSearch = true
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.ink.opacity(0.92))
                    Text("Поиск")
                        .font(.system(size: 17))
                        .foregroundStyle(Theme.muted)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .frame(height: 47)
                .glassChrome(Capsule())
                .contentShape(Capsule())
            }
            .glassPressStyle()
            .accessibilityLabel("Поиск сессий")
            .accessibilityIdentifier("recents.search")
            .padding(.horizontal, 28)
            .padding(.top, 6)
            .padding(.bottom, resting)
        }
        .background(Theme.page.ignoresSafeArea())
        .chatActions(renaming: $renaming, deleting: $deleting)
        .sheet(isPresented: $showSearch) {
            SessionSearchSheet { chat in
                model.activeChatID = chat.id
                model.screen = .chat
            }
        }
    }

    /// «⋯» справа: какие сессии показывать. Выбранный пункт — с галочкой, как в меню Claude.
    private var filterMenu: some View {
        Menu {
            Picker("Показать", selection: $filter) {
                ForEach(RecentsFilter.allCases) { item in
                    Label(item.title, systemImage: item.symbol).tag(item)
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: Theme.headerGlyph, weight: .medium))
                .foregroundStyle(Theme.ink.opacity(0.92))
                .frame(width: Theme.headerButton, height: Theme.headerButton)
                .glassChrome(Circle())
                .contentShape(Circle())
        }
        .accessibilityLabel("Фильтр сессий")
        .accessibilityIdentifier("recents.filter")
    }
}
