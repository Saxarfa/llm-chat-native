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
                    StudioStage(onOpen: { openArt(from: $0) }, onDetails: { panel = .details })
                        .contentShape(Rectangle())
                        .onTapGesture { typing = false }
                    if !studio.completed.isEmpty || !studio.activeJobs.isEmpty {
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
            StudioComposer(typing: $typing, onPanel: { open($0) }, onOpenArt: { openArt() })
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
        .overlay {
            // Открыт арт студии, а генерация идёт: готовый новый арт сменяет показанный.
            if let item = viewer {
                ImageViewer(item: item, followsStudio: true) { viewer = nil }
                    .id(item.id)
            }
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
                    Circle().fill(Theme.ink).frame(width: 7, height: 7).offset(x: -4, y: 4)
                        .allowsHitTesting(false)
                }
            }
            CircleIconButton(symbol: "bubble.left", label: "Вернуться в сессию") {
                Haptics.tap()
                model.screen = .chat
            }
        }
        // Кнопки там же, где в чате (как у Claude): круги 44 pt, центр в 22 pt под безопасной зоной.
        .padding(.horizontal, Theme.headerInset)
        .frame(height: Theme.headerButton)
        .padding(.bottom, 4)
        .background(Theme.canvas)
    }

    private func open(_ kind: StudioPanel) {
        typing = false
        Haptics.tap()
        panel = kind
    }

    /// Арт на весь экран; `origin` — откуда вылетает (арт на сцене), без него просто проявляется.
    private func openArt(from origin: ViewerOrigin? = nil) {
        typing = false
        guard let job = studio.selected else { return }
        viewer = ViewerItem(source: .art(job.id), origin: origin)
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

/// Горизонтальная лента чипов от края до края экрана внутри поля с отступом 16 pt.
/// Раньше стояло `scrollClipDisabled`: прокрученные чипы рисовались за краем экрана и при открытой
/// шторке торчали из карточки студии поверх меню. Теперь лента сама шириной с экран и обрезает по его краю.
private struct EdgeToEdgeRow: ViewModifier {
    func body(content: Content) -> some View {
        content
            .contentMargins(.horizontal, 16, for: .scrollContent)
            .padding(.horizontal, -16)
    }
}

/// На сцене — выбранный или последний арт, ход генерации — в строке под ним.
private struct StudioStage: View {
    @Environment(AppModel.self) private var model
    /// Открыть арт на весь экран — из его места на сцене.
    let onOpen: (ViewerOrigin?) -> Void
    let onDetails: () -> Void

    private var studio: StudioModel { model.studio }

    var body: some View {
        VStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Theme.surface)
                if let selected = studio.selected {
                    TabView(selection: Binding(
                        get: { studio.selected?.id ?? selected.id },
                        set: { id in
                            if id != studio.selected?.id, let job = studio.completed.first(where: { $0.id == id }) {
                                studio.select(job)
                            }
                        }
                    )) {
                        ForEach(pages(around: selected.id)) { job in
                            StudioArtPage(id: job.id) { origin in
                                guard studio.selected?.id == job.id, !DrawerSwipe.blocksTaps else { return }
                                onOpen(origin)
                            }
                            // Страница сравнивается по арту: опрос студии (раз в 1,2 с при генерации) не
                            // пересчитывает страницы с тем же артом.
                            .equatable()
                            .tag(job.id)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                } else if studio.pendingJob != nil {
                    GenerationAura()
                        .transition(.opacity)
                } else {
                    empty
                        .transition(.opacity)
                }
            }
            .animation(.easeOut(duration: 0.35), value: studio.pendingJob != nil)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .contentShape(Rectangle())
            .modifier(DrawerFreeZone(leadingGap: 36))
            // Все действия с артом — по долгому нажатию.
            .contextMenu { artMenu }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("studio.canvas")
            .accessibilityLabel(studio.selected == nil ? "Пустая сцена" : "Открыть арт на весь экран")
            .accessibilityAddTraits(studio.selected == nil ? [] : .isButton)

            tools
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }

    /// Страницы сцены — готовые арты около показанного: окно до 30 артов, сдвигается шагом 10, так что
    /// по обе стороны от показанного всегда есть куда листать. Раньше пейджер держал всю историю и
    /// пересобирал её на каждом опросе студии (аудит 20.11.2026).
    private func pages(around id: String) -> ArraySlice<StudioJob> {
        let done = studio.completed
        let index = done.firstIndex { $0.id == id } ?? 0
        let lower = max(0, index / 10 * 10 - 10)
        let upper = min(done.count, lower + 30)
        return done[lower..<upper]
    }

    @ViewBuilder
    private var artMenu: some View {
        if let job = studio.selected {
            Button {
                Task { await studio.saveToPhotos(job) }
            } label: {
                Label("Сохранить в «Фото»", systemImage: "square.and.arrow.down")
            }
            if let image = ImageStore.image("art:\(job.id):p") ?? ImageStore.image("art:\(job.id):t") {
                ShareLink(item: Image(uiImage: image), preview: SharePreview("Арт", image: Image(uiImage: image))) {
                    Label("Поделиться", systemImage: "square.and.arrow.up")
                }
            }
            Button {
                UIPasteboard.general.string = job.prompt
                Haptics.success()
                studio.show("Промпт скопирован")
            } label: {
                Label("Скопировать промпт", systemImage: "doc.on.doc")
            }
            if !job.isCloud, job.seed != nil {
                Button {
                    studio.reuse(job, keepSeed: true)
                } label: {
                    Label("Взять настройки и seed", systemImage: "lock")
                }
            }
            let favorite = (studio.jobs.first { $0.id == job.id } ?? job).favorite
            Button {
                Task { await studio.toggleFavorite(job) }
            } label: {
                Label(favorite ? "Убрать из избранного" : "В избранное", systemImage: favorite ? "star.slash" : "star")
            }
            Button(action: onDetails) {
                Label("Об этом арте", systemImage: "info.circle")
            }
            Divider()
            Button(role: .destructive) {
                Task { await studio.delete(job) }
            } label: {
                Label("Удалить", systemImage: "trash")
            }
        }
    }

    private var empty: some View {
        VStack(spacing: 10) {
            Image(systemName: "photo.badge.plus")
                .font(.system(size: 30, weight: .light))
                .foregroundStyle(Theme.muted)
                .frame(height: 40)
            Text("Начни с идеи")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.ink)
            Text("Опиши, что хочешь увидеть.\nТвой арт появится здесь.")
                .font(.system(size: 15))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
        .padding(24)
    }

    private var tools: some View {
        HStack(spacing: 8) {
            if let status = studio.status {
                HStack(spacing: 6) {
                    // Идёт работа — как все статусы: «Атом» с орбитами и волна (18.11.2026).
                    if studio.pendingJob != nil {
                        AtomIndicator(size: 16, orbits: true)
                        WaveText(text: status, size: 13, weight: .medium)
                    } else {
                        Circle().fill(Theme.muted).frame(width: 6, height: 6)
                        Text(status)
                            .font(.system(size: 13, weight: .medium).monospacedDigit())
                            .foregroundStyle(Theme.muted)
                    }
                }
                .padding(.horizontal, 12)
                .frame(height: 32)
                .background(Theme.fill, in: Capsule())
                .accessibilityIdentifier("studio.status")
                .transition(.opacity)
            }
            if studio.pendingJob != nil, !studio.loop {
                // «Создать» теперь ставит новые арты в очередь, поэтому идущий останавливается здесь.
                SmallIconButton(symbol: "stop.fill", label: "Остановить генерацию") {
                    Task { await studio.stop() }
                }
                .accessibilityIdentifier("studio.stop")
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

}

/// У каждой страницы своё изображение. Системный пейджер ведёт обе страницы за пальцем и завершает
/// перелистывание или возврат с текущей позиции.
private struct StudioArtPage: View {
    @Environment(AppModel.self) private var model
    let id: String
    let onOpen: (ViewerOrigin?) -> Void
    @State private var preview: UIImage?

    var body: some View {
        GeometryReader { page in
            let image = preview ?? ImageStore.image("art:\(id):p") ?? ImageStore.image("art:\(id):t")
            ZStack {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .padding(6)
                } else {
                    DelayedSpinner()
                }
            }
            .frame(width: page.size.width, height: page.size.height)
            .contentShape(Rectangle())
            .onTapGesture {
                guard let image else {
                    onOpen(nil)
                    return
                }
                let box = page.frame(in: .global).insetBy(dx: 6, dy: 6)
                let frame = ZoomScrollView.fitRect(image.size, in: box.size).offsetBy(dx: box.minX, dy: box.minY)
                onOpen(ViewerOrigin(frame: frame, cornerRadius: 16, image: image))
            }
        }
        .task(id: id) {
            let loaded = await model.artImage(id, preview: true)
            if !Task.isCancelled { preview = loaded }
        }
    }
}

extension StudioArtPage: Equatable {
    /// Одна и та же страница — один и тот же арт; замыкание открытия не сравнивается.
    nonisolated static func == (left: StudioArtPage, right: StudioArtPage) -> Bool { left.id == right.id }
}

/// Лента: сначала очередь (идущий арт и ждущие, у каждого — крестик отмены), затем готовые арты.
/// Нажатие на готовый показывает его на сцене; лента сама докручивается до выбранного,
/// когда сцену листают свайпом.
private struct StudioFilmstrip: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let studio = model.studio
        let currentID = studio.pendingJob?.id
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 8) {
                    ForEach(studio.activeJobs) { job in
                        QueueTile(job: job, isCurrent: job.id == currentID && job.status != "queued")
                            .id(job.id)
                            .transition(.scale(scale: 0.6).combined(with: .opacity))
                    }
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
                        .id(job.id)
                        .accessibilityLabel("Арт \(job.prompt.prefix(40))")
                        .accessibilityAddTraits(job.id == studio.selected?.id ? .isSelected : [])
                        .accessibilityIdentifier("studio.thumb.strip")
                    }
                }
                .padding(.horizontal, 16)
                .animation(Theme.spring, value: studio.activeJobs.map(\.id))
            }
            .onChange(of: studio.selected?.id) { _, id in
                guard let id else { return }
                withAnimation(Theme.spring) { proxy.scrollTo(id, anchor: .center) }
            }
        }
        .frame(height: 60)
        .modifier(DrawerFreeZone())
        .accessibilityIdentifier("studio.filmstrip")
    }
}

