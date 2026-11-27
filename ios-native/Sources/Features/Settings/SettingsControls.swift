import SwiftUI

/// Размеры строк и карточек в шторках — замер снимков приложения Claude 16.11.2026 (3 px = 1 pt):
/// текст 17 pt, строка настроек ~52 pt, строка меню «+» ~54 pt, значок ~19 pt с центром в 32 pt
/// от края карточки, текст — в 60 pt от края, карточка в 20 pt от края экрана.
/// Толщину текста по снимкам не сравнивать: они сняты с системным «Жирным шрифтом».
enum RowMetrics {
    static let height: CGFloat = 52
    static let toolHeight: CGFloat = 54
    static let text: CGFloat = 17
    static let icon: CGFloat = 19
    static let iconFrame: CGFloat = 28
    /// От края карточки до рамки значка; рамка 28 → центр значка в 32 pt.
    static let leading: CGFloat = 18
    /// Рамка значка → текст: текст начинается в 60 pt от края карточки.
    static let iconGap: CGFloat = 14
    /// Строка без значка.
    static let plainLeading: CGFloat = 20
    static let trailing: CGFloat = 20
    /// Линия между строками со значком начинается от текста.
    static let textInset: CGFloat = 60
    static let cardRadius: CGFloat = 26
    /// Отступ карточек от краёв шторки.
    static let cardInset: CGFloat = 20
    static let chevron: CGFloat = 14
}

/// Шапка шторки — та же, что `SheetBar`: круглая ✕ слева, заголовок по центру (как у Claude),
/// под ним — подзаголовок, справа — индикатор загрузки. Закрывает окно, в котором стоит.
struct SheetHeader: View {
    let title: String
    var subtitle: String?
    var busy = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        SheetBar(title: title, subtitle: subtitle, symbol: "xmark", label: "Закрыть", action: { dismiss() }) {
            if busy {
                ProgressView().controlSize(.small).tint(Theme.muted)
                    .frame(width: Theme.headerButton, height: Theme.headerButton)
            }
        }
    }
}

/// Шапка шторки, как у Claude: стеклянный круг 44 pt слева (✕ или ‹) в 20 pt от края,
/// заголовок 17 pt по центру, справа — своя кнопка. Центр кнопок — в 42 pt от верха шторки.
/// Без подложки: содержимое уходит под неё и затухает.
struct SheetBar<Trailing: View>: View {
    let title: String
    var subtitle: String?
    let symbol: String
    let label: String
    let action: () -> Void
    let trailing: Trailing

    init(title: String, subtitle: String? = nil, symbol: String, label: String, action: @escaping () -> Void,
         @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.subtitle = subtitle
        self.symbol = symbol
        self.label = label
        self.action = action
        self.trailing = trailing()
    }

    var body: some View {
        ZStack {
            VStack(spacing: 1) {
                Text(title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, Theme.headerButton + 14)
            HStack {
                CircleIconButton(symbol: symbol, label: label, action: action)
                Spacer()
                trailing
            }
        }
        .frame(minHeight: Theme.headerButton)
        .padding(.horizontal, Theme.headerInset)
        .padding(.top, 20)
        .padding(.bottom, 10)
        .background(alignment: .top) {
            Theme.fade(Theme.sheet, from: .top)
                .padding(.bottom, -14)
                .ignoresSafeArea(edges: .top)
                .allowsHitTesting(false)
        }
    }
}

extension SheetBar where Trailing == EmptyView {
    init(title: String, subtitle: String? = nil, symbol: String, label: String, action: @escaping () -> Void) {
        self.init(title: title, subtitle: subtitle, symbol: symbol, label: label, action: action) { EmptyView() }
    }
}

/// Группа строк на общей подложке, строки разделены тонкой линией.
struct SettingsCard<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: RowMetrics.cardRadius, style: .continuous))
    }
}

/// Линия между строками карточки; у строк со значком начинается от текста (`RowMetrics.textInset`).
struct CardDivider: View {
    var inset: CGFloat = RowMetrics.plainLeading

    var body: some View {
        Rectangle()
            .fill(Theme.line)
            .frame(height: 1)
            .padding(.leading, inset)
            .padding(.trailing, RowMetrics.trailing)
    }
}

/// Подпись над группой («Аккаунт», «Приложение»): у Claude 15 pt вторичным цветом, в 20 pt от края карточки.
struct SectionCaption: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 15))
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 20)
            .padding(.top, 14)
            .padding(.bottom, 2)
    }
}

