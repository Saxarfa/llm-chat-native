import Foundation

/// Стоимость сессии (`GET /api/chats/{id}/cost`, `server-rs/src/billing.rs`, с 22.11.2026): журнал токенов облачных
/// моделей и цены по периодам, которые пользователь задаёт на сайте («Подключение → Цены моделей»; в коде цен нет,
/// без периода запрос стоит $0). Перенос `modelPrices.ts` сайта: деньги (`money`), токены коротко (`compactTokens`),
/// части цены (`chatParts`). Менять вместе с сайтом.
struct ChatCost: Equatable {
    /// Части цены, как `priceFields`/`partNames` сайта.
    enum Part: String, CaseIterable {
        case input, output, cacheRead, cacheWrite5m, cacheWrite1h, webSearch

        var title: String {
            switch self {
            case .input: return "Вход"
            case .output: return "Выход"
            case .cacheRead: return "Чтение из кеша"
            case .cacheWrite5m: return "Запись в кеш"
            case .cacheWrite1h: return "Запись в кеш, 1 ч"
            case .webSearch: return "Веб-поиск"
            }
        }
    }

    /// Часть цены за всю сессию: токены (у веб-поиска — запросы) и деньги.
    struct Line: Equatable, Identifiable {
        let part: Part
        let amount: Double
        let cost: Double
        var id: String { part.rawValue }
    }

    struct ModelCost: Equatable, Identifiable {
        let model: String
        let total: Double
        /// Запросов к модели в журнале (ответы, подсказки, сжатие контекста, поисковые запросы).
        let requests: Int
        /// Сколько из них без цены (для модели нет периода цены на их момент).
        let unpriced: Int
        let tokens: [Part: Double]
        var id: String { model }
    }

    let total: Double
    let tokens: [Part: Double]
    /// По убыванию суммы, как отдаёт сервер.
    let models: [ModelCost]
    /// Части, где что-то потрачено, — дорогие выше.
    let lines: [Line]

    init(json: [String: Any]) {
        total = ChatParameters.number(json["total"]) ?? 0
        tokens = Self.tokens(json["tokens"])
        var sums: [Part: Double] = [:]
        var list: [ModelCost] = []
        for item in (json["models"] as? [[String: Any]]) ?? [] {
            let entries = (item["entries"] as? [[String: Any]]) ?? []
            for entry in entries {
                let cost = ChatConfig.dict(entry["cost"])
                for part in Part.allCases { sums[part, default: 0] += ChatParameters.number(cost[part.rawValue]) ?? 0 }
            }
            list.append(ModelCost(model: (item["model"] as? String) ?? "",
                                  total: ChatParameters.number(item["total"]) ?? 0,
                                  requests: entries.count,
                                  unpriced: Int(ChatParameters.number(item["unpriced"]) ?? 0),
                                  tokens: Self.tokens(item["tokens"])))
        }
        models = list
        let spent = tokens
        lines = Part.allCases
            .map { Line(part: $0, amount: spent[$0] ?? 0, cost: sums[$0] ?? 0) }
            .filter { $0.amount > 0 || $0.cost > 0 }
            .sorted { $0.cost > $1.cost }
    }

    static func tokens(_ value: Any?) -> [Part: Double] {
        let raw = ChatConfig.dict(value)
        var result: [Part: Double] = [:]
        for part in Part.allCases { result[part] = ChatParameters.number(raw[part.rawValue]) ?? 0 }
        return result
    }

    /// Токены вместе — вход, выход и кеш (`tokenTotal` сайта); веб-поиск — запросы, а не токены.
    static func tokenTotal(_ tokens: [Part: Double]) -> Double {
        [Part.input, .output, .cacheRead, .cacheWrite5m, .cacheWrite1h].reduce(0) { $0 + (tokens[$1] ?? 0) }
    }

    // MARK: - Формат (как `modelPrices.ts`)

    private static func formatter(minimum: Int, maximum: Int) -> NumberFormatter {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = minimum
        formatter.maximumFractionDigits = maximum
        return formatter
    }

    /// Деньги без округления до цента: от доллара — два знака, меньше — три значащие цифры ($0,000607).
    static func money(_ value: Double) -> String {
        guard value > 0 else { return "$0" }
        let digits = value >= 1 ? 2 : min(9, max(2, 2 - Int(floor(log10(value)))))
        let text = formatter(minimum: value >= 1 ? 2 : 0, maximum: digits).string(from: NSNumber(value: value))
        return "$" + (text ?? String(value))
    }

    /// Токены коротко: до 10 000 целиком, дальше «тыс.», «млн», «млрд» с одним знаком (125,5 тыс.; 999 950 → 1 млн).
    static func compact(_ count: Double) -> String {
        let number = max(0, count.rounded())
        let format = formatter(minimum: 0, maximum: 1)
        if number < 10_000 { return format.string(from: NSNumber(value: number)) ?? String(Int(number)) }
        let units: [(size: Double, name: String)] = [(1e3, "тыс."), (1e6, "млн"), (1e9, "млрд")]
        for (index, unit) in units.enumerated() {
            let value = (number / unit.size * 10).rounded() / 10
            if value < 1000 || index == units.count - 1 {
                return (format.string(from: NSNumber(value: value)) ?? String(value)) + " " + unit.name
            }
        }
        return format.string(from: NSNumber(value: number)) ?? String(Int(number))
    }

    /// «1 234 токена», «125,5 тыс. токенов».
    static func tokensWord(_ count: Double) -> String {
        let word = count >= 10_000 ? "токенов" : plural(Int(count.rounded()), one: "токен", few: "токена", many: "токенов")
        return compact(count) + " " + word
    }

    static func plural(_ number: Int, one: String, few: String, many: String) -> String {
        let tens = number % 100, ones = number % 10
        if ones == 1 && tens != 11 { return one }
        if (2...4).contains(ones) && !(12...14).contains(tens) { return few }
        return many
    }

    /// Имя модели в окне: облачная — с названием сервиса, если его нет в имени (`pricedModelName` сайта).
    static func modelTitle(_ id: String, profiles: [String: Any]) -> String {
        let name = ChatConfig.modelName(id, profiles: profiles)
        guard let service = HostedService.of(id), !name.hasPrefix(service.title) else { return name }
        return "\(name) · \(service.title)"
    }
}
