import Foundation
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

    var tokensPerSecond: Double { seconds > 0 ? Double(tokens) / seconds : 0 }
}

#if canImport(llama)
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
    private(set) var loadedPath: String?
    private(set) var contextSize = 0

    private static let backend: Void = {
        llama_backend_init()
        // Подробный журнал llama.cpp в консоль не нужен.
        llama_log_set({ _, _, _ in }, nil)
    }()

    // MARK: - Загрузка

    /// Загружает модель (прежняя выгружается). Возвращает размер контекста.
    func load(path: String, context wanted: Int) async throws -> Int {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                do {
                    continuation.resume(returning: try self.loadSync(path: path, context: wanted))
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

    private func loadSync(path: String, context wanted: Int) throws -> Int {
        _ = Self.backend
        if loadedPath == path, context != nil { return contextSize }
        unloadSync()
        var modelParams = llama_model_default_params()
        #if targetEnvironment(simulator)
        modelParams.n_gpu_layers = 0
        #else
        // Все слои — в Metal: на iPhone память общая, так быстрее всего.
        modelParams.n_gpu_layers = 999
        #endif
        guard let loaded = llama_model_load_from_file(path, modelParams) else {
            throw PhoneEngineError(message: "Не удалось открыть модель. Файл повреждён или формат не поддерживается этой версией llama.cpp.")
        }
        let trained = Int(llama_model_n_ctx_train(loaded))
        let size = max(512, min(wanted, trained > 0 ? trained : wanted))
        var contextParams = llama_context_default_params()
        contextParams.n_ctx = UInt32(size)
        contextParams.n_batch = 512
        contextParams.n_ubatch = 512
        let threads = Int32(max(1, min(4, ProcessInfo.processInfo.activeProcessorCount - 2)))
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
        return contextSize
    }

    private func unloadSync() {
        if let context { llama_free(context) }
        if let model { llama_model_free(model) }
        context = nil
        model = nil
        vocab = nil
        template = nil
        loadedPath = nil
        contextSize = 0
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

    /// Потоковый ответ: каждый элемент — очередной кусок текста.
    func stream(messages: [(role: String, content: String)], sampling: PhoneSampling,
                stats: @escaping @Sendable (PhoneRunStats) -> Void) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            lock.lock()
            cancelFlag = false
            lock.unlock()
            queue.async {
                do {
                    let result = try self.generateSync(messages: messages, sampling: sampling) { piece in
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

    private func generateSync(messages: [(role: String, content: String)], sampling: PhoneSampling,
                              emit: (String) -> Void) throws -> PhoneRunStats {
        guard let context, let vocab else {
            throw PhoneEngineError(message: "Модель не загружена.")
        }
        // Ответу оставляем не меньше четверти контекста; старые сообщения уходят первыми.
        let reserve = sampling.maxTokens > 0 ? min(sampling.maxTokens, contextSize / 2) : max(256, contextSize / 4)
        var history = messages
        var tokens = try tokenize(prompt(history))
        while tokens.count > contextSize - reserve {
            let firstTurn = history.firstIndex { $0.role != "system" }
            guard let index = firstTurn, history.count - index > 1 else {
                throw PhoneEngineError(message: "Сообщение не помещается в контекст модели (\(contextSize) токенов). Сократите его.")
            }
            history.remove(at: index)
            tokens = try tokenize(prompt(history))
        }

        var result = PhoneRunStats(promptTokens: tokens.count)
        llama_memory_clear(llama_get_memory(context), true)
        let sampler = makeSampler(sampling)
        defer { llama_sampler_free(sampler) }

        // Промпт — кусками по размеру пакета.
        var position = 0
        while position < tokens.count {
            if isCancelled { return result }
            let count = min(512, tokens.count - position)
            let status = tokens.withUnsafeMutableBufferPointer { buffer -> Int32 in
                llama_decode(context, llama_batch_get_one(buffer.baseAddress! + position, Int32(count)))
            }
            guard status == 0 else {
                throw PhoneEngineError(message: "Модель не смогла прочитать переписку (код \(status)).")
            }
            position += count
        }

        let started = Date()
        let limit = sampling.maxTokens > 0 ? sampling.maxTokens : contextSize - tokens.count
        var pending: [UInt8] = []
        // Стоп-строки из параметров и метки конца реплики: модель, начавшая писать
        // `<|im_end|>` или следующую реплику пользователя, свой ответ уже закончила.
        var scanner = StopScanner(stops: sampling.stop + PhoneChatFormat.turnMarkers)
        var used = tokens.count
        while result.tokens < limit, used < contextSize {
            if isCancelled { break }
            var token = llama_sampler_sample(sampler, context, -1)
            if llama_vocab_is_eog(vocab, token) { break }
            // Служебный токен границы реплики, который llama.cpp не считает концом.
            let special = String(decoding: piece(token, special: true), as: UTF8.self)
            if PhoneChatFormat.turnMarkers.contains(special) { break }
            result.tokens += 1
            pending += piece(token)
            var text: String?
            if let decoded = String(bytes: pending, encoding: .utf8) {
                text = decoded
            } else if pending.count > 8 {
                // Не UTF-8 даже после нескольких токенов — показываем как есть.
                text = String(decoding: pending, as: UTF8.self)
            }
            if let text {
                pending = []
                let visible = scanner.feed(text)
                if !visible.isEmpty { emit(visible) }
                if scanner.stopped {
                    result.seconds = Date().timeIntervalSince(started)
                    return result
                }
            }
            let status = llama_decode(context, llama_batch_get_one(&token, 1))
            guard status == 0 else {
                // Например, приложение ушло в фон и Metal отказал — что успели, остаётся.
                break
            }
            used += 1
        }
        let rest = scanner.flush()
        if !rest.isEmpty { emit(rest) }
        result.stoppedByLimit = result.tokens >= limit || used >= contextSize
        result.seconds = Date().timeIntervalSince(started)
        return result
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
    private func prompt(_ messages: [(role: String, content: String)]) -> String {
        if let custom = PhoneChatFormat.render(template: template, messages: messages) { return custom }
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

    private func tokenize(_ text: String) throws -> [llama_token] {
        guard let vocab else { throw PhoneEngineError(message: "Модель не загружена.") }
        // Если шаблон уже начинается с BOS, второй не добавляем. У части моделей BOS нет (-1) —
        // такой токен в текст не превращаем: llama.cpp упал бы на неверном номере.
        var addSpecial = true
        let bosToken = llama_vocab_bos(vocab)
        if bosToken >= 0, llama_vocab_get_add_bos(vocab) {
            let bos = String(decoding: piece(bosToken, special: true), as: UTF8.self)
            if !bos.isEmpty, text.hasPrefix(bos) { addSpecial = false }
        }
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
    private(set) var contextSize = 0

    private static let unavailable = PhoneEngineError(message: "В симуляторе движка llama.cpp нет — модели на телефоне работают только на iPhone.")

    func load(path: String, context wanted: Int) async throws -> Int {
        throw Self.unavailable
    }

    func unload() async {}

    func cancel() {}

    func stream(messages: [(role: String, content: String)], sampling: PhoneSampling,
                stats: @escaping @Sendable (PhoneRunStats) -> Void) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { $0.finish(throwing: Self.unavailable) }
    }
}
#endif
