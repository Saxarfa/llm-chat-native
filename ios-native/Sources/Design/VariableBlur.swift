import SwiftUI
import UIKit

/// Прогрессивное размытие, как под шапкой шторки и чата у Claude: у края содержимое
/// размыто сильнее всего, к другой стороне размытие плавно сходит на нет — без затемнения.
/// Делается системным фильтром `variableBlur` (тот же, что у системных панелей iOS);
/// если его нет, остаётся обычное равномерное размытие.
struct VariableBlur: UIViewRepresentable {
    /// Наибольший радиус размытия у края.
    var radius: CGFloat = 12
    /// Край, у которого размытие сильнее.
    var edge: VerticalEdge = .top
    /// Доля высоты от края, где размытие полное; дальше — плавный спад до нуля.
    var solid: CGFloat = 0.4

    func makeUIView(context: Context) -> VariableBlurUIView {
        VariableBlurUIView(radius: radius, edge: edge, solid: solid)
    }

    func updateUIView(_ view: VariableBlurUIView, context: Context) {}
}

final class VariableBlurUIView: UIVisualEffectView {
    init(radius: CGFloat, edge: VerticalEdge, solid: CGFloat) {
        super.init(effect: UIBlurEffect(style: .regular))
        isUserInteractionEnabled = false
        // CAFilter — закрытый класс QuartzCore; имя собирается строкой.
        guard let filterType = NSClassFromString("CAFilter") as? NSObject.Type,
              let filter = filterType.perform(NSSelectorFromString("filterWithType:"), with: "variableBlur")?
                .takeUnretainedValue() as? NSObject,
              let mask = Self.mask(edge: edge, solid: solid) else { return }
        // Радиус в каждой точке — по непрозрачности маски: 1 — полный, 0 — без размытия.
        filter.setValue(radius, forKey: "inputRadius")
        filter.setValue(mask, forKey: "inputMaskImage")
        filter.setValue(true, forKey: "inputNormalizeEdges")
        // У UIVisualEffectView первый слой — «подложка», размывающая то, что под ней:
        // вместо стандартных фильтров (размытие, насыщенность) — только наш.
        subviews.first?.layer.filters = [filter]
        // Тонировка эффекта не нужна — иначе по краю видна полоса.
        for view in subviews.dropFirst() { view.alpha = 0 }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) не используется")
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        // Без этого у незамытой границы видны «ступеньки».
        guard let window, let backdrop = subviews.first?.layer else { return }
        backdrop.setValue(window.traitCollection.displayScale, forKey: "scale")
    }

    // Вызов `super` здесь роняет приложение (эффект пытается вернуть свои фильтры).
    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {}

    /// Маска 1×100: непрозрачная у края, прозрачная у другой стороны.
    private static func mask(edge: VerticalEdge, solid: CGFloat) -> CGImage? {
        let size = CGSize(width: 1, height: 100)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
            let colors = [CGColor(gray: 0, alpha: 1), CGColor(gray: 0, alpha: 1), CGColor(gray: 0, alpha: 0)] as CFArray
            let locations: [CGFloat] = [0, min(max(solid, 0), 0.95), 1]
            guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceGray(), colors: colors,
                                            locations: locations) else { return }
            let top = CGPoint(x: 0, y: 0)
            let bottom = CGPoint(x: 0, y: size.height)
            context.cgContext.drawLinearGradient(gradient, start: edge == .top ? top : bottom,
                                                 end: edge == .top ? bottom : top, options: [])
        }
        return image.cgImage
    }
}
