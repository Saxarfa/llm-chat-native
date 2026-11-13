import Foundation
import UIKit
#if canImport(llama)
import llama
#endif

/// Ошибка движка на телефоне — текст сразу для пользователя.
struct PhoneEngineError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// Сводка одного ответа.
struct PhoneRunStats: Equatable {
    var promptTokens = 0
    var tokens = 0
    var seconds: Double = 0
    var stoppedByLimit = false
    /// Сколько токенов головы MTP модель приняла (0 — MTP не работал).
    var draftedAccepted = 0

    var tokensPerSecond: Double { seconds > 0 ? Double(tokens) / seconds : 0 }
}

#if canImport(llama)
/// Функции llama.cpp для MTP из «промежуточного» заголовка `src/llama-ext.h`: в публичных
/// заголовках фреймворка их нет, но библиотека их экспортирует. Ищутся при запуске;
/// не нашлись — модель отвечает как обычно, без ускорения.
private enum NextN {
    typealias SetEmbeddings = @convention(c) (OpaquePointer?, Bool, Bool) -> Void
    typealias Embeddings = @convention(c) (OpaquePointer?) -> UnsafeMutablePointer<Float>?
    typealias EmbeddingsAt = @convention(c) (OpaquePointer?, Int32) -> UnsafeMutablePointer<Float>?
    typealias Other = @convention(c) (OpaquePointer?) -> OpaquePointer?

    static let set: SetEmbeddings? = symbol("llama_set_embeddings_nextn")
    static let all: Embeddings? = symbol("llama_get_embeddings_nextn")
    static let at: EmbeddingsAt? = symbol("llama_get_embeddings_nextn_ith")
    static let other: Other? = symbol("llama_get_ctx_other")

    static var available: Bool { set != nil && all != nil && at != nil }

    private static func symbol<T>(_ name: String) -> T? {
        // RTLD_DEFAULT: искать во всех загруженных библиотеках.
        guard let pointer = dlsym(UnsafeMutableRawPointer(bitPattern: -2), name) else { return nil }
        return unsafeBitCast(pointer, to: T.self)
    }
}

/// Обёртка над C API llama.cpp (релиз зафиксирован в workflow). Все вызовы — в своей
/// последовательной очереди: llama.cpp не потокобезопасен, а главный поток занят интерфейсом.
final class LlamaRunner: @unchecked Sendable {
    private let queue = DispatchQueue(label: "app.llmchat.native.llama", qos: .userInitiated)
    private let lock = NSLock()
    private var cancelFlag = false

    private var model: OpaquePointer?
    private var context: OpaquePointer?
    private var vocab: OpaquePointer?
    private var template: String?
    /// Зрение: контекст mtmd с проектором картинок (`mmproj`).
    private var vision: OpaquePointer?
    /// MTP: контекст головы черновиков и его пакет.
    private var draft: OpaquePointer?
    private var draftBatch: OpaquePointer?
    private var embd = 0
    /// Скрытое состояние модели для следующего токена черновика.
    private var pending: [Float] = []
    /// Строки скрытых состояний последнего пакета модели — по одной на токен.
    private var rows: [Float] = []

    private(set) var loadedPath: String?
    private(set) var loadedVision: String?
    private(set) var contextSize = 0
    private(set) var hasVision = false
    private(set) var hasMTP = false

    /// Сколько токенов черновика проверять за раз и с какой уверенностью головы их брать.
    private static let draftMax = 3
    private static let draftConfidence: Float = 0.6

    private static let backend: Void = {
        llama_backend_init()
        // Подробный журнал llama.cpp в консоль не нужен.
        llama_log_set({ _, _, _ in }, nil)
    }()

    // MARK: - Загрузка

