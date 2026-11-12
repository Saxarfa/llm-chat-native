import Foundation
import Observation
import UIKit
import os

/// Модели на самом iPhone: список файлов, скачивание с Hugging Face, токен, загрузка в движок.
@MainActor
@Observable
final class PhoneModels {
    /// Идущая или прерванная загрузка файла.
    struct Download: Identifiable, Equatable {
        enum State: Equatable {
            case preparing, running, failed(String)
        }

        let file: String
        let repo: String
        /// Путь в репозитории (для повтора, если докачать с места нельзя).
        var path: String = ""
        var received: Int64 = 0
        var total: Int64 = 0
        var state: State = .preparing
        var id: String { file }
        var progress: Double { total > 0 ? min(1, Double(received) / Double(total)) : 0 }
    }

    var installed: [PhoneModel] = []
    var downloads: [String: Download] = [:]
    var hasToken = false

    var query = ""
    var results: [HFRepo] = []
    var searching = false
    var searchError: String?
    var files: [String: [HFFile]] = [:]
    var filesError: [String: String] = [:]

    /// Модель в памяти движка и её контекст.
    var loadedFile: String?
    var contextSize = 0
    var loading = false
    var generating = false
    var notice: String?
    /// Сведения из заголовков файлов (шаблон, рассуждения, обучающий контекст).
    var infos: [String: GGUFInfo] = [:]

    @ObservationIgnored weak var app: AppModel?
    @ObservationIgnored let runner = LlamaRunner()
    @ObservationIgnored private var resumeData: [String: Data] = [:]
    @ObservationIgnored private var started = false
    /// С каким контекстом из настроек загружена модель (фактический может быть меньше обучающего).
    @ObservationIgnored private var loadedWanted = 0

    static let tokenKey = "hf_token"
    static let context = 4096
    /// Ключ размера контекста в параметрах модели (`model_configs` на ПК).
    static let contextKey = "phone_context"
    static let contextChoices = [2048, 4096, 8192, 16384, 32768]

    private var isPreview: Bool { app?.preview != nil }

    /// Пункты группы «На телефоне» в выборе модели.
    var options: [ModelOption] {
        installed.map { ModelOption(id: $0.chatID, name: PhoneModelNames.display($0.chatID), group: .phone,
                                    loaded: $0.file == loadedFile) }
    }

    // MARK: - Запуск

