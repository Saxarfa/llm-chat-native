import AVFoundation
import PhotosUI
import SwiftUI
import UIKit

/// Вложения нового сообщения, картинки с сервера и действия над чатом из шторки.
extension AppModel {
    // MARK: - Вложения

    /// Фото, выбранные в галерее.
    func addPhotos(_ items: [PhotosPickerItem]) async {
        attachmentsBusy = true
        defer { attachmentsBusy = false }
        for item in items {
            guard hasRoomForAttachment() else { break }
            guard let data = try? await item.loadTransferable(type: Data.self) else {
                sendError = "Не удалось загрузить фото из галереи."
                continue
            }
            await addPrepared { try AttachmentPrep.image(data: data, name: "Фото") }
        }
    }

    /// Снимок с камеры.
    func addCamera(_ image: UIImage) async {
        guard hasRoomForAttachment() else { return }
        attachmentsBusy = true
        defer { attachmentsBusy = false }
        await addPrepared { try AttachmentPrep.image(image, name: "Снимок") }
    }

    /// Файлы из приложения «Файлы».
    func addFiles(_ urls: [URL]) async {
        attachmentsBusy = true
        defer { attachmentsBusy = false }
        let chosen = activeModelID
        for url in urls {
            guard hasRoomForAttachment() else { break }
            await addPrepared { try AttachmentPrep.file(at: url, model: chosen) }
        }
    }

    func removeAttachment(_ item: DraftAttachment) {
        draftAttachments.removeAll { $0.id == item.id }
    }

    private func hasRoomForAttachment() -> Bool {
        if draftAttachments.count < AttachmentPrep.limit { return true }
        sendError = "Не больше \(AttachmentPrep.limit) вложений в одном сообщении."
        return false
    }

    /// Чтение и сжатие — вне главного потока.
    private func addPrepared(_ make: @escaping @Sendable () throws -> DraftAttachment) async {
        do {
            let item = try await Task.detached(priority: .userInitiated) { try make() }.value
            draftAttachments.append(item)
            Haptics.tap()
        } catch {
            sendError = (error as? AttachmentError)?.message ?? "Не удалось добавить вложение."
            Haptics.error()
        }
    }

    // MARK: - Картинки модели

    /// Картинка, созданная моделью: `preview` — уменьшенная для ленты, иначе оригинал.
    func artImage(_ id: String, preview small: Bool) async -> UIImage? {
        let key = "art:\(id):" + (small ? "p" : "o")
        if let ready = ImageStore.image(key) { return ready }
        guard let api else { return nil }
        let path = "/api/images/\(APIClient.pathSafe(id))/image/0" + (small ? "?preview=true&preview_size=960" : "")
        guard let data = try? await api.data(path) else { return nil }
        let image = await Task.detached(priority: .userInitiated) { () -> UIImage? in
            guard let decoded = UIImage(data: data) else { return nil }
            return decoded.preparingForDisplay() ?? decoded
        }.value
        if let image { ImageStore.put(image, key: key) }
        return image
    }

    // MARK: - Видео модели (Omni)

    /// Где лежит скачанный ролик: папка кэшей, система чистит её сама при нехватке места.
    nonisolated static func videoURL(_ id: String) -> URL {
        let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("omni", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let safe = id.replacingOccurrences(of: "[^A-Za-z0-9_-]", with: "_", options: .regularExpression)
        return folder.appendingPathComponent(safe + ".mp4")
    }

    /// Скачивает ролик, если его ещё нет на телефоне, и готовит первый кадр для ленты.
    func videoFile(_ id: String) async throws -> URL {
        let target = Self.videoURL(id)
        if FileManager.default.fileExists(atPath: target.path) { return target }
        guard let api else { throw APIError.unreachable }
        try await api.download("/api/images/nano/videos/\(APIClient.pathSafe(id))/0", to: target)
        _ = await videoPoster(id)
        return target
    }

    /// Первый кадр уже скачанного ролика (для плитки в ленте).
    func videoPoster(_ id: String) async -> UIImage? {
        let key = "video:\(id):poster"
        if let ready = ImageStore.image(key) { return ready }
        let file = Self.videoURL(id)
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: file))
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 960, height: 960)
        guard let frame = try? await generator.image(at: .zero).image else { return nil }
        let image = UIImage(cgImage: frame)
        ImageStore.put(image, key: key)
        return image
    }

    // MARK: - Действия над чатом

    func rename(_ chat: ChatSummary, to rawTitle: String) async {
        let title = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title != chat.title else { return }
        await patch(chat, body: ["title": title]) { $0.title = title }
    }

    func setPinned(_ chat: ChatSummary, _ pinned: Bool) async {
        await patch(chat, body: ["pinned": pinned]) { $0.pinned = pinned }
        // Закреплённые сервер ставит первыми — берём его порядок.
        await refreshChats()
    }

    private func patch(_ chat: ChatSummary, body: [String: Any], change: (inout ChatSummary) -> Void) async {
        guard preview == nil, let api, let index = chats.firstIndex(where: { $0.id == chat.id }) else { return }
        let previous = chats[index]
        change(&chats[index])
        Haptics.tap()
        do {
            _ = try await api.json("/api/chats/\(APIClient.pathSafe(chat.id))/metadata", method: "PATCH", body: body)
        } catch {
            if let position = chats.firstIndex(where: { $0.id == chat.id }) { chats[position] = previous }
            chatsNotice = (error as? APIError)?.message ?? "Не удалось изменить чат."
            Haptics.error()
        }
    }

    /// Удаление: сервер кладёт чат в корзину, вернуть его можно на сайте.
    func delete(_ chat: ChatSummary) async {
        guard preview == nil, let api else { return }
        do {
            _ = try await api.json("/api/chats/\(APIClient.pathSafe(chat.id))", method: "DELETE")
            chats.removeAll { $0.id == chat.id }
            lives[chat.id] = nil
            liveRaw[chat.id] = nil
            threadCache[chat.id] = nil
            if activeChatID == chat.id { activeChatID = nil }
            Haptics.success()
        } catch {
            chatsNotice = (error as? APIError)?.message ?? "Не удалось удалить чат."
            Haptics.error()
        }
    }
}
