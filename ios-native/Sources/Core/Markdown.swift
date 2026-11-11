import Foundation

/// Блок ответа модели. Разбор свой и нестрогий: незакрытый блок кода или неполная
/// таблица не ломают остальной текст (это понадобится при потоковом выводе).
struct MarkdownBlock: Identifiable, Equatable {
    struct ListItem: Identifiable, Equatable {
        let id: Int
        let indent: Int
        let marker: String
        let text: String
    }

    enum Kind: Equatable {
        case heading(level: Int, text: String)
        case paragraph(String)
        case code(language: String, text: String)
        case list([ListItem])
        case quote(String)
        case table(header: [String], rows: [[String]])
        case rule
    }

    let id: Int
    let kind: Kind
}

enum MarkdownParser {
    static func parse(_ source: String) -> [MarkdownBlock] {
        let lines = source
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n")
        var kinds: [MarkdownBlock.Kind] = []
        var index = 0

        while index < lines.count {
            let line = lines[index]
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            if trimmed.isEmpty {
                index += 1
                continue
            }

            if let fence = fenceMarker(trimmed) {
                let language = String(trimmed.dropFirst(fence.count)).trimmingCharacters(in: .whitespaces)
                var body: [String] = []
                index += 1
                while index < lines.count {
                    if lines[index].trimmingCharacters(in: .whitespaces).hasPrefix(fence) {
                        index += 1
                        break
                    }
                    body.append(lines[index])
                    index += 1
                }
                kinds.append(.code(language: language, text: body.joined(separator: "\n")))
                continue
            }

            if let heading = heading(trimmed) {
                kinds.append(.heading(level: heading.level, text: heading.text))
                index += 1
                continue
            }

            if isRule(trimmed) {
                kinds.append(.rule)
                index += 1
                continue
            }

            if trimmed.contains("|"), index + 1 < lines.count, isTableSeparator(lines[index + 1]) {
                let header = tableCells(trimmed)
                var rows: [[String]] = []
                index += 2
                while index < lines.count {
                    let rowLine = lines[index].trimmingCharacters(in: .whitespaces)
                    guard !rowLine.isEmpty, rowLine.contains("|") else { break }
                    var cells = tableCells(rowLine)
                    while cells.count < header.count { cells.append("") }
                    rows.append(Array(cells.prefix(header.count)))
                    index += 1
                }
                kinds.append(.table(header: header, rows: rows))
                continue
            }

            if trimmed.hasPrefix(">") {
                var body: [String] = []
                while index < lines.count {
                    let quoteLine = lines[index].trimmingCharacters(in: .whitespaces)
                    guard quoteLine.hasPrefix(">") else { break }
                    body.append(String(quoteLine.dropFirst()).trimmingCharacters(in: .whitespaces))
                    index += 1
                }
                kinds.append(.quote(body.joined(separator: "\n")))
                continue
            }

            if listItem(line) != nil {
                var items: [(indent: Int, marker: String, text: String)] = []
                while index < lines.count {
                    let current = lines[index]
                    let currentTrimmed = current.trimmingCharacters(in: .whitespaces)
                    if let item = listItem(current), !isRule(currentTrimmed) {
                        items.append(item)
                        index += 1
                    } else if currentTrimmed.isEmpty {
                        // Пустая строка между пунктами списка не разрывает его.
                        var next = index + 1
                        while next < lines.count, lines[next].trimmingCharacters(in: .whitespaces).isEmpty { next += 1 }
                        guard next < lines.count, listItem(lines[next]) != nil,
                              !isRule(lines[next].trimmingCharacters(in: .whitespaces)) else { break }
                        index = next
                    } else if startsBlock(currentTrimmed) || !(current.hasPrefix(" ") || current.hasPrefix("\t")) {
                        break
                    } else {
                        // Продолжение пункта на следующей строке с отступом.
                        let last = items.removeLast()
                        items.append((last.indent, last.marker, last.text + " " + currentTrimmed))
                        index += 1
                    }
                }
                let base = items.map { $0.indent }.min() ?? 0
                let rows = items.enumerated().map { offset, item in
                    MarkdownBlock.ListItem(id: offset, indent: min((item.indent - base) / 2, 4),
                                           marker: item.marker, text: item.text)
                }
                kinds.append(.list(rows))
                continue
            }

            var body: [String] = [trimmed]
            index += 1
            while index < lines.count {
                let next = lines[index].trimmingCharacters(in: .whitespaces)
                if next.isEmpty || startsBlock(next) || listItem(lines[index]) != nil { break }
                if next.contains("|"), index + 1 < lines.count, isTableSeparator(lines[index + 1]) { break }
                body.append(next)
                index += 1
            }
            kinds.append(.paragraph(body.joined(separator: "\n")))
        }

        return kinds.enumerated().map { MarkdownBlock(id: $0.offset, kind: $0.element) }
    }

