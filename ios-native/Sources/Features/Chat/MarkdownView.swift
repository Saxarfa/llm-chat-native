import SwiftUI
import UIKit

/// Строчная разметка (жирный, курсив, `код`, ссылки, зачёркивание) средствами системы.
/// Готовый результат кэшируется по тексту и размеру: абзац разбирается один раз, а не при каждой перерисовке,
/// и последние ответы чата разбираются заранее в фоне (`warm`) — раньше `AttributedString(markdown:)` шёл в
/// `body` каждого абзаца и при входе в длинный чат держал главный поток (аудит 20.11.2026).
enum InlineMarkdown {
    private final class Rendered {
        let value: AttributedString
        init(_ value: AttributedString) { self.value = value }
    }

    /// `NSCache` потокобезопасен: кэш заполняется и с главного потока, и из фоновой задачи `warm`.
    private static let cache: NSCache<NSString, Rendered> = {
        let cache = NSCache<NSString, Rendered>()
        cache.countLimit = 4000
        return cache
    }()

    static func render(_ text: String, size: CGFloat = 17) -> AttributedString {
        let key = "\(size)|\(text)" as NSString
        if let ready = cache.object(forKey: key) { return ready.value }
        let result = make(text, size: size)
        cache.setObject(Rendered(result), forKey: key)
        return result
    }

    /// Строчная разметка последних ответов — заранее, в фоне (вызывается из разбора ленты, `apply`).
    /// Размеры те же, что у видов ленты (`AnswerStyle`, ячейки таблиц — 15 pt).
    static func warm(_ messages: ArraySlice<FeedMessage>) {
        let style = AnswerStyle.current
        for message in messages where !message.isUser {
            for block in message.blocks {
                switch block.kind {
                case .heading(let level, let text):
                    _ = render(text, size: style.heading(level))
                case .paragraph(let text), .quote(let text):
                    _ = render(text, size: style.textSize)
                case .list(let items):
                    for item in items { _ = render(item.text, size: style.textSize) }
                case .table(let header, let rows):
                    for cell in header + rows.flatMap({ $0 }) { _ = render(TableCell.clean(cell), size: 15) }
                case .code, .rule:
                    break
                }
            }
        }
    }

    private static func make(_ text: String, size: CGFloat) -> AttributedString {
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
    /// Полоса слева, где свайп вправо всё же открывает меню (у сцены студии, которая листается свайпом).
    var leadingGap: CGFloat

    init(leadingGap: CGFloat = 0) {
        self.leadingGap = leadingGap
    }

    func body(content: Content) -> some View {
        content
            .background(
                GeometryReader { geo in
                    let frame = zone(geo.frame(in: .global))
                    Color.clear
                        .onAppear { HorizontalScrollGuard.zones[id] = frame }
                        .onChange(of: frame) { _, value in HorizontalScrollGuard.zones[id] = value }
                }
            )
            .onDisappear { HorizontalScrollGuard.zones[id] = nil }
    }

    private func zone(_ frame: CGRect) -> CGRect {
        guard leadingGap > 0 else { return frame }
        let gap = max(0, leadingGap - frame.minX)
        return CGRect(x: frame.minX + gap, y: frame.minY, width: max(0, frame.width - gap), height: frame.height)
    }
}

/// Ответ модели: блоки Markdown один под другим.
struct MarkdownView: View {
    let blocks: [MarkdownBlock]
    /// Ответ ещё пишется: новые слова последнего абзаца проступают из прозрачности (`StreamTail`).
    var streaming = false
    /// Шрифт ответов из настроек (по умолчанию — с засечками, как у Claude). Читается здесь, один раз на ответ;
    /// блоки получают готовый `AnswerStyle`.
    @AppStorage(AnswerFont.key) private var font = AnswerFont.serif
    @AppStorage(AnswerSize.key) private var size = AnswerSize.regular

