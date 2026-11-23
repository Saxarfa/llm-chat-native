import AVFoundation
import AVKit
import Photos
import SwiftUI
import UIKit

/// Миниатюра вложения-картинки в ленте; по нажатию открывается на весь экран.
struct AttachmentThumb: View {
    @Environment(AppModel.self) private var model
    let item: FeedAttachment
    let side: CGFloat
    @State private var image: UIImage?
    /// Место миниатюры на экране (отсюда картинка вылетает на весь экран) — берётся в момент нажатия.
    @State private var probe = FrameProbe()

    var body: some View {
        Button {
            guard !DrawerSwipe.blocksTaps else { return }
            Keyboard.hide()
            model.viewer = ViewerItem(source: .attachment(item.id),
                                      origin: ViewerOrigin(frame: probe.frame, cornerRadius: 16, image: image))
        } label: {
            ZStack {
                Theme.surface
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    Image(systemName: "photo")
                        .font(.system(size: 20))
                        .foregroundStyle(Theme.subtle)
                }
            }
            .frame(width: side, height: side)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .frameProbe(probe)
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Изображение \(item.name)")
        .accessibilityHint("Открыть на весь экран")
        .task(id: item.id) {
            guard image == nil else { return }
            let key = item.id
            image = await Task.detached(priority: .userInitiated) {
                ImageStore.attachmentImage(key, thumb: true)
            }.value
        }
    }
}

/// Место вида на экране — по запросу, в момент нажатия. Раньше миниатюры и арты ленты следили за своим местом
/// через `onGeometryChange(.global)` и обновляли его на каждом кадре прокрутки и свайпа шторки (аудит 20.11.2026).
@MainActor
final class FrameProbe {
    fileprivate weak var view: UIView?

    /// Рамка в координатах окна (как `.global` у SwiftUI); нулевая, пока вида нет на экране.
    var frame: CGRect {
        guard let view, view.window != nil else { return .zero }
        return view.convert(view.bounds, to: nil)
    }

    /// Сколько вида видно от его верха до низа прокрутки, которая его держит; вся высота, если прокрутки нет.
    var visibleHeight: CGFloat {
        guard let view, view.window != nil else { return 0 }
        var parent = view.superview
        while let current = parent, !(current is UIScrollView) { parent = current.superview }
        guard let scroll = parent else { return view.bounds.height }
        let bottom = scroll.convert(scroll.bounds, to: view).maxY
        return min(max(bottom, 0), view.bounds.height)
    }
}

/// Пустой UIView под видом — по нему `FrameProbe` узнаёт место вида.
private struct FrameProbeView: UIViewRepresentable {
    let probe: FrameProbe

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        probe.view = view
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        probe.view = view
    }
}

extension View {
    /// Подкладывает под вид `FrameProbe`: его место на экране можно спросить в любой момент.
    func frameProbe(_ probe: FrameProbe) -> some View {
        background(FrameProbeView(probe: probe))
    }
}

/// Картинки сообщения: одна — крупно, несколько — сеткой до трёх в ряд.
struct AttachmentGrid: View {
    let items: [FeedAttachment]

    var body: some View {
        if items.count == 1, let only = items.first {
            AttachmentThumb(item: only, side: 220)
        } else {
            let columns = min(3, items.count)
            LazyVGrid(columns: Array(repeating: GridItem(.fixed(98), spacing: 6), count: columns), spacing: 6) {
                ForEach(items) { item in
                    AttachmentThumb(item: item, side: 98)
                }
            }
            .frame(width: CGFloat(columns) * 98 + CGFloat(columns - 1) * 6)
        }
    }
}

/// Картинка, созданная моделью. Уменьшенная копия подгружается, когда строка появляется на экране.
struct ArtView: View {
    @Environment(AppModel.self) private var model
    let art: FeedArt
    @State private var image: UIImage?
    @State private var failed = false
    @State private var attempt = 0
    /// Картинка уже резкая. Только что докачанная появляется из блюра и «наводится на резкость» —
    /// единственный честный момент проявки: пока арт генерируется, самой картинки ещё нет (16.11.2026).
    @State private var revealed = true
    /// Место плитки на экране (отсюда картинка вылетает на весь экран) — берётся в момент нажатия.
    @State private var probe = FrameProbe()

