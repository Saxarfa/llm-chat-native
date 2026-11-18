import AVFoundation
import SwiftUI
import UIKit

/// Лента сообщений открытого чата. Открывается у последнего сообщения и, пока
/// пользователь не отлистал вверх, держится у низа во время живого ответа.
struct MessageFeed: View {
    @Environment(AppModel.self) private var model
    /// Низ ленты на экране или рядом — можно следовать за новым текстом.
    @State private var atBottom = true
    /// Сколько последних сообщений построено.
    @State private var shown = MessageFeed.page
    @State private var touch = TouchClock()
    @State private var scroll = ScrollHolder()
    /// Вход в готовый чат («Навстречу», выбран пользователем 18.11.2026): последние сообщения въезжают
    /// сверху вниз — вопросы справа, ответы слева. `entered` — въезд начат, `enterAnimated` — с движением
    /// (без него, если чат открылся прямо с идущим ответом: там вопрос поднимается от поля ввода).
    @State private var entered = false
    @State private var enterAnimated = false
    /// Очерёдность въезда: номер сообщения среди последних, сверху вниз. Считается один раз при входе.
    @State private var enterOrder: [String: Int] = [:]

    /// Сколько последних сообщений въезжает; остальные выше экрана и стоят на месте сразу.
    private static let enterCount = 6

    private static let bottomID = "feed-bottom"
    private static let space = "feed-space"
    private static let page = 30

    /// Сколько в ленте своих вопросов: по этому числу анимируется появление нового.
    private var questions: Int {
        model.thread.reduce(0) { $0 + ($1.isUser ? 1 : 0) }
    }

    private func follow(_ proxy: ScrollViewProxy) {
        guard atBottom, Date().timeIntervalSince(touch.last) > 0.3 else { return }
        proxy.scrollTo(Self.bottomID, anchor: .bottom)
    }

    /// Кнопка «вниз». Через сам UIScrollView: остановка инерции и анимированный переход
    /// к низу надёжно перебивают текущую прокрутку (SwiftUI scrollTo во время инерции терялся).
    private func jumpToBottom(_ proxy: ScrollViewProxy) {
        Haptics.tap()
        atBottom = true
        touch.jumpUntil = Date().addingTimeInterval(0.6)
        guard let view = scroll.view else {
            withAnimation(Theme.spring) { proxy.scrollTo(Self.bottomID, anchor: .bottom) }
            return
        }
        let inset = view.adjustedContentInset
        let bottom = max(-inset.top, view.contentSize.height - view.bounds.height + inset.bottom)
        view.setContentOffset(view.contentOffset, animated: false)
        view.setContentOffset(CGPoint(x: view.contentOffset.x, y: bottom), animated: true)
    }

    /// Что показывать: ленту открытого чата, а пока она не подставлена — копию из кэша.
    /// Так при переходе в другой чат сразу видна переписка, без мигания «загрузки».
    private var current: (state: AppModel.ThreadState, items: [FeedMessage]) {
        if model.threadChatID == model.activeChatID { return (model.threadState, model.thread) }
        if let id = model.activeChatID, let cached = model.threadCache[id] { return (.loaded, cached) }
        return (.loading, [])
    }