    var body: some View {
        let style = AnswerStyle(font: font, size: size)
        let last = blocks.last?.id
        VStack(alignment: .leading, spacing: 14) {
            ForEach(blocks) { block in
                MarkdownBlockView(block: block, style: style, tail: streaming && block.id == last)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct MarkdownBlockView: View {
    let block: MarkdownBlock
    let style: AnswerStyle
    /// Последний блок выводимого ответа: у его текста мягкий край.
    var tail = false

    var body: some View {
        switch block.kind {
        case .heading(let level, let text):
            Text(InlineMarkdown.render(text, size: style.heading(level)))
                .font(.system(size: style.heading(level), weight: .semibold, design: style.design))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, level <= 2 ? 6 : 2)
                .accessibilityAddTraits(.isHeader)
        case .paragraph(let text):
            BodyText(text: text, style: style, tail: tail)
        case .code(let language, let text):
            CodeBlockView(language: language, code: text)
        case .list(let items):
            VStack(alignment: .leading, spacing: 8) {
                ForEach(items) { item in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(item.marker)
                            .font(.system(size: style.textSize, design: style.design).monospacedDigit())
                            .foregroundStyle(Theme.muted)
                            .frame(minWidth: 16, alignment: .trailing)
                        BodyText(text: item.text, style: style, tail: tail && item.id == items.last?.id)
                    }
                    .padding(.leading, CGFloat(item.indent) * 20)
                }
            }
        case .quote(let text):
            BodyText(text: text, style: style, color: Theme.muted, tail: tail)
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
}

private struct BodyText: View {
    let text: String
    let style: AnswerStyle
    var color: Color = Theme.ink
    /// Мягкий край выводимого ответа (`StreamTail`).
    var tail = false

    var body: some View {
        // Текст ответа — шрифтом из настроек; по умолчанию с засечками, как в приложении Claude.
        let points = style.textSize
        let rendered = InlineMarkdown.render(text, size: points)
        Text(rendered)
            .font(.system(size: points, design: style.design))
            .foregroundStyle(color)
            .lineSpacing(5)
            // Длина считается только у выводимого абзаца.
            .modifier(StreamTail(active: tail, length: tail ? rendered.characters.count : 0))
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Проявление выводимого ответа: каждое новое слово проступает из прозрачности за `RevealMark.fade` со своего
/// появления (выбор пользователя 23.11.2026). Раньше прозрачность зависела от расстояния до конца, и уже
/// показанные слова светлели скачками вместе с приходом новых. После конца ответа или паузы ~0,4 с
/// недопроявленное за 0,35 с становится обычным текстом. iOS 18+ (`TextRenderer`); на iOS 17 — без проявления.
private struct StreamTail: ViewModifier {
    let active: Bool
    /// Длина текста в знаках: по её росту видно, какие слова новые.
    let length: Int
    @State private var marks = RevealMarks()
    /// Шторка открыта — кадры не идут.
    @Environment(\.motionPaused) private var motionPaused

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            let _ = note()
            let items = marks.items, settled = marks.settled, shown = marks.length, strength: Double = active ? 1 : 0
            // 30 кадров в секунду хватает проявлению за 0,3 с; текст при этом не раскладывается заново.
            TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !active || motionPaused)) { context in
                content.textRenderer(TailRenderer(strength: strength, marks: items, settled: settled, length: shown,
                                                  now: context.date.timeIntervalSinceReferenceDate))
            }
            // Проявление включается сразу (вместе с первыми новыми словами), а гаснет плавно.
            .animation(active ? nil : .easeOut(duration: 0.35), value: active)
        } else {
            content
        }
    }

    /// Отметка о новых словах — в момент, когда они впервые попадают в разметку.
    private func note() {
        if active { marks.note(length, at: Date().timeIntervalSinceReferenceDate) }
    }
}

/// Сколько знаков было показано к моменту `time` (секунды от отсчёта `Date`).
private struct RevealMark: Sendable {
    let end: Int
    let time: Double

    /// За сколько секунд слово проступает целиком.
    static let fade = 0.3
}

/// Когда появлялись знаки выводимого абзаца. Класс, а не состояние: отметки не перерисовывают абзац.
@MainActor
private final class RevealMarks {
    private(set) var items: [RevealMark] = []
    /// Знаки до этого места уже проявились полностью.
    private(set) var settled = 0
    /// Длина абзаца на последней отметке.
    private(set) var length = 0

    func note(_ value: Int, at time: Double) {
        if value < length {
            // Текст заменён (разметка разобрана иначе) — он уже на экране, отсчёт заново.
            items.removeAll()
            settled = value
            length = value
            return
        }
        guard value > length else { return }
        items.append(RevealMark(end: value, time: time))
        length = value
        // Проявившиеся отметки больше не нужны: всё до их конца — обычный текст.
        while items.count > 1, let first = items.first, time - first.time > RevealMark.fade {
            settled = first.end
            items.removeFirst()
        }
    }
}

@available(iOS 18.0, *)
private struct TailRenderer: TextRenderer {
    /// 1 — проявление идёт, 0 — обычный текст (анимируется при конце ответа).
    var strength: Double
    let marks: [RevealMark]
    let settled: Int
    /// Длина текста в знаках на последней отметке.
    let length: Int
    let now: Double

    var animatableData: Double {
        get { strength }
        set { strength = newValue }
    }

    func draw(layout: Text.Layout, in context: inout GraphicsContext) {
        guard strength > 0.01, !marks.isEmpty else {
            for line in layout { context.draw(line) }
            return
        }
        let counts = layout.map { line in line.reduce(0) { $0 + $1.count } }
        // Знаки текста и глифы раскладки сверяются от конца: расхождения (переводы строк) бывают раньше края.
        let shift = length - counts.reduce(0, +)
        var index = 0
        for (number, line) in layout.enumerated() {
            if index + counts[number] + shift <= settled {
                // Строка целиком проявилась — рисуется как обычно.
                context.draw(line)
                index += counts[number]
                continue
            }
            for run in line {
                for glyph in run {
                    let shown = visibility(index + shift)
                    if shown > 0.999 {
                        context.draw(glyph)
                    } else {
                        var copy = context
                        copy.opacity = shown
                        copy.draw(glyph)
                    }
                    index += 1
                }
            }
        }
    }

    /// Непрозрачность знака `position`: от его появления — плавный подъём к 1 за `RevealMark.fade`.
    private func visibility(_ position: Int) -> Double {
        guard position >= settled, let last = marks.last else { return 1 }
        let time = marks.first { $0.end > position }?.time ?? last.time
        let progress = min(max((now - time) / RevealMark.fade, 0), 1)
        let eased = 1 - (1 - progress) * (1 - progress)
        return 1 - strength * (1 - eased)
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
            guard !DrawerSwipe.blocksTaps else { return }
            UIPasteboard.general.string = text
            Haptics.tap()
            copied = true
            Task {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                copied = false
            }
        } label: {
            Group {
                if compact {
                    // В ряду под ответом — тот же рисованный значок, что и соседние (`AnswerGlyph`): одна сетка,
                    // один штрих и цвет; системный символ был мельче и бледнее и сидел выше соседей.
                    AnswerGlyphView(glyph: copied ? .check : .copy, color: copied ? Theme.ink : Theme.muted)
                } else {
                    Image(systemName: copied ? "checkmark" : "doc.on.doc")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(copied ? Theme.ink : Theme.muted)
                }
            }
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

/// Последняя измеренная ширина ответа — общая для всех таблиц ленты (читается и пишется из вида, на главном потоке).
enum TableWidth {
    static var last: CGFloat = 0
}

/// Ширина текста ячейки таблицы: вся строка и самое длинное слово. Ячейка меряется один раз: пока таблица
/// печатается, заново меряются только новые ячейки (раньше вся таблица — на каждом шаге вывода, ~30 раз
/// в секунду; аудит 20.11.2026). Только с главного потока — из `body` таблицы.
@MainActor
private enum TableMeasure {
    private static var cells: [String: (line: CGFloat, word: CGFloat)] = [:]

    static func cell(_ text: String, header: Bool) -> (line: CGFloat, word: CGFloat) {
        let key = (header ? "h|" : "c|") + text
        if let ready = cells[key] { return ready }
        if cells.count > 3000 { cells.removeAll(keepingCapacity: true) }
        let font = UIFont.systemFont(ofSize: 15, weight: header ? .semibold : .regular)
        // Тот же размер, что у самой ячейки (`TableCell`): разметка берётся из общего кэша.
        let plain = String(InlineMarkdown.render(TableCell.clean(text), size: 15).characters)
        var widest: CGFloat = 0
        var longestWord: CGFloat = 0
        for line in plain.split(separator: "\n", omittingEmptySubsequences: false) {
            widest = max(widest, (String(line) as NSString).size(withAttributes: [.font: font]).width)
            for word in line.split(separator: " ") {
                longestWord = max(longestWord, (String(word) as NSString).size(withAttributes: [.font: font]).width)
            }
        }
        let size = (line: widest, word: longestWord)
        cells[key] = size
        return size
    }
}

/// Таблица ответа. Ширины столбцов считаются заранее по тексту ячеек, а не отдаются Grid:
/// Grid внутри горизонтальной прокрутки мерял высоту строки по одной строчке текста, и перенесённый
/// текст налезал на соседние строки (снимок 16.11.2026, Qwen3.5 9B). Узкая таблица лежит в ширину
/// ответа, широкая листается вбок.
private struct TableBlockView: View {
    let header: [String]
    let rows: [[String]]

    private static let padding: CGFloat = 12
    private static let minColumn: CGFloat = 76
    private static let maxColumn: CGFloat = 240

    /// Ширины столбцов по тексту: естественная (вся строка ячейки, до `maxColumn`) и наименьшая —
    /// по самому длинному слову, чтобы при сжатии слова не рвались посередине («поддержива / ется»,
    /// снимок 0.15.0 (28)).
    private var measured: (natural: [CGFloat], least: [CGFloat]) {
        var natural: [CGFloat] = []
        var least: [CGFloat] = []
        for column in header.indices {
            var widest: CGFloat = 0
            var longestWord: CGFloat = 0
            let all = [header[column]] + rows.map { $0.indices.contains(column) ? $0[column] : "" }
            for (index, cell) in all.enumerated() {
                let size = TableMeasure.cell(cell, header: index == 0)
                widest = max(widest, size.line)
                longestWord = max(longestWord, size.word)
            }
            let wanted = ceil(widest * 1.04) + Self.padding * 2 + 2
            let full = min(max(wanted, Self.minColumn), Self.maxColumn)
            natural.append(full)
            least.append(min(full, max(Self.minColumn, ceil(longestWord * 1.04) + Self.padding * 2 + 2)))
        }
        return (natural, least)
    }

    /// Ширина ответа, измеренная по месту. Начальное значение — последняя измеренная (у всех ответов она
    /// одна): таблица, заново появившаяся при прокрутке, сразу рисуется в своём размере, без рывка высоты
    /// (из-за рывка лента «не доезжала до низа» и кнопка «вниз» не пропадала, run 43787353104).
    @State private var available: CGFloat = TableWidth.last

    var body: some View {
        let (natural, least) = measured
        // Шире ответа — широкие столбцы сужаются под его ширину (текст переносится по словам); прокрутка вбок —
        // только если не влезает даже при наименьших столбцах. `ViewThatFits` в ленте выбирал прокрутку
        // и для таблиц, которые помещались (0.15.0, run 43785551079), поэтому ширина меряется явно.
        let fitted = Self.fit(natural, least: least, into: available)
        let fits = available > 0 && fitted.reduce(0, +) <= available + 0.5
        Group {
            if fits {
                grid(fitted)
            } else {
                // Не влезает — столбцы самые узкие без разрыва слов: за краем прячется как можно меньше.
                ScrollView(.horizontal, showsIndicators: false) { grid(fitted) }
                    .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            GeometryReader { geo in
                Color.clear
                    .onAppear { remember(geo.size.width) }
                    .onChange(of: geo.size.width) { _, width in remember(width) }
            }
        }
    }

    private func remember(_ width: CGFloat) {
        guard width > 0 else { return }
        TableWidth.last = width
        if abs(width - available) > 0.5 { available = width }
    }

    /// Ширины под доступное место: лишнее сверх наименьшей ширины снимается со столбцов пропорционально.
    /// Не помещается и при наименьших — возвращаются наименьшие (вызывающий уходит в прокрутку).
    static func fit(_ columns: [CGFloat], least: [CGFloat], into width: CGFloat) -> [CGFloat] {
        let total = columns.reduce(0, +)
        guard width > 0, total > width else { return columns }
        let floor = least.reduce(0, +)
        let extra = zip(columns, least).reduce(0) { $0 + max(0, $1.0 - $1.1) }
        guard width > floor, extra > 0 else { return least }
        let factor = (width - floor) / extra
        return zip(columns, least).map { ($0.1 + max(0, $0.0 - $0.1) * factor).rounded(.down) }
    }

    private func grid(_ columns: [CGFloat]) -> some View {
        let total = columns.reduce(0, +)
        return VStack(alignment: .leading, spacing: 0) {
            TableLine(cells: header, widths: columns, isHeader: true)
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                Rectangle().fill(Theme.line).frame(width: total, height: 1)
                TableLine(cells: row, widths: columns, isHeader: false)
            }
        }
        .frame(width: total, alignment: .leading)
        .background(Theme.surface.opacity(0.55), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.line))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct TableLine: View {
    let cells: [String]
    let widths: [CGFloat]
    let isHeader: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(Array(widths.enumerated()), id: \.offset) { index, width in
                TableCell(text: cells.indices.contains(index) ? cells[index] : "", isHeader: isHeader)
                    .frame(width: width, alignment: .topLeading)
            }
        }
    }
}

private struct TableCell: View {
    let text: String
    let isHeader: Bool

    /// Переносы `<br>` из ответов моделей становятся настоящими. Без привязки к главному потоку: её зовёт и
    /// разбор разметки заранее, в фоне (`InlineMarkdown.warm`).
    nonisolated static func clean(_ text: String) -> String {
        text.replacingOccurrences(of: "<br>", with: "\n", options: .caseInsensitive)
            .replacingOccurrences(of: "<br/>", with: "\n", options: .caseInsensitive)
            .replacingOccurrences(of: "<br />", with: "\n", options: .caseInsensitive)
    }

    var body: some View {
        Text(InlineMarkdown.render(Self.clean(text), size: 15))
            .font(.system(size: 15, weight: isHeader ? .semibold : .regular))
            .foregroundStyle(isHeader ? Theme.ink : Theme.ink.opacity(0.92))
            .lineSpacing(3)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            // Поля ячейки — 12 pt, как у Claude (было 14: таблица из трёх столбцов не влезала на 5 pt).
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
    }
}