    var body: some View {
        if art.isVideo {
            VideoArtView(art: art)
        } else if art.ready {
            Button {
                guard !DrawerSwipe.blocksTaps else { return }
                if image != nil {
                    Keyboard.hide()
                    model.viewer = ViewerItem(source: .art(art.id),
                                              origin: ViewerOrigin(frame: probe.frame, cornerRadius: 18, image: image))
                } else if failed {
                    attempt += 1
                }
            } label: {
                tile {
                    ZStack {
                        if let image {
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFill()
                                .blur(radius: revealed ? 0 : 24)
                                .scaleEffect(revealed ? 1 : 1.08)
                                .transition(.opacity)
                        } else if failed {
                            placeholder("Не удалось загрузить. Нажмите, чтобы повторить.", symbol: "arrow.clockwise")
                        } else {
                            // Готовый арт ещё качается — тот же живой фон, что во время генерации.
                            GenerationAura()
                                .opacity(0.8)
                                .transition(.opacity)
                        }
                    }
                    .animation(.easeOut(duration: 0.35), value: image != nil)
                }
                .frameProbe(probe)
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel(image == nil ? "Изображение загружается" : "Изображение модели")
            .accessibilityHint(image == nil ? "" : "Открыть на весь экран")
            .task(id: "\(art.id)-\(attempt)") {
                guard image == nil else { return }
                failed = false
                let started = Date()
                let loaded = await model.artImage(art.id, preview: true)
                // Из кэша (прокрутка назад) — сразу резкая; докачанная — проявляется из блюра.
                let fresh = Date().timeIntervalSince(started) > 0.15
                revealed = !fresh
                image = loaded
                failed = loaded == nil
                guard fresh, loaded != nil else { return }
                // Кадр с размытой картинкой должен успеть отрисоваться, иначе анимации не будет.
                try? await Task.sleep(nanoseconds: 40_000_000)
                withAnimation(.easeOut(duration: 0.8)) { revealed = true }
            }
        } else if art.busy {
            GenerationTile(ratio: art.ratio, progress: art.progress, status: art.statusText)
                .frame(maxWidth: 340)
        } else {
            note(art.statusText, symbol: "photo")
        }
    }

    private func tile<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        Theme.surface
            .aspectRatio(art.ratio, contentMode: .fit)
            .frame(maxWidth: 340)
            .overlay { content() }
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.line))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func placeholder(_ text: String, symbol: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .medium))
            Text(text)
                .font(.system(size: 14))
                .multilineTextAlignment(.center)
        }
        .foregroundStyle(Theme.muted)
        .padding(16)
    }

    private func note(_ text: String, symbol: String) -> some View {
        Label(text, systemImage: symbol)
            .font(.system(size: 14))
            .foregroundStyle(Theme.subtle)
    }
}

/// Ролик Omni в ленте. Скачивается по нажатию (ролики крупные), дальше — из кэша телефона;
/// после скачивания плитка показывает первый кадр.
private struct VideoArtView: View {
    @Environment(AppModel.self) private var model
    let art: FeedArt
    @State private var poster: UIImage?
    @State private var loading = false
    @State private var failure: String?

