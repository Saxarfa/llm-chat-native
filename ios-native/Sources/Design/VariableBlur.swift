import ObjectiveC
import SwiftUI
import UIKit

/// Прогрессивное размытие у верхнего края — как у Apple и в приложении Claude (16.11.2026, по
/// референсам пользователя): у самого края буквы размыты сильно, ниже размытие плавно сходит на нет.
/// Системный `scrollEdgeEffectStyle(.soft)` на iOS 26 почти не размывал (снимки 0.15.0: текст под
/// «островом» был чётким). Здесь — фильтр Core Animation `variableBlur` с маской-градиентом поверх
/// фона `UIVisualEffectView`; подложку-тонировку эффекта прячем, поэтому серой пелены нет.
/// `CAFilter` — закрытый класс QuartzCore: приложение личное (не App Store). Если фильтра нет,
/// вид остаётся прозрачным, а не превращается в серую полосу обычного Material.
struct VariableBlur: UIViewRepresentable {
    /// Радиус у самого края, pt.
    var maxRadius: CGFloat = 14

    func makeUIView(context: Context) -> VariableBlurUIView {
        VariableBlurUIView(maxRadius: maxRadius)
    }

    func updateUIView(_ view: VariableBlurUIView, context: Context) {}
}

final class VariableBlurUIView: UIVisualEffectView {
    private let maxRadius: CGFloat
    private var filter: NSObject?
    /// Запасной путь на открытом API: обычное размытие, растворённое маской-градиентом.
    private var fallbackMask: GradientMaskView?

    init(maxRadius: CGFloat) {
        self.maxRadius = maxRadius
        super.init(effect: UIBlurEffect(style: .regular))
        isUserInteractionEnabled = false
        filter = Self.makeFilter(maxRadius: maxRadius)
        apply()
    }

    required init?(coder: NSCoder) { nil }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if let window, let backdrop = backdropView {
            backdrop.layer.setValue(window.traitCollection.displayScale, forKey: "scale")
        }
        apply()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // UIKit пересобирает подложку при смене темы — фильтр и скрытие тонировки возвращаем.
        apply()
        fallbackMask?.frame = bounds
    }

    /// Слой-подложка эффекта (`_UIVisualEffectBackdropView`). В iOS 26 он уже не обязательно первый
    /// среди подвидов — в 0.15.0 (28) фильтр лёг не туда, и размытия не было совсем.
    private var backdropView: UIView? {
        subviews.first { String(describing: type(of: $0)).contains("Backdrop") }
    }

    private func apply() {
        guard let filter, let backdrop = backdropView else {
            useFallback()
            return
        }
        if (backdrop.layer.filters as? [NSObject])?.first !== filter {
            backdrop.layer.filters = [filter]
        }
        // Тонировка и прочие слои эффекта — прочь: только размытие, без пелены.
        for view in subviews where view !== backdrop && view.alpha != 0 { view.alpha = 0 }
    }

    private func useFallback() {
        guard fallbackMask == nil else { return }
        let mask = GradientMaskView(frame: bounds)
        fallbackMask = mask
        self.mask = mask
    }

    /// `CAFilter.filterWithType("variableBlur")` через рантайм Objective-C — без заголовков.
    private static func makeFilter(maxRadius: CGFloat) -> NSObject? {
        let selector = NSSelectorFromString("filterWithType:")
        guard let filterClass = NSClassFromString("CAFilter"),
              let method = class_getClassMethod(filterClass, selector),
              let mask = mask() else { return nil }
        typealias Make = @convention(c) (AnyClass, Selector, NSString) -> Unmanaged<NSObject>?
        let make = unsafeBitCast(method_getImplementation(method), to: Make.self)
        guard let filter = make(filterClass, selector, "variableBlur" as NSString)?.takeUnretainedValue() else { return nil }
        filter.setValue(maxRadius, forKey: "inputRadius")
        filter.setValue(mask, forKey: "inputMaskImage")
        filter.setValue(true, forKey: "inputNormalizeEdges")
        return filter
    }

    /// Маска: сверху полное размытие, к низу — ноль; первая треть держится почти полной.
    private static func mask() -> CGImage? {
        let size = CGSize(width: 1, height: 96)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
            let colors = [UIColor.black.cgColor,
                          UIColor.black.withAlphaComponent(0.85).cgColor,
                          UIColor.black.withAlphaComponent(0).cgColor] as CFArray
            guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors,
                                            locations: [0, 0.35, 1]) else { return }
            context.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: size.height), options: [])
        }
        return image.cgImage
    }
}

/// Маска запасного пути: сверху непрозрачно, книзу — прозрачно (форма та же, что у маски фильтра).
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
    var maxRadius: CGFloat = 14

    var body: some View {
        ZStack(alignment: .top) {
            VariableBlur(maxRadius: maxRadius)
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