/// Пояснение мелким текстом.
struct SettingsNote: View {
    let text: String
    var symbol = "info.circle"

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 12))
            Text(text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(.system(size: 14))
        .foregroundStyle(Theme.subtle)
        .padding(.horizontal, 4)
    }
}

/// Строка «подпись — значение».
struct ValueRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: 12) {
            Text(title)
                .foregroundStyle(Theme.ink)
            Spacer(minLength: 8)
            Text(value)
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
        }
        .font(.system(size: RowMetrics.text))
        .padding(.horizontal, RowMetrics.plainLeading)
        .frame(minHeight: RowMetrics.height)
    }
}

/// Значок строки карточки, как у Claude: ~19 pt в рамке 28 (центр в 32 pt от края карточки).
struct RowIcon: View {
    let symbol: String
    var enabled = true
    var tint: Color?

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: RowMetrics.icon, weight: .regular))
            .foregroundStyle(tint ?? (enabled ? Theme.ink.opacity(0.92) : Theme.subtle))
            .frame(width: RowMetrics.iconFrame)
    }
}

struct ToggleRow: View {
    let title: String
    /// Значок слева, как у строк меню «+» в Claude; без него — прежняя строка.
    var symbol: String?
    let isOn: Bool
    let onChange: (Bool) -> Void

    var body: some View {
        Toggle(isOn: Binding(get: { isOn }, set: { value in
            Haptics.tap()
            onChange(value)
        })) {
            HStack(spacing: RowMetrics.iconGap) {
                if let symbol {
                    RowIcon(symbol: symbol)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: RowMetrics.text))
                        .foregroundStyle(Theme.ink)
                }
            }
        }
        .tint(Theme.accent)
        .padding(.leading, symbol == nil ? RowMetrics.plainLeading : RowMetrics.leading)
        .padding(.trailing, RowMetrics.trailing)
        .padding(.vertical, 8)
        .frame(minHeight: symbol == nil ? RowMetrics.height : RowMetrics.toolHeight)
    }
}

/// Выбор одного варианта из меню.
struct ChoiceRow: View {
    let title: String
    let choices: [Choice]
    let selected: String
    let onSelect: (String) -> Void

    private var current: String {
        choices.first { $0.value == selected }?.label ?? (selected == "auto" ? "Авто" : selected)
    }

    var body: some View {
        HStack(spacing: 12) {
            Text(title)
                .font(.system(size: RowMetrics.text))
                .foregroundStyle(Theme.ink)
            Spacer(minLength: 8)
            Menu {
                ForEach(choices) { choice in
                    Button {
                        guard choice.value != selected else { return }
                        Haptics.tap()
                        onSelect(choice.value)
                    } label: {
                        if choice.value == selected {
                            Label(choice.label, systemImage: "checkmark")
                        } else {
                            Text(choice.label)
                        }
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(current)
                        .font(.system(size: RowMetrics.text))
                        .lineLimit(1)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                }
                .foregroundStyle(Theme.muted)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .menuOrder(.fixed)
            .accessibilityLabel("\(title): \(current)")
        }
        .padding(.horizontal, RowMetrics.plainLeading)
        .frame(minHeight: RowMetrics.height)
    }
}

/// Несколько вариантов в ряд — для коротких списков вроде «Выкл / Авто / Всегда».
struct SegmentRow: View {
    let title: String
    let choices: [Choice]
    let selected: String
    let onSelect: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: RowMetrics.text))
                .foregroundStyle(Theme.ink)
            HStack(spacing: 4) {
                ForEach(choices) { choice in
                    let active = choice.value == selected
                    Button {
                        guard !active else { return }
                        Haptics.tap()
                        onSelect(choice.value)
                    } label: {
                        Text(choice.label)
                            .font(.system(size: 15, weight: active ? .semibold : .regular))
                            .foregroundStyle(active ? Theme.ink : Theme.muted)
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(active ? Theme.fillActive : Color.clear,
                                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(PressScaleStyle())
                    .accessibilityAddTraits(active ? .isSelected : [])
                }
            }
            .padding(4)
            .background(Theme.fill, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        }
        .padding(.horizontal, RowMetrics.plainLeading)
        .padding(.vertical, 12)
    }
}

/// Числовой параметр: значение можно вбить с клавиатуры, потянуть ползунком или подстроить
/// кнопками «−»/«+». Сохраняется, когда палец отпущен или ввод закончен.
struct ParameterRow: View {
    let spec: ParameterSpec
    let value: Double
    /// `true` — значение своё: строка с подписью и кнопкой сброса.
    var changed: Bool?
    var changedLabel = "Изменено в этой сессии"
    let onCommit: (Double) -> Void
    var onReset: (() -> Void)?

