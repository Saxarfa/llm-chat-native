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
            note("Видео — просмотр появится на одном из следующих этапов", symbol: "film")
        } else if art.ready {
            Button {
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
struct ImageViewer: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let item: ViewerItem
    @State private var image: UIImage?
    @State private var loading = true
    @State private var note: String?
    @State private var saving = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let image {
                ZoomableImage(image: image)
                    .ignoresSafeArea()
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
        .task { await load() }
    }

    private func load() async {
        switch item.source {
        case .attachment(let key):
            image = await Task.detached(priority: .userInitiated) {
                ImageStore.attachmentImage(key, thumb: false)
            }.value
        case .art(let id):
            // Сначала то, что уже есть в ленте, затем оригинал.
            image = await model.artImage(id, preview: true)
            if let original = await model.artImage(id, preview: false) {
                image = original
            } else if image != nil {
                show("Оригинал недоступен — показана уменьшенная копия.")
            }
        }
        loading = false
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

/// Картинка в системной прокрутке с увеличением.
private struct ZoomableImage: UIViewRepresentable {
    let image: UIImage

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

        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.doubleTap(_:)))
        tap.numberOfTapsRequired = 2
        scroll.addGestureRecognizer(tap)
        return scroll
    }

    func updateUIView(_ scroll: UIScrollView, context: Context) {
        guard let view = context.coordinator.imageView, view.image !== image else { return }
        view.image = image
    }

    final class Coordinator: NSObject, UIScrollViewDelegate {
        weak var imageView: UIImageView?

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
