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

    var body: some View {
        Button {
            guard !DrawerSwipe.blocksTaps else { return }
            Keyboard.hide()
            model.viewer = ViewerItem(source: .attachment(item.id))
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

    var body: some View {
        if art.isVideo {
            VideoArtView(art: art)
        } else if art.ready {
            Button {
                guard !DrawerSwipe.blocksTaps else { return }
                if image != nil {
                    Keyboard.hide()
                    model.viewer = ViewerItem(source: .art(art.id))
                } else if failed {
                    attempt += 1
                }
            } label: {
                tile {
                    if let image {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                    } else if failed {
                        placeholder("Не удалось загрузить. Нажмите, чтобы повторить.", symbol: "arrow.clockwise")
                    } else {
                        ProgressView().tint(Theme.muted)
                    }
                }
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel(image == nil ? "Изображение загружается" : "Изображение модели")
            .accessibilityHint(image == nil ? "" : "Открыть на весь экран")
            .task(id: "\(art.id)-\(attempt)") {
                guard image == nil else { return }
                failed = false
                image = await model.artImage(art.id, preview: true)
                failed = image == nil
            }
        } else if art.busy {
            tile {
                VStack(spacing: 12) {
                    ProgressView().tint(Theme.muted)
                    Text(art.statusText)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                }
            }
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
                                Text(failure ?? (loading ? "Загружаю видео…" : "Видео · нажмите, чтобы посмотреть"))
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
            tile {
                VStack(spacing: 12) {
                    ProgressView().tint(Theme.muted)
                    Text(art.statusText)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                }
            }
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
        .modifier(GuardsDrawer())
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
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Theme.ink)
                    .frame(width: 22, height: 22)
                    .background(Color.black.opacity(0.72), in: Circle())
                    .frame(width: 40, height: 40, alignment: .topTrailing)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .offset(x: 6, y: -6)
            .accessibilityLabel("Убрать \(item.name)")
        }
    }
}

/// Просмотр на весь экран: увеличение щипком и двойным нажатием, сохранение в «Фото».
/// Фон — размытый (сам арт, растянутый и размытый, поверх размытого чата), а не чёрный;
/// смахивание вверх или вниз закрывает, как в «Фото». Открытый из студии просмотр
/// сам переключается на новый арт, когда генерация закончилась.
struct ImageViewer: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let item: ViewerItem
    var followsStudio = false
    @State private var image: UIImage?
    @State private var backdrop: UIImage?
    @State private var loading = true
    @State private var note: String?
    @State private var saving = false
    /// Какой арт показан сейчас (при слежении за студией меняется).
    @State private var shownArt: String?
    @State private var drag: CGSize = .zero
    @State private var closing = false

    /// 0 — на месте, 1 — утащили далеко: фон и кнопки тают.
    private var progress: CGFloat { min(1, abs(drag.height) / 320) }

    var body: some View {
        ZStack {
            background
                .opacity(1 - progress * 0.85)
                .ignoresSafeArea()
            if let image {
                ZoomableImage(image: image,
                              onDrag: { value in if !closing { drag = value } },
                              onEnd: finishDrag)
                    .ignoresSafeArea()
                    .scaleEffect(1 - progress * 0.14)
                    .offset(drag)
            } else if !loading {
                Text("Не удалось открыть изображение.")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.muted)
            }
            if loading {
                ProgressView().tint(.white)
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack {
                CircleIconButton(symbol: "xmark", label: "Закрыть") { dismiss() }
                    // Под прозрачным просмотром экран остаётся в дереве доступности — своя метка для тестов.
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
            .opacity(1 - min(1, progress * 2.5))
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
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
        .preferredColorScheme(.dark)
        // Прозрачная подложка показа: под размытием виден чат, а при смахивании — он сам.
        .presentationBackground(.clear)
        .task { await load() }
        .onChange(of: model.studio.completed.first?.id) { _, newest in
            guard followsStudio, let newest, newest != shownArt, !closing else { return }
            Task { await show(art: newest) }
        }
    }

    /// Размытый фон: системное размытие того, что под просмотром, и поверх — сам арт,
    /// сильно размытый и притемнённый (так фон не чёрный, даже если система подложку не убрала).
    private var background: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial)
            // Копия «с заполнением» шире экрана — она в наложении на Color.clear и обрезана,
            // иначе раздвигала весь просмотр (в первой сборке 0.13 кнопки уезжали за край экрана).
            Color.clear
                .overlay {
                    if let backdrop {
                        Image(uiImage: backdrop)
                            .resizable()
                            .scaledToFill()
                            .blur(radius: 40, opaque: true)
                            .opacity(0.6)
                            .transition(.opacity)
                    }
                }
                .clipped()
            Color.black.opacity(0.42)
        }
        .animation(.easeOut(duration: 0.3), value: backdrop)
    }

    private func finishDrag(velocity: CGFloat, distance: CGFloat) {
        guard !closing else { return }
        if abs(distance) > 110 || abs(velocity) > 900 {
            closing = true
            Haptics.tap()
            let away: CGFloat = (distance == 0 ? velocity : distance) < 0 ? -1200 : 1200
            withAnimation(.easeOut(duration: 0.22)) { drag = CGSize(width: drag.width, height: away) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                var quiet = Transaction()
                quiet.disablesAnimations = true
                withTransaction(quiet) { dismiss() }
            }
        } else {
            withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) { drag = .zero }
        }
    }

    private func load() async {
        switch item.source {
        case .attachment(let key):
            let loaded = await Task.detached(priority: .userInitiated) {
                ImageStore.attachmentImage(key, thumb: false)
            }.value
            set(loaded)
        case .art(let id):
            shownArt = id
            // Сначала то, что уже есть в ленте, затем оригинал.
            set(await model.artImage(id, preview: true))
            if let original = await model.artImage(id, preview: false) {
                if shownArt == id { set(original) }
            } else if image != nil {
                show("Оригинал недоступен — показана уменьшенная копия.")
            }
        case .video:
            break
        }
        loading = false
    }

    /// Новый арт студии на месте прежнего: сначала уменьшенная копия, потом оригинал.
    private func show(art id: String) async {
        guard let preview = await model.artImage(id, preview: true) else { return }
        shownArt = id
        Haptics.selection()
        set(preview)
        if let original = await model.artImage(id, preview: false), shownArt == id { set(original) }
    }

    private func set(_ picture: UIImage?) {
        image = picture
        guard let picture else { return }
        // Для фона хватает крошечной копии — размытие дешёвое.
        let side: CGFloat = 48
        let scale = side / max(picture.size.width, picture.size.height, 1)
        backdrop = picture.preparingThumbnail(of: CGSize(width: max(1, picture.size.width * scale),
                                                         height: max(1, picture.size.height * scale))) ?? picture
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
/// движение пальца тащит её (`onDrag`), а отпускание сообщает скорость и расстояние (`onEnd`).
private struct ZoomableImage: UIViewRepresentable {
    let image: UIImage
    var onDrag: (CGSize) -> Void = { _ in }
    var onEnd: (_ velocity: CGFloat, _ distance: CGFloat) -> Void = { _, _ in }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIScrollView {
        let scroll = UIScrollView()
        scroll.delegate = context.coordinator
        scroll.minimumZoomScale = 1
        scroll.maximumZoomScale = 5
        scroll.showsVerticalScrollIndicator = false
        scroll.showsHorizontalScrollIndicator = false
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.backgroundColor = .clear

        let view = UIImageView(image: image)
        view.contentMode = .scaleAspectFit
        view.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(view)
        NSLayoutConstraint.activate([
            view.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            view.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            view.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            view.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            view.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
            view.heightAnchor.constraint(equalTo: scroll.frameLayoutGuide.heightAnchor),
        ])
        context.coordinator.imageView = view
        context.coordinator.shownSize = image.size

        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.doubleTap(_:)))
        tap.numberOfTapsRequired = 2
        scroll.addGestureRecognizer(tap)

        let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.pan(_:)))
        pan.delegate = context.coordinator
        pan.maximumNumberOfTouches = 1
        scroll.addGestureRecognizer(pan)
        return scroll
    }

    func updateUIView(_ scroll: UIScrollView, context: Context) {
        context.coordinator.onDrag = onDrag
        context.coordinator.onEnd = onEnd
        guard let view = context.coordinator.imageView, view.image !== image else { return }
        // Другая картинка (новый арт студии) — сброс увеличения и плавная смена;
        // тот же арт в лучшем качестве — просто подмена.
        let replacing = context.coordinator.shownSize.width / max(context.coordinator.shownSize.height, 1)
            != image.size.width / max(image.size.height, 1) || context.coordinator.swapping
        context.coordinator.swapping = false
        if replacing { scroll.setZoomScale(1, animated: false) }
        context.coordinator.shownSize = image.size
        UIView.transition(with: view, duration: 0.25, options: .transitionCrossDissolve) {
            view.image = image
        }
    }

    final class Coordinator: NSObject, UIScrollViewDelegate, UIGestureRecognizerDelegate {
        weak var imageView: UIImageView?
        var shownSize: CGSize = .zero
        var swapping = false
        var onDrag: (CGSize) -> Void = { _ in }
        var onEnd: (CGFloat, CGFloat) -> Void = { _, _ in }

        func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

        @objc func doubleTap(_ gesture: UITapGestureRecognizer) {
            guard let scroll = gesture.view as? UIScrollView else { return }
            if scroll.zoomScale > 1.01 {
                scroll.setZoomScale(1, animated: true)
                return
            }
            let point = gesture.location(in: imageView)
            let size = CGSize(width: scroll.bounds.width / 2.5, height: scroll.bounds.height / 2.5)
            scroll.zoom(to: CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2,
                                   width: size.width, height: size.height), animated: true)
        }

        /// Смахивание — только у неувеличенной картинки и только по вертикали.
        func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
            guard let pan = gesture as? UIPanGestureRecognizer,
                  let scroll = pan.view as? UIScrollView,
                  pan !== scroll.panGestureRecognizer else { return true }
            guard scroll.zoomScale <= scroll.minimumZoomScale + 0.01 else { return false }
            let velocity = pan.velocity(in: scroll)
            return abs(velocity.y) > abs(velocity.x) * 1.2
        }

        func gestureRecognizer(_ gesture: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            guard let scroll = gesture.view as? UIScrollView else { return false }
            return other === scroll.panGestureRecognizer
        }

        @objc func pan(_ gesture: UIPanGestureRecognizer) {
            // В координатах окна: сам вид едет за пальцем, его координаты не годятся.
            let shift = gesture.translation(in: nil)
            switch gesture.state {
            case .changed:
                onDrag(CGSize(width: shift.x * 0.35, height: shift.y))
            case .ended, .cancelled, .failed:
                onEnd(gesture.velocity(in: nil).y, shift.y)
            default:
                break
            }
        }
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