    var body: some View {
        let live = model.activeLive
        let snapshot = current
        let items = snapshot.items
        switch snapshot.state {
        case .idle, .loading:
            DelayedSpinner()
        case .failed(let message):
            FeedNotice(text: message, actionTitle: "Повторить") {
                Task { await model.loadThread() }
            }
        case .loaded:
            if items.isEmpty && live == nil {
                FeedNotice(text: "В этой сессии пока нет сообщений.", actionTitle: nil, action: {})
            } else {
                let visible = items.suffix(shown)
                let earlier = items.count - visible.count
                GeometryReader { box in
                    ScrollViewReader { proxy in
                        ScrollView {
                            // Обычный (не ленивый) столбец: у ленивого высота содержимого
                            // оценивается приблизительно, из-за чего низ ленты обрезался.
                            // Чтобы длинный чат не строился целиком, показываем последние
                            // сообщения, а более ранние — по кнопке.
                            VStack(alignment: .leading, spacing: 26) {
                                if earlier > 0 {
                                    Button("Показать более ранние (\(earlier))") {
                                        let anchor = visible.first?.id
                                        shown += Self.page
                                        DispatchQueue.main.async {
                                            if let anchor { proxy.scrollTo(anchor, anchor: .top) }
                                        }
                                    }
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(Theme.muted)
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .buttonStyle(PressScaleStyle())
                                }
                                ForEach(visible) { message in
                                    if message.isUser {
                                        UserMessageView(message: message, canEdit: live == nil)
                                            .id(message.id)
                                            // Вопрос поднимается от поля ввода на своё место.
                                            .transition(.asymmetric(
                                                insertion: .opacity.combined(with: .offset(y: 220)),
                                                removal: .identity))
                                            .modifier(FeedEntrance(entered: entered, animated: enterAnimated,
                                                                   order: enterOrder[message.id], fromRight: true))
                                    } else if message.rawID != live?.replacingID {
                                        // Перегенерируемый ответ на время заменяет живая строка.
                                        AssistantMessageView(message: message, canRegenerate: live == nil)
                                            .id(message.id)
                                            .transition(.identity)
                                            .modifier(FeedEntrance(entered: entered, animated: enterAnimated,
                                                                   order: enterOrder[message.id], fromRight: false))
                                    }
                                }
                                if let live {
                                    LiveAnswerView(live: live)
                                        .transition(.asymmetric(insertion: .opacity, removal: .identity))
                                } else if let last = items.last, !last.isUser {
                                    // Варианты продолжения — как на сайте, если они не выключены в его настройках.
                                    if !last.suggestions.isEmpty, (model.settings.shared["chatSuggestions"] as? Bool) != false,
                                       model.activeChat?.temporary != true {
                                        SuggestionsView(messageID: last.rawID, items: last.suggestions)
                                            .padding(.top, -8)
                                            .transition(.opacity)
                                    }
                                    // Как у Claude: 13 pt третичным цветом (#888781).
                                    Text("\(last.model.isEmpty ? "Модель" : ChatConfig.modelName(last.model, profiles: model.settings.modelProfiles)) — это ИИ, который может ошибаться.")
                                        .font(.system(size: 13))
                                        .foregroundStyle(Theme.subtle)
                                        .padding(.top, -10)
                                        .transition(.identity)
                                }
                                Color.clear
                                    .frame(height: 1)
                                    .background(GeometryReader { mark in
                                        Color.clear.preference(key: BottomEdgeKey.self,
                                                               value: mark.frame(in: .named(Self.space)).maxY)
                                    })
                                    .id(Self.bottomID)
                            }
                            .padding(.horizontal, 15)
                            .padding(.top, 20 + Theme.headerOverhang)
                            .padding(.bottom, 14)
                            .background(ScrollViewCatcher(holder: scroll))
                            // Короткий чат начинается сверху, а не прижимается к полю ввода.
                            .frame(minHeight: box.size.height, alignment: .top)
                            // Анимация — только когда добавился свой вопрос, а не при дописанном ответе.
                            .animation(Theme.spring, value: questions)
                            .onAppear {
                                guard !entered else { return }
                                // Въезд — только при входе в чат: при возврате в тот же чат из студии
                                // или «Недавних» лента создаётся заново, но сообщения стоят сразу.
                                let fresh = FeedEntry.lastChat != model.activeChatID
                                FeedEntry.lastChat = model.activeChatID
                                enterAnimated = fresh && live == nil && model.preview == nil
                                enterOrder = Dictionary(
                                    visible.suffix(Self.enterCount).enumerated().map { ($0.element.id, $0.offset) },
                                    uniquingKeysWith: { first, _ in first })
                                entered = true
                            }
                        }
                        .coordinateSpace(name: Self.space)
                        .defaultScrollAnchor(model.preview == .threadTop ? .top : .bottom)
                        .scrollDismissesKeyboard(.interactively)
                        .onPreferenceChange(BottomEdgeKey.self) { edge in
                            let near = edge - box.size.height < 80
                            // Пока лента едет вниз по кнопке, кнопка не возвращается на полпути.
                            if !near, Date() < touch.jumpUntil { return }
                            if near != atBottom { atBottom = near }
                        }
                        // Пока палец ведёт ленту, она не должна убегать к низу за новым текстом.
                        .simultaneousGesture(DragGesture(minimumDistance: 4).onChanged { _ in
                            touch.last = Date()
                        })
                        // Лента отлистана вверх — кнопка «вниз» над полем ввода, как у Claude.
                        // Это UIButton (стекло iOS 26): касание не забирает себе UIScrollView, пока
                        // лента ещё катится по инерции, — прежняя SwiftUI-кнопка срабатывала только после остановки.
                        .overlay(alignment: .bottom) {
                            if !atBottom {
                                FeedDownButton { jumpToBottom(proxy) }
                                    .frame(width: 40, height: 40)
                                    .padding(2)
                                    .padding(.bottom, 10)
                                    .transition(.opacity.combined(with: .scale(scale: 0.8)))
                            }
                        }
                        .animation(.easeOut(duration: 0.18), value: atBottom)
                        .onChange(of: live?.text.count) { follow(proxy) }
                        .onChange(of: live?.phase) { follow(proxy) }
                        .onChange(of: live?.arts.count) { follow(proxy) }
                        .onChange(of: live == nil) {
                            // Ответ дописан: под ним появляются кнопки — показать и их.
                            DispatchQueue.main.async { follow(proxy) }
                        }
                        .onChange(of: model.thread.count) {
                            // Свой новый вопрос всегда показываем, даже если лента была отлистана.
                            if model.thread.last?.isUser == true {
                                atBottom = true
                                withAnimation(Theme.spring) { proxy.scrollTo(Self.bottomID, anchor: .bottom) }
                            } else {
                                follow(proxy)
                            }
                        }
                    }
                }
            }
        }
    }
}

/// В какой чат вошли последним: по нему лента решает, играть ли въезд сообщений.
enum FeedEntry {
    static var lastChat: String?
}

/// Въезд сообщения при входе в готовый чат: сбоку на своё место, с задержкой по очереди `order`.
/// До входа скрыты все сообщения (очерёдность ещё не посчитана); `order == nil` — сообщение выше
/// экрана и встаёт на место сразу, без движения.
private struct FeedEntrance: ViewModifier {
    let entered: Bool
    let animated: Bool
    let order: Int?
    let fromRight: Bool