    var body: some View {
        if art.ready {
            Button {
                guard !DrawerSwipe.blocksTaps else { return }
                Task { await open() }
            } label: {
                tile {
                    ZStack {
                        if let poster {
                            Image(uiImage: poster)
                                .resizable()
                                .scaledToFill()
                        }
                        VStack(spacing: 10) {
                            if loading {
                                ProgressView().tint(.white)
                            } else {
                                Image(systemName: "play.fill")
                                    .font(.system(size: 22, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .frame(width: 56, height: 56)
                                    .background(Color.black.opacity(0.55), in: Circle())
                            }
                            if poster == nil || failure != nil {
                                Text(failure ?? (loading ? "Загружаю видео…" : "Видео"))
                                    .font(.system(size: 14))
                                    .foregroundStyle(failure == nil ? Theme.muted : Theme.danger)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 16)
                            }
                        }
                    }
                }
            }
            .buttonStyle(PressScaleStyle())
            .disabled(loading)
            .accessibilityLabel("Видео модели")
            .accessibilityHint("Открыть и воспроизвести")
            .task(id: art.id) {
                if poster == nil {
                    poster = ImageStore.image("video:\(art.id):poster")
                }
                if poster == nil {
                    poster = await model.videoPoster(art.id)
                }
            }
        } else if art.busy {
            GenerationTile(ratio: art.ratio, progress: art.progress, status: art.statusText)
                .frame(maxWidth: 340)
        } else {
            Label(art.statusText, systemImage: "film")
                .font(.system(size: 14))
                .foregroundStyle(Theme.subtle)
        }
    }

    private func open() async {
        guard !loading else { return }
        if model.preview != nil { return }
        Keyboard.hide()
        loading = true
        failure = nil
        defer { loading = false }
        do {
            let file = try await model.videoFile(art.id)
            if poster == nil { poster = await model.videoPoster(art.id) }
            model.viewer = ViewerItem(source: .video(art.id, file))
        } catch is CancellationError {
        } catch {
            Haptics.error()
            failure = (error as? APIError)?.message ?? "Не удалось загрузить видео."
        }
    }

    private func tile<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        Theme.surface
            .aspectRatio(art.ratio, contentMode: .fit)
            .frame(maxWidth: 340)
            .overlay { content() }
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.line))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// Ролик на весь экран: системный плеер, сохранение в «Фото» и «Поделиться».
struct VideoViewer: View {
    @Environment(\.dismiss) private var dismiss
    let url: URL
    @State private var player: AVPlayer?
    @State private var note: String?
    @State private var saving = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let player {
                VideoPlayer(player: player)
                    .ignoresSafeArea(edges: .bottom)
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack {
                CircleIconButton(symbol: "xmark", label: "Закрыть") { dismiss() }
                Spacer()
                ShareLink(item: url) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 40, height: 40)
                        .background(Theme.fill, in: Circle())
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Поделиться видео")
                CircleIconButton(symbol: "square.and.arrow.down", label: "Сохранить в Фото") {
                    Task { await save() }
                }
                .disabled(saving)
            }
            .padding(.horizontal, 12)
            .frame(height: 52)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let note {
                Text(note)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 40)
                    .background(Theme.surface, in: Capsule())
                    .padding(.bottom, 64)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: note)
        .preferredColorScheme(.dark)
        .onAppear {
            // Звук ролика слышен и при беззвучном режиме — как в «Фото».
            try? AVAudioSession.sharedInstance().setCategory(.playback)
            let item = AVPlayer(url: url)
            player = item
            item.play()
        }
        .onDisappear {
            player?.pause()
        }
    }

    private func save() async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            Haptics.error()
            show("Разрешите доступ к «Фото» в настройках iPhone.")
            return
        }
        do {
            try await PHPhotoLibrary.shared().performChanges {
                _ = PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
            }
            Haptics.success()
            show("Сохранено в «Фото»")
        } catch {
            Haptics.error()
            show("Не удалось сохранить видео.")
        }
    }

    private func show(_ text: String) {
        note = text
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            if note == text { note = nil }
        }
    }
}

/// Вложения ещё не отправленного сообщения — лента над полем ввода.
struct DraftAttachmentStrip: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(model.draftAttachments) { item in
                    chip(item)
                }
                if model.attachmentsBusy {
                    ProgressView()
                        .tint(Theme.muted)
                        .frame(width: 64, height: 64)
                }
            }
            .padding(.horizontal, 2)
            .padding(.top, 6)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
    }

    private func chip(_ item: DraftAttachment) -> some View {
        Group {
            if item.kind == .image, let image = ImageStore.attachmentImage(item.storeKey, thumb: true) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 64, height: 64)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Image(systemName: FeedAttachment(id: "", name: "", kind: item.kind).symbol)
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.muted)
                    Text(item.name)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(2)
                }
                .padding(8)
                .frame(width: 112, height: 64, alignment: .topLeading)
                .background(Theme.fill)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(alignment: .topTrailing) {
            Button {
                Haptics.tap()
                model.removeAttachment(item)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.ink)
                    .frame(width: 22, height: 22)
                    .background(Color.black.opacity(0.72), in: Circle())
                    .frame(width: 44, height: 44, alignment: .topTrailing)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .offset(x: 6, y: -6)
            .accessibilityLabel("Убрать \(item.name)")
        }
    }
}

/// Просмотр на весь экран: увеличение щипком и двойным нажатием, сохранение в «Фото».
/// Показывается поверх самого экрана (а не отдельным системным окном): фон — размытый экран под ним
/// и сам арт.
///
/// Открытие и закрытие — как в «Фото» (переделано 18.11.2026: «анимация открытия сломана, переделай
/// полностью»): картинка вылетает из своей миниатюры (`ViewerOrigin`) и раскрывается в рамку «вписать
/// в экран», которая считается здесь же из размера просмотра, — без безопасных зон и без UIScrollView.
/// Прокрутка с увеличением (`ZoomableImage`) подменяет летящую картинку, только когда полёт доигран, и
/// стоит ровно там же (та же формула `ZoomScrollView.fitRect`). Закрытие — обратно в миниатюру; если
/// показан уже другой арт (листали, сменился новым), картинка уменьшается и тает.
/// Смахивание вверх или вниз закрывает; открытый из студии просмотр листается вбок по её артам.
struct ImageViewer: View {
    @Environment(AppModel.self) private var model
    let item: ViewerItem
    var followsStudio = false
    /// Убрать просмотр. Вызывается, когда уход уже доигран, — родитель убирает его без анимации.
    let onClose: () -> Void
    @State private var image: UIImage? = nil
    @State private var backdrop: UIImage? = nil
    @State private var loading = true
    @State private var note: String? = nil
    @State private var saving = false
    /// Какой арт показан сейчас (при листании и слежении за студией меняется).
    @State private var shownArt: String? = nil
    @State private var drag: CGSize = .zero
    /// Картинка раскрыта на весь экран; меняется анимацией (миниатюра ⇄ экран).
    @State private var expanded = false
    /// Раскрытие доиграно: на месте летящей картинки — прокрутка с увеличением.
    @State private var settled = false
    @State private var started = false
    @State private var closing = false
    /// Закрытие без миниатюры: картинка уменьшается и тает на месте.
    @State private var fading = false
    /// Листание вбок: сдвиг за пальцем и соседний арт, который въезжает с края.
    @State private var pageX: CGFloat = 0
    @State private var neighbor: Neighbor? = nil
    @State private var pageWidth: CGFloat = 400