    /// Загружает модель (прежняя выгружается). `vision` — файл проектора картинок,
    /// `mtp` — подключить голову MTP, если она есть в файле. Возвращает размер контекста.
    func load(path: String, vision: String?, mtp: Bool, context wanted: Int) async throws -> Int {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                do {
                    continuation.resume(returning: try self.loadSync(path: path, vision: vision, mtp: mtp, context: wanted))
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    func unload() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            queue.async {
                self.unloadSync()
                continuation.resume()
            }
        }
    }

    private var threads: Int32 {
        Int32(max(1, min(4, ProcessInfo.processInfo.activeProcessorCount - 2)))
    }

    private func loadSync(path: String, vision visionPath: String?, mtp: Bool, context wanted: Int) throws -> Int {
        _ = Self.backend
        if loadedPath == path, loadedVision == visionPath, hasMTP == (mtp && hasMTP), context != nil { return contextSize }
        unloadSync()
        var modelParams = llama_model_default_params()
        #if targetEnvironment(simulator)
        modelParams.n_gpu_layers = 0
        #else
        // Все слои — в Metal: на iPhone память общая, так быстрее всего.
        modelParams.n_gpu_layers = 999
        #endif
        // Слои MTP грузятся только если их будут использовать (это лишняя память).
        modelParams.load_mtp = mtp && NextN.available
        guard let loaded = llama_model_load_from_file(path, modelParams) else {
            throw PhoneEngineError(message: "Не удалось открыть модель. Файл повреждён или формат не поддерживается этой версией llama.cpp.")
        }
        let trained = Int(llama_model_n_ctx_train(loaded))
        let size = max(512, min(wanted, trained > 0 ? trained : wanted))
        var contextParams = llama_context_default_params()
        contextParams.n_ctx = UInt32(size)
        contextParams.n_batch = 512
        contextParams.n_ubatch = 512
        contextParams.n_threads = threads
        contextParams.n_threads_batch = threads
        guard let created = llama_init_from_model(loaded, contextParams) else {
            llama_model_free(loaded)
            throw PhoneEngineError(message: "Не хватило памяти для контекста модели. Закройте другие приложения или выберите модель поменьше.")
        }
        model = loaded
        context = created
        vocab = llama_model_get_vocab(loaded)
        template = llama_model_chat_template(loaded, nil).map { String(cString: $0) }
        loadedPath = path
        contextSize = Int(llama_n_ctx(created))
        if let visionPath, FileManager.default.fileExists(atPath: visionPath) {
            attachVision(visionPath)
            loadedVision = visionPath
        }
        if modelParams.load_mtp { attachDraft() }
        return contextSize
    }

    /// Проектор картинок. Не подошёл к модели — модель работает без зрения.
    private func attachVision(_ path: String) {
        guard let model else { return }
        var params = mtmd_context_params_default()
        #if targetEnvironment(simulator)
        params.use_gpu = false
        #else
        params.use_gpu = true
        #endif
        params.n_threads = threads
        params.print_timings = false
        params.warmup = false
        vision = mtmd_init_from_file(path, model, params)
        hasVision = vision.map { mtmd_support_vision($0) } ?? false
    }

    /// Голова MTP — отдельный контекст той же модели (`LLAMA_CONTEXT_TYPE_MTP`), как
    /// `draft-mtp` в llama.cpp (`common/speculative.cpp`). Поддержан вариант с одной головой
    /// и своим кэшем (Qwen 3.5/3.6 и похожие); остальные — без ускорения.
    private func attachDraft() {
        guard let model, let context, NextN.available, llama_model_n_layer_nextn(model) == 1 else { return }
        var params = llama_context_default_params()
        params.n_ctx = UInt32(contextSize)
        params.n_batch = 512
        params.n_ubatch = 512
        params.n_threads = threads
        params.n_threads_batch = threads
        params.ctx_type = LLAMA_CONTEXT_TYPE_MTP
        params.n_rs_seq = 0
        params.ctx_other = context
        guard let head = llama_init_from_model(model, params) else { return }
        // Общий с моделью кэш (Gemma 4) устроен иначе — его не трогаем.
        if NextN.other?(head) == context {
            llama_free(head)
            return
        }
        guard let batch = llama_batch_ext_init(head) else {
            llama_free(head)
            return
        }
        NextN.set?(context, true, false)
        NextN.set?(head, true, true)
        draft = head
        draftBatch = batch
        embd = Int(llama_model_n_embd_out(model))
        hasMTP = embd > 0
    }