    func body(content: Content) -> some View {
        content
            .opacity(entered ? 1 : 0)
            .offset(x: entered ? 0 : (fromRight ? 28 : -28))
            .animation(animated && order != nil
                       ? .spring(response: 0.5, dampingFraction: 0.86).delay(0.12 + Double(order ?? 0) * 0.05)
                       : nil,
                       value: entered)
    }
}

/// Колёсико загрузки появляется не сразу: быстрый ответ сервера не мигает им.
private struct DelayedSpinner: View {
    @State private var visible = false

    var body: some View {
        ProgressView()
            .tint(Theme.muted)
            .opacity(visible ? 1 : 0)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .task {
                try? await Task.sleep(nanoseconds: 350_000_000)
                withAnimation(.easeOut(duration: 0.2)) { visible = true }
            }
    }
}

/// Время последнего движения пальца по ленте. Класс, а не `@State`-значение:
/// запись не должна перерисовывать ленту.
private final class TouchClock {
    var last = Date.distantPast
    /// До этого времени лента едет вниз по кнопке «вниз».
    var jumpUntil = Date.distantPast
}

/// UIScrollView ленты — для кнопки «вниз». Слабая ссылка: лента живёт, пока открыт чат.
final class ScrollHolder {
    weak var view: UIScrollView?
}

/// Невидимая подложка содержимого ленты: находит свой UIScrollView среди родителей.
struct ScrollViewCatcher: UIViewRepresentable {
    let holder: ScrollHolder

    func makeUIView(context: Context) -> CatcherView {
        let view = CatcherView()
        view.holder = holder
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ view: CatcherView, context: Context) {
        view.holder = holder
        view.attach()
    }

    final class CatcherView: UIView {
        weak var holder: ScrollHolder?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            attach()
        }

        func attach() {
            var parent = superview
            while let view = parent {
                if let scroll = view as? UIScrollView {
                    holder?.view = scroll
                    return
                }
                parent = view.superview
            }
        }
    }
}

/// Кнопка «К последнему сообщению» — настоящий UIButton со стеклом iOS 26 (на iOS 17–18 — круг
/// цвета поверхности). UIKit-кнопка получает касание даже во время инерции ленты.
struct FeedDownButton: UIViewRepresentable {
    let action: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(action: action) }

    func makeUIView(context: Context) -> UIButton {
        var config: UIButton.Configuration
        if #available(iOS 26.0, *) {
            config = .glass()
        } else {
            config = .filled()
            config.baseBackgroundColor = UIColor(Theme.surface)
            config.background.strokeColor = UIColor(Theme.line)
            config.background.strokeWidth = 1
        }
        config.cornerStyle = .capsule
        config.image = UIImage(systemName: "arrow.down",
                               withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .regular))
        config.baseForegroundColor = UIColor(Theme.ink)
        config.contentInsets = .zero
        let coordinator = context.coordinator
        let button = UIButton(configuration: config, primaryAction: UIAction { _ in coordinator.action() })
        button.accessibilityLabel = "К последнему сообщению"
        button.accessibilityIdentifier = "feed.down"
        return button
    }

    func updateUIView(_ button: UIButton, context: Context) {
        context.coordinator.action = action
    }

    final class Coordinator {
        var action: () -> Void
        init(action: @escaping () -> Void) { self.action = action }
    }
}

/// Положение нижнего края содержимого относительно видимой области ленты.
private struct BottomEdgeKey: PreferenceKey {
    static let defaultValue: CGFloat = .greatestFiniteMagnitude
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

/// Ответ, который пишется прямо сейчас: строка рассуждений («Атом» + «Размышляет») или строка этапа
/// (`SparkStatus`: «Атом» + короткая подпись, сменяется снизу вверх). Секунд нигде нет
/// (убраны по просьбе пользователя 16.11.2026).
private struct LiveAnswerView: View {
    @Environment(AppModel.self) private var model
    let live: AppModel.LiveState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !live.reasoning.isEmpty {
                // Одна строка, как «Thinking» у Claude: пока модель думает — «Атом» и «Размышляет»;
                // потом та же строка становится «<модель> · размышляла». Нажатие раскрывает шаги.
                ReasoningView(text: live.reasoning, modelName: model.activeModelName, spark: working)
            }
            if !live.blocks.isEmpty {
                MarkdownView(blocks: live.blocks)
            }
            ForEach(live.arts) { art in
                ArtView(art: art)
            }
            // Отдельная «Искра» не нужна, пока искра уже стоит в строке рассуждений (раньше статус был двойным).
            if (live.text.isEmpty || live.stopping) && !(working && !live.stopping) {
                SparkStatus(text: live.stopping ? "Останавливаю" : live.phase)
                    // Уходит сразу: растворяясь 0,3 с на прежнем месте, статус ложился поверх первых
                    // строк ответа (замечание 16.11.2026). Появляется — плавно.
                    .transition(.asymmetric(insertion: .opacity, removal: .identity))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(.easeOut(duration: 0.3), value: live.text.isEmpty)
        .animation(Theme.spring, value: working)
    }