    /// Соседний арт студии: `delta` +1 — более старый (справа), −1 — более новый.
    private struct Neighbor: Equatable {
        let id: String
        let delta: Int
        var image: UIImage?
    }

    /// Промежуток между артами при листании, как в «Фото».
    private static let pageGap: CGFloat = 20
    private static let openSpring = Animation.spring(response: 0.4, dampingFraction: 0.88)
    private static let closeSpring = Animation.spring(response: 0.34, dampingFraction: 0.92)

    init(item: ViewerItem, followsStudio: Bool = false, onClose: @escaping () -> Void) {
        self.item = item
        self.followsStudio = followsStudio
        self.onClose = onClose
        // Первый кадр — уже с картинкой миниатюры на её месте: летит то, что было видно.
        _image = State(initialValue: item.origin?.image)
        if case .art(let id) = item.source {
            _shownArt = State(initialValue: id)
        } else {
            _shownArt = State(initialValue: nil)
        }
    }

    /// 0 — на месте, 1 — утащили далеко: фон и кнопки тают.
    private var progress: CGFloat { min(1, abs(drag.height) / 320) }

    /// Листать можно только арты студии.
    private var pageable: Bool {
        guard followsStudio, settled, let shownArt else { return false }
        return model.studio.completed.contains { $0.id == shownArt }
    }

    /// Закрывать «в миниатюру» можно, пока показан тот же арт, из которого открыли.
    private var returnable: Bool {
        guard item.origin != nil else { return false }
        if case .art(let id) = item.source { return shownArt == id }
        return true
    }

