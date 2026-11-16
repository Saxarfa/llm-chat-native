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
                                    } else if message.rawID != live?.replacingID {
                                        // Перегенерируемый ответ на время заменяет живая строка.
                                        AssistantMessageView(message: message, canRegenerate: live == nil)
                                            .id(message.id)
                                            .transition(.identity)
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
    let live: AppModel.LiveState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !live.reasoning.isEmpty {
                // Одна строка, как «Thinking» у Claude: пока модель думает — «Атом» и «Размышляет»;
                // потом та же строка становится «Размышления». Нажатие раскрывает текст рассуждений.
                ReasoningView(text: live.reasoning, title: working ? "Размышляет" : "Размышления", spark: working)
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
        HStack(spacing: 9) {
            AtomIndicator(size: 20)
            Text(shown)
                .font(.system(size: 15))
                .foregroundStyle(Theme.muted)
                .lineLimit(2)
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
struct AtomIndicator: View {
    var size: CGFloat = 24

    private static let tilts: [Double] = [0, 60, 120].map { $0 * .pi / 180 }
    private static let periods: [Double] = [1.5, 2.1, 2.8]

    var body: some View {
        TimelineView(.animation) { context in
            let time = context.date.timeIntervalSinceReferenceDate
            Canvas { graphics, canvasSize in
                let unit = canvasSize.width / 28
                let center = CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2)
                for orbit in 0..<3 {
                    let tilt = Self.tilts[orbit]
                    for step in 0..<5 {
                        let angle = (time - Double(step) * 0.05) * 2 * .pi / Self.periods[orbit]
                        let x = 11 * cos(angle)
                        let y = 4.2 * sin(angle)
                        let dx = x * cos(tilt) - y * sin(tilt)
                        let dy = x * sin(tilt) + y * cos(tilt)
                        let radius = (2.1 - Double(step) * 0.32) * unit
                        let rect = CGRect(x: center.x + dx * unit - radius, y: center.y + dy * unit - radius,
                                          width: radius * 2, height: radius * 2)
                        graphics.fill(Path(ellipseIn: rect), with: .color(Theme.muted.opacity(1 - Double(step) * 0.2)))
                    }
                }
                let core = (1.8 + 0.5 * sin(time * 5)) * unit
                graphics.fill(Path(ellipseIn: CGRect(x: center.x - core, y: center.y - core, width: core * 2, height: core * 2)),
                              with: .color(Theme.muted))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
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
                ReasoningView(text: message.reasoning)
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

/// Размышления модели: свёрнуты, раскрываются по нажатию.
private struct ReasoningView: View {
    let text: String
    var title = "Размышления"
    /// Идёт рассуждение: слева живой «Атом».
    var spark = false
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                Haptics.tap()
                withAnimation(Theme.spring) { open.toggle() }
            } label: {
                HStack(spacing: 6) {
                    if spark {
                        AtomIndicator()
                            .padding(.trailing, 2)
                            .transition(.opacity.combined(with: .scale(scale: 0.6)))
                    }
                    Text(title)
                        .font(.system(size: 15))
                        .id(title)
                        .transition(.opacity)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .rotationEffect(.degrees(open ? 90 : 0))
                }
                .foregroundStyle(Theme.muted)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityHint(open ? "Свернуть" : "Развернуть")

            if open {
                ReasoningTimeline(text: text, live: spark)
                    .transition(.opacity)
            }
        }
        .padding(.top, -10)
    }
}

/// Раскрытые рассуждения — шаги с заголовками на линии времени (вариант B из макета): у шага точка,
/// между точками тонкая линия, у идущего шага точка «дышит». Без абзацев и заголовков — обычный текст
/// с полосой слева, как раньше.
private struct ReasoningTimeline: View {
    let text: String
    let live: Bool

    var body: some View {
        let steps = ReasoningSteps.parse(text)
        if steps.count == 1, steps[0].heading == nil {
            Text(InlineMarkdown.render(steps[0].body, size: 15))
                .font(.system(size: 15))
                .foregroundStyle(Theme.muted)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, 14)
                .overlay(alignment: .leading) {
                    Capsule().fill(Theme.fillActive).frame(width: 3)
                }
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
                            }
                            Dot(pulsing: live && last)
                                .padding(.top, 2)
                        }
                        .frame(width: 14)
                    }
                }
            }
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
