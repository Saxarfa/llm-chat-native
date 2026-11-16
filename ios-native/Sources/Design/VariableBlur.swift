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

    init(maxRadius: CGFloat) {
        self.maxRadius = maxRadius
        super.init(effect: UIBlurEffect(style: .regular))
        isUserInteractionEnabled = false
        filter = Self.makeFilter(maxRadius: maxRadius)
        if filter == nil { effect = nil }
        apply()
    }

    required init?(coder: NSCoder) { nil }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard let window, let backdrop = subviews.first?.layer else { return }
        backdrop.setValue(window.traitCollection.displayScale, forKey: "scale")
        apply()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // UIKit пересобирает подложку при смене темы — фильтр и скрытие тонировки возвращаем.
        apply()
    }

    private func apply() {
        guard let filter, let backdrop = subviews.first else { return }
        if (backdrop.layer.filters as? [NSObject])?.first !== filter {
            backdrop.layer.filters = [filter]
        }
        for view in subviews.dropFirst() where view.alpha != 0 { view.alpha = 0 }
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
