import SwiftUI

/// «Стоимость» сессии — как окно «Стоимость» в меню чата на сайте (`ChatCostPanel.tsx`), без графика: итог,
/// модели и из каких частей цены он сложился. Цены задаются на сайте («Подключение → Цены моделей»).
struct ChatCostSheet: View {
    @Environment(AppModel.self) private var model
    let chatID: String
    @State private var cost: ChatCost?
    @State private var failure: String?

    var body: some View {
        VStack(spacing: 0) {
            SheetHeader(title: "Стоимость", subtitle: model.chats.first { $0.id == chatID }?.title,
                        busy: cost == nil && failure == nil)
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if let cost {
                        content(cost)
                    } else if let failure {
                        SettingsNote(text: failure, symbol: "exclamationmark.circle")
                            .padding(.top, 8)
                    }
                }
                .padding(.horizontal, RowMetrics.cardInset)
                .padding(.top, 6)
                .padding(.bottom, 24)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.sheet.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.sheet)
        .presentationCornerRadius(28)
        .accessibilityIdentifier("chat.cost")
        .task { await load() }
    }

    @ViewBuilder
    private func content(_ cost: ChatCost) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(ChatCost.money(cost.total))
                .font(.system(size: 34, weight: .semibold).monospacedDigit())
                .foregroundStyle(Theme.ink)
                .accessibilityIdentifier("chat.cost.total")
            Text(ChatCost.tokensWord(ChatCost.tokenTotal(cost.tokens)))
                .font(.system(size: 15))
                .foregroundStyle(Theme.muted)
        }
        .padding(.horizontal, RowMetrics.plainLeading)
        .padding(.vertical, 8)

        if cost.models.isEmpty {
            SettingsNote(text: "Платных запросов нет", symbol: "dollarsign.circle")
                .padding(.horizontal, RowMetrics.plainLeading - 4)
        } else {
            SectionCaption(text: "Модели")
            SettingsCard {
                ForEach(Array(cost.models.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { CardDivider() }
                    row(title: ChatCost.modelTitle(item.model, profiles: model.settings.modelProfiles),
                        detail: modelDetail(item), value: ChatCost.money(item.total))
                }
            }
            if !cost.lines.isEmpty {
                SectionCaption(text: "По видам")
                SettingsCard {
                    ForEach(Array(cost.lines.enumerated()), id: \.element.id) { index, line in
                        if index > 0 { CardDivider() }
                        row(title: line.part.title, detail: lineDetail(line), value: ChatCost.money(line.cost))
                    }
                }
            }
        }
    }

    private func modelDetail(_ item: ChatCost.ModelCost) -> String {
        var parts = ["\(item.requests) " + ChatCost.plural(item.requests, one: "запрос", few: "запроса", many: "запросов"),
                     ChatCost.tokensWord(ChatCost.tokenTotal(item.tokens))]
        if item.unpriced > 0 { parts.append("без цены: \(item.unpriced)") }
        return parts.joined(separator: " · ")
    }

    private func lineDetail(_ line: ChatCost.Line) -> String {
        guard line.part == .webSearch else { return ChatCost.tokensWord(line.amount) }
        let count = Int(line.amount.rounded())
        return "\(count) " + ChatCost.plural(count, one: "поиск", few: "поиска", many: "поисков")
    }

    private func row(title: String, detail: String, value: String) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: RowMetrics.text))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Text(detail)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.subtle)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(value)
                .font(.system(size: RowMetrics.text).monospacedDigit())
                .foregroundStyle(Theme.ink)
        }
        .padding(.horizontal, RowMetrics.plainLeading)
        .frame(minHeight: 62)
    }

    private func load() async {
        if model.preview != nil {
            cost = ChatCost(json: Self.sample)
            return
        }
        guard let api = model.api else {
            failure = "Нет связи с компьютером."
            return
        }
        do {
            cost = ChatCost(json: try await api.json("/api/chats/\(APIClient.pathSafe(chatID))/cost"))
        } catch is CancellationError {
            return
        } catch {
            failure = (error as? APIError)?.message ?? "Не удалось загрузить стоимость."
        }
    }

    /// Пример для снимков (режим без сервера): Opus 5.5 по $4/$20 за 1 млн, Haiku 5.5 по $0,10/$0,50.
    static let sample: [String: Any] = [
        "currency": "USD", "total": 0.1678295,
        "tokens": ["input": 8_420, "output": 3_115, "cacheRead": 61_200, "cacheWrite5m": 9_400, "cacheWrite1h": 0,
                   "reasoning": 1_210, "webSearch": 2],
        "models": [
            ["model": "claude/claude-opus-5-5", "total": 0.16764, "unpriced": 0,
             "tokens": ["input": 7_900, "output": 2_840, "cacheRead": 61_200, "cacheWrite5m": 9_400, "webSearch": 2],
             "entries": [
                ["kind": "answer", "cost": ["input": 0.0316, "output": 0.0568, "cacheRead": 0.01224, "cacheWrite5m": 0.047,
                                            "webSearch": 0.02, "total": 0.16764]],
             ] as [[String: Any]]],
            ["model": "claude/claude-haiku-5-5", "total": 0.0001895, "unpriced": 0,
             "tokens": ["input": 520, "output": 275],
             "entries": [
                ["kind": "suggestions", "cost": ["input": 0.000052, "output": 0.0001375, "total": 0.0001895]],
             ] as [[String: Any]]],
        ] as [[String: Any]],
    ]
}