    private func unloadSync() {
        if let draftBatch { llama_batch_ext_free(draftBatch) }
        if let draft { llama_free(draft) }
        if let vision { mtmd_free(vision) }
        if let context { llama_free(context) }
        if let model { llama_model_free(model) }
        draftBatch = nil
        draft = nil
        vision = nil
        context = nil
        model = nil
        vocab = nil
        template = nil
        loadedPath = nil
        loadedVision = nil
        contextSize = 0
        hasVision = false
        hasMTP = false
        embd = 0
        pending = []
        rows = []
    }

    // MARK: - Ответ

    func cancel() {
        lock.lock()
        cancelFlag = true
        lock.unlock()
    }

    private var isCancelled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return cancelFlag
    }

    /// Потоковый ответ: каждый элемент — очередной кусок текста. `images` — картинки
    /// последнего вопроса (нужен проектор зрения).
    func stream(messages: [(role: String, content: String)], images: [Data] = [], sampling: PhoneSampling,
                stats: @escaping @Sendable (PhoneRunStats) -> Void) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            lock.lock()
            cancelFlag = false
            lock.unlock()
            queue.async {
                do {
                    let result = try self.generateSync(messages: messages, images: images, sampling: sampling) { piece in
                        continuation.yield(piece)
                    }
                    stats(result)
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { [weak self] reason in
                if case .cancelled = reason { self?.cancel() }
            }
        }
    }

    private func generateSync(messages: [(role: String, content: String)], images: [Data], sampling: PhoneSampling,
                              emit: @escaping (String) -> Void) throws -> PhoneRunStats {
        guard let context, let vocab else {
            throw PhoneEngineError(message: "Модель не загружена.")
        }
        // Ответу оставляем не меньше четверти контекста; старые сообщения уходят первыми.
        let reserve = sampling.maxTokens > 0 ? min(sampling.maxTokens, contextSize / 2) : max(256, contextSize / 4)
        let memory = llama_get_memory(context)
        llama_memory_clear(memory, true)
        let useDraft = draft != nil && sampling.mtp && images.isEmpty
        if let draft { llama_memory_clear(llama_get_memory(draft), true) }
        pending = [Float](repeating: 0, count: embd)

        var result = PhoneRunStats()
        var used = 0
        if !images.isEmpty {
            guard vision != nil, hasVision else {
                throw PhoneEngineError(message: "Эта модель на телефоне не видит картинки: нет файла зрения (mmproj). Добавьте его в «Модели на телефоне».")
            }
            used = try readWithImages(messages, images: images, thinking: sampling.thinking, reserve: reserve)
            result.promptTokens = used
        } else {
            var history = messages
            var tokens = try tokenize(prompt(history, thinking: sampling.thinking))
            while tokens.count > contextSize - reserve {
                let firstTurn = history.firstIndex { $0.role != "system" }
                guard let index = firstTurn, history.count - index > 1 else {
                    throw PhoneEngineError(message: "Сообщение не помещается в контекст модели (\(contextSize) токенов). Сократите его.")
                }
                history.remove(at: index)
                tokens = try tokenize(prompt(history, thinking: sampling.thinking))
            }
            result.promptTokens = tokens.count
            // Промпт — кусками по размеру пакета; голова MTP читает те же куски.
            var position = 0
            var drafting = useDraft
            while position < tokens.count {
                if isCancelled { return result }
                let count = min(512, tokens.count - position)
                let status = tokens.withUnsafeMutableBufferPointer { buffer -> Int32 in
                    llama_decode(context, llama_batch_get_one(buffer.baseAddress! + position, Int32(count)))
                }
                guard status == 0 else {
                    throw PhoneEngineError(message: "Модель не смогла прочитать переписку (код \(status)).")
                }
                if drafting {
                    drafting = feedDraft(Array(tokens[position..<(position + count)]), start: position)
                }
                position += count
            }
            used = tokens.count
            if !drafting { pending = [] }
        }

        let sampler = makeSampler(sampling)
        defer { llama_sampler_free(sampler) }
        let started = Date()
        let limit = sampling.maxTokens > 0 ? sampling.maxTokens : contextSize - used
        var bytes: [UInt8] = []
        // Стоп-строки из параметров и метки конца реплики: модель, начавшая писать
        // `<|im_end|>` или следующую реплику пользователя, свой ответ уже закончила.
        var scanner = StopScanner(stops: sampling.stop + PhoneChatFormat.turnMarkers)
        var finished = false

        /// Выдать токен в ответ. `false` — ответ закончен (конец реплики, стоп-строка, предел).
        func take(_ token: llama_token) -> Bool {
            if llama_vocab_is_eog(vocab, token) { return false }
            // Служебный токен границы реплики, который llama.cpp не считает концом.
            let special = String(decoding: piece(token, special: true), as: UTF8.self)
            if PhoneChatFormat.turnMarkers.contains(special) { return false }
            result.tokens += 1
            // Служебные токены размышлений Gemma 4 — в теги, понятные `ThinkSplitter`.
            if let tag = PhoneChatFormat.thinkTags[special] { bytes += Array(tag.utf8) } else { bytes += piece(token) }
            var text: String?
            if let decoded = String(bytes: bytes, encoding: .utf8) {
                text = decoded
            } else if bytes.count > 8 {
                // Не UTF-8 даже после нескольких токенов — показываем как есть.
                text = String(decoding: bytes, as: UTF8.self)
            }
            if let text {
                bytes = []
                let visible = scanner.feed(text)
                if !visible.isEmpty { emit(visible) }
                if scanner.stopped {
                    finished = true
                    return false
                }
            }
            return result.tokens < limit
        }

        var token = llama_sampler_sample(sampler, context, -1)
        if useDraft && !pending.isEmpty {
            // MTP: голова угадывает до трёх токенов вперёд, модель проверяет их одним пакетом;
            // совпавшие принимаются, первый несовпавший токен модели идёт дальше.
            var batch = llama_batch_init(Int32(Self.draftMax + 1), 0, 1)
            defer { llama_batch_free(batch) }
            while !isCancelled, used < contextSize - 1, take(token) {
                let room = min(Self.draftMax, contextSize - used - 2, limit - result.tokens)
                let guesses = room > 0 && !pending.isEmpty ? makeDraft(after: token, at: used, limit: room) : []
                let sequence = [token] + guesses
                batch.n_tokens = Int32(sequence.count)
                for (index, item) in sequence.enumerated() {
                    batch.token[index] = item
                    batch.pos[index] = llama_pos(used + index)
                    batch.n_seq_id[index] = 1
                    batch.seq_id[index]![0] = 0
                    batch.logits[index] = 1
                }
                guard llama_decode(context, batch) == 0 else { break }
                let fed = !pending.isEmpty && feedDraft(sequence, start: used)
                var accepted = 0
                var next = llama_sampler_sample(sampler, context, 0)
                var stop = false
                while accepted < guesses.count, next == guesses[accepted], !llama_vocab_is_eog(vocab, next) {
                    accepted += 1
                    guard take(next) else {
                        stop = true
                        break
                    }
                    next = llama_sampler_sample(sampler, context, Int32(accepted))
                }
                result.draftedAccepted += accepted
                used += 1 + accepted
                // Отвергнутые догадки — из кэша модели и головы.
                llama_memory_seq_rm(memory, 0, llama_pos(used), -1)
                if let draft { llama_memory_seq_rm(llama_get_memory(draft), 0, llama_pos(used), -1) }
                if fed, rows.count >= (accepted + 1) * embd {
                    pending = Array(rows[(accepted * embd)..<((accepted + 1) * embd)])
                } else {
                    pending = []
                }
                if stop { break }
                token = next
            }
        } else {
            while !isCancelled, used < contextSize, take(token) {
                var single = token
                guard llama_decode(context, llama_batch_get_one(&single, 1)) == 0 else {
                    // Например, приложение ушло в фон и Metal отказал — что успели, остаётся.
                    break
                }
                used += 1
                token = llama_sampler_sample(sampler, context, -1)
            }
        }
        if !finished {
            let rest = scanner.flush()
            if !rest.isEmpty { emit(rest) }
        }
        result.stoppedByLimit = result.tokens >= limit || used >= contextSize - 1
        result.seconds = Date().timeIntervalSince(started)
        return result
    }

    // MARK: - MTP

    /// Голова MTP читает те же токены, что только что прочитала модель, в паре со скрытыми
    /// состояниями модели со сдвигом на один: первый токен — с состоянием, оставшимся с прошлого
    /// раза, токен k — с состоянием токена k-1. Строки модели запоминаются (`rows`).
    private func feedDraft(_ tokens: [llama_token], start: Int) -> Bool {
        guard let draft, let draftBatch, let context, let all = NextN.all, embd > 0, !tokens.isEmpty,
              pending.count == embd, let source = all(context) else { return false }
        let count = tokens.count
        rows = Array(UnsafeBufferPointer(start: source, count: count * embd))
        var states = pending
        if count > 1 { states += rows[0..<((count - 1) * embd)] }
        llama_batch_ext_clear(draftBatch)
        let status: Int32 = states.withUnsafeBufferPointer { buffer in
            for (index, token) in tokens.enumerated() {
                let slot = llama_batch_ext_add_token(draftBatch, 0, token)
                guard slot >= 0 else { return -1 }
                var position = llama_pos(start + index)
                _ = llama_batch_ext_set_pos(draftBatch, slot, &position)
                _ = llama_batch_ext_set_output_logits(draftBatch, slot, false)
                _ = llama_batch_ext_set_embd_state(draftBatch, slot,
                                                   llama_embd(data: buffer.baseAddress! + index * embd, n_rows: 1, n_embd: embd))
            }
            return llama_process(draft, LLAMA_PROCESS_TYPE_DECODE, draftBatch)
        }
        guard status == 0 else { return false }
        pending = Array(rows[((count - 1) * embd)..<(count * embd)])
        return true
    }

    /// Черновик до `limit` токенов: голова уверенно предсказывает следующий токен — он идёт
    /// в черновик, её скрытое состояние — на следующий шаг.
    private func makeDraft(after last: llama_token, at position: Int, limit: Int) -> [llama_token] {
        guard let draft, let draftBatch, let vocab, let at = NextN.at else { return [] }
        let vocabSize = Int(llama_vocab_n_tokens(vocab))
        var guesses: [llama_token] = []
        var token = last
        var state = pending
        while guesses.count < limit {
            llama_batch_ext_clear(draftBatch)
            let status: Int32 = state.withUnsafeBufferPointer { buffer in
                let slot = llama_batch_ext_add_token(draftBatch, 0, token)
                guard slot >= 0 else { return -1 }
                var place = llama_pos(position + guesses.count)
                _ = llama_batch_ext_set_pos(draftBatch, slot, &place)
                _ = llama_batch_ext_set_output_logits(draftBatch, slot, true)
                _ = llama_batch_ext_set_embd_state(draftBatch, slot,
                                                   llama_embd(data: buffer.baseAddress, n_rows: 1, n_embd: embd))
                return llama_process(draft, LLAMA_PROCESS_TYPE_DECODE, draftBatch)
            }
            guard status == 0, let logits = llama_get_logits_ith(draft, 0) else { break }
            let best = Self.confident(logits, count: vocabSize)
            guard best.probability >= Self.draftConfidence, !llama_vocab_is_eog(vocab, best.token),
                  let row = at(draft, 0) else { break }
            guesses.append(best.token)
            state = Array(UnsafeBufferPointer(start: row, count: embd))
            token = best.token
        }
        // Ячейки черновика в кэше головы не нужны: после проверки туда лягут принятые токены.
        llama_memory_seq_rm(llama_get_memory(draft), 0, llama_pos(position), -1)
        return guesses
    }

    /// Лучший токен и его вероятность среди десяти лучших (как сэмплер top-k 10 у llama.cpp).
    private static func confident(_ logits: UnsafeMutablePointer<Float>, count: Int) -> (token: llama_token, probability: Float) {
        var best = -Float.infinity
        var index = 0
        for i in 0..<count where logits[i] > best {
            best = logits[i]
            index = i
        }
        var near: [Float] = []
        for i in 0..<count where logits[i] > best - 12 { near.append(logits[i]) }
        near.sort(by: >)
        let sum = near.prefix(10).reduce(Float(0)) { $0 + exp($1 - best) }
        return (llama_token(index), sum > 0 ? 1 / sum : 0)
    }

    // MARK: - Картинки

    /// Читает переписку с картинками последнего вопроса через mtmd. Возвращает, сколько
    /// позиций заняла переписка в контексте.
    private func readWithImages(_ messages: [(role: String, content: String)], images: [Data],
                                thinking: Bool, reserve: Int) throws -> Int {
        guard let vision, let context else { throw PhoneEngineError(message: "Модель не загружена.") }
        var bitmaps: [OpaquePointer?] = []
        defer { for bitmap in bitmaps { if let bitmap { mtmd_bitmap_free(bitmap) } } }
        for data in images {
            guard let picture = Self.pixels(data) else { continue }
            let bitmap = picture.rgb.withUnsafeBufferPointer { buffer in
                mtmd_bitmap_init(UInt32(picture.width), UInt32(picture.height), buffer.baseAddress)
            }
            if let bitmap { bitmaps.append(bitmap) }
        }
        guard !bitmaps.isEmpty else { throw PhoneEngineError(message: "Не удалось прочитать картинку.") }
        let marker = String(cString: mtmd_default_marker())
        var history = messages
        // Метки картинок — в начало последнего вопроса: на их место mtmd подставит изображения.
        if let last = history.lastIndex(where: { $0.role == "user" }) {
            history[last].content = String(repeating: marker + "\n", count: bitmaps.count) + history[last].content
        }
        while true {
            let text = prompt(history, thinking: thinking)
            guard let chunks = mtmd_input_chunks_init() else { throw PhoneEngineError(message: "Не хватило памяти для картинки.") }
            defer { mtmd_input_chunks_free(chunks) }
            let special = addsSpecial(text)
            let count = bitmaps.count
            let status: Int32 = text.withCString { raw in
                var input = mtmd_input_text(text: raw, text_len: strlen(raw), add_special: special, parse_special: true)
                return mtmd_tokenize(vision, chunks, &input, &bitmaps, count)
            }
            guard status == 0 else {
                throw PhoneEngineError(message: "Модель не смогла прочитать картинку (код \(status)).")
            }
            if Int(mtmd_helper_get_n_tokens(chunks)) > contextSize - reserve {
                let lastUser = history.lastIndex { $0.role == "user" } ?? history.count - 1
                guard let index = history.firstIndex(where: { $0.role != "system" }), index < lastUser else {
                    throw PhoneEngineError(message: "Картинка с вопросом не помещается в контекст модели (\(contextSize) токенов). Увеличьте контекст в настройках модели.")
                }
                history.remove(at: index)
                continue
            }
            var past: llama_pos = 0
            let read = mtmd_helper_eval_chunks(vision, context, chunks, 0, 0, 512, true, &past)
            guard read == 0 else {
                throw PhoneEngineError(message: "Модель не смогла прочитать картинку (код \(read)).")
            }
            return Int(past)
        }
    }

    /// Пиксели RGB (по три байта), длинная сторона не больше 1536 — дальше mtmd всё равно уменьшит.
    private static func pixels(_ data: Data) -> (rgb: [UInt8], width: Int, height: Int)? {
        guard let image = UIImage(data: data)?.cgImage else { return nil }
        let scale = min(1, 1536 / Double(max(image.width, image.height, 1)))
        let width = max(1, Int(Double(image.width) * scale))
        let height = max(1, Int(Double(image.height) * scale))
        var rgba = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = rgba.withUnsafeMutableBytes { buffer -> Bool in
            guard let canvas = CGContext(data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                                         bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                         bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
            canvas.interpolationQuality = .high
            canvas.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard drawn else { return nil }
        var rgb = [UInt8](repeating: 0, count: width * height * 3)
        for index in 0..<(width * height) {
            rgb[index * 3] = rgba[index * 4]
            rgb[index * 3 + 1] = rgba[index * 4 + 1]
            rgb[index * 3 + 2] = rgba[index * 4 + 2]
        }
        return (rgb, width, height)
    }

    private func makeSampler(_ sampling: PhoneSampling) -> UnsafeMutablePointer<llama_sampler> {
        let chain = llama_sampler_chain_init(llama_sampler_chain_default_params())!
        if sampling.repeatPenalty != 1 || sampling.presencePenalty != 0 || sampling.frequencyPenalty != 0 {
            llama_sampler_chain_add(chain, llama_sampler_init_penalties(
                llama_vocab_n_tokens(vocab), 64, max(0.01, sampling.repeatPenalty),
                sampling.frequencyPenalty, sampling.presencePenalty))
        }
        if sampling.temperature <= 0 {
            llama_sampler_chain_add(chain, llama_sampler_init_greedy())
            return chain
        }
        if sampling.topK > 0 { llama_sampler_chain_add(chain, llama_sampler_init_top_k(sampling.topK)) }
        if sampling.topP > 0, sampling.topP < 1 { llama_sampler_chain_add(chain, llama_sampler_init_top_p(sampling.topP, 1)) }
        if sampling.minP > 0 { llama_sampler_chain_add(chain, llama_sampler_init_min_p(sampling.minP, 1)) }
        llama_sampler_chain_add(chain, llama_sampler_init_temp(sampling.temperature))
        llama_sampler_chain_add(chain, llama_sampler_init_dist(UInt32.random(in: 0...UInt32.max - 1)))
        return chain
    }

    // MARK: - Текст и токены

    /// Промпт по шаблону чата из самой модели (Gemma 4 — своим кодом, её шаблон только Jinja);
    /// незнакомый шаблон — ChatML.
    private func prompt(_ messages: [(role: String, content: String)], thinking: Bool) -> String {
        let kind = PhoneThinking.kind(template: template)
        if let custom = PhoneChatFormat.render(template: template, messages: messages,
                                               thinking: thinking && kind == .gemma4) { return custom }
        let base = templated(messages)
        // Qwen3 и похожие: пустой блок размышлений в начале ответа выключает их.
        return kind == .switchable && !thinking ? base + PhoneChatFormat.thinkingOff : base
    }

    private func templated(_ messages: [(role: String, content: String)]) -> String {
        let roles = messages.map { strdup($0.role) }
        let contents = messages.map { strdup($0.content) }
        defer {
            roles.forEach { free($0) }
            contents.forEach { free($0) }
        }
        var chat = zip(roles, contents).map { llama_chat_message(role: UnsafePointer($0), content: UnsafePointer($1)) }
        let length = messages.reduce(0) { $0 + $1.content.utf8.count } * 2 + 1024
        var buffer = [CChar](repeating: 0, count: length)
        var written = llama_chat_apply_template(template, &chat, chat.count, true, &buffer, Int32(buffer.count))
        if written > buffer.count {
            buffer = [CChar](repeating: 0, count: Int(written) + 1)
            written = llama_chat_apply_template(template, &chat, chat.count, true, &buffer, Int32(buffer.count))
        }
        guard written > 0 else { return chatML(messages) }
        let bytes = buffer.prefix(Int(written)).map { UInt8(bitPattern: $0) }
        return String(decoding: bytes, as: UTF8.self)
    }

    private func chatML(_ messages: [(role: String, content: String)]) -> String {
        messages.map { "<|im_start|>\($0.role)\n\($0.content)<|im_end|>\n" }.joined() + "<|im_start|>assistant\n"
    }

    /// Добавлять ли BOS: если шаблон уже начинается с него, второй не нужен. У части моделей
    /// BOS нет (-1) — такой токен в текст не превращаем: llama.cpp упал бы на неверном номере.
    private func addsSpecial(_ text: String) -> Bool {
        guard let vocab else { return true }
        let bosToken = llama_vocab_bos(vocab)
        if bosToken >= 0, llama_vocab_get_add_bos(vocab) {
            let bos = String(decoding: piece(bosToken, special: true), as: UTF8.self)
            if !bos.isEmpty, text.hasPrefix(bos) { return false }
        }
        return true
    }

    private func tokenize(_ text: String) throws -> [llama_token] {
        guard let vocab else { throw PhoneEngineError(message: "Модель не загружена.") }
        let addSpecial = addsSpecial(text)
        let utf8Count = Int32(text.utf8.count)
        var tokens = [llama_token](repeating: 0, count: Int(utf8Count) + 16)
        var count = llama_tokenize(vocab, text, utf8Count, &tokens, Int32(tokens.count), addSpecial, true)
        if count < 0 {
            tokens = [llama_token](repeating: 0, count: Int(-count))
            count = llama_tokenize(vocab, text, utf8Count, &tokens, Int32(tokens.count), addSpecial, true)
        }
        guard count >= 0 else { throw PhoneEngineError(message: "Не удалось разобрать текст на токены.") }
        return Array(tokens.prefix(Int(count)))
    }

    private func piece(_ token: llama_token, special: Bool = false) -> [UInt8] {
        guard let vocab else { return [] }
        var buffer = [CChar](repeating: 0, count: 64)
        var count = llama_token_to_piece(vocab, token, &buffer, Int32(buffer.count), 0, special)
        if count < 0 {
            buffer = [CChar](repeating: 0, count: Int(-count))
            count = llama_token_to_piece(vocab, token, &buffer, Int32(buffer.count), 0, special)
        }
        guard count > 0 else { return [] }
        return buffer.prefix(Int(count)).map { UInt8(bitPattern: $0) }
    }
}
#else
/// Симулятор: в релизе llama.cpp нет слоя для него, движок не подключается.
/// Режим снимков отвечает заготовленным текстом и сюда не обращается.
final class LlamaRunner: @unchecked Sendable {
    private(set) var loadedPath: String?
    private(set) var loadedVision: String?
    private(set) var contextSize = 0
    private(set) var hasVision = false
    private(set) var hasMTP = false

    private static let unavailable = PhoneEngineError(message: "В симуляторе движка llama.cpp нет — модели на телефоне работают только на iPhone.")

    func load(path: String, vision: String?, mtp: Bool, context wanted: Int) async throws -> Int {
        throw Self.unavailable
    }

    func unload() async {}

    func cancel() {}

    func stream(messages: [(role: String, content: String)], images: [Data] = [], sampling: PhoneSampling,
                stats: @escaping @Sendable (PhoneRunStats) -> Void) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { $0.finish(throwing: Self.unavailable) }
    }
}
#endif
