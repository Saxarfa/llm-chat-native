import SwiftUI
import UIKit

/// Цвета классической тёмной темы сайта (`frontend/src/theme.css`, тёмные значения по умолчанию).
enum Theme {
    static let canvas = Color(hex: 0x151515)
    static let surface = Color(hex: 0x20201F)
    static let rail = Color(hex: 0x111111)
    static let ink = Color(hex: 0xE8E6DF)
    static let muted = Color(hex: 0xA3A29A)
    static let subtle = Color(hex: 0x7D7C76)
    static let line = Color.white.opacity(0.075)
    static let fill = Color.white.opacity(0.06)
    static let fillActive = Color.white.opacity(0.11)
    static let buttonPrimary = Color(hex: 0xD6D4C9)
    static let buttonPrimaryText = Color(hex: 0x151513)
    static let danger = Color(hex: 0xD5968A)

    static let spring = Animation.spring(response: 0.36, dampingFraction: 0.86)

    /// Засечки — только для логотипа и приветствия.
    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .regular, design: .serif)
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

enum Haptics {
    static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}

enum Keyboard {
    static func hide() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

/// Логотип «llm/chat»: «llm» курсивом, приглушённая косая, «chat» прямым.
struct Wordmark: View {
    var size: CGFloat = 24

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text("llm").italic()
            Text("/").foregroundStyle(Theme.ink.opacity(0.38)).padding(.horizontal, size * 0.04)
            Text("chat")
        }
        .font(Theme.display(size))
        .foregroundStyle(Theme.ink)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("LLM Chat")
    }
}

/// Круглая кнопка-иконка в шапке: видимый круг 40, зона нажатия 44.
struct CircleIconButton: View {
    let symbol: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Theme.ink)
                .frame(width: 40, height: 40)
                .background(Theme.fill, in: Circle())
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(label)
    }
}

struct PressScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .opacity(configuration.isPressed ? 0.75 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        Face(configuration: configuration)
    }

    /// Отдельный вид: `isEnabled` из окружения надёжно читается только внутри View.
    private struct Face: View {
        let configuration: ButtonStyleConfiguration
        @Environment(\.isEnabled) private var enabled

        var body: some View {
            configuration.label
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.buttonPrimaryText)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Theme.buttonPrimary, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .opacity(enabled ? (configuration.isPressed ? 0.8 : 1) : 0.4)
                .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
        }
    }
}

/// Поле формы с подписью сверху.
struct LabeledField<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.muted)
            content
                .font(.system(size: 17))
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 16)
                .frame(minHeight: 52)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.line))
        }
    }
}
