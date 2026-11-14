import Foundation
import Observation
import SwiftUI
import UIKit

/// Студия картинок (ComfyUI) — перенос `ImageStudio.tsx`/`useImageDraft.ts` для телефона.
/// Черновик настроек общий для аккаунта: правки уходят на сервер пачками, ответ сервера —
/// источник правды. Ход генерации сервер не рассылает событиями, поэтому, пока студия
/// открыта, список заданий опрашивается, как на сайте.
@MainActor
@Observable
final class StudioModel {
    enum Undo: Equatable {
        case single(StudioJob)
        case batch(String, Int)
    }

    var draft = StudioDraft()
    /// Черновик загружен с сервера — до этого править нельзя.
    var ready = false
    var switching = false
    var syncError: String?
    var config: StudioConfig?
    var jobs: [StudioJob] = []
    var loop = false
    var busy = false
    var error: String?
    /// Выбранный в ленте арт; `nil` — показывать самый новый.
    var selectedID: String?
    var deleting = false
    var undo: Undo?
    var catalog: [LoraEntry] = []
    var loraSets: [LoraSet] = []
    var lorasLoading = false
    var lorasError: String?

    @ObservationIgnored weak var app: AppModel?
    /// Правки, ещё не принятые сервером (в формате сервера).
    @ObservationIgnored private var pending: [String: Any] = [:]
    @ObservationIgnored private var version = -1
    @ObservationIgnored private var flushTask: Task<Void, Never>?
    @ObservationIgnored private var writing = false
    /// Удалённые на этом телефоне — не показывать, даже если старый опрос их ещё вернул.
    @ObservationIgnored private var hidden: Set<String> = []
    @ObservationIgnored private var loopRevision = 0
    @ObservationIgnored private var loopPending = false
    @ObservationIgnored private var activeIDs: Set<String> = []
    @ObservationIgnored private var undoTask: Task<Void, Never>?
    @ObservationIgnored let tab = "ios-" + String(UUID().uuidString.prefix(8))

    private var api: APIClient? { app?.api }
    private var isPreview: Bool { app?.preview != nil }

    // MARK: - Что показывать

    var completed: [StudioJob] { jobs.filter(\.isDone) }
    var pendingJob: StudioJob? { jobs.first(where: \.isActive) }
    var available: Bool { config?.online == true }

    var selected: StudioJob? {
        let done = completed
        return done.first { $0.id == selectedID } ?? done.first
    }

    var problem: String? { draft.problem(models: config?.online == true ? config?.models : nil) }

    var valid: Bool {
        ready && !switching && config?.models.contains(draft.model) == true
            && !draft.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && problem == nil
    }

    /// Пояснение под кнопкой, когда генерация недоступна не по вине настроек.
    var notice: String? {
        if let config, !config.online, pendingJob == nil { return "ComfyUI не запущен. Запусти его — генерация включится сама." }
        return nil
    }

    /// Строка состояния над лентой.
    var status: String? {
        if let job = pendingJob {
            var text = job.statusText
            if let progress = job.progress { text += " · \(progress)%" }
            return text
        }
        return loop ? "Цикл включён" : nil
    }

    var lastError: String? {
        syncError ?? error ?? (problem.flatMap { draft.prompt.isEmpty ? nil : $0 }) ?? jobs.first?.error
    }

    // MARK: - Жизненный цикл

    func reset() {
        flushTask?.cancel()
        undoTask?.cancel()
        draft = StudioDraft()
        ready = false
        switching = false
        syncError = nil
        config = nil
        jobs = []
        loop = false
        busy = false
        error = nil
        selectedID = nil
        deleting = false
        undo = nil
        catalog = []
        loraSets = []
        pending = [:]
        version = -1
        hidden = []
        activeIDs = []
    }