    var body: some View {
        ZStack {
            background
                .opacity(expanded && !fading ? 1 - progress * 0.85 : 0)
                .ignoresSafeArea()
            GeometryReader { geo in
                stage(full: CGRect(origin: .zero, size: geo.size), box: geo.frame(in: .global))
                    .onAppear { pageWidth = geo.size.width }
                    .onChange(of: geo.size.width) { _, width in pageWidth = width }
            }
            .ignoresSafeArea()
            if image == nil {
                if loading {
                    ProgressView().tint(.white)
                } else {
                    Text("Не удалось открыть изображение.")
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.muted)
                }
            }
            chrome
        }
        // Тёмный вид только у самого просмотра; preferredColorScheme перекрасил бы всё окно.
        .environment(\.colorScheme, .dark)
        .task { await load() }
        .onAppear {
            Keyboard.hide()
            DrawerSwipe.viewerOpen = true
            // Через оборот: первый кадр должен успеть встать на место миниатюры.
            DispatchQueue.main.async { open() }
        }
        .onDisappear { DrawerSwipe.viewerOpen = false }
        .onChange(of: model.studio.completed.first?.id) { previous, newest in
            // Смотрели последний арт — готовый новый встаёт на его место; листали старые — не мешаем.
            guard followsStudio, settled, let newest, newest != shownArt, !closing,
                  shownArt == nil || shownArt == previous else { return }
            Task { await show(art: newest) }
        }
    }

    /// Картинка: пока летит — обычная картинка в явной рамке; когда встала — прокрутка с увеличением
    /// в той же рамке. `full` — весь просмотр, `box` — он же в глобальных координатах (для миниатюры).
    @ViewBuilder
    private func stage(full: CGRect, box: CGRect) -> some View {
        ZStack {
            if let image {
                if settled {
                    ZoomableImage(image: image,
                                  pageable: pageable,
                                  onDrag: { value in if !closing { drag = value } },
                                  onEnd: finishDrag,
                                  onPage: page,
                                  onPageEnd: finishPage)
                        // Свой вид на каждый арт: увеличение прежнего не переносится на новый.
                        .id(shownArt)
                        // Подмена летящей картинки — мгновенная, без растворения.
                        .transition(.identity)
                        .frame(width: full.width, height: full.height)
                        .position(x: full.midX + pageX, y: full.midY)
                } else {
                    flying(image, full: full, box: box)
                        .transition(.identity)
                }
            }
            if settled, let neighbor, let picture = neighbor.image {
                let rect = ZoomScrollView.fitRect(picture.size, in: full.size)
                Image(uiImage: picture)
                    .resizable()
                    .frame(width: rect.width, height: rect.height)
                    .position(x: rect.midX + pageX + CGFloat(neighbor.delta) * (full.width + Self.pageGap),
                              y: rect.midY)
                    .allowsHitTesting(false)
            }
        }
        .frame(width: full.width, height: full.height)
        .scaleEffect(1 - progress * 0.14)
        .offset(drag)
        .scaleEffect(fading ? 0.86 : 1)
        .opacity(fading ? 0 : 1)
    }

    /// Летящая картинка: из рамки миниатюры (со скруглением и обрезкой, как там) в рамку «вписать в экран».
    /// Без миниатюры — проявляется на месте, чуть увеличиваясь.
    private func flying(_ picture: UIImage, full: CGRect, box: CGRect) -> some View {
        let target = ZoomScrollView.fitRect(picture.size, in: full.size)
        let start = item.origin.map { $0.frame.offsetBy(dx: -box.minX, dy: -box.minY) }
        let rect = expanded ? target : (start ?? target)
        let radius = expanded ? 0 : (item.origin?.cornerRadius ?? 0)
        let appear = start == nil && !expanded
        return Image(uiImage: picture)
            .resizable()
            .scaledToFill()
            .frame(width: rect.width, height: rect.height)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .scaleEffect(appear ? 0.92 : 1)
            .opacity(appear ? 0 : 1)
            .position(x: rect.midX, y: rect.midY)
            .accessibilityElement()
            .accessibilityIdentifier("viewer.image")
            .allowsHitTesting(false)
    }

    /// Кнопки сверху и подсказка снизу — в безопасной зоне, поверх картинки.
    private var chrome: some View {
        VStack(spacing: 0) {
            HStack {
                CircleIconButton(symbol: "xmark", label: "Закрыть") { close() }
                    .accessibilityIdentifier("viewer.close")
                Spacer()
                if image != nil {
                    CircleIconButton(symbol: "square.and.arrow.down", label: "Сохранить в Фото") {
                        Task { await save() }
                    }
                    .disabled(saving)
                }
            }
            .padding(.horizontal, 12)
            .frame(height: 52)
            .opacity(expanded && !closing ? 1 - min(1, progress * 2.5) : 0)
            Spacer(minLength: 0)
            if let note {
                Text(note)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 40)
                    .background(Theme.surface, in: Capsule())
                    .padding(.bottom, 12)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: note)
    }

    /// Размытый фон: системное размытие экрана под просмотром и поверх — сам арт,
    /// сильно размытый и притемнённый.
    private var background: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial)
            // Копия «с заполнением» шире экрана — она в наложении на Color.clear и обрезана,
            // иначе раздвигала весь просмотр (в первой сборке 0.13 кнопки уезжали за край экрана).
            Color.clear
                .overlay {
                    if let backdrop {
                        // Копия уже размыта (`ImageStore.backdrop`): живого фильтра на каждом кадре нет.
                        Image(uiImage: backdrop)
                            .resizable()
                            .interpolation(.high)
                            .scaledToFill()
                            .opacity(0.6)
                            .transition(.opacity)
                    }
                }
                .clipped()
            Color.black.opacity(0.42)
        }
        .animation(.easeOut(duration: 0.3), value: backdrop)
    }

    // MARK: - Открытие и закрытие

    /// Полёт из миниатюры на весь экран. Без картинки ждёт её (`set` позовёт снова).
    private func open() {
        guard !started, !closing, image != nil else { return }
        started = true
        withAnimation(Self.openSpring) {
            expanded = true
        } completion: {
            guard !closing else { return }
            settled = true
        }
    }

    /// Закрыть: в миниатюру, если она есть и показан тот же арт; иначе уменьшиться и растаять.
    /// direction — куда вели пальцем при смахивании.
    private func close(direction: CGFloat = 0) {
        guard !closing else { return }
        closing = true
        // Летящая картинка встаёт на место прокрутки (без увеличения) и улетает сама.
        settled = false
        neighbor = nil
        pageX = 0
        if returnable, image != nil {
            withAnimation(Self.closeSpring) {
                expanded = false
                drag = .zero
            } completion: {
                onClose()
            }
        } else {
            withAnimation(.easeOut(duration: 0.24)) {
                fading = true
                if direction != 0 {
                    drag = CGSize(width: drag.width, height: drag.height + (direction < 0 ? -140 : 140))
                }
            } completion: {
                onClose()
            }
        }
    }

    private func finishDrag(velocity: CGFloat, distance: CGFloat) {
        guard !closing else { return }
        if abs(distance) > 110 || abs(velocity) > 900 {
            Haptics.tap()
            close(direction: distance == 0 ? velocity : distance)
        } else {
            withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) { drag = .zero }
        }
    }

    // MARK: - Листание артов студии

    /// Соседний арт в ленте студии: +1 — более старый, −1 — более новый (как свайп по сцене).
    private func neighborID(_ delta: Int) -> String? {
        let done = model.studio.completed
        guard let shownArt, let index = done.firstIndex(where: { $0.id == shownArt }),
              done.indices.contains(index + delta) else { return nil }
        return done[index + delta].id
    }

    /// Палец ведёт арт вбок; с той стороны, куда он идёт, подтягивается соседний.
    private func page(_ distance: CGFloat) {
        guard !closing, distance != 0 else { return }
        let delta = distance < 0 ? 1 : -1
        if neighbor?.delta != delta { prepareNeighbor(delta) }
        // Дальше листать некуда — арт тянется туго.
        pageX = neighbor == nil ? distance * 0.25 : distance
    }

    private func prepareNeighbor(_ delta: Int) {
        guard let id = neighborID(delta) else {
            neighbor = nil
            return
        }
        let cached = ImageStore.image("art:\(id):o") ?? ImageStore.image("art:\(id):p")
        neighbor = Neighbor(id: id, delta: delta, image: cached)
        guard cached == nil else { return }
        Task {
            let loaded = await model.artImage(id, preview: true)
            if neighbor?.id == id { neighbor?.image = loaded }
        }
    }

    private func finishPage(velocity: CGFloat, distance: CGFloat) {
        guard !closing else { return }
        let delta = distance < -60 || velocity < -500 ? 1 : (distance > 60 || velocity > 500 ? -1 : 0)
        guard delta != 0, let next = neighbor, next.delta == delta else {
            withAnimation(.spring(response: 0.32, dampingFraction: 0.85)) { pageX = 0 }
            return
        }
        withAnimation(.easeOut(duration: 0.22)) {
            pageX = -CGFloat(delta) * (pageWidth + Self.pageGap)
        } completion: {
            land(next)
        }
    }

    /// Соседний арт доехал до середины: теперь он показанный, сцена студии — на нём же.
    private func land(_ next: Neighbor) {
        var instant = Transaction()
        instant.disablesAnimations = true
        withTransaction(instant) {
            shownArt = next.id
            set(next.image)
            loading = next.image == nil
            neighbor = nil
            pageX = 0
        }
        if let job = model.studio.completed.first(where: { $0.id == next.id }) {
            model.studio.select(job)
        }
        Task { await upgrade(next.id, fallbackNote: false) }
    }

    // MARK: - Загрузка

    private func load() async {
        switch item.source {
        case .attachment(let key):
            let loaded = await Task.detached(priority: .userInitiated) {
                ImageStore.attachmentImage(key, thumb: false)
            }.value
            if let loaded { set(loaded) }
        case .art(let id):
            // Сначала то, что уже есть (оригинал из кэша или копия из ленты), затем оригинал.
            if let cached = ImageStore.image("art:\(id):o") {
                set(cached)
            } else if image == nil {
                set(await model.artImage(id, preview: true))
            }
            await upgrade(id, fallbackNote: true)
        case .video:
            break
        }
        loading = false
    }

    /// Оригинал на месте уменьшенной копии того же арта.
    private func upgrade(_ id: String, fallbackNote: Bool) async {
        if let original = await model.artImage(id, preview: false) {
            if shownArt == id {
                set(original)
                loading = false
            }
        } else if shownArt == id {
            loading = false
            if image != nil, fallbackNote { show("Оригинал недоступен — показана уменьшенная копия.") }
        }
    }

    /// Новый арт студии на месте прежнего: сначала уменьшенная копия, потом оригинал.
    private func show(art id: String) async {
        guard let preview = await model.artImage(id, preview: true) else { return }
        Haptics.selection()
        var instant = Transaction()
        instant.disablesAnimations = true
        withTransaction(instant) {
            shownArt = id
            neighbor = nil
            pageX = 0
            set(preview)
        }
        await upgrade(id, fallbackNote: false)
    }

    /// Новая картинка. Если полёт ещё не начинался (миниатюры не было), он начинается с ней.
    private func set(_ picture: UIImage?) {
        image = picture
        guard let picture else { return }
        if !started { DispatchQueue.main.async { open() } }
        // Фон — крошечная размытая копия, готовится вне главного потока; пришла другая картинка — не нужна.
        Task {
            let blurred = await Task.detached(priority: .userInitiated) { ImageStore.backdrop(picture) }.value
            if image === picture { backdrop = blurred }
        }
    }

    private func save() async {
        guard let image, !saving else { return }
        saving = true
        defer { saving = false }
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            Haptics.error()
            show("Разрешите доступ к «Фото» в настройках iPhone.")
            return
        }
        do {
            try await PHPhotoLibrary.shared().performChanges {
                _ = PHAssetChangeRequest.creationRequestForAsset(from: image)
            }
            Haptics.success()
            show("Сохранено в «Фото»")
        } catch {
            Haptics.error()
            show("Не удалось сохранить изображение.")
        }
    }

    private func show(_ text: String) {
        note = text
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            if note == text { note = nil }
        }
    }
}

