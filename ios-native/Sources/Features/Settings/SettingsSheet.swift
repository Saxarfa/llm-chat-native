import SwiftUI

/// Разделы настроек, открывающиеся переходом внутрь.
enum SettingsPage: Hashable {
    case profile, computer, models, search, memory, instruction
    case model(String)
}

/// Настройки, как в приложении Claude: сверху аккаунт, группы «Аккаунт» и «Приложение»,
/// «Внешний вид» плитками, внизу «Выйти». Всё сохраняется сразу, без кнопки «Сохранить».
struct SettingsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var path: [SettingsPage] = []
    @State private var confirmLogout = false
    @State private var showKnowledge = false
    @State private var showAbout = false

    private var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "—"
        let build = info?["CFBundleVersion"] as? String ?? ""
        return build.isEmpty ? short : "\(short) (\(build))"
    }

    var body: some View {
        NavigationStack(path: $path) {
            root
                .navigationTitle("Настройки")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        CircleIconButton(symbol: "xmark", label: "Закрыть") { dismiss() }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        CircleIconButton(symbol: "info", label: "О приложении") { showAbout = true }
                    }
                }
                .toolbarBackground(Theme.sheet, for: .navigationBar)
                .navigationDestination(for: SettingsPage.self) { page in
                    destination(page)
                }
        }
        .tint(Theme.ink)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.sheet)
        .presentationCornerRadius(28)
        .settingsNotice()
        .sheet(isPresented: $showKnowledge) { KnowledgeSheet() }
        .alert("LLM Chat", isPresented: $showAbout) {
            Button("Понятно", role: .cancel) {}
        } message: {
            Text("Версия \(version). Нативный клиент для вашего компьютера: чаты, студия картинок и модели на iPhone.")
        }
        .confirmationDialog("Выйти из аккаунта?", isPresented: $confirmLogout, titleVisibility: .visible) {
            Button("Выйти", role: .destructive) {
                dismiss()
                Task { await model.logout() }
            }
            Button("Отмена", role: .cancel) {}
        }
        .task {
            // Снимки: раздел открывается, когда окно уже на экране.
            guard let preview = model.preview else { return }
            try? await Task.sleep(nanoseconds: 700_000_000)
            switch preview {
            case .memory: path = [.memory]
            case .knowledge: showKnowledge = true
            case .computer: path = [.computer]
            case .modelProfile: path = [.models, .model("gemma-26b-qat")]
            default: break
            }
        }
    }

    @ViewBuilder
    private func destination(_ page: SettingsPage) -> some View {
        switch page {
        case .profile:
            ProfilePage().settingsPage("Профиль")
        case .computer:
            ComputerPage(onChangeServer: {
                dismiss()
                model.changeServer()
            }).settingsPage("Компьютер")
        case .models:
            ModelsPage().settingsPage("Модели")
        case .model(let id):
            ModelProfilePage(modelID: id).settingsPage("Профиль модели")
        case .search:
            SearchPage().settingsPage("Веб-поиск")
        case .memory:
            MemorySheet(embedded: true).settingsPage("Память")
        case .instruction:
            InstructionPage().settingsPage("Общая инструкция")
        }
    }

    private var root: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                account

                SectionCaption(text: "Аккаунт")
                SettingsCard {
                    link("Профиль", symbol: "person", page: .profile)
                    CardDivider()
                    link("Компьютер", symbol: "desktopcomputer", value: model.serverLabel, page: .computer)
                }

                SectionCaption(text: "Приложение")
                SettingsCard {
                    link("Модели", symbol: "cpu", page: .models)
                    CardDivider()
                    link("Веб-поиск", symbol: "globe", value: searchModeLabel, page: .search)
                    CardDivider()
                    link("Память", symbol: "brain", page: .memory)
                    CardDivider()
                    Button {
                        Haptics.tap()
                        showKnowledge = true
                    } label: {
                        ToolRowLabel(title: "Базы знаний", symbol: "books.vertical")
                    }
                    .buttonStyle(RowPressStyle())
                    CardDivider()
                    link("Общая инструкция", symbol: "text.quote", page: .instruction)
                    CardDivider()
                    IconToggleRow(title: "Тактильный отклик", symbol: "iphone.radiowaves.left.and.right",
                                  isOn: model.haptics) { model.haptics = $0 }
                }

                SectionCaption(text: "Внешний вид")
                AppearancePicker()

                SettingsCard {
                    Button {
                        Haptics.tap()
                        confirmLogout = true
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .font(.system(size: 17))
                                .frame(width: 24)
                            Text("Выйти")
                                .font(.system(size: 17))
                            Spacer()
                        }
                        .foregroundStyle(Theme.danger)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 54)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowPressStyle())
                    .accessibilityIdentifier("settings.logout")
                }
                .padding(.top, 10)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .background(Theme.sheet)
        .accessibilityIdentifier("settings.root")
    }

    private var searchModeLabel: String {
        let mode = ChatConfig.text(model.settings.shared["searchMode"]) ?? "auto"
        return ChatParameters.searchModes.first { $0.value == mode }?.label ?? "Авто"
    }

    private func link(_ title: String, symbol: String, value: String? = nil, page: SettingsPage) -> some View {
        NavigationLink(value: page) {
            ToolRowLabel(title: title, symbol: symbol, value: value)
        }
        .buttonStyle(RowPressStyle())
        .accessibilityIdentifier("settings.\(String(describing: page))")
    }

    /// Карточка аккаунта: фото, имя, логин и компьютер; нажатие — профиль.
    private var account: some View {
        SettingsCard {
            NavigationLink(value: SettingsPage.profile) {
                HStack(spacing: 12) {
                    AvatarView(image: model.user?.avatar, name: model.user?.shownName ?? "?", size: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.user?.shownName ?? "")
                            .font(.system(size: 17, weight: .medium))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                        Text(["@" + (model.user?.username ?? ""), model.serverLabel].filter { $0.count > 1 }.joined(separator: " · "))
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.subtle)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.subtle)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(RowPressStyle())
            .accessibilityIdentifier("settings.account")
        }
    }
}

