import SwiftUI

/// Настройки приложения и аккаунта (открываются из шторки, кнопкой аккаунта).
/// Окно поверх чата, как на сайте; полный набор настроек — на сайте.
struct SettingsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var confirmLogout = false
    @State private var showMemory = false
    @State private var showKnowledge = false

    private var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "—"
        let build = info?["CFBundleVersion"] as? String ?? ""
        return build.isEmpty ? short : "\(short) (\(build))"
    }

    var body: some View {
        let shared = model.settings.shared
        VStack(spacing: 0) {
            SheetHeader(title: "Настройки")
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    account

                    Group {
                    SectionCaption(text: "Подключение")
                    SettingsCard {
                        ValueRow(title: "Компьютер", value: model.serverLabel)
                        CardDivider()
                        Button {
                            dismiss()
                            model.changeServer()
                        } label: {
                            HStack {
                                Text("Сменить адрес компьютера")
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(Theme.subtle)
                            }
                            .font(.system(size: 16))
                            .foregroundStyle(Theme.ink)
                            .padding(.horizontal, 16)
                            .frame(minHeight: 52)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(RowPressStyle())
                    }
                    }

                    Group {
                    SectionCaption(text: "Ответы")
                    SettingsCard {
                        SegmentRow(title: "Веб-поиск по умолчанию", choices: ChatParameters.searchModes,
                                   selected: ChatConfig.text(shared["searchMode"]) ?? "auto") { value in
                            Task { _ = await model.saveShared(["searchMode": value]) }
                        }
                    }
                    SettingsNote(text: "Действует в чатах, где поиск не выбран отдельно в «Параметрах чата».")
                    }

                    Group {
                    SectionCaption(text: "Общая инструкция")
                    SettingsCard {
                        InstructionEditor(placeholder: "Как модели отвечать во всех чатах",
                                          saved: ChatConfig.text(shared["systemPrompt"]) ?? ChatConfig.defaultPrompt) { text in
                            await model.saveShared(["systemPrompt": text])
                        }
                    }
                    SettingsNote(text: "Для моделей без своей инструкции. Свою задают в «Параметрах чата → Инструкция модели».")
                    }

                    Group {
                    SectionCaption(text: "Данные")
                    SettingsCard {
                        NavRow(title: "Память", symbol: "brain") { showMemory = true }
                        CardDivider()
                        NavRow(title: "Базы знаний", symbol: "books.vertical") { showKnowledge = true }
                    }
                    }

                    Group {
                    SectionCaption(text: "О приложении")
                    SettingsCard {
                        ValueRow(title: "Версия", value: version)
                    }
                    SettingsNote(text: "Темы и остальные настройки — на сайте. Изменения оттуда приходят сюда сразу.")
                    }

                    Button(role: .destructive) {
                        confirmLogout = true
                    } label: {
                        Text("Выйти")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(Theme.danger)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(Theme.fill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(PressScaleStyle())
                    .padding(.top, 8)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
                .contentShape(Rectangle())
                .onTapGesture { Keyboard.hide() }
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.surface)
        .presentationCornerRadius(28)
        .preferredColorScheme(.dark)
        .settingsNotice()
        .sheet(isPresented: $showMemory) { MemorySheet() }
        .sheet(isPresented: $showKnowledge) { KnowledgeSheet() }
        .task {
            // Снимок: второе окно открывается, когда первое уже на экране.
            guard model.preview == .memory || model.preview == .knowledge else { return }
            try? await Task.sleep(nanoseconds: 800_000_000)
            if model.preview == .memory { showMemory = true } else { showKnowledge = true }
        }
        .confirmationDialog("Выйти из аккаунта?", isPresented: $confirmLogout, titleVisibility: .visible) {
            Button("Выйти", role: .destructive) {
                dismiss()
                Task { await model.logout() }
            }
            Button("Отмена", role: .cancel) {}
        }
    }

    private struct NavRow: View {
        let title: String
        let symbol: String
        let action: () -> Void

        var body: some View {
            Button {
                Haptics.tap()
                action()
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: symbol)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.muted)
                        .frame(width: 22)
                    Text(title)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.subtle)
                }
                .font(.system(size: 16))
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 16)
                .frame(minHeight: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(RowPressStyle())
        }
    }

    private var account: some View {
        HStack(spacing: 14) {
            Text(String(model.user?.shownName.prefix(1) ?? "?").uppercased())
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .frame(width: 52, height: 52)
                .background(Theme.fillActive, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(model.user?.shownName ?? "")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                if let username = model.user?.username {
                    Text("@" + username)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 4)
    }
}