    /// Модель сейчас рассуждает, и текст рассуждений уже идёт (его строка несёт «Атом»).
    private var working: Bool { live.isThinking && !live.reasoning.isEmpty && !live.stopping }
}

/// Строка статуса под ответом: «Атом» и короткая подпись этапа («Думаю», «Ищу в интернете», «Пишу ответ»).
/// Подписи — не сырые строки сервера, а `LiveStatus.label`; итоговые фразы («Поиск завершён») прежнюю подпись
/// не меняют. Каждая подпись держится не меньше `minDwell`, чтобы быстрые смены не мелькали, а сменялись
/// плавно снизу вверх (16.11.2026).
private struct SparkStatus: View {
    let text: String
    @State private var shown: String
    @State private var shownAt = Date.distantPast
    @State private var wanted: String?
    @State private var task: Task<Void, Never>?

    private static let minDwell: TimeInterval = 0.9

    init(text: String) {
        self.text = text
        _shown = State(initialValue: LiveStatus.label(text) ?? LiveStatus.fallback)
    }

    var body: some View {
        HStack(spacing: 7) {
            // Как строка размышлений: «Атом» с орбитами и волна по подписи.
            AtomIndicator(size: 20, orbits: true)
            WaveText(text: shown)
                .id(shown)
                .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity),
                                        removal: .move(edge: .top).combined(with: .opacity)))
        }
        .clipped()
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: shown)
        .frame(minHeight: 28)
        .accessibilityElement(children: .combine)
        .onChange(of: text) { _, new in update(new) }
        .onDisappear { task?.cancel() }
    }

    /// Новая подпись ждёт, пока прежняя не продержится `minDwell`; из нескольких быстрых остаётся последняя.
    private func update(_ phase: String) {
        guard let next = LiveStatus.label(phase) else { return }
        if next == shown {
            task?.cancel()
            wanted = nil
            return
        }
        wanted = next
        let wait = max(0, Self.minDwell - Date().timeIntervalSince(shownAt))
        task?.cancel()
        task = Task { @MainActor in
            if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
            guard !Task.isCancelled, let value = wanted else { return }
            shown = value
            shownAt = Date()
            wanted = nil
        }
    }
}

/// Индикатор рассуждения «Атом» (вариант A, выбран пользователем 16.11.2026 по макету): три точки
/// летят по наклонённым орбитам (0°, 60°, 120°) с разной скоростью и шлейфом из пяти точек,
/// в центре пульсирует ядро. Размеры считаются в сетке 28×28 и масштабируются под `size`.
///
/// `active: false` — «Атом» в покое (строка готовых размышлений, 18.11.2026): электронов нет, ядро не
/// пульсирует, кадры не идут. При смене `active` с true на false электроны за `collapse` секунд
/// ускоряются и стягиваются в ядро, затем ядро вспыхивает и от него расходится кольцо.
/// `orbits` — тонкие линии орбит; без них «Атом» в покое был бы одной точкой.
struct AtomIndicator: View {
    var size: CGFloat = 24
    var active = true
    var orbits = false

    /// Когда рассуждение закончилось (идёт завершающее движение).
    @State private var stoppedAt: Date?
    /// Завершающее движение доиграно — рисуется неподвижный «Атом», кадры остановлены.
    @State private var settled: Bool

    private static let tilts: [Double] = [0, 60, 120].map { $0 * .pi / 180 }
    private static let periods: [Double] = [1.5, 2.1, 2.8]
    /// Сколько секунд электроны стягиваются в ядро.
    static let collapse: Double = 0.32
    private static let finale: Double = 1.0

    init(size: CGFloat = 24, active: Bool = true, orbits: Bool = false) {
        self.size = size
        self.active = active
        self.orbits = orbits
        _settled = State(initialValue: !active)
    }

