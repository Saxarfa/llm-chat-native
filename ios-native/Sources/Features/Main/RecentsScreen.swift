import SwiftUI

/// «Недавние» — все чаты со временем последнего изменения, как «Показать все» в приложении Claude:
/// поиск по названию внизу, над ним — «Новый чат».
struct RecentsScreen: View {
    @Environment(AppModel.self) private var model
    let onMenu: () -> Void
    @State private var query = ""
    @State private var renaming: ChatSummary?
    @State private var deleting: ChatSummary?
    @FocusState private var searching: Bool

    private var found: [ChatSummary] {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return model.chats }
        return model.chats.filter { $0.title.localizedCaseInsensitiveContains(text) }
    }

    var body: some View {
        // Поиск стоит как строка-капсула в чате: чуть ниже безопасной зоны, у полосы «домой».
        let resting: CGFloat = Screen.bottomInset > 0 ? -4 : 8
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 3) {
                let chats = found
                if chats.isEmpty {
                    Text(query.isEmpty ? "Диалогов пока нет" : "Ничего не найдено")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                }
                ForEach(chats) { chat in
                    Button {
                        Keyboard.hide()
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
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)
            .padding(.bottom, 80)
        }
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await model.refreshChats() }
        .safeAreaInset(edge: .top, spacing: 0) {
            ZStack {
                Text("Недавние")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                HStack {
                    CircleIconButton(symbol: "line.3.horizontal", label: "Меню", action: onMenu)
                    Spacer()
                }
            }
            .padding(.horizontal, 16)
            .frame(height: 44)
            .padding(.top, -6)
            .padding(.bottom, 4)
            .background(alignment: .top) {
                Theme.edgeBlur(Theme.canvas, from: .top)
                    .padding(.bottom, -24)
                    .ignoresSafeArea(edges: .top)
                    .allowsHitTesting(false)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            Button {
                Keyboard.hide()
                model.activeChatID = nil
                model.screen = .chat
            } label: {
                Label("Новый чат", systemImage: "plus")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.buttonPrimaryText)
                    .padding(.horizontal, 16)
                    .frame(height: 42)
                    .background(Theme.buttonPrimary, in: Capsule())
                    .shadow(color: .black.opacity(0.25), radius: 12, y: 4)
            }
            .buttonStyle(PressScaleStyle())
            .padding(.trailing, 16)
            .padding(.bottom, 10)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.subtle)
                TextField("", text: $query, prompt: Text("Поиск").foregroundStyle(Theme.subtle))
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                    .focused($searching)
                    .submitLabel(.search)
                    .accessibilityIdentifier("recents.search")
                if !query.isEmpty {
                    Button {
                        query = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 16))
                            .foregroundStyle(Theme.subtle)
                            .frame(width: 36, height: 36)
                    }
                    .accessibilityLabel("Очистить поиск")
                }
            }
            .padding(.horizontal, 15)
            .frame(height: 44)
            .background(Theme.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.line))
            .padding(.horizontal, 15)
            .padding(.top, 6)
            .padding(.bottom, searching ? 8 : resting)
            .background(alignment: .bottom) {
                Theme.edgeBlur(Theme.canvas, from: .bottom, solid: 0.7)
                    .padding(.top, -26)
                    .ignoresSafeArea(edges: .bottom)
                    .allowsHitTesting(false)
            }
        }
        .chatActions(renaming: $renaming, deleting: $deleting)
        .onAppear {
            if model.focusRecentsSearch {
                model.focusRecentsSearch = false
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { searching = true }
            }
        }
    }
}
