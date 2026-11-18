import SwiftUI
import UIKit

/// Нативное многострочное поле с собственным сигналом начала/конца редактирования.
/// В safeAreaBar курсор работал, но SwiftUI FocusState оставался false: капсула
/// не раскрывалась. Делегат привязан только к этому полю, а не ко всем клавиатурам
/// приложения (поиск и поля в открытых sheet не меняют состояние капсулы).
struct ComposerInput: UIViewRepresentable {
    @Binding var text: String
    @Binding var focused: Bool
    let placeholder: String
    let maximumLines: Int

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextView {
        let view = UITextView()
        view.delegate = context.coordinator
        view.backgroundColor = .clear
        view.font = .systemFont(ofSize: 16)
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.contentInset = .zero
        view.contentInsetAdjustmentBehavior = .never
        view.showsVerticalScrollIndicator = false
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.accessibilityIdentifier = "chat.input"
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
        context.coordinator.parent = self
        // Не заменяем текст на каждом обновлении: сохраняем выделение, undo и ввод IME.
        if view.text != text { view.text = text }
        view.textColor = UIColor(Theme.ink)
        view.tintColor = UIColor(Theme.ink)
        view.accessibilityLabel = placeholder
        if focused, !view.isFirstResponder {
            // Пока закрывается окно поверх чата (выбор модели, меню «+», системный выбор фото), поле
            // может не принять фокус сразу — тогда пробуем ещё (до ~1,2 с); не вышло — «без фокуса».
            if !view.becomeFirstResponder() { context.coordinator.retryFocus(view, left: Coordinator.attempts) }
        } else if !focused, view.isFirstResponder {
            view.resignFirstResponder()
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        guard let width = proposal.width, width > 0 else { return nil }
        let line = uiView.font?.lineHeight ?? 20
        let measured = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: ceil(min(max(measured.height, line), line * CGFloat(maximumLines))))
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: ComposerInput

        init(_ parent: ComposerInput) { self.parent = parent }

        private var retrying = false
        /// Сколько раз с шагом 0,15 с повторять фокус после закрытия окна.
        static let attempts = 8

        func retryFocus(_ view: UITextView, left: Int) {
            guard !retrying || left < Self.attempts else { return }
            retrying = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self, weak view] in
                guard let self, let view else { return }
                guard self.parent.focused, !view.isFirstResponder else { self.retrying = false; return }
                if view.becomeFirstResponder() {
                    self.retrying = false
                } else if left > 1 {
                    self.retryFocus(view, left: left - 1)
                } else {
                    self.retrying = false
                    self.parent.focused = false
                }
            }
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            if !parent.focused { parent.focused = true }
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            if parent.focused { parent.focused = false }
        }

        func textViewDidChange(_ textView: UITextView) {
            if parent.text != textView.text { parent.text = textView.text }
        }
    }
}
