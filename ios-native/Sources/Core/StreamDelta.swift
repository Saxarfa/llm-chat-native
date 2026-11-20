import Foundation

/// Дельты живого ответа в потоке `/api/sync/events?delta=1` (сервер Rust, с 20.11.2026; повторяет
/// `frontend/src/streamDelta.ts` сайта — менять вместе).
///
/// В событиях `stream_start/chunk/phase/tool/image` поле `text` (и `reasoning`) приходит либо целиком,
/// либо дельтой: `text_offset` — сколько единиц UTF-16 прежнего значения оставить, `text_append` — что
/// дописать (так же `reasoning_offset` + `reasoning_append`). Смещение бывает и меньше прежней длины —
/// хвост укоротился (например, обрезан незакрытый тег). Разборщик живёт одно соединение и возвращает
/// событие с полным текстом, без полей дельт, — дальше `ChatEngine.handle` работает как раньше.
///
/// База по чату берётся только из этих пяти событий и забывается на `stream_end/stream_stop`.
/// На `connected` (сервер очистил переполненную очередь) базу не сбрасываем: сервер сам пришлёт
/// следующее значение целиком. Нет базы или смещение за её концом — `Gap`: соединение обрывается,
/// а новое начинается с полного текста. Сервер Python и старый Rust параметр не знают и шлют
/// всё целиком — это тоже понимается.
struct StreamDeltas {
    /// Дельта без базы: событие пропущено, нужно переподключиться.
    struct Gap: Error {}

    private struct Value {
        var text: String
        /// Длина в единицах UTF-16 — в них сервер считает смещение.
        var units: Int
    }

    private static let fields = ["text", "reasoning"]
    private static let live: Set<String> = ["stream_start", "stream_chunk", "stream_phase", "stream_tool", "stream_image"]

    private var bases: [String: [String: Value]] = [:]

    mutating func expand(_ event: inout [String: Any]) throws {
        guard let id = event["chat_id"] as? String, !id.isEmpty, let type = event["type"] as? String else { return }
        if type == "stream_end" || type == "stream_stop" {
            bases[id] = nil
            return
        }
        guard Self.live.contains(type) else { return }
        for field in Self.fields {
            let offsetKey = field + "_offset"
            let appendKey = field + "_append"
            if let full = event[field] as? String {
                bases[id, default: [:]][field] = Value(text: full, units: full.utf16.count)
            } else if let append = event[appendKey] as? String {
                guard let base = bases[id]?[field],
                      let offset = event[offsetKey] as? Int,
                      offset >= 0, offset <= base.units else { throw Gap() }
                // Сервер режет по границе символа, поэтому пара суррогатов эмодзи не разрывается.
                let kept = offset == base.units ? base.text : (base.text as NSString).substring(to: offset)
                let text = kept + append
                bases[id, default: [:]][field] = Value(text: text, units: offset + append.utf16.count)
                event[field] = text
                event[offsetKey] = nil
                event[appendKey] = nil
            }
        }
    }
}
