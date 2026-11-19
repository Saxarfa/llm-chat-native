import SwiftUI

/// Живой фон генерации: тёплые мягкие пятна медленно плывут, как картинка в проявителе.
/// 30 кадров в секунду; стоит, пока плитка за краем прокрутки (iOS 18+) или в закрытой шторке.
/// Каждое пятно — радиальный градиент с тем же мягким краем, что давал прежний круг под фильтром размытия:
/// фильтр радиусом ~54 pt пересчитывался на каждом кадре и был самым тяжёлым эффектом приложения (аудит 20.11.2026).
struct GenerationAura: View {
    private static let colors: [Color] = [
        Color(hex: 0xC6613F, alpha: 0.5),   // коралл кнопки «Отправить»
        Color(hex: 0xD9A35C, alpha: 0.38),  // янтарь
        Color(hex: 0x8C7BD9, alpha: 0.26),  // лаванда
    ]

    @Environment(\.motionPaused) private var motionPaused
    @State private var offscreen = false

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: motionPaused || offscreen)) { timeline in
            let time = timeline.date.timeIntervalSinceReferenceDate
            Canvas { context, size in
                let side = min(size.width, size.height)
                let blur = side * 0.16
                for (index, color) in Self.colors.enumerated() {
                    let phase = time * (0.32 + Double(index) * 0.11) + Double(index) * 2.1
                    let x = size.width * (0.5 + 0.3 * cos(phase))
                    let y = size.height * (0.5 + 0.26 * sin(phase * 1.27))
                    let radius = side * (0.36 + 0.07 * sin(phase * 0.8))
                    // Край размытого круга: полная сила до `radius − blur`, половина на самом радиусе, ноль к `radius + blur`.
                    let outer = radius + blur
                    let gradient = Gradient(stops: [
                        .init(color: color, location: 0),
                        .init(color: color, location: (radius - blur) / outer),
                        .init(color: color.opacity(0.85), location: (radius - blur / 2) / outer),
                        .init(color: color.opacity(0.5), location: radius / outer),
                        .init(color: color.opacity(0.15), location: (radius + blur / 2) / outer),
                        .init(color: color.opacity(0), location: 1),
                    ])
                    context.fill(Path(ellipseIn: CGRect(x: x - outer, y: y - outer, width: outer * 2, height: outer * 2)),
                                 with: .radialGradient(gradient, center: CGPoint(x: x, y: y), startRadius: 0, endRadius: outer))
                }
            }
        }
        .modifier(OffscreenPause(offscreen: $offscreen))
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Плитка ушла за край прокрутки — живой фон стоит (iOS 18+; на iOS 17 видимость не отслеживается).
private struct OffscreenPause: ViewModifier {
    @Binding var offscreen: Bool

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.onScrollVisibilityChange(threshold: 0.01) { visible in offscreen = !visible }
        } else {
            content
        }
    }
}

/// Плитка арта, который ещё создаётся в чате: живой фон и — только у
/// генерации в ComfyUI, где ход известен, — процент готовности. Подписи хода работы нет
/// (убрана по просьбе пользователя 18.11.2026).
/// Готовая доля «проявляется» снизу вверх тёплой полосой со светящимся краем; число процентов
/// меняется плавно. У Nano Banana и Omni на живом фоне виден «Атом».
struct GenerationTile: View {
    let ratio: CGFloat
    /// 0…1 — доля готовности; `nil` — неизвестна.
    let progress: Double?
    let status: String

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
        ZStack {
            Theme.surface
            GenerationAura()
                .opacity(0.9)
            if let progress {
                developed(progress)
            }
            // Подписи хода работы на плитке нет (просьба пользователя 18.11.2026): только живой фон
            // и процент, где он известен. `status` остаётся для диктора и тестов.
            if let progress {
                Text(progress, format: .percent.precision(.fractionLength(0)))
                    .font(.system(size: 30, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(Theme.ink)
                    .contentTransition(.numericText(value: progress))
            } else {
                // Процента нет (Nano Banana, Omni): «Атом» показывает, что работа идёт, а не зависла.
                AtomIndicator(size: 30, orbits: true)
            }
            if let progress {
                bar(progress)
            }
        }
        .animation(.easeOut(duration: 0.6), value: progress)
        .aspectRatio(ratio, contentMode: .fit)
        .clipShape(shape)
        .overlay(shape.strokeBorder(Theme.line))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(progress.map { "\(status) \(Int(($0 * 100).rounded()))%" } ?? status)
        .accessibilityIdentifier("generation.tile")
    }

    /// Готовая доля — тёплая полоса снизу; по её краю — тонкое свечение.
    private func developed(_ progress: Double) -> some View {
        GeometryReader { geo in
            let height = geo.size.height * min(max(progress, 0), 1)
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                ZStack(alignment: .top) {
                    LinearGradient(colors: [Theme.send.opacity(0.16), Theme.send.opacity(0.05)],
                                   startPoint: .bottom, endPoint: .top)
                    LinearGradient(colors: [Theme.send.opacity(0.55), Theme.send.opacity(0)],
                                   startPoint: .top, endPoint: .bottom)
                        .frame(height: 12)
                }
                .frame(height: height)
            }
        }
        .allowsHitTesting(false)
    }

    private func bar(_ progress: Double) -> some View {
        VStack {
            Spacer()
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.ink.opacity(0.12))
                    Capsule().fill(Theme.ink.opacity(0.8))
                        .frame(width: max(4, geo.size.width * min(max(progress, 0), 1)))
                }
            }
            .frame(height: 3)
            .padding(.horizontal, 18)
            .padding(.bottom, 14)
        }
    }
}