    @State private var draft: Double = 0
    @State private var text = ""
    @FocusState private var typing: Bool

    private var isLength: Bool { spec.key == "max_tokens" || spec.key == "nano_max_output_tokens" }
    private var unlimited: Bool { isLength && value == -1 }
    private var upper: Double { Swift.max(spec.max, value) }
    /// У длинных шкал (Top-K) «−»/«+» шагают крупнее.
    private var buttonStep: Double { spec.max - spec.min > 200 && spec.key != "seed" ? Swift.max(spec.step, 5) : spec.step }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 2) {
                Text(spec.label)
                    .font(.system(size: RowMetrics.text))
                    .foregroundStyle(Theme.ink)
                Spacer(minLength: 8)
                if unlimited {
                    Text("Максимум")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.muted)
                } else {
                    // При вводе поле пустое, прежнее значение — бледной подсказкой: новое число
                    // набирается сразу, без стирания (курсор мог встать в начало — «1.250.7»).
                    TextField(Self.format(value, spec: spec), text: $text)
                        .keyboardType(spec.min < 0 ? .numbersAndPunctuation : (spec.isInteger ? .numberPad : .decimalPad))
                        .multilineTextAlignment(.trailing)
                        .font(.system(size: 15).monospacedDigit())
                        .foregroundStyle(Theme.ink)
                        .focused($typing)
                        .submitLabel(.done)
                        .onSubmit { typing = false }
                        .padding(.horizontal, 10)
                        .frame(width: isLength ? 110 : 76, height: 36)
                        .background(Theme.fill, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .strokeBorder(typing ? Theme.buttonPrimary.opacity(0.7) : .clear, lineWidth: 1)
                        }
                        .accessibilityLabel("\(spec.label), значение")
                        .accessibilityIdentifier("param.\(spec.key).field")
                    // У цифровой клавиатуры нет «Ввода» — закончить ввод можно здесь.
                    if typing {
                        Button {
                            typing = false
                        } label: {
                            Image(systemName: "checkmark")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Theme.buttonPrimaryText)
                                .frame(width: 36, height: 36)
                                .background(Theme.buttonPrimary, in: Circle())
                                .contentShape(Circle())
                        }
                        .buttonStyle(PressScaleStyle())
                        .padding(.leading, 6)
                        .accessibilityLabel("Готово")
                        .transition(.opacity)
                    }
                }
            }

            if isLength {
                Toggle(isOn: Binding(get: { unlimited }, set: { on in
                    Haptics.tap()
                    onCommit(on ? -1 : 2048)
                })) {
                    Text("Максимум, доступный модели")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                }
                .tint(Theme.buttonPrimary)
            } else {
                HStack(spacing: 6) {
                    stepButton(symbol: "minus", delta: -buttonStep)
                    Slider(value: Binding(get: { draft }, set: { new in
                        let snapped = snap(new)
                        if snapped != draft {
                            draft = snapped
                            text = Self.format(snapped, spec: spec)
                            Haptics.selection()
                        }
                    }), in: spec.min...upper, onEditingChanged: { editing in
                        if !editing, draft != value { onCommit(draft) }
                    })
                    .tint(Theme.buttonPrimary)
                    .accessibilityLabel(spec.label)
                    .accessibilityIdentifier("param.\(spec.key).slider")
                    stepButton(symbol: "plus", delta: buttonStep)
                }
            }

            if changed == true {
                HStack(spacing: 8) {
                    Text(changedLabel)
                    Spacer(minLength: 8)
                    if let onReset {
                        Button {
                            Haptics.tap()
                            onReset()
                        } label: {
                            Label("Сбросить", systemImage: "arrow.uturn.backward")
                                .frame(minHeight: 32)
                                .hitPadding(.vertical, 6)
                        }
                        .buttonStyle(PressScaleStyle())
                        .foregroundStyle(Theme.muted)
                    }
                }
                .font(.system(size: 13))
                .foregroundStyle(Theme.subtle)
            }
        }
        .padding(.horizontal, RowMetrics.plainLeading)
        .padding(.vertical, 12)
        .onAppear { sync(value) }
        .onChange(of: value) { _, new in sync(new) }
        .onChange(of: typing) { _, focused in
            if focused { text = "" } else { commitText() }
        }
    }

    private func stepButton(symbol: String, delta: Double) -> some View {
        let next = snap(draft + delta)
        return Button {
            guard next != draft else { return }
            Haptics.selection()
            draft = next
            text = Self.format(next, spec: spec)
            onCommit(next)
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(next == draft ? Theme.subtle : Theme.ink)
                .frame(width: 34, height: 34)
                .background(Theme.fill, in: Circle())
                // Видимый круг 34, зона нажатия 44 — место в строке прежнее.
                .padding(5)
                .contentShape(Rectangle())
                .padding(-5)
        }
        .buttonStyle(PressScaleStyle())
        .disabled(next == draft)
        .accessibilityLabel(symbol == "minus" ? "Уменьшить: \(spec.label)" : "Увеличить: \(spec.label)")
    }

    /// Значение в пределах шкалы, кратное шагу.
    private func snap(_ raw: Double) -> Double {
        Self.snap(raw, spec: spec, upper: upper)
    }

    static func snap(_ raw: Double, spec: ParameterSpec, upper: Double) -> Double {
        let clamped = Swift.min(Swift.max(raw, spec.min), upper)
        let steps = ((clamped - spec.min) / spec.step).rounded()
        let value = Swift.min(spec.min + steps * spec.step, upper)
        return spec.isInteger ? value.rounded() : (value * 1000).rounded() / 1000
    }

    private func sync(_ new: Double) {
        draft = Swift.min(Swift.max(new, spec.min), upper)
        text = new == -1 && isLength ? "" : Self.format(new, spec: spec)
    }

    private func commitText() {
        guard !unlimited else { return }
        guard let number = Self.parse(text) else {
            text = Self.format(value, spec: spec)
            return
        }
        // Вбитое число не обязано попадать в шаг ползунка, но держится в пределах параметра.
        let clamped = Self.clampTyped(number, spec: spec, upper: isLength ? upper : spec.max)
        text = Self.format(clamped, spec: spec)
        draft = Swift.min(clamped, upper)
        if clamped != value { onCommit(clamped) }
    }

    static func clampTyped(_ number: Double, spec: ParameterSpec, upper: Double) -> Double {
        let clamped = Swift.min(Swift.max(number, spec.min), upper)
        return spec.isInteger ? clamped.rounded() : (clamped * 1000).rounded() / 1000
    }

    /// Число из поля ввода: запятая или точка, минус.
    static func parse(_ raw: String) -> Double? {
        let cleaned = raw.trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: ",", with: ".")
            .replacingOccurrences(of: "\u{2212}", with: "-")
            .replacingOccurrences(of: " ", with: "")
        guard !cleaned.isEmpty else { return nil }
        return Double(cleaned)
    }

    static func format(_ value: Double, spec: ParameterSpec) -> String {
        if spec.isInteger { return String(Int(value.rounded())) }
        return value.formatted(.number.precision(.fractionLength(0...3)).grouping(.never))
    }
}

