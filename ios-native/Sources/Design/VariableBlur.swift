import SwiftUI
import UIKit

/// Прогрессивное размытие у верхнего края — как у Apple и в приложении Claude (16.11.2026, по
/// референсам пользователя): у самого края буквы размыты сильно, ниже размытие плавно сходит на нет.
/// Системный `scrollEdgeEffectStyle(.soft)` на iOS 26 почти не размывал, закрытый фильтр `variableBlur`
/// в iOS 26 не сработал (снимки 0.15.0 (28) и (29)). Здесь — обычное системное размытие на открытом API,
/// растворённое маской-градиентом; стиль `.regular` в тёмной теме тёмный, без белёсой пелены.
struct VariableBlur: UIViewRepresentable {
    func makeUIView(context: Context) -> VariableBlurUIView { VariableBlurUIView() }
    func updateUIView(_ view: VariableBlurUIView, context: Context) {}
}

final class VariableBlurUIView: UIVisualEffectView {
    private let fade = GradientMaskView(frame: .zero)

    init() {
        super.init(effect: UIBlurEffect(style: .regular))
        isUserInteractionEnabled = false
        mask = fade
    }

    required init?(coder: NSCoder) { nil }

    override func layoutSubviews() {
        super.layoutSubviews()
        fade.frame = bounds
    }
}

/// Маска размытия: сверху непрозрачно (до 60% высоты почти полностью), книзу — прозрачно.
final class GradientMaskView: UIView {
    override class var layerClass: AnyClass { CAGradientLayer.self }

    override init(frame: CGRect) {
        super.init(frame: frame)
        guard let gradient = layer as? CAGradientLayer else { return }
        // Полная сила до 60% высоты: у Claude текст на уровне часов размыт целиком, а чётким становится
        // уже у кнопок шапки (при 35% «python» под часами читался, снимки 0.15.0 (30)).
        gradient.colors = [UIColor.black.cgColor, UIColor.black.withAlphaComponent(0.92).cgColor,
                           UIColor.black.withAlphaComponent(0).cgColor]
        gradient.locations = [0, 0.6, 1]
        gradient.startPoint = CGPoint(x: 0.5, y: 0)
        gradient.endPoint = CGPoint(x: 0.5, y: 1)
    }

    required init?(coder: NSCoder) { nil }
}

/// Размытие верхнего края экрана: под «островом» и строкой состояния и ещё `depth` pt ниже.
/// Лёгкое затемнение цветом фона у самого края — часы читаются, серой пелены нет.
struct ProgressiveTopBlur: View {
    let depth: CGFloat
    let tint: Color
    var body: some View {
        // Полоса сама ставит себя от верха экрана на «строка состояния + depth»: где начинается слой,
        // в который её положили, у экранов разное (в 0.15.0 (30–31) она бралась от верха экрана высотой
        // только `depth`, и размыта была лишь полоска в 14 pt над часами).
        GeometryReader { geo in
            let top = geo.frame(in: .global).minY
            ZStack(alignment: .top) {
                VariableBlur()
                LinearGradient(colors: [tint.opacity(0.5), tint.opacity(0)], startPoint: .top, endPoint: .bottom)
            }
            .frame(width: geo.size.width, height: Screen.topInset + depth)
            .offset(y: -top)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
