import ImageIO
import UIKit

/// Вложение сообщения в ленте. Сами байты картинки лежат в `ImageStore` под ключом `id`.
struct FeedAttachment: Identifiable, Equatable {
    enum Kind: Equatable {
        case image, pdf, markdown, video, file
    }

    let id: String
    let name: String
    let kind: Kind

    var symbol: String {
        switch kind {
        case .image: return "photo"
        case .pdf: return "doc.richtext"
        case .markdown: return "doc.text"
        case .video: return "film"
        case .file: return "paperclip"
        }
    }

    static func kind(ofDataURL url: String) -> Kind {
        if url.hasPrefix("data:image/") { return .image }
        if url.hasPrefix("data:application/pdf") { return .pdf }
        if url.hasPrefix("data:text/markdown") { return .markdown }
        if url.hasPrefix("data:video/") { return .video }
        return .file
    }
}

/// Картинка или видео, созданные моделью (`generated_images` сообщения).
/// Сам файл сервер отдаёт отдельно: `/api/images/{id}/image/0`.
struct FeedArt: Identifiable, Equatable {
    let id: String
    let status: String
    let width: Int
    let height: Int
    let ready: Bool
    let isVideo: Bool
    let error: String

    var busy: Bool { ["queued", "preparing", "generating"].contains(status) }

    var ratio: CGFloat {
        guard width > 0, height > 0 else { return 1 }
        return min(max(CGFloat(width) / CGFloat(height), 0.45), 2.4)
    }

    var statusText: String {
        if !error.isEmpty { return error }
        switch status {
        case "queued": return "Подготовка изображения…"
        case "preparing": return "Освобождаю память…"
        case "generating": return "Генерирую изображение…"
        case "cancelled": return "Генерация остановлена"
        case "error": return "Не удалось создать изображение"
        default: return "Изображение недоступно"
        }
    }

    init(id: String, status: String = "done", width: Int = 1024, height: Int = 1024, ready: Bool = true,
         isVideo: Bool = false, error: String = "") {
        self.id = id
        self.status = status
        self.width = width
        self.height = height
        self.ready = ready
        self.isVideo = isVideo
        self.error = error
    }

    init?(json: [String: Any]) {
        guard let id = json["id"] as? String, !id.isEmpty else { return nil }
        self.id = id
        status = (json["status"] as? String) ?? ""
        width = (json["width"] as? NSNumber)?.intValue ?? 0
        height = (json["height"] as? NSNumber)?.intValue ?? 0
        isVideo = (json["media_kind"] as? String) == "video"
        let count = (json["image_count"] as? NSNumber)?.intValue ?? 0
        ready = status == "done" && count > 0 && !isVideo
        error = (json["error"] as? String) ?? ""
    }

    static func list(_ value: Any?) -> [FeedArt] {
        ((value as? [[String: Any]]) ?? []).compactMap { FeedArt(json: $0) }
    }
}

/// Что показать на весь экран: вложение из `ImageStore` или картинку модели с сервера.
struct ViewerItem: Identifiable, Equatable {
    enum Source: Equatable {
        case attachment(String)
        case art(String)
    }

    let source: Source

    var id: String {
        switch source {
        case .attachment(let key): return key
        case .art(let art): return "art:" + art
        }
    }
}

/// Вложение, выбранное для ещё не отправленного сообщения.
struct DraftAttachment: Identifiable, Equatable {
    let id = UUID()
    let name: String
    /// Как ждёт сервер: `data:<тип>;base64,<данные>`.
    let dataURL: String
    let kind: FeedAttachment.Kind
    /// Ключ миниатюры в `ImageStore` (только у картинок).
    var storeKey: String { "draft:\(id.uuidString)" }

    static func == (left: DraftAttachment, right: DraftAttachment) -> Bool { left.id == right.id }
}

/// Память картинок: исходные байты вложений и уже раскодированные изображения.
/// Обе части сами освобождаются при нехватке памяти.
enum ImageStore {
    private static let bytes: NSCache<NSString, NSData> = {
        let cache = NSCache<NSString, NSData>()
        cache.totalCostLimit = 160 * 1024 * 1024
        return cache
    }()