/// Многострочный текст с кнопкой «Сохранить» — для инструкций модели.
struct InstructionEditor: View {
    let placeholder: String
    let saved: String
    let onSave: (String) async -> Bool

    @State private var text = ""
    @State private var saving = false

    var body: some View {
        VStack(alignment: .trailing, spacing: 10) {
            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text(placeholder)
                        .foregroundStyle(Theme.subtle)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 8)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $text)
                    .scrollContentBackground(.hidden)
                    .foregroundStyle(Theme.ink)
                    .frame(minHeight: 140, maxHeight: 260)
            }
            .font(.system(size: 16))
            .padding(8)
            .background(Theme.fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            HStack(spacing: 8) {
                if text != saved {
                    Button("Отменить") { text = saved }
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.muted)
                        .frame(minHeight: 40)
                        .padding(.horizontal, 10)
                        .buttonStyle(PressScaleStyle())
                }
                Button {
                    Keyboard.hide()
                    saving = true
                    Task {
                        if await onSave(text) { Haptics.success() }
                        saving = false
                    }
                } label: {
                    HStack(spacing: 6) {
                        if saving { ProgressView().controlSize(.small).tint(Theme.buttonPrimaryText) }
                        Text("Сохранить")
                    }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.buttonPrimaryText)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 40)
                    .background(Theme.buttonPrimary.opacity(text == saved ? 0.3 : 1), in: Capsule())
                }
                .buttonStyle(PressScaleStyle())
                .disabled(text == saved || saving)
            }
        }
        .padding(12)
        // Несохранённый промпт не теряется от случайного свайпа окна вниз: есть «Сохранить» и «Отменить».
        .interactiveDismissDisabled(text != saved)
        .onAppear { text = saved }
        .onChange(of: saved) { _, new in
            if !saving { text = new }
        }
    }
}
