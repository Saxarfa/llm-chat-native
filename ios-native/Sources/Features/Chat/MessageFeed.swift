import AVFoundation
import SwiftUI
import UIKit

/// Лента сообщений открытого чата. Открывается у последнего сообщения.
///
/// Отправка — как у Claude (решение пользователя 18.11.2026: «ответ идёт и тянет меня с собой… когда
/// генерация закончилась, меня выкинуло в другую часть чата»): свой вопрос встаёт к верху экрана, ответ
/// растёт под ним, а лента стоит. Пока ответ короче экрана, под ним держится пустое место (`room`), чтобы
/// вопрос мог стоять у верха. За новым текстом лента идёт, только если человек сам долистал до конца
/// ответа или нажал «вниз» (`following`).
struct MessageFeed: View {
    @Environment(AppModel.self) private var model
    /// Низ ленты на экране или рядом: кнопка «вниз» не нужна.
    @State private var atBottom = true
    /// Лента идёт за новым текстом. Меняет её только сам человек: долистал до конца ответа — да,
    /// ушёл выше — нет, нажал «вниз» — да. Свой отправленный вопрос — нет.
    @State private var following = true
    /// Сообщение над только что отправленным вопросом: по его низу считается, где стоит вопрос
    /// (сам вопрос въезжает снизу со сдвигом, и его рамка на это время врёт).
    @State private var pinBaseID: String?
    /// Низ этого сообщения в координатах ленты.
    @State private var pinBase: CGFloat?
    /// Вопрос ещё надо поднять к верху — как только посчитано место под ним.
    @State private var pinPending = false
    /// Низ последнего сообщения в координатах ленты.
    @State private var bottomEdge: CGFloat = 0
    /// Пустое место под ответом: без него короткий ответ не дал бы вопросу встать к верху.
    @State private var room: CGFloat = 0
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
    /// Отступы столбца ленты: между сообщениями, сверху (под шапкой) и снизу.
    private static let spacing: CGFloat = 26
    private static let topPad: CGFloat = 20 + Theme.headerOverhang
    private static let bottomPad: CGFloat = 14

    /// Сколько в ленте своих вопросов: по этому числу анимируется появление нового.
    private var questions: Int {
        model.thread.reduce(0) { $0 + ($1.isUser ? 1 : 0) }
    }

    /// Нижний край видимой части ленты (над полем ввода и клавиатурой) в координатах ленты.
    private func visibleBottom(_ view: UIScrollView) -> CGFloat {
        view.bounds.height - view.adjustedContentInset.bottom
    }

    /// Ленту ведёт палец или она катится после него.
    private func userScrolling(_ view: UIScrollView) -> Bool {
        view.isTracking || view.isDecelerating || Date().timeIntervalSince(touch.last) < 0.3
    }

    /// Свой вопрос отправлен: он поднимется к верху экрана, лента за ответом не пойдёт.
    private func pin(_ question: FeedMessage, in visible: [FeedMessage]) {
        following = false
        guard let index = visible.firstIndex(where: { $0.id == question.id }), index > 0 else {
            // Первый вопрос сессии и так стоит наверху.
            pinBaseID = nil
            pinBase = nil
            room = 0
            return
        }
        pinBaseID = visible[index - 1].id
        pinBase = nil
        pinPending = true
    }

    /// Место под ответом: сколько не хватает, чтобы вопрос мог стоять у верха экрана.
    /// Пока ответ растёт, место убывает на столько же — высота ленты не меняется и ничего не едет.
    private func layoutPin() {
        guard pinBaseID != nil, let base = pinBase, let view = scroll.view else {
            if room != 0 { room = 0 }
            return
        }
        let top = view.adjustedContentInset.top + Self.topPad
        let tail = bottomEdge - (base + Self.spacing)
        let need = max(0, (visibleBottom(view) - top) - tail - Self.bottomPad).rounded()
        if abs(need - room) > 0.5 { room = need }
        if pinPending {
            pinPending = false
            // После того как место под ответом попадёт в разметку.
            DispatchQueue.main.async { scrollToPin() }
        }
    }

    /// Поднимает вопрос к верху — туда, где стоит первое сообщение ленты.
    private func scrollToPin() {
        guard let view = scroll.view, let base = pinBase else { return }
        let top = view.adjustedContentInset.top + Self.topPad
        let shift = (base + Self.spacing) - top
        guard abs(shift) > 0.5 else { return }
        view.setContentOffset(view.contentOffset, animated: false)
        view.setContentOffset(CGPoint(x: view.contentOffset.x, y: view.contentOffset.y + shift), animated: true)
    }