    private static let images: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.totalCostLimit = 220 * 1024 * 1024
        return cache
    }()

    static func put(_ data: Data, key: String) {
        bytes.setObject(data as NSData, forKey: key as NSString, cost: data.count)
    }

    static func data(_ key: String) -> Data? {
        bytes.object(forKey: key as NSString) as Data?
    }

    static func image(_ key: String) -> UIImage? {
        images.object(forKey: key as NSString)
    }

    static func put(_ image: UIImage, key: String) {
        let cost = Int(image.size.width * image.scale * image.size.height * image.scale * 4)
        images.setObject(image, forKey: key as NSString, cost: cost)
    }

    /// Байты из `data:`-адреса.
    static func decode(dataURL: String) -> Data? {
        guard let comma = dataURL.firstIndex(of: ",") else { return nil }
        return Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...]))
    }

    /// Уменьшенная копия без раскодирования картинки целиком.
    static func downsample(_ data: Data, maxPixel: CGFloat) -> UIImage? {
        let options = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, options) else { return nil }
        let settings: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        let thumb = settings as CFDictionary
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, thumb) else { return nil }
        return UIImage(cgImage: image)
    }

    /// Картинка вложения: `thumb` — для ленты, иначе в полном размере для просмотра.
    static func attachmentImage(_ key: String, thumb: Bool) -> UIImage? {
        let cacheKey = key + (thumb ? ":thumb" : ":full")
        if let ready = image(cacheKey) { return ready }
        guard let data = data(key), let made = downsample(data, maxPixel: thumb ? 720 : 2400) else { return nil }
        put(made, key: cacheKey)
        return made
    }
}

struct AttachmentError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// Подготовка вложений так же, как на сайте (`frontend/src/chatAttachments.ts`):
/// картинки ужимаются до 1600 px и JPEG, PDF и Markdown уходят как есть.
enum AttachmentPrep {
    static let limit = 8

    private static let pdfModels: Set<String> = [
        "aistudio/gemini-4-carbon", "aistudio/gemini-4-argon",
        "aistudio/gemini-3.8-flash", "aistudio/gemini-3.5-flash-lite",
    ]

    static func image(data: Data, name: String) throws -> DraftAttachment {
        guard let source = ImageStore.downsample(data, maxPixel: 1600) else {
            throw AttachmentError(message: "Не удалось прочитать изображение.")
        }
        return try image(source, name: name)
    }

    static func image(_ source: UIImage, name: String) throws -> DraftAttachment {
        let longest = max(source.size.width * source.scale, source.size.height * source.scale)
        guard longest > 0 else { throw AttachmentError(message: "Не удалось прочитать изображение.") }
        let ratio = min(1, 1600 / longest)
        let size = CGSize(width: (source.size.width * source.scale * ratio).rounded(),
                          height: (source.size.height * source.scale * ratio).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let flat = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: size))
            source.draw(in: CGRect(origin: .zero, size: size))
        }
        guard let jpeg = flat.jpegData(compressionQuality: 0.86) else {
            throw AttachmentError(message: "Не удалось подготовить изображение.")
        }
        let base = (name as NSString).deletingPathExtension
        let item = DraftAttachment(name: (base.isEmpty ? "Фото" : base) + ".jpg",
                                   dataURL: "data:image/jpeg;base64," + jpeg.base64EncodedString(), kind: .image)
        ImageStore.put(jpeg, key: item.storeKey)
        return item
    }

    /// Файл из «Файлов»: Markdown, PDF или картинка.
    static func file(at url: URL, model: String) throws -> DraftAttachment {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let name = url.lastPathComponent
        let kind = url.pathExtension.lowercased()
        guard let data = try? Data(contentsOf: url) else {
            throw AttachmentError(message: "Не удалось прочитать файл.")
        }
        switch kind {
        case "md", "markdown":
            guard String(data: data, encoding: .utf8) != nil else {
                throw AttachmentError(message: "Не удалось прочитать Markdown: сохраните файл в UTF-8.")
            }
            return DraftAttachment(name: name, dataURL: "data:text/markdown;base64," + data.base64EncodedString(),
                                   kind: .markdown)
        case "pdf":
            guard pdfModels.contains(model) else {
                throw AttachmentError(message: "Для PDF выберите Gemini через AI Studio: Carbon, Argon, Flash или Flash-Lite.")
            }
            guard data.starts(with: Data("%PDF-".utf8)) else {
                throw AttachmentError(message: "Не удалось прочитать PDF: неверный заголовок файла.")
            }
            return DraftAttachment(name: name, dataURL: "data:application/pdf;base64," + data.base64EncodedString(),
                                   kind: .pdf)
        case "png", "jpg", "jpeg", "webp", "heic", "heif":
            return try image(data: data, name: name)
        default:
            throw AttachmentError(message: "Выберите Markdown (.md), PDF, PNG, JPEG или WebP.")
        }
    }
}
