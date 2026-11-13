import SwiftUI
import UIKit

/// Строчная разметка (жирный, курсив, `код`, ссылки, зачёркивание) средствами системы.
enum InlineMarkdown {
    static func render(_ text: String, size: CGFloat = 17) -> AttributedString {
        var options = AttributedString.MarkdownParsingOptions()
        options.interpretedSyntax = .inlineOnlyPreservingWhitespace
        options.failurePolicy = .returnPartiallyParsedIfPossible
        guard var result = try? AttributedString(markdown: text, options: options) else {
            return AttributedString(text)
        }

        var codeRanges: [Range<AttributedString.Index>] = []
        var linkRanges: [Range<AttributedString.Index>] = []
        for run in result.runs {
            if let intent = run.inlinePresentationIntent, intent.contains(.code) {
                codeRanges.append(run.range)
            }
            if run.link != nil {
                linkRanges.append(run.range)
            }
        }
        for range in codeRanges {
            result[range].swiftUI.font = .system(size: size * 0.88, design: .monospaced)
            result[range].swiftUI.backgroundColor = Theme.fillActive
        }
        for range in linkRanges {
            result[range].swiftUI.foregroundColor = Theme.ink
            result[range].swiftUI.underlineStyle = Text.LineStyle(pattern: .solid, color: Theme.subtle)
        }
        return result
    }
}

/// Горизонтальные ленты, на которых свайп вправо листает ленту, а не открывает боковое меню.
enum HorizontalScrollGuard {
    /// Экранные рамки горизонтальных лент (чипы и лента артов в студии):
    /// жест, начатый внутри, листает ленту, а не открывает меню.
    static var zones: [UUID: CGRect] = [:]

    static func covers(_ point: CGPoint) -> Bool {
        zones.values.contains { $0.contains(point) }
    }

    /// Палец лёг на горизонтальную прокрутку, которой есть куда листать (блок кода, таблица,
    /// вложения). Проверяется по самим видам под пальцем, без жестов на блоках: прежний
    /// «сторож» (DragGesture с нулевым порогом на блоке кода) перехватывал касание, и ленту
    /// нельзя было листать вверх-вниз, если палец начинал на коде (замечание 13.11.2026).
    @MainActor
    static func scrollsSideways(at point: CGPoint) -> Bool {
        for scene in UIApplication.shared.connectedScenes {
            guard let window = (scene as? UIWindowScene)?.keyWindow,
                  var view = window.hitTest(point, with: nil) else { continue }
            while true {
                if let scroll = view as? UIScrollView, scroll.contentSize.width > scroll.bounds.width + 1 {
                    return true
                }
                guard let parent = view.superview else { return false }
                view = parent
            }
        }
        return false
    }
}

/// Отмечает горизонтальную ленту как зону, где свайп вправо не открывает боковое меню.
struct DrawerFreeZone: ViewModifier {
    @State private var id = UUID()

    func body(content: Content) -> some View {
        content
            .background(
                GeometryReader { geo in
                    let frame = geo.frame(in: .global)
                    Color.clear
                        .onAppear { HorizontalScrollGuard.zones[id] = frame }
                        .onChange(of: frame) { _, value in HorizontalScrollGuard.zones[id] = value }
                }
            )
            .onDisappear { HorizontalScrollGuard.zones[id] = nil }
    }
}

