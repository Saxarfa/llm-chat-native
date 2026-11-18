import SwiftUI
import UIKit

/// Цвета приложения: тёмные — классическая тёмная тема сайта, светлые — светлая (`frontend/src/theme.css`).
/// Каждый цвет сам меняется вместе с темой (светлая, тёмная или как в системе — см. `Appearance`).
enum Theme {
    static let canvas = dynamic(dark: 0x151515, light: 0xF7F5F0)
    static let surface = dynamic(dark: 0x20201F, light: 0xFFFDF8)
    static let rail = dynamic(dark: 0x111111, light: 0xEEEBE3)
    /// Тёмные текстовые цвета — замер снимков Claude 16.11.2026 (PNG с iPhone, без сжатия):
    /// основной #F9F9F7, вторичный #96958D (подсказка поля, значки под ответом, подписи разделов),
    /// третичный #888781 (даты, «…может ошибаться»).
    static let ink = dynamic(dark: 0xF9F9F7, light: 0x302E28)
    static let muted = dynamic(dark: 0x96958D, light: 0x686256)
    /// Самый бледный текст (подписи, даты). Контраст не ниже 4,5:1 и на карточках, и на фоне шторок
    /// (аудит 13.11.2026: было 3,6–3,8).
    static let subtle = dynamic(dark: 0x888781, light: 0x736C5F)
    /// Подпись раздела в шторке («Недавние», «Показать все») — у Claude светлее остальных подписей.
    static let caption = dynamic(dark: 0xC3C2B8, light: 0x5E594E)
    /// Выбранная строка шторки — плашка #404040 (замер снимка Claude).
    static let rowSelected = dynamic(UIColor(hex: 0x404040), UIColor(hex: 0x514832, alpha: 0.12))
    /// Фон страницы «Недавние»: у Claude темнее чата (#0B0B0B).
    static let page = dynamic(dark: 0x0B0B0B, light: 0xF2F0EA)
    /// Синяя точка у сессии, ответ в которой пришёл, пока её не открывали.
    static let unread = dynamic(dark: 0x4076CF, light: 0x2F6FDB)
    static let line = dynamic(UIColor.white.withAlphaComponent(0.075), UIColor(hex: 0x514832, alpha: 0.11))
    static let fill = dynamic(UIColor.white.withAlphaComponent(0.06), UIColor(hex: 0x514832, alpha: 0.06))
    static let fillActive = dynamic(UIColor.white.withAlphaComponent(0.11), UIColor(hex: 0x514832, alpha: 0.11))
    static let buttonPrimary = dynamic(dark: 0xF2F0EA, light: 0x34382F)
    static let buttonPrimaryText = dynamic(dark: 0x151513, light: 0xFFFDF7)
    static let danger = dynamic(dark: 0xD5968A, light: 0xB4513F)
    /// Синий акцент, как в настройках iOS: переключатели, галочки выбора, выбранная плитка.
    static let accent = dynamic(dark: 0x4A8DF0, light: 0x2F6FDB)
    /// Поднятая карточка в шторках (группы строк в настройках, меню «+»): у Claude #20201F.
    static let card = dynamic(dark: 0x20201F, light: 0xFFFFFF)
    /// Подложка шторок: у Claude как фон чата (#151515), в светлой теме — тёплый серый.
    static let sheet = dynamic(dark: 0x151515, light: 0xF2F0EA)
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
    /// Капсула и приветствие при появлении/скрытии клавиатуры: без отскока и примерно за то же
    /// время, что системная клавиатура, иначе две разные кривые (клавиатура и капсула) дёргают логотип.
    static let keyboardMorph = Animation.spring(duration: 0.45, bounce: 0)

    /// Размытие под плавающей шапкой: «остров» и ещё столько pt (замечание 14.11.2026 — было слишком высоко).
    static let headerReach: CGFloat = 10
    /// Прогрессивное размытие сверху (16.11.2026, по референсам Claude): в чате — под строкой состояния
    /// и чуть ниже (текст у кнопок шапки уже чёткий), в шторке и «Недавних» — до низа шапки.
    static let chatBlurDepth: CGFloat = 14
    static let drawerBlurDepth: CGFloat = 52
    /// Круглые кнопки шапок и шторок: у Claude стеклянный круг 44 pt, центр на 22 pt ниже
    /// безопасной зоны, поле 20 pt от края экрана (замер снимков 16.11.2026).
    static let headerButton: CGFloat = 44
    static let headerInset: CGFloat = 20
    /// Значки в круглых кнопках шапки: у Claude глиф ~18 pt.
    static let headerGlyph: CGFloat = 18
    /// Сколько шапка (ряд 44 pt от безопасной зоны) выступает ниже размытой полосы — на столько
    /// лента опускает своё первое содержимое, чтобы оно не начиналось под кнопками.
    /// С 17.11.2026 шапка стоит в safeAreaBar целиком (как капсула внизу), лента сама начинается под ней.
    static var headerOverhang: CGFloat { 0 }

