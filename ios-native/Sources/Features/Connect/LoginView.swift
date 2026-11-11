import SwiftUI

struct LoginView: View {
    private enum Field { case username, password }

    @Environment(AppModel.self) private var model
    @State private var username = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?

    private var canSubmit: Bool {
        !busy && !username.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty
    }

    var body: some View {
        OnboardingFrame(
            title: "Вход",
            subtitle: "Тот же логин и пароль, что на сайте LLM Chat."
        ) {
            LabeledField(title: "Логин") {
                TextField("", text: $username)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($focus, equals: .username)
                    .onSubmit { focus = .password }
            }
            LabeledField(title: "Пароль") {
                SecureField("", text: $password)
                    .textContentType(.password)
                    .submitLabel(.go)
                    .focused($focus, equals: .password)
                    .onSubmit(submit)
            }
            if let error {
                FormError(text: error)
            }
            Button(action: submit) {
                if busy {
                    ProgressView().tint(Theme.buttonPrimaryText)
                } else {
                    Text("Войти")
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!canSubmit)
            .padding(.top, 8)
            Button {
                model.changeServer()
            } label: {
                Text("Компьютер: \(model.serverLabel) · Сменить")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
        }
    }

    private func submit() {
        guard canSubmit else { return }
        busy = true
        error = nil
        Task {
            do {
                try await model.login(username: username.trimmingCharacters(in: .whitespaces), password: password)
                password = ""
            } catch {
                self.error = (error as? APIError)?.message ?? APIError.unreachable.message
                Haptics.error()
            }
            busy = false
        }
    }
}
