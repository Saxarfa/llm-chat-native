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
                FeedNotice(text: "В этом чате пока нет сообщений.", actionTitle: nil, action: {})
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
                                    Text("\(last.model.isEmpty ? "Модель" : ChatConfig.modelName(last.model, profiles: model.settings.modelProfiles)) — это ИИ, который может ошибаться.")
                                        .font(.system(size: 12))
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
                            .padding(.top, 20)
                            .padding(.bottom, 14)
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
                            if near != atBottom { atBottom = near }
                        }
                        // Пока палец ведёт ленту, она не должна убегать к низу за новым текстом.
                        .simultaneousGesture(DragGesture(minimumDistance: 4).onChanged { _ in
                            touch.last = Date()
                        })
                        // Лента отлистана вверх — кнопка «вниз» над полем ввода, как у Claude.
                        .overlay(alignment: .bottom) {
                            if !atBottom {
                                Button {
                                    Haptics.tap()
                                    atBottom = true
                                    withAnimation(Theme.spring) { proxy.scrollTo(Self.bottomID, anchor: .bottom) }
                                } label: {
                                    Image(systemName: "arrow.down")
                                        .font(.system(size: 14, weight: .regular))
                                        .foregroundStyle(Theme.ink.opacity(0.82))
                                        .frame(width: 34, height: 34)
                                        .background(Theme.surface, in: Circle())
                                        .overlay(Circle().strokeBorder(Theme.line))
                                        .shadow(color: .black.opacity(0.22), radius: 8, y: 2)
                                        .frame(width: 44, height: 44)
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(PressScaleStyle())
                                .padding(.bottom, 4)
                                .transition(.opacity.combined(with: .scale(scale: 0.8)))
                                .accessibilityLabel("К последнему сообщению")
                                .accessibilityIdentifier("feed.down")
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
}

/// Положение нижнего края содержимого относительно видимой области ленты.
private struct BottomEdgeKey: PreferenceKey {
    static let defaultValue: CGFloat = .greatestFiniteMagnitude
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

/// Ответ, который пишется прямо сейчас. Статус — вариант «Искра» (выбран пользователем
/// 13.11.2026): коралловая искра вращается и «дышит», подпись этапа сменяется снизу вверх,
/// через 2 с рядом идёт счётчик секунд; когда пошёл текст, статус сворачивается в «Думал N с».
private struct LiveAnswerView: View {
    let live: AppModel.LiveState
    @State private var started = Date()
    /// Сколько секунд модель готовилась до первого слова ответа.
    @State private var thought: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !live.reasoning.isEmpty {
                ReasoningView(text: live.reasoning, title: live.isThinking ? "Размышляет…"
                              : thought.map { "Думал \($0) с" } ?? "Размышления")
            } else if let thought, thought >= 2, !live.text.isEmpty {
                Text("Думал \(thought) с")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .padding(.top, -6)
                    .transition(.opacity)
            }
            if !live.blocks.isEmpty {
                MarkdownView(blocks: live.blocks)
            }
            ForEach(live.arts) { art in
                ArtView(art: art)
            }
            if live.text.isEmpty || live.stopping {
                SparkStatus(text: live.stopping ? "Останавливаю" : live.phase, started: started)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(.easeOut(duration: 0.3), value: live.text.isEmpty)
        .onChange(of: live.text.isEmpty) { _, empty in
            if !empty, thought == nil { thought = max(0, Int(Date().timeIntervalSince(started).rounded())) }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Строка статуса «Искра»: искра, подпись этапа и (после 2 с) секунды ожидания.
private struct SparkStatus: View {
    let text: String
    let started: Date

    /// «Ищу в интернете…» → «Ищу в интернете»: многоточие заменяет живая искра.
    private var label: String {
        var value = text.trimmingCharacters(in: .whitespaces)
        while value.hasSuffix("…") || value.hasSuffix(".") { value.removeLast() }
        return value.isEmpty ? "Думаю" : value
    }

    var body: some View {
        HStack(spacing: 9) {
            Spark()
            Text(label)
                .font(.system(size: 14))
                .foregroundStyle(Theme.muted)
                .lineLimit(2)
                .id(label)
                .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity),
                                        removal: .move(edge: .top).combined(with: .opacity)))
            TimelineView(.periodic(from: started, by: 1)) { context in
                let seconds = Int(context.date.timeIntervalSince(started))
                if seconds >= 2 {
                    Text("· \(seconds) с")
                        .font(.system(size: 14).monospacedDigit())
                        .foregroundStyle(Theme.subtle)
                        .contentTransition(.numericText(value: Double(seconds)))
                        .transition(.opacity)
                }
            }
        }
        .clipped()
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: label)
        .frame(minHeight: 28)
        .accessibilityElement(children: .combine)
    }
}

/// Коралловая четырёхлучевая искра: медленно вращается и «дышит».
private struct Spark: View {
    var body: some View {
        TimelineView(.animation) { context in
            let time = context.date.timeIntervalSinceReferenceDate
            SparkShape()
                .fill(Theme.send)
                .frame(width: 13, height: 13)
                .rotationEffect(.degrees(time.truncatingRemainder(dividingBy: 2.4) / 2.4 * 360))
                .scaleEffect(0.85 + 0.2 * (0.5 + 0.5 * sin(time * 2 * .pi / 1.2)))
        }
        .frame(width: 16, height: 16)
        .accessibilityHidden(true)
    }
}

private struct SparkShape: Shape {
    func path(in rect: CGRect) -> Path {
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let r = min(rect.width, rect.height) / 2
        let inner = r * 0.28
        var path = Path()
        for index in 0..<8 {
            let angle = Double(index) * .pi / 4 - .pi / 2
            let radius = index.isMultiple(of: 2) ? r : inner
            let point = CGPoint(x: c.x + CGFloat(cos(angle)) * radius, y: c.y + CGFloat(sin(angle)) * radius)
            if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        return path
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
        Image(systemName: symbol)
            .font(.system(size: 13.5, weight: .regular))
            .foregroundStyle(active ? Theme.accent : Theme.muted.opacity(0.85))
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
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                Haptics.tap()
                withAnimation(Theme.spring) { open.toggle() }
            } label: {
                HStack(spacing: 6) {
                    Text(title)
                        .font(.system(size: 15))
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
                Text(text)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.leading, 14)
                    .overlay(alignment: .leading) {
                        Capsule().fill(Theme.fillActive).frame(width: 3)
                    }
                    .transition(.opacity)
            }
        }
        .padding(.top, -10)
    }
}
