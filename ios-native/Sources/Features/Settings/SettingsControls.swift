import SwiftUI

/// Заголовок шторки настроек.
struct SheetHeader: View {
    let title: String
    var subtitle: String?
    var busy = false

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
            }
            Spacer()
            if busy {
                ProgressView().controlSize(.small).tint(Theme.muted)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 26)
        .padding(.bottom, 12)
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
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// Линия между строками карточки; у строк со значком начинается от текста (`inset: 53`).
struct CardDivider: View {
    var inset: CGFloat = 16

    var body: some View {
        Rectangle()
            .fill(Theme.line)
            .frame(height: 1)
            .padding(.leading, inset)
            .padding(.trailing, 16)
    }
}

/// Подпись над группой.
struct SectionCaption: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 12.5))
            .foregroundStyle(Theme.subtle)
            .padding(.horizontal, 18)
            .padding(.top, 10)
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
        .font(.system(size: 16))
        .padding(.horizontal, 16)
        .frame(minHeight: 46)
    }
}

struct ToggleRow: View {
    let title: String
    var hint: String?
    let isOn: Bool
    let onChange: (Bool) -> Void

    var body: some View {
        Toggle(isOn: Binding(get: { isOn }, set: { value in
            Haptics.tap()
            onChange(value)
        })) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                if let hint {
                    Text(hint)
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.subtle)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(Theme.accent)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(minHeight: 46)
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
                .font(.system(size: 16))
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
                HStack(spacing: 5) {
                    Text(current)
                        .font(.system(size: 15))
                        .lineLimit(1)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundStyle(Theme.muted)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .menuOrder(.fixed)
            .accessibilityLabel("\(title): \(current)")
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 46)
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
                .font(.system(size: 16))
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
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

/// Числовой параметр: значение можно вбить с клавиатуры, потянуть ползунком или подстроить
/// кнопками «−»/«+». Сохраняется, когда палец отпущен или ввод закончен.
struct ParameterRow: View {
    let spec: ParameterSpec
    let value: Double
    /// `nil` — строку источника не показывать.
    var changed: Bool?
    /// Подписи источника значения.
    var changedLabel = "Изменено в этом чате"
    var sourceLabel = "Из профиля модели"
    let onCommit: (Double) -> Void
    var onReset: (() -> Void)?

    @State private var draft: Double = 0
    @State private var text = ""
    @State private var help = false
    @FocusState private var typing: Bool

    private var isLength: Bool { spec.key == "max_tokens" || spec.key == "nano_max_output_tokens" }
    private var unlimited: Bool { isLength && value == -1 }
    private var upper: Double { Swift.max(spec.max, value) }
    /// У длинных шкал (Top-K) «−»/«+» шагают крупнее.
    private var buttonStep: Double { spec.max - spec.min > 200 ? Swift.max(spec.step, 5) : spec.step }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 2) {
                Text(spec.label)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                Button {
                    withAnimation(Theme.spring) { help.toggle() }
                } label: {
                    Image(systemName: "info.circle")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.subtle)
                        .frame(width: 34, height: 34)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Описание: \(spec.label)")
                Spacer(minLength: 8)
                if unlimited {
                    Text("Максимум")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.muted)
                } else {
                    // При вводе поле пустое, прежнее значение — бледной подсказкой: новое число
                    // набирается сразу, без стирания (курсор мог встать в начало — «1.250.7»).
                    TextField(Self.format(value, spec: spec), text: $text)
                        .keyboardType(spec.isInteger ? .numberPad : (spec.min < 0 ? .numbersAndPunctuation : .decimalPad))
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

            if help {
                Text(spec.hint + (isLength ? "" : " От \(Self.format(spec.min, spec: spec)) до \(Self.format(spec.max, spec: spec))."))
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity)
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
                if spec.key == "temperature" || spec.key == "nano_temperature" {
                    HStack {
                        Text("Предсказуемее")
                        Spacer()
                        Text("Разнообразнее")
                    }
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.subtle)
                    .padding(.horizontal, 40)
                }
            }

            if let changed {
                HStack(spacing: 8) {
                    Text(changed ? changedLabel : sourceLabel)
                    Spacer(minLength: 8)
                    if changed, let onReset {
                        Button {
                            Haptics.tap()
                            onReset()
                        } label: {
                            Label("Сбросить", systemImage: "arrow.uturn.backward")
                                .frame(minHeight: 32)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(PressScaleStyle())
                        .foregroundStyle(Theme.muted)
                    }
                }
                .font(.system(size: 13))
                .foregroundStyle(Theme.subtle)
            }
        }
        .padding(.horizontal, 16)
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
                .contentShape(Circle())
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
        .onAppear { text = saved }
        .onChange(of: saved) { _, new in
            if !saving { text = new }
        }
    }
}