    /// Низ ленты сдвинулся. Если человек сам у конца ответа — ведём ленту за текстом.
    private func bottomMoved(_ edge: CGFloat, box: CGSize) {
        bottomEdge = edge
        // Палец ведёт ленту или она катится после него: время для `userScrolling` — по самой прокрутке,
        // без отдельного жеста на ленте (он лишь дублировал `isTracking`).
        if let view = scroll.view, view.isTracking || view.isDecelerating { touch.last = Date() }
        refreshBottom(box: box)
        layoutPin()
        guard let view = scroll.view else { return }
        let gap = edge + Self.bottomPad - visibleBottom(view)
        if userScrolling(view) {
            // Решает только сам человек: у конца ответа — идём за текстом, выше или ниже — нет.
            if Date() >= touch.jumpUntil {
                let wanted = abs(gap) < 80
                if wanted != following { following = wanted }
            }
            return
        }
        // Во время перехода по «вниз» лента и так едет к концу — не перебиваем его анимацию.
        guard following, !pinPending, Date() >= touch.jumpUntil, gap > 0.5 else { return }
        view.setContentOffset(CGPoint(x: view.contentOffset.x, y: view.contentOffset.y + gap), animated: false)
    }

    /// Конец переписки на экране — кнопка «вниз» не нужна. Низ считается видимый — над полем ввода и
    /// клавиатурой: раньше бралась высота всей области, и с открытой клавиатурой конец ленты прятался под ней,
    /// а кнопки «вниз» не было (снимок ui-k5-thread-keyboard 0.16.4, аудит 20.11.2026).
    private func refreshBottom(box: CGSize) {
        let visible = scroll.view.map { visibleBottom($0) } ?? box.height
        let near = bottomEdge - visible < 80
        // Пока лента едет вниз по кнопке, кнопка не возвращается на полпути.
        if near || Date() >= touch.jumpUntil, near != atBottom { atBottom = near }
    }

    /// Низ переписки — низ последнего сообщения с отступом под ним — в координатах содержимого прокрутки.
    /// Считается по самому UIKit (подложка содержимого `ScrollViewCatcher`): запомненный из SwiftUI низ ленты
    /// (`bottomEdge`) отстаёт, пока лента едет, и при двух изменениях подряд (карточка ввода, затем клавиатура)
    /// лента не доезжала до конца (UI-тест сборки 0.16.5 (44), run 44641843961).
    private func contentEnd(_ view: UIScrollView) -> CGFloat? {
        guard let content = scroll.content, content.isDescendant(of: view) else { return nil }
        return content.convert(content.bounds, to: view).maxY - room
    }