    var body: some View {
        TimelineView(.animation(paused: settled)) { context in
            let time = context.date.timeIntervalSinceReferenceDate
            // Секунды с конца рассуждения: nil — рассуждение идёт, .infinity — «Атом» в покое.
            let since: Double? = active ? nil : (settled ? .infinity : stoppedAt.map { context.date.timeIntervalSince($0) } ?? .infinity)
            Canvas { graphics, canvasSize in
                let unit = canvasSize.width / 28
                let center = CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2)
                // Доля радиуса орбиты у электронов: 1 — летят, 0 — стянулись в ядро.
                let spread: Double = since.map { max(0, 1 - $0 / Self.collapse) }.map { $0 * $0 } ?? 1
                // Стягиваясь, электроны ускоряются.
                let clock = time + min(since ?? 0, Self.collapse) * 2.5

                if orbits {
                    for tilt in Self.tilts {
                        let ellipse = Path(ellipseIn: CGRect(x: -11 * unit, y: -4.2 * unit, width: 22 * unit, height: 8.4 * unit))
                            .applying(CGAffineTransform(rotationAngle: tilt)
                                .concatenating(CGAffineTransform(translationX: center.x, y: center.y)))
                        graphics.stroke(ellipse, with: .color(Theme.muted.opacity(0.5)), lineWidth: 1)
                    }
                }
                if spread > 0.01 {
                    for orbit in 0..<3 {
                        let tilt = Self.tilts[orbit]
                        for step in 0..<5 {
                            let angle = (clock - Double(step) * 0.05) * 2 * .pi / Self.periods[orbit]
                            let x = 11 * spread * cos(angle)
                            let y = 4.2 * spread * sin(angle)
                            let dx = x * cos(tilt) - y * sin(tilt)
                            let dy = x * sin(tilt) + y * cos(tilt)
                            let radius = (2.1 - Double(step) * 0.32) * unit
                            let rect = CGRect(x: center.x + dx * unit - radius, y: center.y + dy * unit - radius,
                                              width: radius * 2, height: radius * 2)
                            let alpha = (1 - Double(step) * 0.2) * min(1, spread * 1.4)
                            graphics.fill(Path(ellipseIn: rect), with: .color(Theme.muted.opacity(alpha)))
                        }
                    }
                }
                // Вспышка: после стягивания ядро вздувается и опадает, кольцо расходится и гаснет.
                let flash: Double? = since.flatMap { value -> Double? in
                    let part = (value - Self.collapse) / 0.55
                    return part > 0 && part < 1 ? part : nil
                }
                if let flash {
                    let ring = (3 + 10 * flash) * unit
                    graphics.stroke(Path(ellipseIn: CGRect(x: center.x - ring, y: center.y - ring, width: ring * 2, height: ring * 2)),
                                    with: .color(Theme.ink.opacity((1 - flash) * 0.9)), lineWidth: 1)
                }
                let pulse = since == nil ? 0.5 * sin(time * 5) : 0
                let core = (1.8 + pulse) * (1 + 1.1 * sin(.pi * (flash ?? 0))) * unit
                graphics.fill(Path(ellipseIn: CGRect(x: center.x - core, y: center.y - core, width: core * 2, height: core * 2)),
                              with: .color(flash == nil ? Theme.muted : Theme.ink))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
        .onChange(of: active) { _, now in
            if now {
                stoppedAt = nil
                settled = false
            } else {
                let moment = Date()
                stoppedAt = moment
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: UInt64(Self.finale * 1_000_000_000))
                    if stoppedAt == moment { settled = true }
                }
            }
        }
    }
}

private struct FeedNotice: View {
    let text: String
    let actionTitle: String?
    let action: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text(text)
                .font(.system(size: 16))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            if let actionTitle {
                Button(actionTitle, action: action)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 20)
                    .frame(minHeight: 44)
                    .background(Theme.fill, in: Capsule())
                    .buttonStyle(PressScaleStyle())
            }
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Вопрос пользователя — пузырь справа.
private struct UserMessageView: View {
    @Environment(AppModel.self) private var model
    let message: FeedMessage
    let canEdit: Bool

    var body: some View {
        let images = message.attachments.filter { $0.kind == .image }
        let files = message.attachments.filter { $0.kind != .image }
        VStack(alignment: .trailing, spacing: 8) {
            if !images.isEmpty {
                AttachmentGrid(items: images)
            }
            if !files.isEmpty {
                VStack(alignment: .trailing, spacing: 6) {
                    ForEach(files) { file in
                        Label(file.name, systemImage: file.symbol)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 34)
                            .background(Theme.fill, in: Capsule())
                    }
                }
            }
            if !message.text.isEmpty {
                Text(message.text)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Theme.bubble, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .contextMenu {
                        Button {
                            UIPasteboard.general.string = message.text
                        } label: {
                            Label("Скопировать", systemImage: "doc.on.doc")
                        }
                        if canEdit {
                            Button {
                                model.editing = message
                            } label: {
                                Label("Изменить", systemImage: "pencil")
                            }
                            Button {
                                Task { await model.forkBranch(at: message) }
                            } label: {
                                Label("Новая ветка отсюда", systemImage: "arrow.triangle.branch")
                            }
                            Button(role: .destructive) {
                                model.pendingDelete = message
                            } label: {
                                Label("Удалить сообщение", systemImage: "trash")
                            }
                        }
                    }
            }
        }
        .padding(.leading, 44)
        .padding(.trailing, -3)
        .frame(maxWidth: .infinity, alignment: .trailing)
    }
}

