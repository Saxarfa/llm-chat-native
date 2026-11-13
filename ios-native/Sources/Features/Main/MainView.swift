import SwiftUI

/// Чат и боковое меню под ним, как у Claude: меню открывается кнопкой или движением пальца вправо,
/// чат при этом уезжает вправо карточкой со скруглёнными углами и тускнеет; меню стоит на месте.
struct MainView: View {
    private enum DragAxis { case horizontal, vertical }

    @Environment(AppModel.self) private var model
    @State private var isOpen: Bool
    @State private var dragX: CGFloat = 0
    @State private var axis: DragAxis?
    /// Сразу после свайпа нажатия в меню не принимаются — палец ещё «едет».
    @State private var settling = false
    /// Сбрасывается сам, даже если жест отменила система (например, перехватила прокрутка).
    @GestureState private var dragging = false

    init(startOpen: Bool = false) {
        _isOpen = State(initialValue: startOpen)
    }

    var body: some View {
        GeometryReader { geo in
            let width = min((geo.size.width * 0.733).rounded(), 330)
            let offset = min(max((isOpen ? width : 0) + dragX, 0), width)
            let progress = width > 0 ? offset / width : 0

            ZStack(alignment: .leading) {
                Theme.rail.ignoresSafeArea()

                SidebarView(onClose: { setOpen(false) })
                    .frame(width: width)
                    .allowsHitTesting(isOpen && !swiping)
                    .scrollDisabled(swiping)
                    .accessibilityHidden(!isOpen)

                Group {
                    if model.screen == .studio {
                        StudioScreen(onMenu: { setOpen(!isOpen) })
                    } else if model.screen == .recents {
                        RecentsScreen(onMenu: { setOpen(!isOpen) })
                    } else {
                        ChatScreen(onMenu: { setOpen(!isOpen) })
                    }
                }
                    .frame(width: geo.size.width)
                    // Пока меню тянут вбок, лента не листается вверх-вниз.
                    .scrollDisabled(swiping)
                    .background(Theme.canvas.ignoresSafeArea())
                    .overlay {
                        Theme.canvas.opacity(0.62 * progress)
                            .ignoresSafeArea()
                            .allowsHitTesting(isOpen)
                            .onTapGesture { setOpen(false) }
                    }
                    // Углы карточки: поверх чата рисуется фон меню, вырезанный скруглённым прямоугольником.
                    .overlay {
                        CardCorners(radius: 42 * progress)
                            .fill(Theme.rail, style: FillStyle(eoFill: true))
                            .overlay {
                                RoundedRectangle(cornerRadius: 42 * progress, style: .continuous)
                                    .strokeBorder(Theme.line.opacity(Double(progress)))
                            }
                            .ignoresSafeArea()
                            .allowsHitTesting(false)
                    }
                    .offset(x: offset)
                    .accessibilityHidden(isOpen)
            }
            .simultaneousGesture(drag(width: width))
            .onChange(of: dragging) { _, active in
                guard !active else { return }
                // Жест отменён без onEnded — возвращаем меню на место.
                DispatchQueue.main.async {
                    if axis != nil {
                        axis = nil
                        setOpen(isOpen)
                    }
                }
            }
        }
    }

    private var swiping: Bool { axis == .horizontal || settling }

    private func settle() {
        settling = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { settling = false }
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
        DragGesture(minimumDistance: 14, coordinateSpace: .global)
            .updating($dragging) { _, state, _ in state = true }
            .onChanged { value in
                if axis == nil {
                    // Палец листает код, таблицу или ленту студии — закрытое меню не трогаем.
                    let scrollingBlock = !isOpen && (HorizontalScrollGuard.isActive
                        || HorizontalScrollGuard.covers(value.startLocation))
                    let horizontal = !scrollingBlock
                        && abs(value.translation.width) > abs(value.translation.height) * 1.3
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
                settle()
                let projected = (isOpen ? width : 0) + value.predictedEndTranslation.width
                setOpen(projected > width / 2)
            }
    }
}

/// Прямоугольник без скруглённой середины — то, что остаётся в углах карточки чата.
private struct CardCorners: Shape {
    var radius: CGFloat

    var animatableData: CGFloat {
        get { radius }
        set { radius = newValue }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path(rect)
        path.addRoundedRect(in: rect, cornerSize: CGSize(width: radius, height: radius), style: .continuous)
        return path
    }
}
