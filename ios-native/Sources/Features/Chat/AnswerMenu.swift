import SwiftUI
import UIKit

/// Долгое нажатие на текст сохранённого ответа — системное меню, как у вопроса: «Скопировать», «Выделить текст»,
/// «Поделиться», «Ответить заново». У живого ответа меню нет: текст менялся бы под пальцем.
struct AnswerMenu: ViewModifier {
    @Environment(AppModel.self) private var model
    let message: FeedMessage
    let canRegenerate: Bool
    @State private var selecting = false

    /// Поле вокруг текста в поднятой карточке меню. В ленте его не видно: фон — цвет ленты, а отступ
    /// снимается снаружи, так что раскладка и промежутки `FeedMetrics` прежние.
    private static let inset = EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12)
    private static let outset = EdgeInsets(top: -10, leading: -12, bottom: -10, trailing: -12)

    func body(content: Content) -> some View {
        content
            // Меню открывается с любого места ответа, а не только с букв.
            .contentShape(Rectangle())
            .padding(Self.inset)
            // Фон не ловит касания: поле вокруг текста не перехватывает соседние кнопки.
            .background { Theme.canvas.allowsHitTesting(false) }
            .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contextMenu { items }
            .padding(Self.outset)
            .sheet(isPresented: $selecting) {
                SelectTextSheet(blocks: message.blocks)
            }
    }

    @ViewBuilder
    private var items: some View {
        Button(action: copy) {
            Label("Скопировать", systemImage: "doc.on.doc")
        }
        Button {
            selecting = true
        } label: {
            Label("Выделить текст", systemImage: "selection.pin.in.out")
        }
        Button(action: share) {
            Label("Поделиться", systemImage: "square.and.arrow.up")
        }
        if canRegenerate {
            Divider()
            Button(action: regenerate) {
                Label("Ответить заново", systemImage: "arrow.clockwise")
            }
            .disabled(model.branchBusy)
        }
    }

    private func copy() {
        UIPasteboard.general.string = message.text
        Haptics.tap()
    }

    private func share() {
        ChatShare.present(message.text)
    }

    private func regenerate() {
        Task { await model.regenerate(message) }
    }
}

/// «Выделить текст»: ответ обычным текстом, в котором работает системное выделение — ручки, лупа, «Скопировать».
struct SelectTextSheet: View {
    @Environment(\.dismiss) private var dismiss
    let blocks: [MarkdownBlock]
    @AppStorage(AnswerFont.key) private var font = AnswerFont.serif
    @AppStorage(AnswerSize.key) private var size = AnswerSize.regular

    var body: some View {
        VStack(spacing: 0) {
            SheetBar(title: "Выделить текст", symbol: "xmark", label: "Закрыть", action: { dismiss() })
            SelectableText(content: .init(blocks: blocks, style: AnswerStyle(font: font, size: size)))
                .ignoresSafeArea(.container, edges: .bottom)
        }
        .background(Theme.sheet.ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.sheet)
        .presentationCornerRadius(28)
        .accessibilityIdentifier("answer.select")
    }
}

/// Текст только для чтения с системным выделением.
private struct SelectableText: UIViewRepresentable {
    /// Что показано: ответ и его шрифт. По нему видно, что текст и правда другой.
    struct Content: Equatable {
        let blocks: [MarkdownBlock]
        let style: AnswerStyle
    }

    final class Coordinator {
        var shown: Content?
    }

    let content: Content

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UITextView {
        let view = UITextView()
        view.isEditable = false
        view.isSelectable = true
        view.backgroundColor = .clear
        view.textContainerInset = UIEdgeInsets(top: 6, left: 20, bottom: 40, right: 20)
        view.textContainer.lineFragmentPadding = 0
        view.alwaysBounceVertical = true
        view.tintColor = UIColor(Theme.accent)
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
        // Текст ставится заново, только если он другой: иначе любая перерисовка окна сбрасывала бы выделение.
        guard context.coordinator.shown != content else { return }
        context.coordinator.shown = content
        view.attributedText = AnswerPlainText.make(content.blocks, style: content.style)
    }
}

/// Ответ без разметки — для выделения: строчная разметка снята, у заголовков и кода свой шрифт, строки таблиц —
/// ячейками через табуляцию (так они вставляются в таблицы). Шрифт и размер — как у ответов в ленте.
enum AnswerPlainText {
    static func make(_ blocks: [MarkdownBlock], style: AnswerStyle) -> NSAttributedString {
        let result = NSMutableAttributedString()
        let ink = UIColor(Theme.ink)
        let muted = UIColor(Theme.muted)
        let body = font(style.textSize, design: style.design)
        for block in blocks {
            let piece: (text: String, font: UIFont, color: UIColor, lineSpacing: CGFloat)
            switch block.kind {
            case .heading(let level, let text):
                piece = (plain(text), font(style.heading(level), weight: .semibold, design: style.design), ink, 3)
            case .paragraph(let text):
                piece = (plain(text), body, ink, 5)
            case .quote(let text):
                piece = (plain(text), body, muted, 5)
            case .list(let items):
                let lines = items.map { String(repeating: "    ", count: $0.indent) + $0.marker + " " + plain($0.text) }
                piece = (lines.joined(separator: "\n"), body, ink, 5)
            case .code(_, let text):
                piece = (text, UIFont.monospacedSystemFont(ofSize: 14, weight: .regular), ink, 4)
            case .table(let header, let rows):
                let lines = ([header] + rows).map { row in row.map { cell($0) }.joined(separator: "\t") }
                piece = (lines.joined(separator: "\n"), font(15, design: .default), ink, 3)
            case .rule:
                continue
            }
            if result.length > 0 { result.append(NSAttributedString(string: "\n")) }
            let start = result.length
            let paragraph = NSMutableParagraphStyle()
            paragraph.lineSpacing = piece.lineSpacing
            result.append(NSAttributedString(string: piece.text, attributes: [
                .font: piece.font, .foregroundColor: piece.color, .paragraphStyle: paragraph,
            ]))
            // Промежуток между блоками — как в ленте (14 pt), только после последней строки блока.
            let last = (piece.text as NSString).range(of: "\n", options: .backwards)
            let lastStart = start + (last.location == NSNotFound ? 0 : last.location + 1)
            let gap = NSMutableParagraphStyle()
            gap.lineSpacing = piece.lineSpacing
            gap.paragraphSpacing = 14
            result.addAttribute(.paragraphStyle, value: gap, range: NSRange(location: lastStart, length: result.length - lastStart))
        }
        return result
    }

    /// Текст без строчной разметки (жирный, курсив, `код`, ссылки).
    private static func plain(_ text: String) -> String {
        String(InlineMarkdown.render(text).characters)
    }

    /// Ячейка таблицы в одну строку: переносы `<br>` — пробелами, иначе строка таблицы распалась бы.
    private static func cell(_ text: String) -> String {
        var value = text
        for tag in ["<br>", "<br/>", "<br />"] {
            value = value.replacingOccurrences(of: tag, with: " ", options: .caseInsensitive)
        }
        return plain(value)
    }

    private static func font(_ size: CGFloat, weight: UIFont.Weight = .regular, design: Font.Design) -> UIFont {
        let base = UIFont.systemFont(ofSize: size, weight: weight)
        let system: UIFontDescriptor.SystemDesign
        switch design {
        case .serif: system = .serif
        case .rounded: system = .rounded
        case .monospaced: system = .monospaced
        default: system = .default
        }
        guard let descriptor = base.fontDescriptor.withDesign(system) else { return base }
        return UIFont(descriptor: descriptor, size: size)
    }
}