/// Ответ модели — текст во всю ширину, без пузыря; снизу — действия.
private struct AssistantMessageView: View {
    @Environment(AppModel.self) private var model
    let message: FeedMessage
    let canRegenerate: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !message.reasoning.isEmpty {
                ReasoningView(text: message.reasoning,
                              modelName: message.model.isEmpty ? nil : ChatConfig.modelName(message.model, profiles: model.settings.modelProfiles))
            }
            if !message.blocks.isEmpty {
                MarkdownView(blocks: message.blocks)
            }
            ForEach(message.arts) { art in
                ArtView(art: art)
            }
            if !message.sources.isEmpty {
                SourcesButton(sources: message.sources)
            }
            if !message.text.isEmpty || !message.arts.isEmpty {
                // Как под ответом у Claude: скопировать, поделиться, прочитать вслух, ответить заново.
                HStack(spacing: 0) {
                    if !message.text.isEmpty {
                        CopyButton(text: message.text, label: "Скопировать ответ", compact: true)
                        ShareLink(item: message.text) {
                            AnswerIcon(symbol: "square.and.arrow.up")
                        }
                        .accessibilityLabel("Поделиться")
                        ReadAloudButton(id: message.id, text: message.text)
                    }
                    if canRegenerate {
                        Button {
                            Task { await model.regenerate(message) }
                        } label: {
                            AnswerIcon(symbol: "arrow.clockwise")
                        }
                        .buttonStyle(PressScaleStyle())
                        .disabled(model.branchBusy)
                        .accessibilityLabel("Ответить заново")
                    }
                    if message.variantCount > 1 {
                        VariantStepper(message: message, enabled: canRegenerate && !model.branchBusy)
                    }
                    if canRegenerate {
                        AnswerMoreMenu(message: message)
                    }
                }
                .padding(.leading, -7)
                .padding(.top, -8)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Значок в ряду под ответом.
private struct AnswerIcon: View {
    let symbol: String
    var active = false

    var body: some View {
        // Как у Claude: глиф ~15 pt вторичным цветом #96958D, шаг 32 pt.
        Image(systemName: symbol)
            .font(.system(size: 14.5, weight: .regular))
            .foregroundStyle(active ? Theme.accent : Theme.muted)
            // Зона нажатия 32×44 (было 29×38 — мимо легко промахнуться, аудит 13.11.2026).
            .frame(width: 32, height: 44)
            .contentShape(Rectangle())
    }
}

/// «Прочитать вслух»: голос iOS; повторное нажатие — стоп.
private struct ReadAloudButton: View {
    let id: String
    let text: String
    var body: some View {
        let reader = ReadAloud.shared
        let speaking = reader.speakingID == id
        Button {
            Haptics.tap()
            reader.toggle(id: id, text: text)
        } label: {
            AnswerIcon(symbol: speaking ? "stop.circle" : "play", active: speaking)
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(speaking ? "Остановить чтение" : "Прочитать вслух")
    }
}

/// Чтение ответа вслух. Одно на приложение: новый ответ останавливает предыдущий.
@MainActor
@Observable
final class ReadAloud: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = ReadAloud()

    private(set) var speakingID: String?
    @ObservationIgnored private let synthesizer = AVSpeechSynthesizer()

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func toggle(id: String, text: String) {
        let same = speakingID == id
        synthesizer.stopSpeaking(at: .immediate)
        speakingID = nil
        guard !same else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        let utterance = AVSpeechUtterance(string: Self.plain(text))
        utterance.voice = AVSpeechSynthesisVoice(language: "ru-RU")
        speakingID = id
        synthesizer.speak(utterance)
    }

    /// Без разметки Markdown: голос не должен читать звёздочки и решётки.
    nonisolated static func plain(_ text: String) -> String {
        var result = text
        for mark in ["```", "**", "__", "`", "#", "*", ">", "|"] {
            result = result.replacingOccurrences(of: mark, with: mark == "|" ? ", " : "")
        }
        return result
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.finished() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.finished() }
    }

    private func finished() {
        if !synthesizer.isSpeaking { speakingID = nil }
    }
}

/// «‹ 2 / 3 ›» — переключение сохранённых вариантов ответа.
private struct VariantStepper: View {
    @Environment(AppModel.self) private var model
    let message: FeedMessage
    let enabled: Bool

    var body: some View {
        HStack(spacing: 0) {
            step("chevron.left", label: "Предыдущий вариант", to: message.variantIndex - 1)
            Text("\(message.variantIndex + 1)/\(message.variantCount)")
                .font(.system(size: 12, weight: .medium).monospacedDigit())
                .foregroundStyle(Theme.muted)
                .accessibilityLabel("Вариант \(message.variantIndex + 1) из \(message.variantCount)")
            step("chevron.right", label: "Следующий вариант", to: message.variantIndex + 1)
        }
    }

    private func step(_ symbol: String, label: String, to index: Int) -> some View {
        let possible = index >= 0 && index < message.variantCount
        return Button {
            Task { await model.selectVariant(message, index: index) }
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(possible && enabled ? Theme.muted : Theme.subtle.opacity(0.5))
                .frame(width: 32, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!possible || !enabled)
        .accessibilityLabel(label)
    }
}

/// «…» под ответом: ветка от этого места и удаление.
private struct AnswerMoreMenu: View {
    @Environment(AppModel.self) private var model
    let message: FeedMessage

    var body: some View {
        Menu {
            if !message.model.isEmpty {
                Text("Ответила: " + ChatConfig.modelName(message.model, profiles: model.settings.modelProfiles))
            }
            Button {
                Task { await model.forkBranch(at: message) }
            } label: {
                Label("Новая ветка отсюда", systemImage: "arrow.triangle.branch")
            }
            Button(role: .destructive) {
                model.pendingDelete = message
            } label: {
                Label("Удалить ответ", systemImage: "trash")
            }
        } label: {
            AnswerIcon(symbol: "ellipsis")
        }
        .disabled(model.branchBusy)
        .accessibilityLabel("Ещё действия с ответом")
    }
}

/// Размышления модели — шапка ответа (вид выбран пользователем 18.11.2026 по макету): «Атом», подпись,
/// стрелка; свёрнуты, раскрываются по нажатию. Пока модель думает — электроны летят, по слову
/// «Размышляет» идёт волна. Когда рассуждение кончилось — электроны стягиваются в ядро, вспышка, и
/// снизу по буквам въезжает «<имя модели> · размышляла». У готовых ответов строка неподвижна.
/// Подпись не зависит от темы вопроса (просьба пользователя): только имя модели.
private struct ReasoningView: View {
    let text: String
    /// Имя ответившей модели; без него подпись — «Размышления».
    var modelName: String?
    /// Идёт рассуждение: «Атом» живой.
    var spark = false
    @State private var open = false
    /// Подпись «Размышляет» держится, пока электроны стягиваются, и сменяется на вспышке.
    @State private var thinkingLabel: Bool
    /// Рассуждение закончилось на глазах — итоговая подпись собирается по буквам.
    @State private var celebrate = false

