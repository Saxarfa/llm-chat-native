import SwiftUI

/// Окна студии, открываемые снизу.
enum StudioPanel: String, Identifiable {
    case model, format, settings, history, details, loras
    var id: String { rawValue }
}

/// Студия картинок — повторяет мобильную студию сайта (`MobileImageStudio.tsx`):
/// сверху арт, под ним лента последних, внизу промпт, быстрые настройки и «Создать».
struct StudioScreen: View {
    @Environment(AppModel.self) private var model
    let onMenu: () -> Void
    @State private var panel: StudioPanel?
    @State private var viewer: ViewerItem?
    @FocusState private var typing: Bool

    private var studio: StudioModel { model.studio }

    var body: some View {
        VStack(spacing: 0) {
            // Пока набирается промпт, сцена и лента убираются, а поле растягивается до клавиатуры —
            // как на сайте (`data-prompt-focus` в `MobileImageStudio.css`). Иначе арт сжимался в полоску.
            if !typing {
                VStack(spacing: 0) {
                    StudioStage(onOpen: openArt, onDetails: { panel = .details })
                        .contentShape(Rectangle())
                        .onTapGesture { typing = false }
                    if !studio.completed.isEmpty {
                        StudioFilmstrip()
                            .padding(.top, 10)
                    }
                    if let undo = studio.undo {
                        UndoBar(undo: undo)
                            .padding(.top, 8)
                            .transition(.opacity)
                    }
                }
                .animation(.easeOut(duration: 0.2), value: studio.undo)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .transition(.opacity)
            }
            StudioComposer(typing: $typing, onPanel: { open($0) }, onOpenArt: openArt)
                .frame(maxHeight: typing ? .infinity : nil, alignment: .top)
        }
        .animation(.easeOut(duration: 0.2), value: typing)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .safeAreaInset(edge: .top, spacing: 0) { header }
        .background(Theme.canvas.ignoresSafeArea())
        .task { await studio.run() }
        .sheet(item: $panel) { kind in
            StudioPanelSheet(kind: kind, onOpenArt: { id in
                panel = nil
                Task {
                    try? await Task.sleep(nanoseconds: 450_000_000)
                    viewer = ViewerItem(source: .art(id))
                }
            })
            .environment(model)
        }
        .fullScreenCover(item: $viewer) { item in
            ImageViewer(item: item)
        }
        .onAppear(perform: openPreviewPanel)
    }

    private var header: some View {
        HStack(spacing: 8) {
            CircleIconButton(symbol: "line.3.horizontal", label: "Меню", action: onMenu)
            Spacer()
            Text("Студия")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.ink)
            Spacer()
            ZStack(alignment: .topTrailing) {
                CircleIconButton(symbol: "clock.arrow.circlepath", label: "История артов") { open(.history) }
                    .accessibilityIdentifier("studio.history")
                if !studio.completed.isEmpty {
                    Circle().fill(Theme.ink).frame(width: 7, height: 7).offset(x: -6, y: 6)
                        .allowsHitTesting(false)
                }
            }
            CircleIconButton(symbol: "bubble.left", label: "Вернуться в чат") {
                Haptics.tap()
                model.screen = .chat
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 52)
        .background(Theme.canvas)
    }

    private func open(_ kind: StudioPanel) {
        typing = false
        Haptics.tap()
        panel = kind
    }

    private func openArt() {
        typing = false
        guard let job = studio.selected else { return }
        viewer = ViewerItem(source: .art(job.id))
    }

    private func openPreviewPanel() {
        switch model.preview {
        case .studioSettings: panel = .settings
        case .studioHistory: panel = .history
        case .studioArt: openArt()
        default: break
        }
    }
}

/// Арт на сцене: выбранный или последний, с ходом генерации поверх.
private struct StudioStage: View {
    @Environment(AppModel.self) private var model
    let onOpen: () -> Void
    let onDetails: () -> Void
    @State private var image: UIImage?
    @State private var shownID: String?

    private var studio: StudioModel { model.studio }