/// Оформление раздела настроек: заголовок по центру, круглая кнопка «назад», фон шторки.
private struct SettingsPageChrome: ViewModifier {
    let title: String
    @Environment(\.dismiss) private var dismiss

    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(Theme.sheet)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    CircleIconButton(symbol: "chevron.left", label: "Назад") { dismiss() }
                }
            }
            .toolbarBackground(Theme.sheet, for: .navigationBar)
    }
}

extension View {
    func settingsPage(_ title: String) -> some View {
        modifier(SettingsPageChrome(title: title))
    }
}

/// Переключатель со значком слева, как строки настроек Claude.
struct IconToggleRow: View {
    let title: String
    let symbol: String
    let isOn: Bool
    let onChange: (Bool) -> Void

    var body: some View {
        Toggle(isOn: Binding(get: { isOn }, set: { value in
            onChange(value)
            Haptics.tap()
        })) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.ink)
                    .frame(width: 24)
                Text(title)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.ink)
            }
        }
        .tint(Theme.accent)
        .padding(.horizontal, 16)
        .frame(minHeight: 54)
    }
}

/// «Внешний вид»: три плитки-миниатюры — светлая, тёмная, как в системе.
struct AppearancePicker: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(spacing: 10) {
            ForEach(Appearance.allCases, id: \.self) { option in
                let selected = model.appearance == option
                Button {
                    Haptics.tap()
                    withAnimation(.easeOut(duration: 0.2)) { model.appearance = option }
                } label: {
                    VStack(spacing: 8) {
                        AppearanceSample(option: option)
                            .frame(height: 74)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .strokeBorder(selected ? Theme.accent : Theme.line, lineWidth: selected ? 2 : 1)
                            )
                        Text(option.title)
                            .font(.system(size: 13, weight: selected ? .semibold : .regular))
                            .foregroundStyle(selected ? Theme.accent : Theme.muted)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Тема: \(option.title)")
                .accessibilityAddTraits(selected ? .isSelected : [])
                .accessibilityIdentifier("appearance.\(option.rawValue)")
            }
        }
        .padding(12)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// Миниатюра темы: две строки текста и точка; у «Системной» — по диагонали светлая и тёмная.
private struct AppearanceSample: View {
    let option: Appearance

    var body: some View {
        ZStack {
            switch option {
            case .light:
                Color(hex: 0xF7F5F0)
            case .dark:
                Color(hex: 0x151515)
            case .system:
                Color(hex: 0x151515)
                Color(hex: 0xF7F5F0)
                    .clipShape(Diagonal())
            }
            VStack(alignment: .leading, spacing: 5) {
                Capsule().frame(width: 34, height: 3)
                Capsule().frame(width: 22, height: 3)
                Spacer()
                HStack {
                    Spacer()
                    Circle().fill(Color(hex: 0xC8643F)).frame(width: 9, height: 9)
                }
            }
            .foregroundStyle(option == .dark ? Color(hex: 0x8A8984) : Color(hex: 0x9A9488))
            .padding(10)
        }
    }

    private struct Diagonal: Shape {
        func path(in rect: CGRect) -> Path {
            var path = Path()
            path.move(to: .zero)
            path.addLine(to: CGPoint(x: rect.maxX, y: 0))
            path.addLine(to: CGPoint(x: 0, y: rect.maxY))
            path.closeSubpath()
            return path
        }
    }
}