    func start() {
        guard !started, !isPreview else { return }
        started = true
        hasToken = !(Keychain.get(Self.tokenKey) ?? "").isEmpty
        reloadInstalled()
        DownloadCenter.shared.owner = self
        DownloadCenter.shared.reattach()
        let center = NotificationCenter.default
        center.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in
                guard let self, !self.generating else { return }
                await self.unload()
            }
        }
        // В фоне iOS не даёт работать Metal — ответ останавливается, написанное сохраняется.
        center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.runner.cancel() }
        }
    }

    nonisolated static var folder: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        var url = base.appendingPathComponent("Models", isDirectory: true)
        if !FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            // Модели весят гигабайты — в резервную копию iCloud их не кладём.
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? url.setResourceValues(values)
        }
        return url
    }

    nonisolated private static var indexURL: URL { folder.appendingPathComponent("models.json") }

    nonisolated static func path(of file: String) -> URL { folder.appendingPathComponent(file) }

    /// Список сверяется с папкой: файлы без записи добавляются, записи без файлов убираются.
    func reloadInstalled() {
        var list = (try? JSONDecoder().decode([PhoneModel].self, from: Data(contentsOf: Self.indexURL))) ?? []
        let names = (try? FileManager.default.contentsOfDirectory(atPath: Self.folder.path)) ?? []
        let ggufs = Set(names.filter { $0.lowercased().hasSuffix(".gguf") })
        list.removeAll { !ggufs.contains($0.file) }
        for name in ggufs where !list.contains(where: { $0.file == name }) {
            let size = (try? FileManager.default.attributesOfItem(atPath: Self.path(of: name).path)[.size] as? NSNumber)?.int64Value ?? 0
            list.append(PhoneModel(file: name, repo: nil, size: size, added: Date().timeIntervalSince1970))
        }
        installed = list.sorted { $0.added > $1.added }
        saveIndex()
    }

    private func saveIndex() {
        guard !isPreview, let data = try? JSONEncoder().encode(installed) else { return }
        try? data.write(to: Self.indexURL, options: .atomic)
    }

    // MARK: - Память

    /// Сколько памяти может занять модель: свободное приложению плюс уже загруженная модель.
    var availableMemory: Int64 {
        if isPreview { return 5_200_000_000 }
        var free = Int64(os_proc_available_memory())
        if let loadedFile, let model = installed.first(where: { $0.file == loadedFile }) { free += model.size }
        return free
    }

    var diskFree: Int64 {
        let values = try? Self.folder.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
        return values?.volumeAvailableCapacityForImportantUsage ?? 0
    }

    var diskUsed: Int64 { installed.reduce(0) { $0 + $1.size } }

    func fit(_ size: Int64, context: Int = PhoneModels.context) -> PhoneMemory.Fit {
        PhoneMemory.fit(fileSize: size, available: availableMemory, context: context)
    }

    // MARK: - Сведения о модели

    /// Читает заголовок файла один раз (в фоне: у больших словарей это десятки миллисекунд).
    func loadInfo(_ file: String) async {
        guard infos[file] == nil else { return }
        if isPreview {
            infos[file] = PreviewScene.phoneInfo(file)
            return
        }
        let url = Self.path(of: file)
        if let info = await Task.detached(priority: .utility, operation: { GGUFInfo.read(url: url) }).value {
            infos[file] = info
        }
    }

    /// Варианты контекста не больше обучающего.
    func contextChoices(_ file: String) -> [Int] {
        let limit = infos[file]?.trainContext ?? Self.contextChoices.last!
        let list = Self.contextChoices.filter { $0 <= limit }
        return list.isEmpty ? [Self.contextChoices[0]] : list
    }

    /// Размер контекста из настроек модели.
    func wantedContext(_ file: String) -> Int {
        let saved = app?.settings.modelConfigs[PhoneModelID.make(file: file)]
        let value = ChatParameters.number(ChatConfig.dict(saved)[Self.contextKey]).map { Int($0) } ?? Self.context
        return Self.contextChoices.contains(value) ? value : Self.context
    }

    // MARK: - Токен

    func setToken(_ raw: String?) {
        let token = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        Keychain.set(token.isEmpty ? nil : token, for: Self.tokenKey)
        hasToken = !token.isEmpty
        files = [:]
        filesError = [:]
    }

    private var token: String? {
        let value = Keychain.get(Self.tokenKey) ?? ""
        return value.isEmpty ? nil : value
    }

    // MARK: - Hugging Face

    private func hfRequest(_ url: URL, method: String = "GET") -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("LLMChat-iOS", forHTTPHeaderField: "User-Agent")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }

    func search() async {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if isPreview {
            results = PreviewScene.phoneRepos.filter { text.isEmpty || $0.id.localizedCaseInsensitiveContains(text) }
            return
        }
        var components = URLComponents(string: "https://huggingface.co/api/models")!
        components.queryItems = [
            URLQueryItem(name: "filter", value: "gguf"),
            URLQueryItem(name: "sort", value: "downloads"),
            URLQueryItem(name: "direction", value: "-1"),
            URLQueryItem(name: "limit", value: "40"),
        ] + (text.isEmpty ? [] : [URLQueryItem(name: "search", value: text)])
        searching = true
        defer { searching = false }
        do {
            let (data, response) = try await URLSession.shared.data(for: hfRequest(components.url!))
            try Self.check(response, data: data)
            let list = (try JSONSerialization.jsonObject(with: data) as? [[String: Any]]) ?? []
            guard query.trimmingCharacters(in: .whitespacesAndNewlines) == text else { return }
            results = list.compactMap(HFRepo.init(json:))
            searchError = results.isEmpty ? "Ничего не нашлось. Попробуйте другое название." : nil
        } catch is CancellationError {
        } catch {
            searchError = (error as? PhoneEngineError)?.message ?? "Hugging Face недоступен. Проверьте интернет."
        }
    }

    func loadFiles(_ repo: String) async {
        if isPreview {
            files[repo] = PreviewScene.phoneFiles
            return
        }
        let path = repo.split(separator: "/").map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }.joined(separator: "/")
        guard let url = URL(string: "https://huggingface.co/api/models/\(path)/tree/main?recursive=true") else { return }
        do {
            let (data, response) = try await URLSession.shared.data(for: hfRequest(url))
            try Self.check(response, data: data)
            let tree = (try JSONSerialization.jsonObject(with: data) as? [[String: Any]]) ?? []
            let list = HFFile.list(tree)
            files[repo] = list
            filesError[repo] = list.isEmpty ? "В репозитории нет цельных файлов GGUF, которые можно скачать на телефон." : nil
        } catch is CancellationError {
        } catch {
            filesError[repo] = (error as? PhoneEngineError)?.message ?? "Не удалось получить список файлов."
        }
    }

    private static func check(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        switch http.statusCode {
        case 200..<300: return
        case 401, 403:
            throw PhoneEngineError(message: "Модель закрыта. Добавьте токен Hugging Face и примите условия модели на её странице.")
        case 404: throw PhoneEngineError(message: "Не найдено на Hugging Face.")
        case 429: throw PhoneEngineError(message: "Hugging Face просит подождать. Попробуйте через минуту.")
        default: throw PhoneEngineError(message: "Hugging Face ответил ошибкой \(http.statusCode).")
        }
    }

    // MARK: - Скачивание

    func download(repo: String, file: HFFile) async {
        let name = file.file
        guard downloads[name] == nil || downloads[name]?.state != .running else { return }
        if installed.contains(where: { $0.file == name }) {
            notice = "Эта модель уже на телефоне."
            return
        }
        if !isPreview, file.size > 0, diskFree > 0, file.size + 500_000_000 > diskFree {
            notice = "Не хватает места: нужно \(PhoneMemory.gigabytes(file.size)), свободно \(PhoneMemory.gigabytes(diskFree))."
            return
        }
        Haptics.tap()
        downloads[name] = Download(file: name, repo: repo, path: file.path, total: file.size)
        if isPreview {
            downloads[name]?.state = .running
            downloads[name]?.received = file.size * 2 / 5
            return
        }
        do {
            let url = try await resolve(repo: repo, path: file.path)
            DownloadCenter.shared.start(url: url, file: name, repo: repo, path: file.path, resume: resumeData.removeValue(forKey: name))
            downloads[name]?.state = .running
        } catch {
            downloads[name]?.state = .failed((error as? PhoneEngineError)?.message ?? "Не удалось начать скачивание.")
        }
    }

    /// Адрес файла на CDN. Токен нужен только самому Hugging Face: подписанная ссылка CDN
    /// с заголовком авторизации не работает, а фоновая загрузка не даёт его убрать на переадресации.
    private func resolve(repo: String, path: String) async throws -> URL {
        let encoded = (repo + "/resolve/main/" + path).split(separator: "/", omittingEmptySubsequences: false)
            .map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
            .joined(separator: "/")
        guard let url = URL(string: "https://huggingface.co/" + encoded) else {
            throw PhoneEngineError(message: "Неверный адрес файла.")
        }
        let (data, response) = try await URLSession.shared.data(for: hfRequest(url, method: "HEAD"), delegate: RedirectStopper())
        guard let http = response as? HTTPURLResponse else { return url }
        if (300..<400).contains(http.statusCode), let location = http.value(forHTTPHeaderField: "Location"),
           let target = URL(string: location, relativeTo: url)?.absoluteURL {
            return target
        }
        try Self.check(response, data: data)
        return url
    }

    func cancelDownload(_ file: String) {
        DownloadCenter.shared.cancel(file: file)
        downloads[file] = nil
        resumeData[file] = nil
    }

    func retry(_ item: Download) async {
        downloads[item.file] = nil
        await download(repo: item.repo, file: HFFile(path: item.path.isEmpty ? item.file : item.path, size: item.total))
    }

    // События фоновой загрузки (из `DownloadCenter`).
    func progress(file: String, repo: String, path: String, received: Int64, total: Int64) {
        var item = downloads[file] ?? Download(file: file, repo: repo, path: path)
        item.received = received
        if total > 0 { item.total = total }
        item.state = .running
        downloads[file] = item
    }

    func finished(file: String, repo: String, size: Int64) {
        downloads[file] = nil
        installed.removeAll { $0.file == file }
        installed.insert(PhoneModel(file: file, repo: repo, size: size, added: Date().timeIntervalSince1970), at: 0)
        saveIndex()
        Haptics.success()
    }

    func failed(file: String, repo: String, path: String, message: String, resume: Data?) {
        if let resume { resumeData[file] = resume }
        var item = downloads[file] ?? Download(file: file, repo: repo, path: path)
        item.state = .failed(message)
        downloads[file] = item
    }

    // MARK: - Добавление и удаление

    /// Файл из «Файлов»: копируется в папку моделей.
    func importFile(_ source: URL) {
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        let name = source.lastPathComponent
        guard name.lowercased().hasSuffix(".gguf") else {
            notice = "Нужен файл модели в формате GGUF."
            return
        }
        let target = Self.path(of: name)
        do {
            if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
            try FileManager.default.copyItem(at: source, to: target)
            let size = (try FileManager.default.attributesOfItem(atPath: target.path)[.size] as? NSNumber)?.int64Value ?? 0
            installed.removeAll { $0.file == name }
            installed.insert(PhoneModel(file: name, repo: nil, size: size, added: Date().timeIntervalSince1970), at: 0)
            saveIndex()
            Haptics.success()
        } catch {
            notice = "Не удалось скопировать файл: \(error.localizedDescription)"
        }
    }

    func delete(_ model: PhoneModel) async {
        if loadedFile == model.file { await unload() }
        if !isPreview { try? FileManager.default.removeItem(at: Self.path(of: model.file)) }
        installed.removeAll { $0.file == model.file }
        infos[model.file] = nil
        saveIndex()
    }

    // MARK: - Движок

    func unload() async {
        guard loadedFile != nil else { return }
        await runner.unload()
        loadedFile = nil
        contextSize = 0
    }

    /// Загружает модель в память, если в ней другая. Ошибка — уже текстом для пользователя.
    func ensureLoaded(_ file: String) async throws {
        if isPreview {
            loadedFile = file
            contextSize = Self.context
            return
        }
        let wanted = wantedContext(file)
        if loadedFile == file, runner.loadedPath != nil, loadedWanted == wanted { return }
        guard let model = installed.first(where: { $0.file == file }) else {
            throw PhoneEngineError(message: "Модели «\(PhoneModelNames.title(file))» нет на этом телефоне. Скачайте её в окне «Модели на телефоне».")
        }
        await unload()
        if fit(model.size, context: wanted) == .tooBig {
            throw PhoneEngineError(message: "Модели нужно около \(PhoneMemory.gigabytes(PhoneMemory.needed(fileSize: model.size, context: wanted))) памяти, а свободно \(PhoneMemory.gigabytes(availableMemory)). Выберите модель поменьше, квантование ниже или контекст меньше (Модели на телефоне → Настройки).")
        }
        loading = true
        defer { loading = false }
        contextSize = try await runner.load(path: Self.path(of: file).path, context: wanted)
        loadedFile = file
        loadedWanted = wanted
    }

    /// Ответ модели кусками текста. В режиме снимков — заготовленный текст.
    func stream(messages: [(role: String, content: String)], sampling: PhoneSampling,
                stats: @escaping @Sendable (PhoneRunStats) -> Void) -> AsyncThrowingStream<String, Error> {
        if isPreview { return Self.previewStream() }
        return runner.stream(messages: messages, sampling: sampling, stats: stats)
    }

    func cancel() {
        runner.cancel()
    }

    private static func previewStream() -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            Task {
                let words = "Работаю прямо на телефоне, без связи с компьютером. Ответ считает llama.cpp на Metal — примерно 20 токенов в секунду для модели на 4 миллиарда параметров.".split(separator: " ")
                for word in words {
                    try? await Task.sleep(nanoseconds: 60_000_000)
                    continuation.yield(String(word) + " ")
                }
                continuation.finish()
            }
        }
    }

    // MARK: - Режим снимков

    func loadPreview() {
        installed = PreviewScene.phoneInstalled
        hasToken = false
        results = PreviewScene.phoneRepos
        files = [PreviewScene.phoneRepos[0].id: PreviewScene.phoneFiles]
        downloads = ["gemma-3-4b-it-Q4_K_M.gguf": Download(file: "gemma-3-4b-it-Q4_K_M.gguf", repo: "unsloth/gemma-3-4b-it-GGUF",
                                                            received: 1_120_000_000, total: 2_490_000_000, state: .running)]
    }

    func reset() {
        results = []
        files = [:]
        filesError = [:]
        query = ""
        searchError = nil
        notice = nil
    }
}

