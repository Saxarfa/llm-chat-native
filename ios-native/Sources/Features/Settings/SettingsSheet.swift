import SwiftUI

/// Разделы настроек, открывающиеся переходом внутрь.
enum SettingsPage: Hashable {
    case profile, computer, models, search, memory
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
                .safeAreaInset(edge: .top, spacing: 0) {
                    SheetBar(title: "Настройки", symbol: "xmark", label: "Закрыть", action: { dismiss() }) {
                        CircleIconButton(symbol: "info", label: "О приложении") { showAbout = true }
                    }
                }
                .navigationTitle("Настройки")
                .toolbar(.hidden, for: .navigationBar)
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
            ModelProfilePage(modelID: id).settingsPage(ChatConfig.modelName(id, profiles: model.settings.modelProfiles))
        case .search:
            SearchPage().settingsPage("Веб-поиск")
        case .memory:
            MemorySheet(embedded: true).settingsPage("Память")
        }
    }

    private var root: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                account

                SectionCaption(text: "Аккаунт")
                SettingsCard {
                    link("Профиль", symbol: "person", page: .profile)
                    CardDivider(inset: 53)
                    link("Компьютер", symbol: "desktopcomputer", value: model.serverLabel, page: .computer)
                }

                SectionCaption(text: "Приложение")
                SettingsCard {
                    link("Модели", symbol: "cpu", page: .models)
                    CardDivider(inset: 53)
                    link("Веб-поиск", symbol: "globe", value: searchModeLabel, page: .search)
                    CardDivider(inset: 53)
                    link("Память", symbol: "brain", page: .memory)
                    CardDivider(inset: 53)
                    Button {
                        Haptics.tap()
                        showKnowledge = true
                    } label: {
                        ToolRowLabel(title: "Базы знаний", symbol: "books.vertical")
                    }
                    .buttonStyle(RowPressStyle())
                    CardDivider(inset: 53)
                    IconToggleRow(title: "Тактильный отклик", symbol: "iphone.radiowaves.left.and.right",
                                  isOn: model.haptics) { model.haptics = $0 }
                }

                SectionCaption(text: "Внешний вид")
                AppearancePicker()

                SectionCaption(text: "Шрифт ответов")
                AnswerFontPicker()

                SettingsCard {
                    Button {
                        Haptics.tap()
                        confirmLogout = true
                    } label: {
                        HStack(spacing: 14) {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .font(.system(size: 15, weight: .light))
                                .frame(width: 22)
                            Text("Выйти")
                                .font(.system(size: 16))
                            Spacer()
                        }
                        .foregroundStyle(Theme.danger)
                        .padding(.leading, 17)
                        .padding(.trailing, 16)
                        .frame(minHeight: 46)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowPressStyle())
                    .accessibilityIdentifier("settings.logout")
                }
                .padding(.top, 10)
            }
            .padding(.horizontal, 18)
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
                    AvatarView(image: model.user?.avatar, name: model.user?.shownName ?? "?", size: 38)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.user?.shownName ?? "")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                        Text(["@" + (model.user?.username ?? ""), model.serverLabel].filter { $0.count > 1 }.joined(separator: " · "))
                            .font(.system(size: 12.5))
                            .foregroundStyle(Theme.subtle)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Theme.subtle)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(RowPressStyle())
            .accessibilityIdentifier("settings.account")
        }
    }
}

/// Оформление раздела настроек: заголовок по центру, круглая кнопка «назад» (или «закрыть»,
/// если раздел — корень отдельного окна), фон шторки.
private struct SettingsPageChrome: ViewModifier {
    let title: String
    var symbol = "chevron.left"
    var label = "Назад"
    @Environment(\.dismiss) private var dismiss

    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(Theme.sheet)
            .safeAreaInset(edge: .top, spacing: 0) {
                SheetBar(title: title, symbol: symbol, label: label, action: { dismiss() })
            }
            .navigationTitle(title)
            .navigationBarBackButtonHidden(true)
            .toolbar(.hidden, for: .navigationBar)
    }
}

extension View {
    func settingsPage(_ title: String, symbol: String = "chevron.left", label: String = "Назад") -> some View {
        modifier(SettingsPageChrome(title: title, symbol: symbol, label: label))
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
            HStack(spacing: 14) {
                Image(systemName: symbol)
                    .font(.system(size: 15, weight: .light))
                    .foregroundStyle(Theme.ink.opacity(0.9))
                    .frame(width: 22)
                Text(title)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
            }
        }
        .tint(Theme.accent)
        .padding(.leading, 17)
        .padding(.trailing, 16)
        .frame(minHeight: 46)
    }
}

/// «Внешний вид»: три плитки-миниатюры — светлая, тёмная, как в системе.
struct AppearancePicker: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(spacing: 8) {
            ForEach(Appearance.allCases, id: \.self) { option in
                let selected = model.appearance == option
                Button {
                    Haptics.tap()
                    withAnimation(.easeOut(duration: 0.2)) { model.appearance = option }
                } label: {
                    VStack(spacing: 8) {
                        AppearanceSample(option: option)
                            .frame(height: 68)
                            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 11, style: .continuous)
                                    .strokeBorder(selected ? Theme.accent : Theme.line, lineWidth: selected ? 1.5 : 1)
                            )
                        Text(option.title)
                            .font(.system(size: 11.5, weight: selected ? .medium : .regular))
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
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 12)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
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