    /// Пока студия на экране: черновик, затем опрос заданий и состояния ComfyUI.
    func run() async {
        if isPreview {
            if jobs.isEmpty { loadPreview() }
            return
        }
        await loadSettings()
        Task { await loadLoras() }
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.pollJobs() }
            group.addTask { await self.pollConfig() }
        }
        await flush()
    }

    private func pollJobs() async {
        while !Task.isCancelled {
            await refreshJobs()
            try? await Task.sleep(nanoseconds: pendingJob == nil && !loop ? 2_500_000_000 : 1_200_000_000)
        }
    }

    private func pollConfig() async {
        while !Task.isCancelled {
            await refreshConfig()
            try? await Task.sleep(nanoseconds: config?.online == true ? 30_000_000_000 : 3_000_000_000)
        }
    }

    func refreshConfig() async {
        guard let api else { return }
        do {
            config = StudioConfig(json: try await api.json("/api/images/config", timeout: 15))
        } catch is CancellationError {
        } catch {
            if config != nil { config?.online = false } else { config = StudioConfig() }
        }
    }

    func refreshJobs() async {
        guard let api else { return }
        let revision = loopRevision
        do {
            let history = try await api.json("/api/images", timeout: 20)
            let list = ((history["jobs"] as? [[String: Any]]) ?? []).compactMap(StudioJob.init(json:))
                .filter { !hidden.contains($0.id) }
            var finished = false
            for job in list {
                if job.isActive { activeIDs.insert(job.id) } else if activeIDs.remove(job.id) != nil, job.isDone { finished = true }
            }
            if list != jobs { jobs = list }
            if finished { Haptics.success() }
            if !loopPending, revision == loopRevision {
                loop = ((history["loop"] as? [String: Any])?["enabled"] as? Bool) == true
            }
            if let id = selectedID, !completed.contains(where: { $0.id == id }) { selectedID = nil }
            if error == "Нет связи с компьютером." { error = nil }
        } catch is CancellationError {
        } catch let failure as APIError where failure.status == 401 {
            await app?.logout()
        } catch {
            self.error = "Нет связи с компьютером."
        }
    }

    // MARK: - Черновик настроек

    func loadSettings() async {
        guard let api else { return }
        while !Task.isCancelled {
            do {
                accept(try await api.json("/api/images/settings"))
                ready = true
                syncError = nil
                await flush()
                return
            } catch is CancellationError {
                return
            } catch {
                syncError = "Не удалось загрузить настройки генерации. Повторяю подключение…"
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }
        }
    }

    /// Ответ сервера с настройками: новее нашего — принять, сверху оставить неотправленные правки.
    private func accept(_ result: [String: Any]) {
        let incoming = StudioValue.int(result["version"]) ?? 0
        guard incoming >= version, let values = result["values"] as? [String: Any] else { return }
        version = incoming
        var next = StudioDraft(json: values)
        next.apply(pending)
        if next != draft { draft = next }
    }

    /// Событие `image_settings_updated`: настройки поменяли на другом устройстве или вкладке.
    func receive(_ event: [String: Any]) {
        guard (event["source_tab"] as? String) != tab, ready else { return }
        accept(event)
    }

    /// Правка черновика: сразу на экране, на сервер — через мгновение одной пачкой.
    func edit(_ change: (inout StudioDraft) -> Void) {
        let before = draft.values
        change(&draft)
        for (key, value) in draft.values where (before[key] as? NSObject)?.isEqual(value) != true {
            pending[key] = value
        }
        if isPreview { pending = [:] }
        guard !pending.isEmpty else { return }
        flushTask?.cancel()
        flushTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            await self.flush()
        }
    }

    func flush() async {
        guard ready, !writing, let api else { return }
        writing = true
        defer { writing = false }
        while !pending.isEmpty {
            let patch = pending
            pending = [:]
            do {
                let result = try await api.json("/api/images/settings", method: "PATCH",
                                                body: ["values": patch, "source_tab": tab])
                accept(result)
                syncError = nil
            } catch {
                pending = patch.merging(pending) { _, newer in newer }
                syncError = "Нет синхронизации настроек. Повторяю…"
                flushTask = Task {
                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                    guard !Task.isCancelled else { return }
                    await self.flush()
                }
                return
            }
        }
    }

    /// Смена чекпоинта: сервер подставляет сохранённый профиль его движка.
    func switchModel(_ model: String) async {
        guard model != draft.model, ready, !switching else { return }
        Haptics.tap()
        if isPreview {
            draft.model = model
            return
        }
        guard let api else { return }
        switching = true
        defer { switching = false }
        await flush()
        do {
            accept(try await api.json("/api/images/settings", method: "PATCH",
                                      body: ["values": ["model": model], "source_tab": tab]))
            syncError = nil
        } catch {
            syncError = (error as? APIError)?.message ?? "Не удалось сменить чекпоинт."
        }
    }

    // MARK: - Генерация

    func generate() async {
        guard valid, !busy, pendingJob == nil, !loop else { return }
        Keyboard.hide()
        Haptics.tap()
        if isPreview {
            previewGenerate()
            return
        }
        guard let api else { return }
        busy = true
        error = nil
        defer { busy = false }
        await flush()
        do {
            let result = try await api.json("/api/images", method: "POST", body: draft.parameters, timeout: 30)
            if let raw = result["job"] as? [String: Any], let job = StudioJob(json: raw) {
                jobs.removeAll { $0.id == job.id }
                jobs.insert(job, at: 0)
                activeIDs.insert(job.id)
            }
            selectedID = nil
        } catch {
            self.error = (error as? APIError)?.message ?? "Не удалось запустить генерацию."
            Haptics.error()
        }
    }

    func stop() async {
        guard let job = pendingJob else { return }
        Haptics.tap()
        if isPreview {
            jobs.removeAll { $0.id == job.id }
            loop = false
            return
        }
        guard let api else { return }
        do {
            _ = try await api.json("/api/images/\(APIClient.pathSafe(job.id))/stop", method: "POST", timeout: 30)
            loop = false
            await refreshJobs()
        } catch {
            self.error = (error as? APIError)?.message ?? "Не удалось остановить генерацию."
        }
    }

    /// Непрерывная генерация: новый арт сразу после готового, с текущими настройками.
    func toggleLoop() async {
        let enabled = !loop
        Haptics.tap()
        loopRevision = max(Int(Date().timeIntervalSince1970 * 1000), loopRevision + 1)
        let revision = loopRevision
        loopPending = true
        loop = enabled
        defer { if revision == loopRevision { loopPending = false } }
        if isPreview { return }
        guard let api else { return }
        if enabled { await flush() }
        guard revision == loopRevision else { return }
        var body: [String: Any] = ["enabled": enabled, "paused": enabled && !valid, "revision": revision]
        if valid { body["parameters"] = draft.parameters }
        do {
            let result = try await api.json("/api/images/loop", method: "PUT", body: body, timeout: 30)
            if revision == loopRevision {
                loop = (result["enabled"] as? Bool) == true
                if enabled { selectedID = nil }
            }
        } catch {
            if revision == loopRevision {
                self.error = (error as? APIError)?.message ?? "Не удалось переключить цикл."
                loop = false
            }
        }
    }

    // MARK: - История

    func select(_ job: StudioJob) {
        Haptics.tap()
        selectedID = job.id == completed.first?.id ? nil : job.id
    }

    func toggleFavorite(_ job: StudioJob) async {
        Haptics.tap()
        let current = jobs.first { $0.id == job.id } ?? job
        if isPreview {
            replace(job.id) { $0.favorite.toggle() }
            return
        }
        guard let api else { return }
        do {
            let result = try await api.json("/api/images/\(APIClient.pathSafe(job.id))/favorite", method: "PATCH",
                                            body: ["favorite": !current.favorite])
            if let raw = result["job"] as? [String: Any], let updated = StudioJob(json: raw) {
                replace(job.id) { $0 = updated }
            }
        } catch {
            self.error = (error as? APIError)?.message ?? "Не удалось изменить избранное."
        }
    }

    func delete(_ job: StudioJob) async {
        guard !deleting else { return }
        deleting = true
        defer { deleting = false }
        if !isPreview {
            guard let api else { return }
            do {
                _ = try await api.json("/api/images/\(APIClient.pathSafe(job.id))", method: "DELETE")
            } catch {
                self.error = (error as? APIError)?.message ?? "Не удалось удалить арт."
                Haptics.error()
                return
            }
        }
        hidden.insert(job.id)
        jobs.removeAll { $0.id == job.id }
        showUndo(.single(job))
    }

    /// Очистка истории: избранное и идущие задания остаются, вернуть можно сразу после.
    func clearHistory() async {
        guard !deleting else { return }
        deleting = true
        defer { deleting = false }
        let removable = jobs.filter { !$0.favorite && ["done", "error", "cancelled"].contains($0.status) }
        var batch = "preview"
        if !isPreview {
            guard let api else { return }
            do {
                let result = try await api.json("/api/images/history", method: "DELETE", timeout: 30)
                batch = result["batch"] as? String ?? ""
            } catch {
                self.error = (error as? APIError)?.message ?? "Не удалось очистить историю."
                Haptics.error()
                return
            }
        }
        removable.forEach { hidden.insert($0.id) }
        jobs.removeAll { job in removable.contains { $0.id == job.id } }
        selectedID = nil
        showUndo(.batch(batch, removable.count))
    }

    var clearableCount: Int {
        jobs.filter { !$0.favorite && ["done", "error", "cancelled"].contains($0.status) }.count
    }

    func restore() async {
        guard let undo else { return }
        self.undo = nil
        Haptics.tap()
        if isPreview {
            hidden = []
            loadPreview()
            return
        }
        guard let api else { return }
        do {
            switch undo {
            case .single(let job):
                let result = try await api.json("/api/images/\(APIClient.pathSafe(job.id))/restore", method: "POST")
                hidden.remove(job.id)
                if let raw = result["job"] as? [String: Any], let restored = StudioJob(json: raw) {
                    jobs.append(restored)
                    jobs.sort { $0.created > $1.created }
                }
            case .batch(let batch, _):
                let result = try await api.json("/api/images/history/\(APIClient.pathSafe(batch))/restore", method: "POST")
                ((result["restored"] as? [String]) ?? []).forEach { hidden.remove($0) }
                await refreshJobs()
            }
        } catch {
            self.error = (error as? APIError)?.message ?? "Не удалось вернуть арт."
        }
    }

    private func showUndo(_ value: Undo) {
        undo = value
        Haptics.success()
        undoTask?.cancel()
        undoTask = Task {
            try? await Task.sleep(nanoseconds: 12_000_000_000)
            guard !Task.isCancelled else { return }
            if self.undo == value { self.undo = nil }
        }
    }

    /// «Повторить настройки»: всё, кроме seed, — как у выбранного арта.
    func reuse(_ job: StudioJob) {
        guard !busy, pendingJob == nil, !loop else { return }
        Haptics.tap()
        if job.isCloud {
            edit { $0.prompt = job.prompt }
            return
        }
        edit { draft in
            draft.prompt = job.prompt
            if !job.model.isEmpty { draft.model = job.model }
            draft.size = "custom"
            draft.width = String(job.sourceWidth ?? job.width)
            draft.height = String(job.sourceHeight ?? job.height)
            if let steps = job.steps { draft.steps = steps }
            if let cfg = job.cfg { draft.cfg = cfg }
            if let sampler = job.sampler, !sampler.isEmpty { draft.sampler = sampler }
            if let negative = job.negative { draft.negative = negative }
            if let scheduler = job.scheduler, !scheduler.isEmpty { draft.scheduler = scheduler }
            draft.denoise = job.denoise ?? 1
            if let loras = job.loras { draft.loras = loras }
            draft.seed = "-1"
        }
    }

    private func replace(_ id: String, _ change: (inout StudioJob) -> Void) {
        guard let index = jobs.firstIndex(where: { $0.id == id }) else { return }
        change(&jobs[index])
    }

    // MARK: - LoRA

    func loadLoras() async {
        if isPreview { return }
        guard let api else { return }
        lorasLoading = true
        defer { lorasLoading = false }
        do {
            let data = try await api.json("/api/images/loras", timeout: 20)
            var entries = ((data["loras"] as? [[String: Any]]) ?? []).compactMap { item -> LoraEntry? in
                guard let name = item["name"] as? String else { return nil }
                return LoraEntry(name: name, description: item["description"] as? String ?? "",
                                 triggers: item["triggers"] as? String ?? "")
            }
            if let library = try? await api.json("/api/lora-library", timeout: 20) {
                for note in (library["notes"] as? [[String: Any]]) ?? [] {
                    guard let name = note["name"] as? String, let index = entries.firstIndex(where: { $0.name == name }) else { continue }
                    if let text = note["description"] as? String, !text.isEmpty { entries[index].description = text }
                    if let text = note["triggers"] as? String, !text.isEmpty { entries[index].triggers = text }
                    entries[index].favorite = (note["favorite"] as? Bool) == true
                }
                loraSets = ((library["sets"] as? [[String: Any]]) ?? []).compactMap { item in
                    guard let id = item["id"] as? String, let name = item["name"] as? String else { return nil }
                    return LoraSet(id: id, name: name, architecture: item["architecture"] as? String ?? "",
                                   loras: StudioLora.list(item["loras"]))
                }
            }
            catalog = entries.sorted { ($0.favorite ? 0 : 1, $0.title.lowercased()) < ($1.favorite ? 0 : 1, $1.title.lowercased()) }
            lorasError = nil
        } catch {
            lorasError = "Не удалось загрузить LoRA из ComfyUI."
        }
    }

    func toggleLora(_ name: String) {
        Haptics.tap()
        edit { draft in
            if draft.loras.contains(where: { $0.name == name }) {
                draft.loras.removeAll { $0.name == name }
            } else if draft.loras.count < 8 {
                draft.loras.append(StudioLora(name: name))
            }
        }
    }

    /// Применить набор; `false` — каких-то LoRA из набора нет в ComfyUI.
    func applySet(_ set: LoraSet) -> Bool {
        guard set.loras.allSatisfy({ item in catalog.contains { $0.name == item.name } }) else { return false }
        Haptics.tap()
        edit { $0.loras = set.loras }
        return true
    }

    func addTriggers(_ text: String) {
        edit { draft in
            draft.prompt = [draft.prompt.trimmingCharacters(in: .whitespacesAndNewlines), text]
                .filter { !$0.isEmpty }.joined(separator: ", ")
        }
    }

    // MARK: - Картинки

    /// Миниатюра для ленты и истории (320 px).
    func thumbnail(_ id: String) async -> UIImage? {
        let key = "art:\(id):t"
        if let ready = ImageStore.image(key) { return ready }
        guard let api else { return nil }
        guard let data = try? await api.data("/api/images/\(APIClient.pathSafe(id))/image/0?preview=true&preview_size=320") else { return nil }
        let image = await Task.detached(priority: .utility) { () -> UIImage? in
            guard let decoded = UIImage(data: data) else { return nil }
            return decoded.preparingForDisplay() ?? decoded
        }.value
        if let image { ImageStore.put(image, key: key) }
        return image
    }

    // MARK: - Снимки для симулятора

    func loadPreview() {
        config = StudioConfig()
        config?.online = true
        config?.models = ["anima_baseV10.safetensors", "anima-3.8B-v1.1.safetensors",
                          "waiIllustriousSDXL_v170.safetensors", "noctqa_v1_int8_convrot.safetensors"]
        config?.samplers = ["er_sde", "euler_ancestral", "dpmpp_2m_sde"]
        config?.schedulers = ["normal", "karras", "sgm_uniform"]
        draft = StudioDraft()
        draft.prompt = "девушка-рыцарь в серебряных доспехах на краю утёса, закат, ветер, детальный фон"
        draft.loras = [StudioLora(name: "silvana-style-AB10-01.safetensors")]
        ready = true
        catalog = [
            LoraEntry(name: "silvana-style-AB10-01.safetensors", description: "Мягкий акварельный стиль", triggers: "silvana style", favorite: true),
            LoraEntry(name: "Alya_Kujou_Official_Art_Anima.safetensors", triggers: "alya kujou"),
            LoraEntry(name: "detail_tweaker_anima.safetensors"),
        ]
        loraSets = [LoraSet(id: "s1", name: "Акварель", architecture: "anima", loras: [StudioLora(name: "silvana-style-AB10-01.safetensors", strength: 0.8)])]
        let palette: [(UInt32, UInt32)] = [(0x3B2A4D, 0xE29A6B), (0x1F3B4D, 0x9FD3C7), (0x4D2A2A, 0xF2C46D),
                                           (0x23304A, 0xB9A3E3), (0x2E4031, 0xD9E3A3), (0x402B3A, 0xE3A3C4)]
        jobs = palette.enumerated().map { index, colors in
            var job = StudioJob(id: "p\(index)")
            job.prompt = draft.prompt
            job.status = "done"
            job.images = 1
            job.width = index % 3 == 1 ? 832 : 1024
            job.height = index % 3 == 1 ? 1216 : 1024
            job.steps = 30
            job.seed = 418_204_771 + index * 97
            job.model = "anima_baseV10.safetensors"
            job.created = 1_700_000_000 - Double(index) * 60
            job.favorite = index == 2
            Self.paint(job, colors)
            return job
        }
    }

    private func previewGenerate() {
        var job = StudioJob(id: "p\(Int(Date().timeIntervalSince1970 * 1000))")
        job.prompt = draft.prompt
        job.status = "generating"
        job.progress = 0
        job.model = draft.model
        (job.width, job.height) = draft.dimensions
        job.steps = draft.steps
        jobs.insert(job, at: 0)
        selectedID = nil
        Task {
            // ~3.6 с: автотест успевает увидеть «Создаю арт» (стеклу iOS 26 нужно время «успокоиться»).
            for step in 1...4 {
                try? await Task.sleep(nanoseconds: 900_000_000)
                replace(job.id) { $0.progress = step * 25 }
            }
            replace(job.id) { item in
                item.status = "done"
                item.images = 1
                item.seed = 77_123_456
                Self.paint(item, (0x1D2B45, 0xF0B37E))
            }
            Haptics.success()
        }
    }

    /// Градиент вместо арта: в симуляторе нет сервера.
    private static func paint(_ job: StudioJob, _ colors: (UInt32, UInt32)) {
        let size = CGSize(width: CGFloat(job.width) / 4, height: CGFloat(job.height) / 4)
        let image = UIGraphicsImageRenderer(size: size).image { context in
            let space = CGColorSpaceCreateDeviceRGB()
            let start = UIColor(Color(hex: colors.0)).cgColor
            let end = UIColor(Color(hex: colors.1)).cgColor
            if let gradient = CGGradient(colorsSpace: space, colors: [start, end] as CFArray, locations: [0, 1]) {
                context.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: size.width, y: size.height), options: [])
            }
            UIColor.white.withAlphaComponent(0.18).setFill()
            context.cgContext.fillEllipse(in: CGRect(x: size.width * 0.55, y: size.height * 0.12,
                                                     width: size.width * 0.28, height: size.width * 0.28))
        }
        for suffix in ["t", "p", "o"] { ImageStore.put(image, key: "art:\(job.id):\(suffix)") }
    }
}

extension StudioDraft {
    /// Значения в формате сервера — для сравнения правок.
    var values: [String: Any] {
        [
            "prompt": prompt, "negative": negative, "model": model, "sampler": sampler, "scheduler": scheduler,
            "denoise": denoise, "size": size, "width": Int(width).map { $0 as Any } ?? width,
            "height": Int(height).map { $0 as Any } ?? height, "steps": steps, "cfg": cfg, "seed": seed,
            "loras": loras.map(\.json),
        ]
    }
}