    /// Затухание фона под плавающей шапкой: лента уходит под кнопки и под «остров».
    static func fade(_ color: Color, from edge: UnitPoint) -> LinearGradient {
        LinearGradient(stops: [
            .init(color: color, location: 0),
            .init(color: color.opacity(0.96), location: 0.5),
            .init(color: color.opacity(0.72), location: 0.78),
            .init(color: color.opacity(0), location: 1),
        ], startPoint: edge, endPoint: edge == .top ? .bottom : .top)
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
    /// Верхняя безопасная зона окна («остров» и строка состояния).
    @MainActor
    static var topInset: CGFloat {
        for scene in UIApplication.shared.connectedScenes {
            if let window = (scene as? UIWindowScene)?.windows.first { return window.safeAreaInsets.top }
        }
        return 0
    }

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
    /// Появление «Слэш» (приветствие нового чата, 18.11.2026): при смене false → true сначала
    /// вырастает косая черта, затем из-за неё разъезжаются «llm» и «chat». По умолчанию логотип стоит сразу.
    var shown = true

    var body: some View {
        let sides = Animation.spring(response: 0.5, dampingFraction: 0.85).delay(0.25)
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text("llm").italic()
                .opacity(shown ? 1 : 0)
                .offset(x: shown ? 0 : size * 0.9)
                .animation(sides, value: shown)
            Text("/").foregroundStyle(Theme.ink.opacity(0.38)).padding(.horizontal, size * 0.04)
                .scaleEffect(x: 1, y: shown ? 1 : 0.01)
                .rotationEffect(.degrees(shown ? 0 : -20))
                .animation(.spring(response: 0.35, dampingFraction: 0.6), value: shown)
            Text("chat")
                .opacity(shown ? 1 : 0)
                .offset(x: shown ? 0 : -size * 0.9)
                .animation(sides, value: shown)
        }
        .font(Theme.display(size))
        .foregroundStyle(Theme.ink)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("LLM Chat")
    }
}

/// Значок меню, как у Claude: две длинные линии и короткая (глиф ~18 pt, замер 16.11.2026).
struct MenuGlyph: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Capsule().frame(width: 18, height: 1.75)
            Capsule().frame(width: 18, height: 1.75)
            Capsule().frame(width: 9, height: 1.75)
        }
    }
}

/// Призрак «Инкогнито», как у Claude: купол с волнистым низом и двумя глазами.
/// В SF Symbols призрака нет — рисуем сами. `filled` — залитый (приветствие), иначе контур (кнопка).
struct GhostGlyph: View {
    var filled = false
    var lineWidth: CGFloat = 1.6

    var body: some View {
        GeometryReader { geo in
            let rect = CGRect(origin: .zero, size: geo.size)
            ZStack {
                if filled {
                    GhostShape().fill(style: FillStyle(eoFill: true))
                } else {
                    GhostShape(eyes: false).stroke(style: StrokeStyle(lineWidth: lineWidth, lineJoin: .round))
                    GhostEyes().fill()
                }
            }
            .frame(width: rect.width, height: rect.height)
        }
        .accessibilityHidden(true)
    }

    private struct GhostShape: Shape {
        var eyes = true

        func path(in rect: CGRect) -> Path {
            let w = rect.width, h = rect.height
            var path = Path()
            let top = rect.minY
            let dome = w / 2
            path.move(to: CGPoint(x: rect.minX, y: rect.minY + h))
            path.addLine(to: CGPoint(x: rect.minX, y: top + dome))
            path.addArc(center: CGPoint(x: rect.midX, y: top + dome), radius: dome,
                        startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + h))
            // Волнистый низ: три «языка» справа налево.
            let bottom = rect.minY + h, rise = h * 0.13
            for index in 0..<3 {
                let right = rect.maxX - CGFloat(index) * w / 3
                let left = right - w / 3
                path.addQuadCurve(to: CGPoint(x: (left + right) / 2, y: bottom - rise),
                                  control: CGPoint(x: right - w / 12, y: bottom - rise))
                path.addQuadCurve(to: CGPoint(x: left, y: bottom),
                                  control: CGPoint(x: left + w / 12, y: bottom - rise))
            }
            path.closeSubpath()
            if eyes { path.addPath(GhostEyes().path(in: rect)) }
            return path
        }
    }

    private struct GhostEyes: Shape {
        func path(in rect: CGRect) -> Path {
            let w = rect.width, h = rect.height
            let size = CGSize(width: w * 0.15, height: h * 0.2)
            var path = Path()
            for x in [0.34, 0.66] {
                path.addEllipse(in: CGRect(x: rect.minX + w * x - size.width / 2, y: rect.minY + h * 0.36,
                                           width: size.width, height: size.height))
            }
            return path
        }
    }
}