/// Не идти по переадресации: нужен сам адрес CDN, чтобы скачать файл уже без токена.
private final class RedirectStopper: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

/// Фоновая загрузка моделей: продолжается, даже если приложение свернули.
final class DownloadCenter: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    static let shared = DownloadCenter()
    static let identifier = "app.llmchat.native.models"

    @MainActor weak var owner: PhoneModels?
    /// Система разбудила приложение ради завершившихся загрузок — вызвать, когда события обработаны.
    var backgroundCompletion: (() -> Void)?

    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.identifier)
        configuration.isDiscretionary = false
        configuration.sessionSendsLaunchEvents = true
        configuration.allowsCellularAccess = true
        return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }()

    private struct Tag: Codable {
        let file: String
        let repo: String
        var path: String?
    }

    private func tag(_ task: URLSessionTask) -> Tag? {
        guard let text = task.taskDescription, let data = text.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(Tag.self, from: data)
    }

    /// После перезапуска приложения: показать загрузки, которые система продолжала без него.
    func reattach() {
        session.getAllTasks { tasks in
            for task in tasks where task.state == .running {
                guard let tag = self.tag(task) else { continue }
                let received = task.countOfBytesReceived
                let total = task.countOfBytesExpectedToReceive
                Task { @MainActor in
                    self.owner?.progress(file: tag.file, repo: tag.repo, path: tag.path ?? tag.file, received: received, total: total)
                }
            }
        }
    }

    func start(url: URL, file: String, repo: String, path: String, resume: Data?) {
        let task = resume.map { session.downloadTask(withResumeData: $0) } ?? session.downloadTask(with: url)
        if let data = try? JSONEncoder().encode(Tag(file: file, repo: repo, path: path)) {
            task.taskDescription = String(data: data, encoding: .utf8)
        }
        task.resume()
    }

    func cancel(file: String) {
        session.getAllTasks { tasks in
            for task in tasks where self.tag(task)?.file == file { task.cancel() }
        }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard let tag = tag(downloadTask) else { return }
        Task { @MainActor in
            self.owner?.progress(file: tag.file, repo: tag.repo, path: tag.path ?? tag.file,
                                 received: totalBytesWritten, total: totalBytesExpectedToWrite)
        }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let tag = tag(downloadTask) else { return }
        let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 200
        guard (200..<300).contains(status) else {
            let message = status == 401 || status == 403
                ? "Модель закрыта. Добавьте токен Hugging Face и примите условия модели на её странице."
                : "Сервер ответил ошибкой \(status)."
            Task { @MainActor in self.owner?.failed(file: tag.file, repo: tag.repo, path: tag.path ?? tag.file, message: message, resume: nil) }
            return
        }
        // Временный файл живёт только до конца этого вызова — переносим сразу.
        let target = PhoneModels.path(of: tag.file)
        do {
            if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
            try FileManager.default.moveItem(at: location, to: target)
            let size = (try FileManager.default.attributesOfItem(atPath: target.path)[.size] as? NSNumber)?.int64Value ?? 0
            Task { @MainActor in self.owner?.finished(file: tag.file, repo: tag.repo, size: size) }
        } catch {
            let message = "Не удалось сохранить файл: \(error.localizedDescription)"
            Task { @MainActor in self.owner?.failed(file: tag.file, repo: tag.repo, path: tag.path ?? tag.file, message: message, resume: nil) }
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let error, let tag = tag(task) else { return }
        let nsError = error as NSError
        if nsError.code == NSURLErrorCancelled, nsError.userInfo[NSURLSessionDownloadTaskResumeData] == nil { return }
        let resume = nsError.userInfo[NSURLSessionDownloadTaskResumeData] as? Data
        let message = nsError.code == NSURLErrorNotConnectedToInternet
            ? "Нет интернета. Загрузка продолжится с того же места."
            : "Загрузка прервалась: \(error.localizedDescription)"
        Task { @MainActor in self.owner?.failed(file: tag.file, repo: tag.repo, path: tag.path ?? tag.file, message: message, resume: resume) }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            self.backgroundCompletion?()
            self.backgroundCompletion = nil
        }
    }
}