/// Картинка в системной прокрутке с увеличением. Пока картинка не увеличена, вертикальное
/// движение пальца тащит её (`onDrag`), а отпускание сообщает скорость и расстояние (`onEnd`);
/// горизонтальное — листает (`onPage`/`onPageEnd`), если `pageable`.
private struct ZoomableImage: UIViewRepresentable {
    let image: UIImage
    var pageable = false
    var onDrag: (CGSize) -> Void = { _ in }
    var onEnd: (_ velocity: CGFloat, _ distance: CGFloat) -> Void = { _, _ in }
    var onPage: (CGFloat) -> Void = { _ in }
    var onPageEnd: (_ velocity: CGFloat, _ distance: CGFloat) -> Void = { _, _ in }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> ZoomScrollView {
        let scroll = ZoomScrollView(image: image)
        scroll.delegate = context.coordinator

        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.doubleTap(_:)))
        tap.numberOfTapsRequired = 2
        scroll.addGestureRecognizer(tap)

        let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.pan(_:)))
        pan.delegate = context.coordinator
        pan.maximumNumberOfTouches = 1
        scroll.addGestureRecognizer(pan)
        return scroll
    }

    func updateUIView(_ scroll: ZoomScrollView, context: Context) {
        let coordinator = context.coordinator
        coordinator.pageable = pageable
        coordinator.onDrag = onDrag
        coordinator.onEnd = onEnd
        coordinator.onPage = onPage
        coordinator.onPageEnd = onPageEnd
        guard scroll.imageView.image !== image else { return }
        // Тот же арт в лучшем качестве — подмена без сброса увеличения (пропорции копии и оригинала
        // расходятся на доли пикселя: прежнее точное сравнение считало их разными картинками и
        // сбрасывало увеличение — картинка на этом прыгала, замечание 18.11.2026).
        UIView.transition(with: scroll.imageView, duration: 0.25, options: .transitionCrossDissolve) {
            scroll.show(image)
        }
    }

    final class Coordinator: NSObject, UIScrollViewDelegate, UIGestureRecognizerDelegate {
        private enum Axis { case vertical, horizontal }
        private var axis: Axis?
        var pageable = false
        var onDrag: (CGSize) -> Void = { _ in }
        var onEnd: (CGFloat, CGFloat) -> Void = { _, _ in }
        var onPage: (CGFloat) -> Void = { _ in }
        var onPageEnd: (CGFloat, CGFloat) -> Void = { _, _ in }

        func viewForZooming(in scrollView: UIScrollView) -> UIView? {
            (scrollView as? ZoomScrollView)?.imageView
        }

        func scrollViewDidZoom(_ scrollView: UIScrollView) {
            (scrollView as? ZoomScrollView)?.centerImage()
        }

        @objc func doubleTap(_ gesture: UITapGestureRecognizer) {
            guard let scroll = gesture.view as? ZoomScrollView else { return }
            if scroll.zoomScale > 1.01 {
                scroll.setZoomScale(1, animated: true)
                return
            }
            let point = gesture.location(in: scroll.imageView)
            let size = CGSize(width: scroll.bounds.width / 2.5, height: scroll.bounds.height / 2.5)
            scroll.zoom(to: CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2,
                                   width: size.width, height: size.height), animated: true)
        }

        /// Свой жест — только у неувеличенной картинки: по вертикали — смахнуть, вбок — листать.
        func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
            guard let pan = gesture as? UIPanGestureRecognizer,
                  let scroll = pan.view as? UIScrollView,
                  pan !== scroll.panGestureRecognizer else { return true }
            guard scroll.zoomScale <= scroll.minimumZoomScale + 0.01 else { return false }
            let velocity = pan.velocity(in: scroll)
            if abs(velocity.y) > abs(velocity.x) * 1.2 {
                axis = .vertical
                return true
            }
            if pageable, abs(velocity.x) > abs(velocity.y) * 1.2 {
                axis = .horizontal
                return true
            }
            return false
        }

        func gestureRecognizer(_ gesture: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            guard let scroll = gesture.view as? UIScrollView else { return false }
            return other === scroll.panGestureRecognizer
        }

        @objc func pan(_ gesture: UIPanGestureRecognizer) {
            // В координатах окна: сам вид едет за пальцем, его координаты не годятся.
            let shift = gesture.translation(in: nil)
            let velocity = gesture.velocity(in: nil)
            switch gesture.state {
            case .changed:
                if axis == .horizontal {
                    onPage(shift.x)
                } else {
                    onDrag(CGSize(width: shift.x * 0.35, height: shift.y))
                }
            case .ended, .cancelled, .failed:
                if axis == .horizontal {
                    onPageEnd(velocity.x, shift.x)
                } else {
                    onEnd(velocity.y, shift.y)
                }
                axis = nil
            default:
                break
            }
        }
    }
}

