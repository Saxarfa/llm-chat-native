import SwiftUI

/// Живой фон генерации: тёплые мягкие пятна медленно плывут, как картинка в проявителе.
/// Перерисовывается с частотой экрана, только пока плитка на экране.
struct GenerationAura: View {
    private static let colors: [Color] = [
        Color(hex: 0xC6613F, alpha: 0.5),   // коралл кнопки «Отправить»
        Color(hex: 0xD9A35C, alpha: 0.38),  // янтарь
        Color(hex: 0x8C7BD9, alpha: 0.26),  // лаванда
    ]

    var body: some View {
        TimelineView(.animation) { timeline in
            let time = timeline.date.timeIntervalSinceReferenceDate
            Canvas { context, size in
                let side = min(size.width, size.height)
                context.addFilter(.blur(radius: side * 0.16))
                for (index, color) in Self.colors.enumerated() {
                    let phase = time * (0.32 + Double(index) * 0.11) + Double(index) * 2.1
                    let x = size.width * (0.5 + 0.3 * cos(phase))
                    let y = size.height * (0.5 + 0.26 * sin(phase * 1.27))
                    let radius = side * (0.36 + 0.07 * sin(phase * 0.8))
                    context.fill(Path(ellipseIn: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2)),
                                 with: .color(color))
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Плитка арта, который ещё создаётся (лента чата и сцена студии): живой фон, подпись хода
/// работы и — только у генерации в ComfyUI, где ход известен, — процент готовности.
/// Готовая доля «проявляется» снизу вверх тёплой полосой со светящимся краем; число процентов
/// меняется плавно. У Nano Banana и Omni процента нет — только живой фон и подпись.
struct GenerationTile: View {
    /// Соотношение сторон будущей картинки; `nil` — заполнить отведённое место.
    var ratio: CGFloat?
    /// 0…1 — доля готовности; `nil` — неизвестна.
    let progress: Double?
    let status: String
    var cornerRadius: CGFloat = 18
    /// Поверх прежнего арта (студия): подложка полупрозрачная, прежний арт виден размытым.
    var translucent = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        ZStack {
            if translucent {
                Rectangle().fill(.ultraThinMaterial)
            } else {
                Theme.surface
            }
            GenerationAura()
                .opacity(0.9)
            if let progress {
                developed(progress)
            }
            VStack(spacing: 6) {
                if let progress {
                    Text(progress, format: .percent.precision(.fractionLength(0)))
                        .font(.system(size: 30, weight: .semibold, design: .rounded).monospacedDigit())
                        .foregroundStyle(Theme.ink)
                        .contentTransition(.numericText(value: progress))
                }
                Text(status)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.ink.opacity(0.78))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)
            }
            if let progress {
                bar(progress)
            }
        }
        .animation(.easeOut(duration: 0.6), value: progress)
        .modifier(RatioFrame(ratio: ratio))
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

private struct RatioFrame: ViewModifier {
    let ratio: CGFloat?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let ratio {
            content.aspectRatio(ratio, contentMode: .fit)
        } else {
            content
        }
    }
}
