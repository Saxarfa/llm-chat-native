import SwiftUI

/// Чат и боковое меню под ним: меню открывается кнопкой или движением пальца вправо,
/// чат при этом сдвигается и затемняется.
struct MainView: View {
    private enum DragAxis { case horizontal, vertical }

    @Environment(AppModel.self) private var model
    @State private var isOpen: Bool
    @State private var dragX: CGFloat = 0
    @State private var axis: DragAxis?

    init(startOpen: Bool = false) {
        _isOpen = State(initialValue: startOpen)
    }

    var body: some View {
        GeometryReader { geo in
            let width = min(geo.size.width * 0.86, 360)
            let offset = min(max((isOpen ? width : 0) + dragX, 0), width)
            let progress = width > 0 ? offset / width : 0

            ZStack(alignment: .leading) {
                Theme.rail.ignoresSafeArea()

                SidebarView(onClose: { setOpen(false) })
                    .frame(width: width)
                    .offset(x: (progress - 1) * width * 0.22)
                    .opacity(0.35 + 0.65 * progress)
                    .allowsHitTesting(isOpen)
                    .accessibilityHidden(!isOpen)

                ChatScreen(onMenu: { setOpen(!isOpen) })
                    .frame(width: geo.size.width)
                    .background(Theme.canvas.ignoresSafeArea())
                    .overlay {
                        Color.black.opacity(0.45 * progress)
                            .ignoresSafeArea()
                            .allowsHitTesting(isOpen)
                            .onTapGesture { setOpen(false) }
                    }
                    .offset(x: offset)
                    .accessibilityHidden(isOpen)
            }
            .simultaneousGesture(drag(width: width))
        }
    }

    private func setOpen(_ open: Bool) {
        if open { Keyboard.hide() }
        if open != isOpen { Haptics.tap() }
        withAnimation(Theme.spring) {
            isOpen = open
            dragX = 0
        }
        if open {
            Task { await model.refreshChats() }
        }
    }

    /// Жест принимается только если начался горизонтально — вертикальный скролл не перехватывается.
    private func drag(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 14)
            .onChanged { value in
                if axis == nil {
                    let horizontal = abs(value.translation.width) > abs(value.translation.height) * 1.3
                    axis = horizontal ? .horizontal : .vertical
                    if horizontal { Keyboard.hide() }
                }
                guard axis == .horizontal else { return }
                dragX = value.translation.width
            }
            .onEnded { value in
                let wasHorizontal = axis == .horizontal
                axis = nil
                guard wasHorizontal else { return }
                let projected = (isOpen ? width : 0) + value.predictedEndTranslation.width
                setOpen(projected > width / 2)
            }
    }
}