    init(text: String, modelName: String? = nil, spark: Bool = false) {
        self.text = text
        self.modelName = modelName
        self.spark = spark
        _thinkingLabel = State(initialValue: spark)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Button {
                Haptics.tap()
                withAnimation(Theme.spring) { open.toggle() }
            } label: {
                HStack(spacing: 7) {
                    AtomIndicator(size: 20, active: spark, orbits: true)
                    Group {
                        if thinkingLabel {
                            WaveText(text: "Размышляет")
                                .transition(Self.swap)
                        } else {
                            ReasoningTitle(modelName: modelName, byLetter: celebrate)
                                .transition(Self.swap)
                        }
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Theme.subtle)
                        .rotationEffect(.degrees(open ? 90 : 0))
                }
                .foregroundStyle(Theme.muted)
                .clipped()
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel(thinkingLabel ? "Размышляет" : "Размышления")
            .accessibilityHint(open ? "Свернуть" : "Развернуть")

            if open {
                ReasoningTimeline(text: text, live: spark)
                    .transition(.opacity)
            }
        }
        // Строка — шапка ответа: прижата к тексту под ней (зона нажатия 44 pt остаётся).
        .padding(.top, -20)
        .padding(.bottom, open ? 4 : -12)
        .onChange(of: spark) { _, now in
            if now {
                thinkingLabel = true
                celebrate = false
            } else {
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: UInt64(AtomIndicator.collapse * 1_000_000_000))
                    celebrate = true
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { thinkingLabel = false }
                }
            }
        }
    }

    /// Подписи сменяются снизу вверх, как статусы ответа (`SparkStatus`).
    private static let swap = AnyTransition.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity),
                                                       removal: .move(edge: .top).combined(with: .opacity))
}

/// Слово с волной по буквам: каждая буква по очереди светлеет и чуть приподнимается.
/// Один `Text` с атрибутами на каждую букву (а не ряд отдельных букв): интервалы между буквами
/// те же, что у обычного текста, и ширина слова не меняется.
///
/// Это вид всех статусов работы в приложении (решение пользователя 18.11.2026: «все статусы — как
/// строка размышлений»): «Атом» с орбитами + слово с волной. Размер и цвет — у каждого места свои.
struct WaveText: View {
    let text: String
    var size: CGFloat = 15
    var weight: Font.Weight = .regular
    var color: Color = Theme.muted

    var body: some View {
        TimelineView(.animation) { context in
            let time = context.date.timeIntervalSinceReferenceDate
            Text(wave(time: time))
        }
        .frame(height: size + 5)
        .fixedSize()
        .accessibilityLabel(text)
    }

    private func wave(time: Double) -> AttributedString {
        var result = AttributedString()
        for (index, letter) in text.enumerated() {
            // Гребень волны проходит слово за 1,3 с; между буквами 0,07 с.
            let phase = ((time - Double(index) * 0.07).truncatingRemainder(dividingBy: 1.3) + 1.3)
                .truncatingRemainder(dividingBy: 1.3) / 1.3
            let lift = phase < 0.6 ? sin(.pi * phase / 0.6) : 0
            var piece = AttributedString(String(letter))
            piece.swiftUI.font = .system(size: size, weight: weight)
            piece.swiftUI.foregroundColor = color.opacity(0.45 + 0.55 * lift)
            piece.swiftUI.baselineOffset = size / 10 * lift
            result += piece
        }
        return result
    }
}

/// Итоговая подпись строки размышлений: «<имя модели> · размышляла» или «Размышления».
/// `byLetter` — собрать по буквам (рассуждение закончилось на глазах); иначе текст стоит сразу.
/// В обоих случаях это один `Text` с одной и той же обрезкой имени: когда живой ответ становится
/// сохранённым сообщением, подпись не меняет ни ширину, ни текст.
private struct ReasoningTitle: View {
    let modelName: String?
    let byLetter: Bool
    @State private var start = Date()
    @State private var done = false

    /// Шаг между буквами и время въезда одной буквы, секунды.
    private static let step = 0.022
    private static let rise = 0.3

    private var name: String? {
        guard let modelName, !modelName.isEmpty else { return nil }
        return modelName.count > 26 ? String(modelName.prefix(25)) + "…" : modelName
    }

    private var parts: [(text: String, weight: Font.Weight, color: Color)] {
        guard let name else { return [("Размышления", .regular, Theme.muted)] }
        return [(name, .medium, Theme.ink.opacity(0.82)), (" · ", .regular, Theme.subtle), ("размышляла", .regular, Theme.muted)]
    }

