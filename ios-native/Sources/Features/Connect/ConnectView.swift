import SwiftUI

/// Общая рамка экранов до входа: логотип сверху, форма по центру.
struct OnboardingFrame<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Wordmark(size: 30)
                    .padding(.top, 56)
                Text(title)
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .padding(.top, 40)
                Text(subtitle)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
                VStack(alignment: .leading, spacing: 16) {
                    content
                }
                .padding(.top, 32)
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: 520, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .scrollBounceBehavior(.basedOnSize)
    }
}

struct FormError: View {
    let text: String

    var body: some View {
        Label(text, systemImage: "exclamationmark.circle")
            .font(.system(size: 15))
            .foregroundStyle(Theme.danger)
            .fixedSize(horizontal: false, vertical: true)
            .transition(.opacity)
    }
}

/// Первый запуск: адрес компьютера, на котором работает LLM Chat.
struct ConnectView: View {
    @Environment(AppModel.self) private var model
    @State private var address = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        OnboardingFrame(
            title: "Адрес компьютера",
            subtitle: "Модели и история остаются на вашем ПК. Телефон должен быть с ним в одной сети или в Tailscale."
        ) {
            LabeledField(title: "Адрес и порт") {
                TextField("", text: $address, prompt: Text("192.168.1.5:8000").foregroundStyle(Theme.subtle))
                    .keyboardType(.URL)
                    .textContentType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .focused($focused)
                    .onSubmit(submit)
            }
            if let error {
                FormError(text: error)
            }
            Button(action: submit) {
                if busy {
                    ProgressView().tint(Theme.buttonPrimaryText)
                } else {
                    Text("Подключиться")
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(busy || address.trimmingCharacters(in: .whitespaces).isEmpty)
            .padding(.top, 8)
        }
        .onAppear {
            if address.isEmpty, let url = model.serverURL {
                address = url.absoluteString
            }
        }
    }

    private func submit() {
        guard !busy else { return }
        busy = true
        error = nil
        Task {
            do {
                try await model.connect(to: address)
            } catch {
                self.error = (error as? APIError)?.message ?? APIError.unreachable.message
                Haptics.error()
            }
            busy = false
        }
    }
}

/// Сервер не ответил при запуске, хотя вход сохранён.
struct OfflineView: View {
    @Environment(AppModel.self) private var model
    @State private var busy = false

    var body: some View {
        OnboardingFrame(
            title: "Компьютер не отвечает",
            subtitle: "Не удалось связаться с \(model.serverLabel). Проверьте, что ПК включён, сервер запущен и телефон в той же сети."
        ) {
            Button {
                busy = true
                Task {
                    await model.restoreSession()
                    busy = false
                }
            } label: {
                if busy {
                    ProgressView().tint(Theme.buttonPrimaryText)
                } else {
                    Text("Повторить")
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(busy)
            Button("Сменить адрес") {
                model.changeServer()
            }
            .font(.system(size: 16, weight: .medium))
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity, minHeight: 44)
        }
    }
}