    var body: some View {
        VStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Theme.surface)
                if let image, studio.selected != nil {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .padding(6)
                        .id(shownID)
                        .transition(.opacity)
                } else {
                    empty
                }
                if let job = studio.pendingJob {
                    VStack {
                        ProgressBar(value: job.progress.map { Double($0) / 100 })
                        Spacer()
                    }
                    .padding(12)
                }
            }
            .animation(.easeOut(duration: 0.25), value: shownID)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .contentShape(Rectangle())
            .onTapGesture {
                if studio.selected != nil { onOpen() }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("studio.canvas")
            .accessibilityLabel(studio.selected == nil ? "Пустая сцена" : "Открыть арт на весь экран")
            .accessibilityAddTraits(studio.selected == nil ? [] : .isButton)

            tools
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .task(id: studio.selected?.id) { await load() }
    }

    private var empty: some View {
        VStack(spacing: 10) {
            Group {
                if studio.pendingJob != nil {
                    ProgressView().controlSize(.large).tint(Theme.muted)
                } else {
                    Image(systemName: "photo.badge.plus")
                        .font(.system(size: 30, weight: .light))
                        .foregroundStyle(Theme.muted)
                }
            }
            .frame(height: 40)
            Text(studio.pendingJob?.statusText ?? "Начни с идеи")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.ink)
            Text(emptyHint)
                .font(.system(size: 15))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
        .padding(24)
    }

    private var emptyHint: String {
        guard let job = studio.pendingJob else { return "Опиши, что хочешь увидеть.\nТвой арт появится здесь." }
        if let progress = job.progress { return "Выполнено \(progress)% · арт скоро появится" }
        return "Твой арт сейчас создаётся…"
    }

    private var tools: some View {
        HStack(spacing: 8) {
            if let status = studio.status {
                HStack(spacing: 6) {
                    if studio.pendingJob != nil {
                        ProgressView().controlSize(.mini).tint(Theme.muted)
                    } else {
                        Circle().fill(Theme.muted).frame(width: 6, height: 6)
                    }
                    Text(status)
                        .font(.system(size: 13, weight: .medium).monospacedDigit())
                        .foregroundStyle(Theme.muted)
                        .contentTransition(.numericText())
                }
                .padding(.horizontal, 12)
                .frame(height: 32)
                .background(Theme.fill, in: Capsule())
                .accessibilityIdentifier("studio.status")
                .transition(.opacity)
            }
            Spacer(minLength: 0)
            if let job = studio.selected {
                SmallIconButton(symbol: (studio.jobs.first { $0.id == job.id } ?? job).favorite ? "star.fill" : "star",
                                label: job.favorite ? "Убрать из избранного" : "В избранное") {
                    Task { await studio.toggleFavorite(job) }
                }
                SmallIconButton(symbol: "ellipsis", label: "Действия с артом", action: onDetails)
                    .accessibilityIdentifier("studio.details")
            }
        }
        .frame(height: 36)
        .animation(.easeOut(duration: 0.2), value: studio.status)
    }

    private func load() async {
        guard let job = studio.selected else {
            image = nil
            shownID = nil
            return
        }
        if let ready = ImageStore.image("art:\(job.id):p") {
            image = ready
            shownID = job.id
            return
        }
        // Пока грузится новый, на сцене остаётся прежний арт.
        if let loaded = await model.artImage(job.id, preview: true), studio.selected?.id == job.id {
            image = loaded
            shownID = job.id
        }
    }
}

/// Тонкая полоса хода генерации; без процента — бегущий отрезок.
private struct ProgressBar: View {
    let value: Double?
    @State private var phase = false

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.fillActive)
                if let value {
                    Capsule().fill(Theme.ink)
                        .frame(width: max(6, geo.size.width * value))
                        .animation(.easeOut(duration: 0.4), value: value)
                } else {
                    Capsule().fill(Theme.ink.opacity(0.8))
                        .frame(width: geo.size.width * 0.3)
                        .offset(x: phase ? geo.size.width * 0.7 : 0)
                        .animation(.easeInOut(duration: 1).repeatForever(autoreverses: true), value: phase)
                        .onAppear { phase = true }
                }
            }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }
}

/// Лента готовых артов: нажатие показывает арт на сцене.
private struct StudioFilmstrip: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let studio = model.studio
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 8) {
                ForEach(studio.completed.prefix(30)) { job in
                    Button {
                        studio.select(job)
                    } label: {
                        StudioThumb(id: job.id)
                            .frame(width: 58, height: 58)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .strokeBorder(job.id == studio.selected?.id ? Theme.ink : Color.clear, lineWidth: 2)
                            )
                    }
                    .buttonStyle(PressScaleStyle())
                    .accessibilityLabel("Арт \(job.prompt.prefix(40))")
                }
            }
            .padding(.horizontal, 16)
        }
        .frame(height: 60)
        .modifier(DrawerFreeZone())
        .accessibilityIdentifier("studio.filmstrip")
    }
}