/// Ответ модели: блоки Markdown один под другим.
struct MarkdownView: View {
    let blocks: [MarkdownBlock]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(blocks) { block in
                MarkdownBlockView(block: block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct MarkdownBlockView: View {
    let block: MarkdownBlock
    /// Шрифт ответов из настроек (по умолчанию — с засечками, как у Claude).
    @AppStorage(AnswerFont.key) private var font = AnswerFont.serif
    @AppStorage(AnswerSize.key) private var size = AnswerSize.regular

    private var scale: CGFloat { font.sizeFactor * size.factor }

    var body: some View {
        switch block.kind {
        case .heading(let level, let text):
            Text(InlineMarkdown.render(text, size: headingSize(level) * scale))
                .font(.system(size: headingSize(level) * scale, weight: .semibold, design: font.design))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, level <= 2 ? 6 : 2)
                .accessibilityAddTraits(.isHeader)
        case .paragraph(let text):
            BodyText(text: text)
        case .code(let language, let text):
            CodeBlockView(language: language, code: text)
        case .list(let items):
            VStack(alignment: .leading, spacing: 8) {
                ForEach(items) { item in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(item.marker)
                            .font(.system(size: 16.5 * scale, design: font.design).monospacedDigit())
                            .foregroundStyle(Theme.muted)
                            .frame(minWidth: 16, alignment: .trailing)
                        BodyText(text: item.text)
                    }
                    .padding(.leading, CGFloat(item.indent) * 20)
                }
            }
        case .quote(let text):
            BodyText(text: text, color: Theme.muted)
                .padding(.leading, 14)
                .overlay(alignment: .leading) {
                    Capsule().fill(Theme.fillActive).frame(width: 3)
                }
        case .table(let header, let rows):
            TableBlockView(header: header, rows: rows)
        case .rule:
            Rectangle().fill(Theme.line).frame(height: 1).padding(.vertical, 4)
        }
    }

    private func headingSize(_ level: Int) -> CGFloat {
        switch level {
        case 1: return 24
        case 2: return 21
        case 3: return 19
        default: return 17
        }
    }
}

private struct BodyText: View {
    let text: String
    var color: Color = Theme.ink
    @AppStorage(AnswerFont.key) private var font = AnswerFont.serif
    @AppStorage(AnswerSize.key) private var size = AnswerSize.regular

    var body: some View {
        // Текст ответа — шрифтом из настроек; по умолчанию с засечками, как в приложении Claude.
        let points = 16.5 * font.sizeFactor * size.factor
        Text(InlineMarkdown.render(text, size: points))
            .font(.system(size: points, design: font.design))
            .foregroundStyle(color)
            .lineSpacing(5)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Кнопка «Скопировать»: на полторы секунды сменяется галочкой.
struct CopyButton: View {
    let text: String
    var label = "Скопировать"
    /// В ряду под ответом — мелкий значок, как остальные там.
    var compact = false
    @State private var copied = false

    var body: some View {
        Button {
            UIPasteboard.general.string = text
            Haptics.tap()
            copied = true
            Task {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                copied = false
            }
        } label: {
            Image(systemName: copied ? "checkmark" : (compact ? "square.on.square" : "doc.on.doc"))
                .font(.system(size: compact ? 13.5 : 14, weight: compact ? .regular : .medium))
                .foregroundStyle(copied ? Theme.ink : Theme.muted.opacity(compact ? 0.85 : 1))
                .frame(width: compact ? 32 : 44, height: compact ? 44 : 40)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(copied ? "Скопировано" : label)
    }
}

private struct CodeBlockView: View {
    let language: String
    let code: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 0) {
                Text(language.isEmpty ? "код" : language.lowercased())
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundStyle(Theme.subtle)
                    .lineLimit(1)
                Spacer(minLength: 8)
                CopyButton(text: code, label: "Скопировать код")
            }
            .padding(.leading, 14)
            .padding(.trailing, 2)

            ScrollView(.horizontal, showsIndicators: false) {
                Text(code)
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundStyle(Theme.ink)
                    .lineSpacing(4)
                    .fixedSize(horizontal: true, vertical: true)
                    .padding(.horizontal, 14)
                    .padding(.bottom, 14)
            }
            // Короткий код не «гуляет» вбок: прокрутка — только когда строки шире блока.
            .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        }
        .background(Theme.rail, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.line))
    }
}

private struct TableBlockView: View {
    let header: [String]
    let rows: [[String]]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Grid(alignment: .topLeading, horizontalSpacing: 0, verticalSpacing: 0) {
                GridRow {
                    ForEach(Array(header.enumerated()), id: \.offset) { _, cell in
                        TableCell(text: cell, isHeader: true)
                    }
                }
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    Rectangle().fill(Theme.line).frame(height: 1).gridCellUnsizedAxes(.horizontal)
                    GridRow {
                        ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
                            TableCell(text: cell, isHeader: false)
                        }
                    }
                }
            }
            .background(Theme.surface.opacity(0.55), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.line))
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
    }
}

private struct TableCell: View {
    let text: String
    let isHeader: Bool

    var body: some View {
        Text(InlineMarkdown.render(text, size: 15))
            .font(.system(size: 15, weight: isHeader ? .semibold : .regular))
            .foregroundStyle(isHeader ? Theme.ink : Theme.ink.opacity(0.92))
            .lineSpacing(3)
            .frame(maxWidth: 220, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
    }
}
