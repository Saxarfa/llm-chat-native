import Foundation

/// Один шаг рассуждения: короткий заголовок (если модель его написала) и текст.
struct ReasoningStep: Identifiable, Equatable {
    let id: Int
    let heading: String?
    let body: String
}

/// Делит текст рассуждений на шаги для раскрытого блока (вариант B из макета, выбран пользователем
/// 16.11.2026): абзацы через пустую строку; заголовок — первая строка вида `**Заголовок**` или `## Заголовок`
/// (так пишут Gemini и многие локальные модели), отдельная строка-заголовок относится к следующему абзацу.
/// Нет абзацев и заголовков — один шаг без заголовка, он показывается обычным текстом.
enum ReasoningSteps {
    static func parse(_ text: String) -> [ReasoningStep] {
        let chunks = text.replacingOccurrences(of: "\r\n", with: "\n")
            .components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        var steps: [ReasoningStep] = []
        var pending: String?
        for chunk in chunks {
            let (heading, body) = split(chunk)
            if let heading, body.isEmpty {
                // Заголовок стоит отдельным абзацем: берём его для следующего текста.
                if let held = pending { steps.append(ReasoningStep(id: steps.count, heading: held, body: "")) }
                pending = heading
                continue
            }
            steps.append(ReasoningStep(id: steps.count, heading: heading ?? pending, body: body))
            pending = nil
        }
        if let pending { steps.append(ReasoningStep(id: steps.count, heading: pending, body: "")) }
        return steps
    }

    /// Первая строка абзаца как заголовок и остаток.
    private static func split(_ chunk: String) -> (heading: String?, body: String) {
        let lines = chunk.components(separatedBy: "\n")
        let first = lines[0].trimmingCharacters(in: .whitespaces)
        let rest = lines.dropFirst().joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        if first.hasPrefix("**"), first.hasSuffix("**"), first.count > 4 {
            return (String(first.dropFirst(2).dropLast(2)).trimmingCharacters(in: .whitespaces), rest)
        }
        if first.hasPrefix("#") {
            let title = first.drop { $0 == "#" }.trimmingCharacters(in: .whitespaces)
            if !title.isEmpty { return (title, rest) }
        }
        return (nil, chunk)
    }
}