/// Квадратная миниатюра арта (320 px с сервера, обрезана по центру).
/// Все места показа — квадраты (история, лента, чип при наборе).
struct StudioThumb: View {
    @Environment(AppModel.self) private var model
    let id: String
    @State private var image: UIImage?

    var body: some View {
        // Размер задаёт подложка, а картинка заранее обрезана в квадрат: `scaledToFill`
        // неквадратной картинки выступал за ячейку — в 0.7 миниатюры истории наезжали друг на друга,
        // а невидимый выступ после `clipped` всё равно ловил нажатия.
        Theme.surface
            .overlay {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .transition(.opacity)
                }
            }
            .clipped()
            .contentShape(Rectangle())
            .task(id: id) {
                if image == nil { image = ImageStore.image("art:\(id):t").map(Self.square) }
                if image == nil, let loaded = await model.studio.thumbnail(id) {
                    let square = Self.square(loaded)
                    withAnimation(.easeOut(duration: 0.2)) { image = square }
                }
            }
    }

    /// Центральный квадрат картинки (в пикселях — от ориентации не зависит).
    static func square(_ image: UIImage) -> UIImage {
        guard let cg = image.cgImage, cg.width != cg.height else { return image }
        let side = min(cg.width, cg.height)
        let rect = CGRect(x: (cg.width - side) / 2, y: (cg.height - side) / 2, width: side, height: side)
        guard let cropped = cg.cropping(to: rect) else { return image }
        return UIImage(cgImage: cropped, scale: image.scale, orientation: image.imageOrientation)
    }
}

/// «Арт удалён · Вернуть».
private struct UndoBar: View {
    @Environment(AppModel.self) private var model
    let undo: StudioModel.Undo

    var body: some View {
        HStack(spacing: 12) {
            Text(text)
                .font(.system(size: 15))
                .foregroundStyle(Theme.ink)
            Spacer(minLength: 8)
            Button("Вернуть") {
                Task { await model.studio.restore() }
            }
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Theme.ink)
            .frame(minHeight: 40)
        }
        .padding(.horizontal, 16)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.horizontal, 16)
    }

    private var text: String {
        switch undo {
        case .single: return "Арт удалён"
        case .batch(_, let count): return "Удалено артов · \(count)"
        }
    }
}

/// Маленькая круглая кнопка для действий под артом.
struct SmallIconButton: View {
    let symbol: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Theme.ink)
                .frame(width: 36, height: 36)
                .background(Theme.fill, in: Circle())
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(label)
    }
}

/// Поле промпта, быстрые настройки и «Создать».
private struct StudioComposer: View {
    @Environment(AppModel.self) private var model
    var typing: FocusState<Bool>.Binding
    let onPanel: (StudioPanel) -> Void
    let onOpenArt: () -> Void