/// Круглая кнопка-иконка в шапке, как у Claude: стеклянный круг 44 pt со значком ~18 pt.
/// `active` — включённый режим (инкогнито): светлый круг с тёмным значком, как у Claude.
struct CircleIconButton: View {
    let symbol: String
    let label: String
    var active = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if symbol == "line.3.horizontal" {
                    MenuGlyph()
                } else {
                    Image(systemName: symbol)
                        .font(.system(size: symbol == "xmark" || symbol == "chevron.left" ? 17 : Theme.headerGlyph,
                                      weight: .regular))
                }
            }
                .foregroundStyle(active ? Theme.buttonPrimaryText : Theme.ink.opacity(0.92))
                .frame(width: Theme.headerButton, height: Theme.headerButton)
                .glassChrome(Circle(), tint: active ? Theme.buttonPrimary : nil)
                .contentShape(Circle())
        }
        .glassPressStyle()
        .accessibilityLabel(label)
        .accessibilityAddTraits(active ? .isSelected : [])
    }
}

extension View {
    /// Подложка кнопок шапки, как у Claude на iOS 26: системное «жидкое стекло», которое
    /// откликается на нажатие (растягивается и подсвечивается). На iOS 17–18 — прежний круг с каймой.
    /// `tint` — главная кнопка («Новая сессия»): стекло, окрашенное в цвет кнопки.
    @ViewBuilder
    func glassChrome<S: InsettableShape>(_ shape: S, tint: Color? = nil, interactive: Bool = true) -> some View {
        if #available(iOS 26.0, *) {
            let glass: Glass = tint.map { Glass.regular.tint($0) } ?? .regular
            self.glassEffect(interactive ? glass.interactive() : glass, in: shape)
        } else if let tint {
            self.background(tint, in: shape)
                .shadow(color: .black.opacity(0.25), radius: 10, y: 3)
        } else {
            self.background(Theme.surface, in: shape)
                .overlay(shape.strokeBorder(Theme.line))
        }
    }

    /// Нажатие стеклянной кнопки показывает само стекло; на старых iOS — прежнее сжатие.
    @ViewBuilder
    func glassPressStyle() -> some View {
        if #available(iOS 26.0, *) {
            self.buttonStyle(.plain)
        } else {
            self.buttonStyle(PressScaleStyle())
        }
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


extension View {
    /// Плавающая панель со штатным постепенным размытием прокручиваемого содержимого.
    /// safeAreaBar связывает эффект с самой прокруткой: отдельного Material поверх неё нет.
    /// Как и safeAreaInset, панель учитывает клавиатуру; контейнеры и .keyboard не игнорируем.
    /// `reach` — высота размытой полосы под шапкой (только iOS 26, верхний край): шапка тогда
    /// плавает поверх ленты отдельным слоем, а размытие захватывает лишь «остров» и `reach` pt под ним.
    /// Высоту шапки сверх `reach` экран добавляет к верхнему отступу своей ленты (`Theme.headerOverhang`).
    /// `blurDepth` — на сколько pt ниже безопасной зоны тянется прогрессивное размытие (`ProgressiveTopBlur`,
    /// 16.11.2026): в чате — чуть ниже строки состояния, в шторке — до низа шапки, как у Claude.
    @ViewBuilder
    func softEdgeBar<Bar: View>(edge: VerticalEdge, tint: Color, hasScrollContent: Bool = true,
                               reach: CGFloat? = nil, blurDepth: CGFloat? = nil,
                               @ViewBuilder content: () -> Bar) -> some View {
        // Верх — так же, как низ под капсулой (замечание пользователя 17.11.2026: «верх чата и шторки —
        // блюр, как сейчас внизу»): шапка целиком в safeAreaBar, системное размытие края прокрутки на всю
        // её высоту. Прежняя схема (полоса 10 pt + шапка отдельным слоем + `ProgressiveTopBlur` с
        // затемнением) давала светлую муть вместо размытия. `reach`/`blurDepth` больше не используются.
        if #available(iOS 26.0, *), hasScrollContent {
            self.safeAreaBar(edge: edge, spacing: 0, content: content)
                .scrollEdgeEffectStyle(.soft, for: edge == .top ? .top : .bottom)
        } else {
            // На iOS 17–18 нет scroll edge effect. Затухание в цвет текущего фона,
            // без Material и доступа к недокументированным слоям UIVisualEffectView.
            self.safeAreaInset(edge: edge, spacing: 0) {
                content()
                    .background(alignment: edge == .top ? .top : .bottom) {
                        if hasScrollContent {
                            Theme.fade(tint, from: edge == .top ? .top : .bottom)
                                .ignoresSafeArea(.container, edges: edge == .top ? .top : .bottom)
                                .allowsHitTesting(false)
                                .accessibilityHidden(true)
                        }
                    }
            }
        }
    }
}