    /// Видимый низ ленты поднялся или опустился: открылась клавиатура, раскрылась карточка ввода и обратно.
    /// Если конец переписки был на экране, он остаётся над полем ввода (как у Claude); если человек читал
    /// выше — лента стоит, а над полем появляется «вниз». `old`, `new` — высота видимой части до и после.
    private func visibleChanged(from old: CGFloat, to new: CGFloat, box: CGSize) {
        guard let view = scroll.view, let end = contentEnd(view) else {
            layoutPin()
            refreshBottom(box: box)
            return
        }
        let bottom = visibleBottom(view)
        let shrink = old - new
        // Был ли конец на экране до изменения: видимый низ тогда был ниже на `shrink`; порог — как у «вниз».
        let wasAtEnd = end - view.contentOffset.y - (bottom + shrink) < 80
        let target = end - bottom
        guard shrink > 0.5, wasAtEnd, !view.isTracking, !view.isDecelerating,
              target > view.contentOffset.y + 0.5 else {
            layoutPin()
            refreshBottom(box: box)
            return
        }
        // Смещение меняется сразу, а движется анимацией: следующее изменение (клавиатура после карточки)
        // считается уже от нового места.
        UIView.animate(withDuration: 0.3, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction, .curveEaseOut]) {
            view.contentOffset = CGPoint(x: view.contentOffset.x, y: target)
        }
        if !atBottom { atBottom = true }
        layoutPin()
    }

    /// Кнопка «вниз». Через сам UIScrollView: остановка инерции и анимированный переход
    /// к низу надёжно перебивают текущую прокрутку (SwiftUI scrollTo во время инерции терялся).
    private func jumpToBottom(_ proxy: ScrollViewProxy) {
        Haptics.tap()
        atBottom = true
        following = true
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
        // Дописанный ответ стоит на месте живого, пока лента не получит сохранённое сообщение.
        let shownLive = live ?? model.activeSettling
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
            if items.isEmpty && shownLive == nil {
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
                            VStack(alignment: .leading, spacing: Self.spacing) {
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
                                            .modifier(PinMark(active: message.id == pinBaseID, space: Self.space))
                                    } else if message.rawID != shownLive?.replacingID {
                                        // Перегенерируемый ответ на время заменяет живая строка.
                                        AssistantMessageView(message: message, canRegenerate: live == nil)
                                            .id(message.id)
                                            .transition(.identity)
                                            .modifier(FeedEntrance(entered: entered, animated: enterAnimated,
                                                                   order: enterOrder[message.id], fromRight: false))
                                            .modifier(PinMark(active: message.id == pinBaseID, space: Self.space))
                                    }
                                }
                                if let shownLive {
                                    // Та же ветка и для дописанного ответа: строка не пересоздаётся, раскрытые
                                    // размышления не сворачиваются.
                                    LiveAnswerView(live: shownLive, done: live == nil)
                                        .transition(.asymmetric(insertion: .opacity, removal: .identity))
                                } else if let last = items.last, !last.isUser {
                                    // Варианты продолжения — как на сайте, если они не выключены в его настройках.
                                    if !last.suggestions.isEmpty, (model.settings.shared["chatSuggestions"] as? Bool) != false,
                                       model.activeChat?.temporary != true {
                                        SuggestionsView(messageID: last.rawID, items: last.suggestions)
                                            .padding(.top, -8)
                                            .transition(.opacity)
                                    }
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
                            .padding(.top, Self.topPad)
                            // Под ответом — место, чтобы свой вопрос мог встать к верху экрана (`room`).
                            .padding(.bottom, Self.bottomPad + room)
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
                                if model.preview == .threadTop { following = false }
                            }
                        }
                        .coordinateSpace(name: Self.space)
                        // Только при открытии: «держать низ» при любом росте ленты тянуло читающего
                        // за ответом (так `defaultScrollAnchor` без роли ведёт себя с iOS 18).
                        .modifier(InitialScrollAnchor(anchor: model.preview == .threadTop ? .top : .bottom))
                        .scrollDismissesKeyboard(.interactively)
                        // Замыкания `onPreferenceChange` не привязаны к главному потоку, а вызываются на нём:
                        // `assumeIsolated` — чтобы звать методы ленты без предупреждений Swift 6.
                        .onPreferenceChange(BottomEdgeKey.self) { [size = box.size] edge in
                            MainActor.assumeIsolated { bottomMoved(edge, box: size) }
                        }
                        .onPreferenceChange(PinBaseKey.self) { base in
                            MainActor.assumeIsolated {
                                pinBase = base
                                layoutPin()
                            }
                        }
                        // Клавиатура или раскрытая карточка ввода подняли видимый низ: конец переписки остаётся
                        // над полем ввода. Следующим тактом — когда UIScrollView уже получил новые отступы.
                        .onChange(of: box.size.height - box.safeAreaInsets.bottom) { old, new in
                            let size = box.size
                            DispatchQueue.main.async { visibleChanged(from: old, to: new, box: size) }
                        }
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
                        // За текстом лента идёт сама — по сдвигу низа (`bottomMoved`), а не по каждому куску.
                        .onChange(of: model.thread.count) {
                            // Свой новый вопрос — к верху экрана, даже если лента была отлистана.
                            if let last = model.thread.last, last.isUser {
                                pin(last, in: Array(visible))
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
struct DelayedSpinner: View {
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

/// UIScrollView ленты — для кнопки «вниз» — и подложка её содержимого (по ней считается низ переписки,
/// `MessageFeed.contentEnd`). Слабые ссылки: лента живёт, пока открыт чат.
final class ScrollHolder {
    weak var view: UIScrollView?
    weak var content: UIView?
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
            holder?.content = self
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

/// Низ сообщения над только что отправленным вопросом (`MessageFeed.pinBaseID`) в координатах ленты.
private struct PinBaseKey: PreferenceKey {
    static let defaultValue: CGFloat? = nil
    static func reduce(value: inout CGFloat?, nextValue: () -> CGFloat?) {
        value = value ?? nextValue()
    }
}

/// Отмечает сообщение, по низу которого лента ставит свой вопрос к верху экрана.
private struct PinMark: ViewModifier {
    let active: Bool
    let space: String

    func body(content: Content) -> some View {
        content.background {
            if active {
                GeometryReader { mark in
                    Color.clear.preference(key: PinBaseKey.self, value: mark.frame(in: .named(space)).maxY)
                }
            }
        }
    }
}

/// Где лента открывается. С iOS 18 — только при открытии (`.initialOffset`): без роли
/// `defaultScrollAnchor(.bottom)` ещё и держит низ при каждом росте содержимого.
private struct InitialScrollAnchor: ViewModifier {
    let anchor: UnitPoint

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.defaultScrollAnchor(anchor, for: .initialOffset)
        } else {
            content.defaultScrollAnchor(anchor)
        }
    }
}

/// Раскрытые строки размышлений. Живой ответ и сменившее его сохранённое сообщение — разные виды,
/// но для глаза одна строка: раскрытая во время ответа остаётся раскрытой и после.
enum ReasoningOpen {
    static var keys: Set<String> = []

    static func liveKey(_ chat: String) -> String { "live:" + chat }

    /// Живой ответ сменился сообщением `message` (nil — сообщения нет или это другой ответ).
    static func handOver(chat: String, to message: String?) {
        guard keys.remove(liveKey(chat)) != nil, let message else { return }
        keys.insert(message)
    }
}

/// Ответ, который пишется прямо сейчас. Ожидание и первые рассуждения занимают одну шапку.
private struct LiveAnswerView: View {
    @Environment(AppModel.self) private var model
    let live: AppModel.LiveState
    /// Ответ уже дописан и ждёт сохранённое сообщение (`AppModel.settling`): статусов нет.
    var done = false

    var body: some View {
        let phase = !done && !working && (live.text.isEmpty || live.stopping)
            ? (live.stopping ? "Останавливаю" : live.phase) : nil
        let headerPhase = live.reasoning.isEmpty && live.text.isEmpty ? phase : nil
        VStack(alignment: .leading, spacing: 12) {
            if headerPhase != nil || !live.reasoning.isEmpty {
                ReasoningView(text: live.reasoning, modelName: model.activeModelName, spark: working, phase: headerPhase,
                              memoryKey: model.activeChatID.map(ReasoningOpen.liveKey))
                    .transition(.identity)
            }
            if !live.blocks.isEmpty {
                MarkdownView(blocks: live.blocks)
            }
            ForEach(live.arts) { art in
                ArtView(art: art)
            }
            // После первых рассуждений общий этап «Думаю» уже пройден. Конкретные этапы
            // (например, поиск или остановка) по-прежнему видны под содержимым.
            if let phase, headerPhase == nil,
               live.reasoning.isEmpty || LiveStatus.label(phase) != LiveStatus.fallback {
                HStack(spacing: 7) {
                    AtomIndicator(size: 20, orbits: true)
                    LivePhaseLabel(phase: phase)
                }
                .frame(minHeight: 28)
                .accessibilityElement(children: .combine)
                .transition(.asymmetric(insertion: .opacity, removal: .identity))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(.easeOut(duration: 0.3), value: live.text.isEmpty)
    }

    /// Модель сейчас рассуждает, и текст рассуждений уже идёт (его строка несёт «Атом»).
    private var working: Bool { live.isThinking && !live.reasoning.isEmpty && !live.stopping }
}

/// Серверные этапы сменяются с выдержкой. При появлении рассуждений подпись меняется в тот же кадр.
private struct LivePhaseLabel: View {
    /// nil — уже показываем рассуждения.
    let phase: String?
    @State private var shown: String
    @State private var shownAt = Date.distantPast
    @State private var task: Task<Void, Never>?

    private static let minDwell: TimeInterval = 0.9

    init(phase: String?) {
        self.phase = phase
        _shown = State(initialValue: phase.flatMap(LiveStatus.label) ?? LiveStatus.fallback)
    }

    var body: some View {
        let label = phase == nil ? "Размышляет" : shown
        WaveText(text: label)
            .id(label)
            .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity), removal: .identity))
            .clipped()
            .animation(phase == nil ? nil : .spring(response: 0.35, dampingFraction: 0.85), value: label)
            .onChange(of: phase) { _, new in update(new) }
            .onDisappear { task?.cancel() }
    }

    /// Новая подпись ждёт, пока прежняя не продержится `minDwell`; из нескольких быстрых остаётся последняя.
    private func update(_ phase: String?) {
        guard let phase else {
            task?.cancel()
            return
        }
        guard let next = LiveStatus.label(phase) else { return }
        task?.cancel()
        guard next != shown else { return }
        let wait = max(0, Self.minDwell - Date().timeIntervalSince(shownAt))
        task = Task { @MainActor in
            if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
            guard !Task.isCancelled else { return }
            shown = next
            shownAt = Date()
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
    /// «Атом» не видно (закрытая шторка) — кадры не идут.
    @Environment(\.motionPaused) private var motionPaused

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
        // 60 кадров в секунду: на экране 120 Гц точки летели бы с той же скоростью, а работы вдвое больше.
        TimelineView(.animation(minimumInterval: 1.0 / 60, paused: settled || motionPaused)) { context in
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
                              modelName: message.model.isEmpty ? nil : ChatConfig.modelName(message.model, profiles: model.settings.modelProfiles),
                              memoryKey: message.id)
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
                // Лента едет за пальцем вместе со шторкой, и палец, начавший свайп на кнопке, отпускается
                // на ней же — поэтому каждая кнопка ряда спрашивает `DrawerSwipe.blocksTaps`
                // (замечание 18.11.2026: двигаю шторку, зажав кнопку под ответом, — она нажимается).
                HStack(spacing: 0) {
                    if !message.text.isEmpty {
                        CopyButton(text: message.text, label: "Скопировать ответ", compact: true)
                        // Кнопка, а не ShareLink: у ShareLink нет своего действия, где проверить свайп.
                        Button {
                            guard !DrawerSwipe.blocksTaps else { return }
                            Haptics.tap()
                            ChatShare.present(message.text)
                        } label: {
                            AnswerIcon(symbol: "square.and.arrow.up")
                        }
                        .buttonStyle(PressScaleStyle())
                        .accessibilityLabel("Поделиться")
                        ReadAloudButton(id: message.id, text: message.text)
                    }
                    if canRegenerate {
                        Button {
                            guard !DrawerSwipe.blocksTaps else { return }
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
            guard !DrawerSwipe.blocksTaps else { return }
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
            guard !DrawerSwipe.blocksTaps else { return }
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
    @Environment(\.drawerSwiping) private var drawerSwiping
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
        // Меню открывается системой на отрыве пальца, без действия, где проверить свайп, — поэтому
        // пока шторку ведут или она доезжает, «⋯» выключено.
        .disabled(model.branchBusy || drawerSwiping)
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
    /// Начальный этап ответа до первого фрагмента рассуждений.
    let phase: String?
    /// Ключ в `ReasoningOpen`: раскрытая строка остаётся раскрытой, когда живой ответ сменяется сообщением.
    var memoryKey: String?
    @State private var open: Bool
    /// Подпись «Размышляет» держится, пока электроны стягиваются, и сменяется на вспышке.
    @State private var thinkingLabel: Bool
    /// Рассуждение закончилось на глазах — итоговая подпись собирается по буквам.
    @State private var celebrate = false

    init(text: String, modelName: String? = nil, spark: Bool = false, phase: String? = nil, memoryKey: String? = nil) {
        self.text = text
        self.modelName = modelName
        self.spark = spark
        self.phase = phase
        self.memoryKey = memoryKey
        _open = State(initialValue: memoryKey.map { ReasoningOpen.keys.contains($0) } ?? false)
        _thinkingLabel = State(initialValue: spark)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Button {
                guard !text.isEmpty, !DrawerSwipe.blocksTaps else { return }
                Haptics.tap()
                withAnimation(Theme.spring) { open.toggle() }
                if let memoryKey {
                    if open { ReasoningOpen.keys.insert(memoryKey) } else { ReasoningOpen.keys.remove(memoryKey) }
                }
            } label: {
                HStack(spacing: 7) {
                    AtomIndicator(size: 20, active: phase != nil || spark, orbits: true)
                    Group {
                        if phase != nil || spark || thinkingLabel {
                            LivePhaseLabel(phase: phase)
                                .transition(Self.swap)
                        } else {
                            ReasoningTitle(modelName: modelName, byLetter: celebrate)
                                .accessibilityLabel("Размышления")
                                .transition(Self.swap)
                        }
                    }
                    if !text.isEmpty {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Theme.subtle)
                            .rotationEffect(.degrees(open ? 90 : 0))
                            .accessibilityHidden(true)
                    }
                }
                .foregroundStyle(Theme.muted)
                .clipped()
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .allowsHitTesting(!text.isEmpty)
            .accessibilityRemoveTraits(text.isEmpty ? .isButton : [])
            .accessibilityHint(text.isEmpty ? "" : (open ? "Свернуть" : "Развернуть"))

            if open && !text.isEmpty {
                ReasoningTimeline(text: text, live: spark)
                    .transition(.opacity)
            }
        }
        // Строка — шапка ответа: прижата к тексту под ней (зона нажатия 44 pt остаётся).
        .padding(.top, -20)
        .padding(.bottom, open && !text.isEmpty ? 4 : -12)
        .task(id: spark) {
            if spark {
                thinkingLabel = true
                celebrate = false
            } else if thinkingLabel {
                try? await Task.sleep(nanoseconds: UInt64(AtomIndicator.collapse * 1_000_000_000))
                guard !Task.isCancelled else { return }
                celebrate = true
                withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { thinkingLabel = false }
            }
        }
    }

    /// Рассуждение закончилось: появляется итоговая подпись.
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
    /// Волну не видно (закрытая шторка) — кадры не идут.
    @Environment(\.motionPaused) private var motionPaused

    var body: some View {
        // 30 кадров в секунду хватает волне (гребень проходит слово за 1,3 с); на экране 120 Гц она
        // пересчитывалась вчетверо чаще (аудит 20.11.2026).
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: motionPaused)) { context in
            let time = context.date.timeIntervalSinceReferenceDate
            if #available(iOS 18.0, *) {
                // Текст раскладывается один раз, а каждый кадр буквы только рисуются со своим подъёмом и
                // прозрачностью (`WaveRenderer`). Прежняя строка с атрибутами на каждую букву раскладывалась заново.
                Text(text)
                    .font(.system(size: size, weight: weight))
                    .foregroundStyle(color)
                    .textRenderer(WaveRenderer(time: time, lift: size / 10))
            } else {
                Text(wave(time: time))
            }
        }
        .frame(height: size + 5)
        .fixedSize()
        .accessibilityLabel(text)
    }

    /// Подъём буквы `index` в момент `time`, 0…1: гребень волны проходит слово за 1,3 с, между буквами 0,07 с.
    /// Без привязки к главному потоку: её зовёт и `WaveRenderer` при отрисовке.
    nonisolated static func rise(time: Double, index: Int) -> Double {
        let phase = ((time - Double(index) * 0.07).truncatingRemainder(dividingBy: 1.3) + 1.3)
            .truncatingRemainder(dividingBy: 1.3) / 1.3
        return phase < 0.6 ? sin(.pi * phase / 0.6) : 0
    }

    /// iOS 17: строка с атрибутами на каждую букву.
    private func wave(time: Double) -> AttributedString {
        var result = AttributedString()
        for (index, letter) in text.enumerated() {
            let lift = Self.rise(time: time, index: index)
            var piece = AttributedString(String(letter))
            piece.swiftUI.font = .system(size: size, weight: weight)
            piece.swiftUI.foregroundColor = color.opacity(0.45 + 0.55 * lift)
            piece.swiftUI.baselineOffset = size / 10 * lift
            result += piece
        }
        return result
    }
}

/// Волна по буквам при отрисовке уже разложенного текста (iOS 18+): буква светлеет и чуть поднимается.
@available(iOS 18.0, *)
private struct WaveRenderer: TextRenderer {
    let time: Double
    /// Наибольший подъём буквы, pt.
    let lift: CGFloat

    var displayPadding: EdgeInsets { EdgeInsets(top: lift, leading: 0, bottom: 0, trailing: 0) }

    func draw(layout: Text.Layout, in context: inout GraphicsContext) {
        var index = 0
        for line in layout {
            for run in line {
                for glyph in run {
                    let rise = WaveText.rise(time: time, index: index)
                    var copy = context
                    copy.opacity = 0.45 + 0.55 * rise
                    copy.translateBy(x: 0, y: -lift * rise)
                    copy.draw(glyph)
                    index += 1
                }
            }
        }
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
                TimelineView(.animation(minimumInterval: 1.0 / 60)) { context in
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
        @Environment(\.motionPaused) private var motionPaused

        var body: some View {
            Group {
                if pulsing {
                    TimelineView(.animation(minimumInterval: 1.0 / 30, paused: motionPaused)) { context in
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
