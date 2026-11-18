import SwiftUI

/// Источники под ответом — как «Источники ответа» на сайте (`AnswerSources.tsx`): капсула со значками
/// до трёх сайтов и числом; нажатие открывает лист со списком, строка открывает страницу в Safari.
struct SourcesButton: View {
    let sources: [FeedSource]
    @State private var open = false

    /// До трёх разных сайтов для стопки значков.
    private var sites: [FeedSource] {
        var seen = Set<String>()
        return sources.filter { source in
            let key = source.knowledge ? "knowledge" : (source.host.isEmpty ? "?" : source.host)
            return seen.insert(key).inserted
        }.prefix(3).map { $0 }
    }

    var body: some View {
        Button {
            guard !DrawerSwipe.blocksTaps else { return }
            Haptics.tap()
            open = true
        } label: {
            HStack(spacing: 7) {
                HStack(spacing: -5) {
                    ForEach(sites) { source in
                        SourceIcon(source: source, size: 18)
                            .overlay(Circle().strokeBorder(Theme.canvas, lineWidth: 1.5))
                    }
                }
                Text(SourcesButton.count(sources.count))
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.muted)
            }
            .padding(.leading, 6)
            .padding(.trailing, 12)
            .frame(height: 32)
            .background(Theme.fill, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Источники ответа: \(sources.count)")
        .accessibilityIdentifier("answer.sources")
        .sheet(isPresented: $open) {
            SourcesSheet(sources: sources)
        }
    }

    static func count(_ value: Int) -> String {
        let tens = value % 100, ones = value % 10
        if (11...14).contains(tens) { return "\(value) источников" }
        if ones == 1 { return "\(value) источник" }
        if (2...4).contains(ones) { return "\(value) источника" }
        return "\(value) источников"
    }
}

/// Значок источника: favicon сайта, без него — первая буква; у базы знаний — книга.
private struct SourceIcon: View {
    let source: FeedSource
    var size: CGFloat = 20

    var body: some View {
        Group {
            if source.knowledge {
                Image(systemName: "book.closed")
                    .font(.system(size: size * 0.5, weight: .medium))
                    .foregroundStyle(Theme.ink)
                    .frame(width: size, height: size)
                    .background(Theme.fillActive)
            } else if let favicon = source.favicon {
                AsyncImage(url: favicon) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFit().padding(size * 0.12).background(Color.white)
                    } else {
                        letter
                    }
                }
            } else {
                letter
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }

    private var letter: some View {
        Text(String(source.host.prefix(1)).uppercased().isEmpty ? "•" : String(source.host.prefix(1)).uppercased())
            .font(.system(size: size * 0.5, weight: .semibold))
            .foregroundStyle(Theme.ink)
            .frame(width: size, height: size)
            .background(Theme.fillActive)
    }
}

/// Лист «Источники»: номер, значок, заголовок, сайт; нажатие открывает страницу.
private struct SourcesSheet: View {
    let sources: [FeedSource]
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(spacing: 0) {
            SheetBar(title: "Источники", subtitle: SourcesButton.count(sources.count),
                     symbol: "xmark", label: "Закрыть", action: { dismiss() })
            ScrollView {
                SettingsCard {
                    ForEach(Array(sources.enumerated()), id: \.element.id) { index, source in
                        if index > 0 { CardDivider(inset: 72) }
                        row(source, number: index + 1)
                    }
                }
                .padding(.horizontal, RowMetrics.cardInset)
                .padding(.top, 4)
                .padding(.bottom, 24)
            }
        }
        .background(Theme.sheet.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.sheet)
        .presentationCornerRadius(28)
        .accessibilityIdentifier("sources.sheet")
    }

    private func row(_ source: FeedSource, number: Int) -> some View {
        Button {
            guard let url = source.url else { return }
            Haptics.tap()
            openURL(url)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Text("\(number)")
                    .font(.system(size: 13, weight: .medium).monospacedDigit())
                    .foregroundStyle(Theme.subtle)
                    .frame(width: 18, alignment: .trailing)
                    .padding(.top, 3)
                SourceIcon(source: source, size: 24)
                VStack(alignment: .leading, spacing: 3) {
                    Text(source.title)
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    let line = [source.host.isEmpty ? nil : source.host, source.note].compactMap { $0 }.joined(separator: " · ")
                    if !line.isEmpty {
                        Text(line)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                if source.url != nil {
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.subtle)
                        .padding(.top, 4)
                }
            }
            .padding(.leading, 12)
            .padding(.trailing, RowMetrics.trailing)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: RowMetrics.height, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .disabled(source.url == nil)
    }
}

/// «Продолжить разговор» под последним ответом — варианты от модели, как `ChatSuggestions.tsx` на телефоне
/// сайта: два варианта и «Ещё варианты»; нажатие отправляет текст обычным сообщением.
struct SuggestionsView: View {
    @Environment(AppModel.self) private var model
    let messageID: String
    let items: [String]
    @State private var expanded = false
    @State private var chosen: String?

    var body: some View {
        let shown = expanded ? items : Array(items.prefix(2))
        VStack(alignment: .leading, spacing: 8) {
            Label("Продолжить разговор", systemImage: "bubble.left")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.subtle)
                .labelStyle(.titleAndIcon)
            ForEach(shown, id: \.self) { text in
                Button {
                    choose(text)
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(text)
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.ink)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: chosen == text ? "checkmark" : "arrow.up.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.line))
                    .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(PressScaleStyle())
                .disabled(chosen != nil)
                .opacity(chosen != nil && chosen != text ? 0.4 : 1)
                .transition(.opacity.combined(with: .move(edge: .top)))
                .accessibilityIdentifier("answer.suggestion")
            }
            if items.count > 2 {
                Button {
                    guard !DrawerSwipe.blocksTaps else { return }
                    Haptics.tap()
                    withAnimation(Theme.spring) { expanded.toggle() }
                } label: {
                    HStack(spacing: 4) {
                        Text(expanded ? "Свернуть" : "Ещё варианты")
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .rotationEffect(.degrees(expanded ? 180 : 0))
                            .accessibilityHidden(true)
                    }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .frame(minHeight: 32)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(chosen != nil)
            }
        }
        .animation(Theme.spring, value: expanded)
        .onChange(of: messageID) { _, _ in
            chosen = nil
            expanded = false
        }
    }

    private func choose(_ text: String) {
        // Свайп шторки, начатый на варианте, не должен отправлять его сообщением.
        guard chosen == nil, model.activeLive == nil, !DrawerSwipe.blocksTaps else { return }
        chosen = text
        Haptics.tap()
        Task {
            if !(await model.send(text)) { chosen = nil }
        }
    }
}