/// Прокрутка с увеличением, которая сама ставит картинку: вписывает её в свой размер и держит по центру,
/// как образец Apple PhotoScroller. Раньше место картинке задавали ограничения autolayout вместе с
/// увеличением, и первая раскладка выходила неточной: картинка открывалась ниже нужного и вставала
/// на место только через полсекунды, когда приходил оригинал и сбрасывалось увеличение (замечание 18.11.2026).
final class ZoomScrollView: UIScrollView {
    let imageView = UIImageView()
    /// Под какой размер прокрутки вписана картинка.
    private var fittedFor: CGSize = .zero
    private var imageSize: CGSize

    init(image: UIImage) {
        imageSize = image.size
        super.init(frame: .zero)
        minimumZoomScale = 1
        maximumZoomScale = 5
        showsVerticalScrollIndicator = false
        showsHorizontalScrollIndicator = false
        contentInsetAdjustmentBehavior = .never
        decelerationRate = .fast
        backgroundColor = .clear
        imageView.image = image
        imageView.contentMode = .scaleAspectFit
        // Для автотестов: где на экране сама картинка (как у летящей, `viewer.image`).
        imageView.isAccessibilityElement = true
        imageView.accessibilityIdentifier = "viewer.image"
        addSubview(imageView)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    /// Другая картинка того же арта; если пропорции заметно другие — вписать заново.
    func show(_ image: UIImage) {
        imageView.image = image
        let old = imageSize.width / max(imageSize.height, 1)
        let new = image.size.width / max(image.size.height, 1)
        imageSize = image.size
        if abs(old - new) > 0.01 {
            fittedFor = .zero
            setNeedsLayout()
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0, bounds.height > 0 else { return }
        if bounds.size != fittedFor { fit() }
        centerImage()
    }

    /// Рамка картинки «вписать целиком» в размер `bounds`, по центру. По ней же летит картинка
    /// при открытии просмотра — поэтому подмена летящей картинки прокруткой незаметна.
    static func fitRect(_ size: CGSize, in bounds: CGSize) -> CGRect {
        let scale = min(bounds.width / max(size.width, 1), bounds.height / max(size.height, 1))
        let fitted = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        return CGRect(x: ((bounds.width - fitted.width) / 2).rounded(), y: ((bounds.height - fitted.height) / 2).rounded(),
                      width: fitted.width, height: fitted.height)
    }

    /// Картинка целиком в размер прокрутки, без увеличения.
    private func fit() {
        fittedFor = bounds.size
        zoomScale = 1
        let size = Self.fitRect(imageSize, in: bounds.size).size
        imageView.frame = CGRect(origin: .zero, size: size)
        contentSize = size
        contentOffset = .zero
    }

    /// Меньше экрана по стороне — по центру этой стороны (и при увеличении тоже).
    func centerImage() {
        var frame = imageView.frame
        frame.origin.x = frame.width < bounds.width ? ((bounds.width - frame.width) / 2).rounded() : 0
        frame.origin.y = frame.height < bounds.height ? ((bounds.height - frame.height) / 2).rounded() : 0
        if frame.origin != imageView.frame.origin { imageView.frame = frame }
    }
}

/// Системная камера.
struct CameraPicker: UIViewControllerRepresentable {
    let onFinish: (UIImage?) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onFinish: (UIImage?) -> Void

        init(onFinish: @escaping (UIImage?) -> Void) {
            self.onFinish = onFinish
        }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onFinish(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onFinish(nil)
        }
    }
}
