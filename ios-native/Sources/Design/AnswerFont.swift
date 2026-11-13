import SwiftUI

/// Начертание ответов модели в ленте («Настройки → Шрифт ответов»), хранится на телефоне.
/// По умолчанию — с засечками, как в приложении Claude.
enum AnswerFont: String, CaseIterable {
    case serif, sans, rounded, mono

    static let key = "answerFont"

    var title: String {
        switch self {
        case .serif: return "С засечками"
        case .sans: return "Без засечек"
        case .rounded: return "Скруглённый"
        case .mono: return "Моноширинный"
        }
    }

    var design: Font.Design {
        switch self {
        case .serif: return .serif
        case .sans: return .default
        case .rounded: return .rounded
        case .mono: return .monospaced
        }
    }

    /// Моноширинный шире остальных — на ступень мельче, чтобы строка вмещала столько же.
    var sizeFactor: CGFloat { self == .mono ? 0.92 : 1 }
}

/// Размер текста ответов.
enum AnswerSize: String, CaseIterable {
    case small, regular, large

    static let key = "answerSize"

    var title: String {
        switch self {
        case .small: return "Мельче"
        case .regular: return "Обычный"
        case .large: return "Крупнее"
        }
    }

    var factor: CGFloat {
        switch self {
        case .small: return 0.92
        case .regular: return 1
        case .large: return 1.1
        }
    }
}

/// Выбор шрифта ответов: четыре плитки «Аа» и размер, ниже — образец ответа.
struct AnswerFontPicker: View {
    @AppStorage(AnswerFont.key) private var font = AnswerFont.serif
    @AppStorage(AnswerSize.key) private var size = AnswerSize.regular

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                ForEach(AnswerFont.allCases, id: \.self) { option in
                    let selected = font == option
                    Button {
                        Haptics.tap()
                        withAnimation(.easeOut(duration: 0.2)) { font = option }
                    } label: {
                        VStack(spacing: 6) {
                            Text("Аа")
                                .font(.system(size: 22, design: option.design))
                                .foregroundStyle(Theme.ink)
                                .frame(maxWidth: .infinity, minHeight: 52)
                                .background(Theme.fill, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                                        .strokeBorder(selected ? Theme.accent : Theme.line, lineWidth: selected ? 1.5 : 1)
                                )
                            Text(option.title)
                                .font(.system(size: 12, weight: selected ? .medium : .regular))
                                .foregroundStyle(selected ? Theme.accent : Theme.muted)
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PressScaleStyle())
                    .accessibilityLabel("Шрифт ответов: \(option.title)")
                    .accessibilityAddTraits(selected ? .isSelected : [])
                    .accessibilityIdentifier("answerFont.\(option.rawValue)")
                }
            }

            Picker("Размер", selection: Binding(get: { size }, set: { value in
                Haptics.selection()
                withAnimation(.easeOut(duration: 0.2)) { size = value }
            })) {
                ForEach(AnswerSize.allCases, id: \.self) { option in
                    Text(option.title).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("answerSize")

            Text("Так будут выглядеть ответы модели: спокойный, ровный текст, который легко читать.")
                .font(.system(size: 16.5 * font.sizeFactor * size.factor, design: font.design))
                .foregroundStyle(Theme.ink)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 2)
        }
        .padding(16)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}
