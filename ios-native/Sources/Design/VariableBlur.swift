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

/// Маска размытия: сверху непрозрачно (первая треть почти полностью), книзу — прозрачно.
final class GradientMaskView: UIView {
    override class var layerClass: AnyClass { CAGradientLayer.self }

    override init(frame: CGRect) {
        super.init(frame: frame)
        guard let gradient = layer as? CAGradientLayer else { return }
        gradient.colors = [UIColor.black.cgColor, UIColor.black.withAlphaComponent(0.85).cgColor,
                           UIColor.black.withAlphaComponent(0).cgColor]
        gradient.locations = [0, 0.35, 1]
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
        ZStack(alignment: .top) {
            VariableBlur()
            LinearGradient(colors: [tint.opacity(0.5), tint.opacity(0)], startPoint: .top, endPoint: .bottom)
        }
        // Высота — `depth` ниже безопасной зоны; ignoresSafeArea дотягивает её до верха экрана.
        .frame(height: depth)
        .frame(maxWidth: .infinity)
        .ignoresSafeArea(edges: .top)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
