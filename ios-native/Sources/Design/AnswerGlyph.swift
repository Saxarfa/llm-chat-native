import SwiftUI

/// Значки под ответом — свои линии на сетке 18 × 18, как линейные значки сайта (`line(...)` в
/// `frontend/src/icons/index.tsx`, `docs/ui-rules.md` §4): один штрих, круглые концы, общий центр (9, 9).
/// Системные символы были разного размера и сидели на разной высоте («Поделиться» ниже, «Скопировать»
/// мельче и бледнее) — ряд выглядел кривым (замечание пользователя 22.11.2026).
enum AnswerGlyph {
    case copy, check, share, play, stop, regenerate, more

    /// Точки «Ещё» заливаются, остальное — штрих.
    var filled: Bool { self == .more }
}

/// Контур значка в квадрате `rect`: сетка 18 × 18 растягивается на меньшую сторону и ставится по центру.
struct AnswerGlyphShape: Shape {
    let glyph: AnswerGlyph

    func path(in rect: CGRect) -> Path {
        let unit = min(rect.width, rect.height) / 18
        let origin = CGPoint(x: rect.midX - 9 * unit, y: rect.midY - 9 * unit)
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: origin.x + x * unit, y: origin.y + y * unit)
        }
        func square(_ x: CGFloat, _ y: CGFloat, side: CGFloat, radius: CGFloat) -> (CGRect, CGSize) {
            (CGRect(origin: p(x, y), size: CGSize(width: side * unit, height: side * unit)),
             CGSize(width: radius * unit, height: radius * unit))
        }
        var path = Path()
        switch glyph {
        case .copy:
            // Сайт: передний лист 6,25…14,75 и угол заднего листа 3,25…11,75, скругления 2.
            let front = square(6.25, 6.25, side: 8.5, radius: 2)
            path.addRoundedRect(in: front.0, cornerSize: front.1, style: .circular)
            path.move(to: p(11.75, 6.25))
            path.addLine(to: p(11.75, 5.25))
            path.addArc(tangent1End: p(11.75, 3.25), tangent2End: p(9.75, 3.25), radius: 2 * unit)
            path.addLine(to: p(5.25, 3.25))
            path.addArc(tangent1End: p(3.25, 3.25), tangent2End: p(3.25, 5.25), radius: 2 * unit)
            path.addLine(to: p(3.25, 9.75))
            path.addArc(tangent1End: p(3.25, 11.75), tangent2End: p(5.25, 11.75), radius: 2 * unit)
            path.addLine(to: p(6.25, 11.75))
        case .check:
            path.move(to: p(4, 9.4))
            path.addLine(to: p(7.4, 12.6))
            path.addLine(to: p(14, 5.6))
        case .share:
            // Стрелка вверх из лотка; лоток 3,25…14,75 × 7,25…15,25 с разрывом под стрелкой.
            path.move(to: p(9, 10.75))
            path.addLine(to: p(9, 2.75))
            path.move(to: p(5.75, 6))
            path.addLine(to: p(9, 2.75))
            path.addLine(to: p(12.25, 6))
            path.move(to: p(6.75, 7.25))
            path.addLine(to: p(5.25, 7.25))
            path.addArc(tangent1End: p(3.25, 7.25), tangent2End: p(3.25, 9.25), radius: 2 * unit)
            path.addLine(to: p(3.25, 13.25))
            path.addArc(tangent1End: p(3.25, 15.25), tangent2End: p(5.25, 15.25), radius: 2 * unit)
            path.addLine(to: p(12.75, 15.25))
            path.addArc(tangent1End: p(14.75, 15.25), tangent2End: p(14.75, 13.25), radius: 2 * unit)
            path.addLine(to: p(14.75, 9.25))
            path.addArc(tangent1End: p(14.75, 7.25), tangent2End: p(12.75, 7.25), radius: 2 * unit)
            path.addLine(to: p(11.25, 7.25))
        case .play:
            // Треугольник со скруглёнными углами; центр тяжести — в центре сетки (оптический центр «Play»).
            let top = p(5.5, 2.75), bottom = p(5.5, 15.25), tip = p(15.75, 9)
            path.move(to: p(5.5, 9))
            path.addArc(tangent1End: bottom, tangent2End: tip, radius: 1.3 * unit)
            path.addArc(tangent1End: tip, tangent2End: top, radius: 1.3 * unit)
            path.addArc(tangent1End: top, tangent2End: bottom, radius: 1.3 * unit)
            path.closeSubpath()
        case .stop:
            let box = square(4.75, 4.75, side: 8.5, radius: 2)
            path.addRoundedRect(in: box.0, cornerSize: box.1, style: .circular)
        case .regenerate:
            // Сайт (`RotateCcw`): дуга радиусом 5,75 против часовой — от левой точки вниз, вокруг и через верх
            // к левому верхнему углу, где стоит уголок стрелки.
            path.addArc(center: p(9, 9), radius: 5.75 * unit, startAngle: .degrees(180), endAngle: .degrees(-140),
                        clockwise: true)
            path.addLine(to: p(3.25, 6.25))
            path.move(to: p(3.25, 3.25))
            path.addLine(to: p(3.25, 6.25))
            path.addLine(to: p(6.25, 6.25))
        case .more:
            for x: CGFloat in [3.75, 9, 14.25] {
                path.addEllipse(in: CGRect(x: origin.x + (x - 1.15) * unit, y: origin.y + (9 - 1.15) * unit,
                                           width: 2.3 * unit, height: 2.3 * unit))
            }
        }
        return path
    }
}

/// Значок под ответом: 20 pt (сетка 18 растянута в 1,11 раза — на глаз как значки Claude, ~14 pt
/// видимой части), штрих 1,4 pt.
struct AnswerGlyphView: View {
    let glyph: AnswerGlyph
    var color: Color = Theme.muted
    var size: CGFloat = 20
    var lineWidth: CGFloat = 1.4

    var body: some View {
        Group {
            if glyph.filled {
                AnswerGlyphShape(glyph: glyph).fill(color)
            } else {
                AnswerGlyphShape(glyph: glyph)
                    .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
