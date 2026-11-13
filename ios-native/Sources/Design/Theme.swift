import SwiftUI
import UIKit

/// Цвета приложения: тёмные — классическая тёмная тема сайта, светлые — светлая (`frontend/src/theme.css`).
/// Каждый цвет сам меняется вместе с темой (светлая, тёмная или как в системе — см. `Appearance`).
enum Theme {
    static let canvas = dynamic(dark: 0x151515, light: 0xF7F5F0)
    static let surface = dynamic(dark: 0x20201F, light: 0xFFFDF8)
    static let rail = dynamic(dark: 0x111111, light: 0xEEEBE3)
    static let ink = dynamic(dark: 0xE8E6DF, light: 0x302E28)
    static let muted = dynamic(dark: 0xA3A29A, light: 0x686256)
    /// Самый бледный текст (подписи, даты). Контраст не ниже 4,5:1 и на карточках, и на фоне шторок
    /// (аудит 13.11.2026: было 3,6–3,8).
    static let subtle = dynamic(dark: 0x8C8B85, light: 0x736C5F)
    static let line = dynamic(UIColor.white.withAlphaComponent(0.075), UIColor(hex: 0x514832, alpha: 0.11))
    static let fill = dynamic(UIColor.white.withAlphaComponent(0.06), UIColor(hex: 0x514832, alpha: 0.06))
    static let fillActive = dynamic(UIColor.white.withAlphaComponent(0.11), UIColor(hex: 0x514832, alpha: 0.11))
    static let buttonPrimary = dynamic(dark: 0xF2F0EA, light: 0x34382F)
    static let buttonPrimaryText = dynamic(dark: 0x151513, light: 0xFFFDF7)
    static let danger = dynamic(dark: 0xD5968A, light: 0xB4513F)
    /// Синий акцент, как в настройках iOS: переключатели, галочки выбора, выбранная плитка.
    static let accent = dynamic(dark: 0x4A8DF0, light: 0x2F6FDB)
    /// Поднятая карточка в шторках (группы строк в настройках, меню «+»).
    static let card = dynamic(dark: 0x222221, light: 0xFFFFFF)
    /// Подложка шторок: в тёмной теме как карточка в настройках Claude, в светлой — тёплый серый.
    static let sheet = dynamic(dark: 0x181817, light: 0xF2F0EA)
    /// Пузырь вопроса в ленте.
    static let bubble = dynamic(dark: 0x272725, light: 0xEBE8E0)
    /// Коралловая «Отправить», когда есть что отправлять, — как в приложении Claude.
    static let send = Color(hex: 0xC6613F)
    /// Капсула ввода (замер со снимков Claude на iPhone): строка #2A2A2A с каймой #363636,
    /// карточка с клавиатурой чуть темнее — #242424; круглые кнопки и чип модели — #363636.
    static let capsule = dynamic(dark: 0x2A2A2A, light: 0xFFFDF8)
    static let capsuleOpen = dynamic(dark: 0x242424, light: 0xFFFDF8)
    static let capsuleLine = dynamic(UIColor(hex: 0x363636), UIColor(hex: 0x514832, alpha: 0.13))
    static let capsuleControl = dynamic(UIColor(hex: 0x363636), UIColor(hex: 0x514832, alpha: 0.08))

    private static func dynamic(dark: UInt32, light: UInt32) -> Color {
        dynamic(UIColor(hex: dark), UIColor(hex: light))
    }

    private static func dynamic(_ dark: UIColor, _ light: UIColor) -> Color {
        Color(uiColor: UIColor { $0.userInterfaceStyle == .light ? light : dark })
    }

    static let spring = Animation.spring(response: 0.36, dampingFraction: 0.86)
    /// Капсула ввода: из строки в карточку и обратно.
    static let morph = Animation.spring(response: 0.32, dampingFraction: 0.84)

    /// Затухание фона под плавающей шапкой: лента уходит под кнопки и под «остров».
    static func fade(_ color: Color, from edge: UnitPoint) -> LinearGradient {
        LinearGradient(stops: [
            .init(color: color, location: 0),
            .init(color: color.opacity(0.96), location: 0.5),
            .init(color: color.opacity(0.72), location: 0.78),
            .init(color: color.opacity(0), location: 1),
        ], startPoint: edge, endPoint: edge == .top ? .bottom : .top)
    }

