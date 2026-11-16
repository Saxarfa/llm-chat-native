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
        filter == .pinned ? model.chats.filter(\.pinned) : model.chats
    }

    var body: some View {
        // Поиск стоит как строка-капсула в чате: чуть ниже безопасной зоны, у полосы «домой».
        let resting: CGFloat = Screen.bottomInset > 0 ? -4 : 8
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 3) {
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
                        ChatRowLabel(chat: chat, showTime: true)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .frame(minHeight: 60)
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
            .padding(.top, 8 + Theme.headerOverhang)
            .padding(.bottom, 80)
            // Переключение фильтра перестраивает список плавно, а не рывком.
            .animation(Theme.spring, value: shown.map(\.id))
        }
        .refreshable { await model.refreshChats() }
        .softEdgeBar(edge: .top, tint: Theme.canvas, reach: Theme.headerReach, blurDepth: Theme.drawerBlurDepth) {
            ZStack {
                Text("Недавние")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                HStack {
                    CircleIconButton(symbol: "line.3.horizontal", label: "Меню", action: onMenu)
                    Spacer()
                    filterMenu
                }
            }
            .padding(.horizontal, 16)
            .frame(height: 44)
            .padding(.top, -6)
            .padding(.bottom, 4)
        }
        .overlay(alignment: .bottomTrailing) {
            Button {
                guard !DrawerSwipe.blocksTaps else { return }
                model.activeChatID = nil
                model.screen = .chat
            } label: {
                Label("Новая сессия", systemImage: "plus")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.buttonPrimaryText)
                    .padding(.horizontal, 16)
                    .frame(height: 42)
                    .glassChrome(Capsule(), tint: Theme.buttonPrimary)
            }
            .glassPressStyle()
            .padding(.trailing, 16)
            .padding(.bottom, 10)
        }
        .softEdgeBar(edge: .bottom, tint: Theme.canvas) {
            Button {
                guard !DrawerSwipe.blocksTaps else { return }
                Haptics.tap()
                showSearch = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.ink.opacity(0.9))
                    Text("Поиск")
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.subtle)
                    Spacer()
                }
                .padding(.horizontal, 15)
                .frame(height: 44)
                .background(Theme.surface, in: Capsule())
                .overlay(Capsule().strokeBorder(Theme.line))
                .contentShape(Capsule())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Поиск сессий")
            .accessibilityIdentifier("recents.search")
            .padding(.horizontal, 15)
            .padding(.top, 6)
            .padding(.bottom, resting)
        }
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
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Theme.ink.opacity(0.9))
                .frame(width: 40, height: 40)
                .glassChrome(Circle())
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Фильтр сессий")
        .accessibilityIdentifier("recents.filter")
    }
}
