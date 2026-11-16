import SwiftUI

/// Поиск по сессиям, как у Claude: большой лист, сверху поле с крестиком, под ним «Недавние»;
/// когда что-то набрано — только подходящие по названию. Клавиатура поднимается вместе с листом.
/// Открывается из шторки (кнопка с лупой) и со страницы «Недавние» (строка поиска внизу).
struct SessionSearchSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// Что делать с выбранной сессией (закрыть шторку, открыть чат).
    let onOpen: (ChatSummary) -> Void
    @State private var query = ""
    @FocusState private var focused: Bool

    /// Сколько недавних сессий видно, пока поле пустое (как у Claude).
    private static let recentLimit = 8

    private var text: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var results: [ChatSummary] {
        guard !text.isEmpty else { return Array(model.chats.prefix(Self.recentLimit)) }
        return model.chats.filter { $0.title.localizedCaseInsensitiveContains(text) }
    }

    var body: some View {
        let list = results
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.subtle)
                    TextField("", text: $query, prompt: Text("Поиск по сессиям").foregroundStyle(Theme.subtle))
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.ink)
                        .focused($focused)
                        .submitLabel(.search)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("search.field")
                    if !query.isEmpty {
                        Button {
                            Haptics.tap()
                            query = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 16))
                                .foregroundStyle(Theme.subtle)
                                .frame(width: 32, height: 40)
                                .contentShape(Rectangle())
                        }
                        .accessibilityLabel("Очистить поиск")
                        .transition(.opacity.combined(with: .scale(scale: 0.8)))
                    }
                }
                .padding(.horizontal, 14)
                .frame(height: 44)
                .background(Theme.surface, in: Capsule())
                .overlay(Capsule().strokeBorder(Theme.line))
                CircleIconButton(symbol: "xmark", label: "Закрыть поиск") {
                    focused = false
                    dismiss()
                }
            }
            .animation(Theme.morph, value: query.isEmpty)
            .padding(.leading, 14)
            .padding(.trailing, 10)
            .padding(.top, 18)
            .padding(.bottom, 6)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    if text.isEmpty, !list.isEmpty {
                        Text("Недавние")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.subtle)
                            .padding(.horizontal, 8)
                            .padding(.top, 14)
                            .padding(.bottom, 6)
                    }
                    if list.isEmpty {
                        Text(text.isEmpty ? "Сессий пока нет" : "Ничего не найдено")
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.muted)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 48)
                    }
                    ForEach(list) { chat in
                        Button {
                            Haptics.tap()
                            focused = false
                            onOpen(chat)
                            dismiss()
                        } label: {
                            ChatRowLabel(chat: chat)
                                .padding(.horizontal, 8)
                                .frame(minHeight: 50)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(RowPressStyle())
                        .accessibilityIdentifier("search.row")
                        .transition(.opacity)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 24)
                // Список перестраивается плавно: строки не прыгают, пока набирается запрос.
                .animation(Theme.spring, value: list.map(\.id))
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Theme.sheet.ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.hidden)
        .presentationBackground(Theme.sheet)
        .presentationCornerRadius(28)
        .task {
            // Клавиатура поднимается, когда лист уже доехал: вместе с ним она дёргала бы строки.
            try? await Task.sleep(nanoseconds: 280_000_000)
            focused = true
        }
    }
}