    /// Размытие под плавающей шапкой и под нижними кнопками, как у Claude (запись экрана
    /// пользователя 13.11.2026): содержимое под краем не затемняется, а слегка размывается —
    /// у края заметнее, к середине экрана сходит на нет. Только SwiftUI:
    /// слой UIKit с фильтром `variableBlur` (первая сборка 0.14) ломал подъём экрана над
    /// клавиатурой — капсула ввода оставалась под ней. `solid` — доля высоты с полным размытием.
    static func edgeBlur(_ tint: Color, from edge: UnitPoint, solid: CGFloat = 0.45) -> some View {
        let far: UnitPoint = edge == .top ? .bottom : .top
        // Небольшое размытие (пользователь 13.11.2026: «сильно слишком, надо небольшое»):
        // один тонкий материал, прозрачнее у края и быстро сходящий на нет.
        return ZStack {
            Rectangle()
                .fill(.ultraThinMaterial)
                .opacity(0.7)
                .mask(LinearGradient(stops: [
                    .init(color: .black, location: 0),
                    .init(color: .black.opacity(0.8), location: solid),
                    .init(color: .clear, location: 1),
                ], startPoint: edge, endPoint: far))
            LinearGradient(stops: [
                .init(color: tint.opacity(0.3), location: 0),
                .init(color: tint.opacity(0.08), location: 0.3),
                .init(color: tint.opacity(0), location: 0.55),
            ], startPoint: edge, endPoint: far)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// То же размытие у нижнего края (капсула ввода, поиск «Недавних», кнопки шторки).
    static func bottomBlur(_ tint: Color, solid: CGFloat = 0.7) -> some View {
        edgeBlur(tint, from: .bottom, solid: solid)
    }

    /// Засечки — только для логотипа и приветствия.
    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .regular, design: .serif)
    }
}

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
    }
}

/// Тема приложения: выбирается в «Настройки → Внешний вид», хранится на телефоне.
enum Appearance: String, CaseIterable {
    case light, dark, system

    static let key = "appearance"

    var title: String {
        switch self {
        case .light: return "Светлая"
        case .dark: return "Тёмная"
        case .system: return "Системная"
        }
    }

    var style: UIUserInterfaceStyle {
        switch self {
        case .light: return .light
        case .dark: return .dark
        case .system: return .unspecified
        }
    }

    static var saved: Appearance {
        Appearance(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? .dark
    }

    /// Тема всего окна — вместе с ним и все шторки поверх.
    @MainActor
    func apply() {
        for scene in UIApplication.shared.connectedScenes {
            guard let windows = (scene as? UIWindowScene)?.windows else { continue }
            for window in windows { window.overrideUserInterfaceStyle = style }
        }
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
    static let key = "haptics"

    /// «Настройки → Тактильный отклик».
    static var enabled: Bool {
        UserDefaults.standard.object(forKey: key) as? Bool ?? true
    }

    static func tap() {
        guard enabled else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func success() {
        guard enabled else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func error() {
        guard enabled else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }

    /// Лёгкий щелчок шага ползунка.
    static func selection() {
        guard enabled else { return }
        UISelectionFeedbackGenerator().selectionChanged()
    }
}

/// Свайп от левого края возвращает назад и там, где вместо системной кнопки «Назад» — своя круглая.
extension UINavigationController: UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1
    }
}

/// Размеры экрана, которые нужны раскладке: есть ли внизу полоса «домой».
enum Screen {
    @MainActor
    static var bottomInset: CGFloat {
        for scene in UIApplication.shared.connectedScenes {
            if let window = (scene as? UIWindowScene)?.windows.first { return window.safeAreaInsets.bottom }
        }
        return 0
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

/// Значок меню, как у Claude: две длинные тонкие линии и короткая.
struct MenuGlyph: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4.5) {
            Capsule().frame(width: 16, height: 1.5)
            Capsule().frame(width: 16, height: 1.5)
            Capsule().frame(width: 8, height: 1.5)
        }
    }
}

/// Круглая кнопка-иконка в шапке, как у Claude: круг 38 чуть светлее фона с тонкой каймой,
/// тонкий значок; зона нажатия 44.
struct CircleIconButton: View {
    let symbol: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if symbol == "line.3.horizontal" {
                    MenuGlyph()
                } else {
                    Image(systemName: symbol)
                        .font(.system(size: 15, weight: .regular))
                }
            }
                .foregroundStyle(Theme.ink.opacity(0.82))
                .frame(width: 38, height: 38)
                .background(Theme.surface, in: Circle())
                .overlay(Circle().strokeBorder(Theme.line))
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