    private var studio: StudioModel { model.studio }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            chipRow
            prompt
            if typing.wrappedValue {
                Spacer(minLength: 0)
            }
            HStack(spacing: 10) {
                loopButton
                createButton
            }
            if let text = message {
                Text(text)
                    .font(.system(size: 14))
                    .foregroundStyle(isError ? Theme.danger : Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("studio.message")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(Theme.canvas)
        .disabled(!studio.ready)
    }

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // Сцена спрятана, пока набирается промпт, — последний арт остаётся под рукой (как на сайте).
                if typing.wrappedValue, let job = studio.selected {
                    Button(action: onOpenArt) {
                        StudioThumb(id: job.id)
                            .frame(width: 36, height: 36)
                            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(Theme.line))
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(PressScaleStyle())
                    .accessibilityLabel("Открыть последний арт на весь экран")
                    .accessibilityIdentifier("studio.thumb")
                }
                Chip(title: StudioModels.name(studio.draft.model), symbol: "chevron.down") { onPanel(.model) }
                    .accessibilityIdentifier("studio.model")
                Chip(title: formatName, leading: ratioIcon, symbol: nil) { onPanel(.format) }
                    .accessibilityIdentifier("studio.format")
                Chip(title: studio.draft.loras.isEmpty ? "LoRA" : "LoRA · \(studio.draft.loras.count)", symbol: nil) { onPanel(.loras) }
                    .accessibilityIdentifier("studio.loras")
                Button {
                    onPanel(.settings)
                } label: {
                    Image(systemName: "slider.horizontal.3")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 40, height: 36)
                        .background(Theme.fill, in: Capsule())
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Настройки генерации")
                .accessibilityIdentifier("studio.settings")
            }
        }
        // Пока набирается промпт, справа стоит «Готово» — ленту под ним обрезаем.
        .scrollClipDisabled(!typing.wrappedValue)
        .modifier(DrawerFreeZone())
    }

    private var chipRow: some View {
        HStack(spacing: 8) {
            chips
            if typing.wrappedValue {
                // Вне прокрутки, чтобы не уезжать за край экрана (в 0.7 её не было видно).
                Button {
                    typing.wrappedValue = false
                } label: {
                    Label("Готово", systemImage: "checkmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .padding(.horizontal, 12)
                        .frame(height: 36)
                        .background(Theme.fill, in: Capsule())
                        .overlay(Capsule().strokeBorder(Theme.line))
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle())
                .fixedSize()
                .accessibilityLabel("Скрыть клавиатуру")
            }
        }
    }

    private var formatName: String {
        if studio.draft.size == "custom" { return "\(studio.draft.width) × \(studio.draft.height)" }
        return StudioFormat.all.first { $0.value == studio.draft.size }?.name ?? "Свой размер"
    }

    private var ratioIcon: AnyView {
        let (w, h) = studio.draft.dimensions
        let ratio = h > 0 && w > 0 ? CGFloat(w) / CGFloat(h) : 1
        return AnyView(
            RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                .strokeBorder(Theme.muted, lineWidth: 1.5)
                .frame(width: ratio >= 1 ? 16 : 16 * ratio, height: ratio >= 1 ? 16 / ratio : 16)
                .frame(width: 16, height: 16)
        )
    }

    private var prompt: some View {
        TextField("Опиши будущий арт…", text: Binding(
            get: { studio.draft.prompt },
            set: { value in studio.edit { $0.prompt = String(value.prefix(16000)) } }
        ), axis: .vertical)
            .lineLimit(typing.wrappedValue ? 4...7 : 2...6)
            .font(.system(size: 17))
            .foregroundStyle(Theme.ink)
            .focused(typing)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Theme.line))
            .accessibilityLabel("Промпт")
            .accessibilityIdentifier("studio.prompt")
    }

    private var loopButton: some View {
        Button {
            Task { await studio.toggleLoop() }
        } label: {
            Image(systemName: "repeat")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(studio.loop ? Theme.buttonPrimaryText : Theme.ink)
                .frame(width: 52, height: 52)
                .background(studio.loop ? Theme.buttonPrimary : Theme.fill,
                            in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .disabled(studio.busy || (!studio.loop && (!studio.valid || !studio.available)))
        .opacity(studio.busy || (!studio.loop && (!studio.valid || !studio.available)) ? 0.4 : 1)
        .accessibilityLabel(studio.loop ? "Выключить непрерывную генерацию" : "Включить непрерывную генерацию")
        .accessibilityIdentifier("studio.loop")
    }

    private var createButton: some View {
        Button {
            if studio.loop {
                Task { await studio.toggleLoop() }
            } else if studio.pendingJob != nil {
                Task { await studio.stop() }
            } else {
                typing.wrappedValue = false
                Task { await studio.generate() }
            }
        } label: {
            HStack(spacing: 8) {
                if studio.busy {
                    ProgressView().tint(Theme.buttonPrimaryText)
                } else {
                    Image(systemName: studio.loop || studio.pendingJob != nil ? "stop.fill" : "sparkles")
                }
                Text(createTitle)
            }
        }
        .buttonStyle(PrimaryButtonStyle())
        .disabled(createDisabled)
        .accessibilityIdentifier("studio.create")
    }

    private var createTitle: String {
        if studio.loop { return "Остановить цикл" }
        if let job = studio.pendingJob { return job.status == "preparing" ? "Подготовка…" : "Остановить" }
        return studio.busy ? "Запускаю…" : "Создать"
    }

    private var createDisabled: Bool {
        if studio.busy || !studio.ready { return true }
        if studio.loop { return false }
        if let job = studio.pendingJob { return job.status == "preparing" && !job.isCloud }
        return !studio.valid || !studio.available
    }

    private var message: String? {
        if let error = studio.lastError { return error }
        if studio.loop { return studio.valid ? "Изменения применятся к следующему арту" : "Следующий арт ждёт корректных настроек" }
        return studio.notice
    }

    private var isError: Bool { studio.lastError != nil }
}

/// Кнопка-«таблетка» быстрой настройки.
private struct Chip: View {
    let title: String
    var leading: AnyView?
    let symbol: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let leading { leading }
                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .lineLimit(1)
                if let symbol {
                    Image(systemName: symbol)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Theme.muted)
                }
            }
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 14)
            .frame(height: 36)
            .background(Theme.fill, in: Capsule())
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
    }
}