    private var length: Int { parts.reduce(0) { $0 + $1.text.count } }

    var body: some View {
        Group {
            if byLetter, !done {
                TimelineView(.animation) { context in
                    Text(title(elapsed: context.date.timeIntervalSince(start)))
                }
                .task {
                    let total = Double(length) * Self.step + Self.rise + 0.05
                    try? await Task.sleep(nanoseconds: UInt64(total * 1_000_000_000))
                    done = true
                }
            } else {
                Text(title(elapsed: nil))
            }
        }
        .lineLimit(1)
        .frame(height: 20)
    }

    /// Подпись; `elapsed` — секунды с начала сборки по буквам, `nil` — готовая.
    private func title(elapsed: Double?) -> AttributedString {
        var result = AttributedString()
        var index = 0
        for part in parts {
            for letter in part.text {
                var shown = 1.0
                if let elapsed {
                    let raw = min(max((elapsed - Double(index) * Self.step) / Self.rise, 0), 1)
                    shown = 1 - pow(1 - raw, 3)
                }
                var piece = AttributedString(String(letter))
                piece.swiftUI.font = .system(size: 15, weight: part.weight)
                piece.swiftUI.foregroundColor = part.color.opacity(shown)
                piece.swiftUI.baselineOffset = -7 * (1 - shown)
                result += piece
                index += 1
            }
        }
        return result
    }
}

/// Раскрытые рассуждения — шаги с заголовками на линии времени (вариант B из макета): у шага точка,
/// между точками тонкая линия, у идущего шага точка «дышит». Без абзацев и заголовков — обычный текст
/// с полосой слева, как раньше.
private struct ReasoningTimeline: View {
    let text: String
    let live: Bool
    /// Раскрытие: шаги появляются по очереди, линия растёт сверху вниз, точки выскакивают.
    @State private var appeared = false

    /// Задержка появления шага; дальние шаги не ждут дольше седьмого.
    private func delay(_ index: Int) -> Double { Double(min(index, 7)) * 0.07 }

    var body: some View {
        content
            .onAppear { appeared = true }
    }

    @ViewBuilder
    private var content: some View {
        let steps = ReasoningSteps.parse(text)
        if steps.count == 1, steps[0].heading == nil {
            Text(InlineMarkdown.render(steps[0].body, size: 15))
                .font(.system(size: 15))
                .foregroundStyle(Theme.muted)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, 14)
                .opacity(appeared ? 1 : 0)
                .overlay(alignment: .leading) {
                    Capsule().fill(Theme.fillActive).frame(width: 3)
                        .scaleEffect(y: appeared ? 1 : 0.01, anchor: .top)
                }
                // Полоса — под центром «Атома» (20 pt) в строке выше.
                .padding(.leading, 8.5)
                .animation(Theme.spring, value: appeared)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(steps) { step in
                    let last = step.id == steps.count - 1
                    VStack(alignment: .leading, spacing: 3) {
                        if let heading = step.heading {
                            Text(heading)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(Theme.ink)
                        }
                        if !step.body.isEmpty {
                            Text(InlineMarkdown.render(step.body, size: 15))
                                .font(.system(size: 15))
                                .foregroundStyle(Theme.muted)
                                .lineSpacing(4)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 24)
                    .opacity(appeared ? 1 : 0)
                    .offset(x: appeared ? 0 : -6)
                    // Отступ между шагами — внутри строки: линия ниже тянется до следующей точки.
                    .padding(.bottom, last ? 0 : 14)
                    // Точка и линия — поверх строки: так линия всегда ровно в высоту шага
                    // (в колонке рядом с текстом в ленте прокрутки она оставалась короткой).
                    .overlay(alignment: .topLeading) {
                        ZStack(alignment: .top) {
                            if !last {
                                Rectangle().fill(Theme.line)
                                    .frame(width: 1)
                                    .padding(.top, 12)
                                    .frame(maxHeight: .infinity, alignment: .top)
                                    .scaleEffect(y: appeared ? 1 : 0.01, anchor: .top)
                            }
                            Dot(pulsing: live && last)
                                .padding(.top, 2)
                                .scaleEffect(appeared ? 1 : 0.01)
                        }
                        .frame(width: 14)
                    }
                    .animation(.spring(response: 0.4, dampingFraction: 0.72).delay(delay(step.id)), value: appeared)
                }
            }
            // Точки — под центром «Атома» (20 pt) в строке выше.
            .padding(.leading, 3)
            .animation(Theme.spring, value: steps.count)
        }
    }

    /// Точка шага; у идущего шага плавно пульсирует.
    private struct Dot: View {
        let pulsing: Bool

        var body: some View {
            Group {
                if pulsing {
                    TimelineView(.animation) { context in
                        let time = context.date.timeIntervalSinceReferenceDate
                        Circle()
                            .fill(Theme.muted)
                            .frame(width: 7, height: 7)
                            .scaleEffect(1 + 0.4 * (0.5 + 0.5 * sin(time * 5)))
                    }
                } else {
                    Circle().fill(Theme.subtle).frame(width: 7, height: 7)
                }
            }
            .frame(width: 14, height: 9)
        }
    }
}