    private static func fenceMarker(_ trimmed: String) -> String? {
        if trimmed.hasPrefix("```") { return "```" }
        if trimmed.hasPrefix("~~~") { return "~~~" }
        return nil
    }

    private static func heading(_ trimmed: String) -> (level: Int, text: String)? {
        let hashes = trimmed.prefix { $0 == "#" }
        guard (1...6).contains(hashes.count) else { return nil }
        let rest = trimmed.dropFirst(hashes.count)
        guard rest.first == " " else { return nil }
        var text = String(rest).trimmingCharacters(in: .whitespaces)
        while text.hasSuffix("#") { text.removeLast() }
        return (hashes.count, text.trimmingCharacters(in: .whitespaces))
    }

    private static func isRule(_ trimmed: String) -> Bool {
        let compact = trimmed.filter { $0 != " " }
        guard compact.count >= 3, let first = compact.first, first == "-" || first == "*" || first == "_" else {
            return false
        }
        return compact.allSatisfy { $0 == first }
    }

    private static func isTableSeparator(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard trimmed.contains("-"), trimmed.contains("|") else { return false }
        return trimmed.allSatisfy { $0 == "|" || $0 == "-" || $0 == ":" || $0 == " " }
    }

    private static func tableCells(_ trimmed: String) -> [String] {
        let placeholder = "\u{1}"
        var text = trimmed.replacingOccurrences(of: "\\|", with: placeholder)
        if text.hasPrefix("|") { text.removeFirst() }
        if text.hasSuffix("|") { text.removeLast() }
        return text.components(separatedBy: "|").map {
            $0.replacingOccurrences(of: placeholder, with: "|").trimmingCharacters(in: .whitespaces)
        }
    }

    private static func startsBlock(_ trimmed: String) -> Bool {
        fenceMarker(trimmed) != nil || heading(trimmed) != nil || trimmed.hasPrefix(">") || isRule(trimmed)
    }

    private static func listItem(_ line: String) -> (indent: Int, marker: String, text: String)? {
        var indent = 0
        for character in line {
            if character == " " { indent += 1 } else if character == "\t" { indent += 4 } else { break }
        }
        let body = line.drop { $0 == " " || $0 == "\t" }
        guard let first = body.first else { return nil }

        if first == "-" || first == "*" || first == "+" {
            let rest = body.dropFirst()
            guard rest.first == " " else { return nil }
            var text = String(rest).trimmingCharacters(in: .whitespaces)
            var marker = "•"
            if text.hasPrefix("[ ] ") {
                marker = "☐"
                text = String(text.dropFirst(4))
            } else if text.hasPrefix("[x] ") || text.hasPrefix("[X] ") {
                marker = "☑"
                text = String(text.dropFirst(4))
            }
            return (indent, marker, text)
        }

        let digits = body.prefix { $0.isASCII && $0.isNumber }
        guard !digits.isEmpty, digits.count <= 9 else { return nil }
        let afterDigits = body.dropFirst(digits.count)
        guard let separator = afterDigits.first, separator == "." || separator == ")" else { return nil }
        let rest = afterDigits.dropFirst()
        guard rest.first == " " else { return nil }
        return (indent, "\(digits).", String(rest).trimmingCharacters(in: .whitespaces))
    }
}