/// Рамка связывает текущую плитку со статусом под сценой, часы обозначают ожидание.
private struct QueueTile: View {
    @Environment(AppModel.self) private var model
    let job: StudioJob
    let isCurrent: Bool

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        shape.fill(Theme.surface)
            .overlay {
                if job.status == "queued" {
                    Image(systemName: "clock")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.muted)
                        .accessibilityHidden(true)
                }
            }
            .frame(width: 58, height: 58)
            .overlay(shape.strokeBorder(isCurrent ? Theme.accent : Theme.line, lineWidth: isCurrent ? 1.5 : 1))
            .overlay(alignment: .topTrailing) {
                Button {
                    Task { await model.studio.stop(job) }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 20, height: 20)
                        .background(Theme.fillActive, in: Circle())
                        // Зона нажатия 44 pt (было 32 — аудит 18.11.2026); кружок на прежнем месте.
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle())
                // Кружок крестика целиком внутри плитки: лента обрезает всё, что выступает за её высоту.
                .offset(x: 12, y: -12)
                .accessibilityLabel(job.status == "queued" ? "Убрать из очереди" : "Остановить генерацию")
                .accessibilityValue(Text(job.prompt))
            }
            .accessibilityIdentifier("studio.queue")
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
            if typing.wrappedValue {
                recentRow
            }
            // Пока идёт набор, поле занимает всё место до «Создать» (а не висит над пустотой).
            prompt
                .frame(maxHeight: typing.wrappedValue ? .infinity : nil, alignment: .top)
            HStack(spacing: 10) {
                loopButton
                seedButton
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
        .modifier(EdgeToEdgeRow())
        .modifier(DrawerFreeZone())
    }

    private var chipRow: some View {
        chips
    }

    /// Последние промпты чипами — только пока идёт набор; нажатие подставляет промпт целиком.
    @ViewBuilder
    private var recentRow: some View {
        let recent = studio.recentPrompts.filter { $0 != studio.draft.prompt.trimmingCharacters(in: .whitespacesAndNewlines) }
        if !recent.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Image(systemName: "clock.arrow.circlepath")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.subtle)
                    ForEach(recent, id: \.self) { text in
                        Button {
                            Haptics.tap()
                            studio.edit { $0.prompt = text }
                        } label: {
                            Text(text)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.ink)
                                .lineLimit(1)
                                .frame(maxWidth: 220)
                                .padding(.horizontal, 12)
                                .frame(height: 32)
                                .background(Theme.fill, in: Capsule())
                                .frame(minHeight: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(PressScaleStyle())
                        .accessibilityLabel("Подставить промпт: \(text.prefix(60))")
                    }
                }
            }
            .modifier(EdgeToEdgeRow())
            .modifier(DrawerFreeZone())
            .accessibilityIdentifier("studio.recent")
            .transition(.opacity)
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
        let shape = RoundedRectangle(cornerRadius: 20, style: .continuous)
        return TextField("Опиши будущий арт…", text: Binding(
            get: { studio.draft.prompt },
            set: { value in
                // Клавиша ввода подписана «Готово» и прячет клавиатуру: промпт — теги через запятую,
                // абзацы в нём не нужны. Вставленный многострочный текст не трогаем.
                if StudioPromptInput.isReturnPress(old: studio.draft.prompt, new: value) {
                    Haptics.tap()
                    typing.wrappedValue = false
                    return
                }
                studio.edit { $0.prompt = String(value.prefix(16000)) }
            }
        ), axis: .vertical)
            .lineLimit(typing.wrappedValue ? 3...14 : 2...6)
            .submitLabel(.done)
            .font(.system(size: 17))
            .foregroundStyle(Theme.ink)
            .focused(typing)
            .padding(.leading, 16)
            .padding(.trailing, showsClear ? 44 : 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, maxHeight: typing.wrappedValue ? .infinity : nil, alignment: .topLeading)
            .background(Theme.surface, in: shape)
            .overlay(shape.strokeBorder(typing.wrappedValue ? Theme.capsuleLine : Theme.line))
            // Касание в любом месте рамки (и под текстом) ставит курсор — в конец промпта: фокус ставим сами,
            // и UIKit оставлял курсор в начале (набранное вставало перед прежним промптом, снимок ui-03-typing 0.16.4).
            .contentShape(shape)
            .onTapGesture {
                guard !typing.wrappedValue else { return }
                typing.wrappedValue = true
                Keyboard.caretToEnd()
            }
            .overlay(alignment: .topTrailing) {
                // Длинный промпт с телефона не стереть — одна кнопка очищает поле.
                if showsClear {
                    Button {
                        Haptics.tap()
                        studio.edit { $0.prompt = "" }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(Theme.subtle)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .padding(2)
                    .accessibilityLabel("Очистить промпт")
                    .accessibilityIdentifier("studio.prompt.clear")
                    .transition(.opacity)
                }
            }
            .accessibilityLabel("Промпт")
            .accessibilityIdentifier("studio.prompt")
    }

    private var showsClear: Bool { typing.wrappedValue && !studio.draft.prompt.isEmpty }

    /// Замок seed: закреплённый seed повторяет композицию, пока меняется промпт.
    private var seedButton: some View {
        Button {
            studio.toggleSeedLock()
        } label: {
            Image(systemName: studio.seedLocked ? "lock.fill" : "lock.open")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(studio.seedLocked ? Theme.buttonPrimaryText : Theme.ink)
                .contentTransition(.symbolEffect(.replace))
                .frame(width: 52, height: 52)
                .background(studio.seedLocked ? Theme.buttonPrimary : Theme.fill,
                            in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!studio.ready)
        .animation(.easeOut(duration: 0.2), value: studio.seedLocked)
        .accessibilityLabel(studio.seedLocked ? "Открепить seed" : "Закрепить seed")
        .accessibilityIdentifier("studio.seed")
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
            } else {
                // Пока рисуется прежний, новый арт встаёт в очередь (остановка — у плитки и у строки хода).
                typing.wrappedValue = false
                Task { await studio.generate() }
            }
        } label: {
            HStack(spacing: 8) {
                if studio.busy {
                    ProgressView().tint(Theme.buttonPrimaryText)
                } else {
                    Image(systemName: studio.loop ? "stop.fill" : "sparkles")
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
        if studio.busy { return "Запускаю…" }
        if studio.queueFull { return "Очередь полна" }
        return studio.pendingJob == nil ? "Создать" : "В очередь"
    }

    private var createDisabled: Bool {
        if studio.busy || !studio.ready { return true }
        if studio.loop { return false }
        return !studio.valid || !studio.available || studio.queueFull
    }

    private var message: String? {
        if let error = studio.lastError { return error }
        if let flash = studio.flash { return flash }
        if studio.loop { return studio.valid ? "Изменения применятся к следующему арту" : "Следующий арт ждёт корректных настроек" }
        if let notice = studio.notice { return notice }
        if studio.seedLocked { return "Seed закреплён · \(studio.draft.seed)" }
        return nil
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
                        .font(.system(size: 11, weight: .bold))
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
