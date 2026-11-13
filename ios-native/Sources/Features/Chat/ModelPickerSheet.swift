import SwiftUI

/// Шторка «Выбор модели», как в приложении Claude: главная карточка с моделями (аватарка,
/// название, описание, синяя галочка у выбранной), под ней строка «Рассуждения» с уровнем
/// (переход на список уровней) и «Другие модели» — модели телефона и модели картинок.
struct ModelPickerSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var path: [Page] = []
    @State private var showPhone = false

    enum Page: Hashable { case reasoning, other }

    /// Модели картинок (Nano Banana, Omni) — во «Других моделях», как старые модели у Claude.
    static func isImageModel(_ id: String) -> Bool {
        ChatParameters.isNano(id) || id.localizedCaseInsensitiveContains("omni")
    }

    private var mainModels: [ModelOption] {
        model.models.filter { $0.group != .phone && !Self.isImageModel($0.id) }
            .sorted { $0.group.rawValue > $1.group.rawValue }   // сначала AI Studio, затем ПК
    }

    private var otherModels: [ModelOption] {
        model.allModels.filter { $0.group == .phone || Self.isImageModel($0.id) }
    }

    var body: some View {
        NavigationStack(path: $path) {
            main
                .navigationDestination(for: Page.self) { page in
                    switch page {
                    case .reasoning: ReasoningPage(modelID: model.activeModelID)
                    case .other: otherPage
                    }
                }
                .toolbar(.hidden, for: .navigationBar)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.sheet)
        .presentationCornerRadius(28)
        .task { await model.refreshModels() }
        .sheet(isPresented: $showPhone) {
            PhoneModelsSheet { id in
                Task { await model.selectModel(id) }
                showPhone = false
                dismiss()
            }
            .environment(model)
        }
        .task {
            // Режим снимков: второе окно — после того, как первое доехало.
            guard model.preview == .phoneModels || model.preview == .phoneSettings else { return }
            try? await Task.sleep(nanoseconds: 700_000_000)
            showPhone = true
        }
    }

    private var main: some View {
        VStack(spacing: 0) {
            SheetBar(title: "Выбор модели", symbol: "xmark", label: "Закрыть", action: { dismiss() }) {
                if model.modelsLoading {
                    ProgressView().controlSize(.small).tint(Theme.muted)
                        .padding(.trailing, 12)
                }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if model.models.isEmpty {
                        emptyState
                            .padding(.vertical, 24)
                    } else {
                        SettingsCard {
                            ForEach(Array(mainModels.enumerated()), id: \.element.id) { index, item in
                                if index > 0 { CardDivider(inset: 62) }
                                row(item)
                            }
                        }
                    }
                    if let reasoning = reasoningSummary {
                        SettingsCard {
                            navRow(title: "Рассуждения", value: reasoning, identifier: "picker.reasoning") {
                                path.append(.reasoning)
                            }
                        }
                    }
                    SettingsCard {
                        let current = otherModels.first { $0.id == model.activeModelID }
                        navRow(title: "Другие модели", value: current?.name, identifier: "picker.other") {
                            path.append(.other)
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 6)
                .padding(.bottom, 24)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.sheet.ignoresSafeArea())
    }

    /// Что стоит в строке «Рассуждения»: уровень, «Вкл.»/«Выкл.» или ничего (модель не рассуждает).
    private var reasoningSummary: String? {
        let id = model.activeModelID
        let config = model.modelConfig(id)
        if PhoneModelID.isPhone(id) {
            guard model.phone.infos[PhoneModelID.file(of: id)]?.thinking.canToggle == true else { return nil }
            return (config["thinking"] as? Bool) == true ? "Вкл." : "Выкл."
        }
        switch ChatParameters.reasoning(id) {
        case .toggle:
            return (config["thinking"] as? Bool) ?? true ? "Вкл." : "Выкл."
        case .levels(let levels):
            let value = ChatConfig.text(config["reasoning_strength"]) ?? "high"
            return levels.first { $0.value == value }?.label ?? value
        case nil:
            return nil
        }
    }

    private var otherPage: some View {
        VStack(spacing: 0) {
            SheetBar(title: "Другие модели", symbol: "chevron.left", label: "Назад", action: { path.removeLast() })
            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    SectionLabel("На телефоне")
                    SettingsCard {
                        let phone = otherModels.filter { $0.group == .phone }
                        ForEach(Array(phone.enumerated()), id: \.element.id) { index, item in
                            if index > 0 { CardDivider(inset: 62) }
                            row(item)
                        }
                        if !phone.isEmpty { CardDivider(inset: 16) }
                        managePhone
                    }
                    let images = otherModels.filter { Self.isImageModel($0.id) }
                    if !images.isEmpty {
                        SectionLabel("Картинки")
                            .padding(.top, 10)
                        SettingsCard {
                            ForEach(Array(images.enumerated()), id: \.element.id) { index, item in
                                if index > 0 { CardDivider(inset: 62) }
                                row(item)
                            }
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 6)
                .padding(.bottom, 24)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.sheet.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }

    private func navRow(title: String, value: String?, identifier: String, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 8) {
                Text(title)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.ink)
                Spacer(minLength: 8)
                if let value {
                    Text(value)
                        .font(.system(size: 17))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.subtle)
            }
            .padding(.horizontal, 18)
            .frame(minHeight: 54)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .accessibilityIdentifier(identifier)
    }

    private var managePhone: some View {
        Button {
            Haptics.tap()
            showPhone = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "iphone")
                    .font(.system(size: 15, weight: .light))
                    .foregroundStyle(Theme.ink.opacity(0.9))
                    .frame(width: 22)
                Text(model.phone.installed.isEmpty ? "Скачать модель на телефон" : "Модели на телефоне")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                Spacer(minLength: 8)
                if !model.phone.downloads.isEmpty {
                    ProgressView().controlSize(.small).tint(Theme.muted)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.subtle)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 50)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .accessibilityIdentifier("phone.manage")
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            if model.modelsLoading {
                ProgressView().tint(Theme.muted)
            } else {
                Text("Список моделей недоступен. Проверьте, что сервер моделей на компьютере запущен.")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                Button("Повторить") {
                    Task { await model.refreshModels() }
                }
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 20)
                .frame(minHeight: 44)
                .background(Theme.fill, in: Capsule())
                .buttonStyle(PressScaleStyle())
            }
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity)
    }

    /// Описание под названием: из профиля модели на сайте, иначе — где она работает.
    private func detail(_ item: ModelOption) -> String {
        if let tagline = ChatConfig.text(ChatConfig.dict(model.settings.modelProfiles[item.id])["tagline"]),
           !tagline.trimmingCharacters(in: .whitespaces).isEmpty {
            return tagline
        }
        switch item.group {
        case .local: return item.loaded ? "На компьютере · загружена в память" : "На компьютере"
        case .phone: return "Работает на iPhone без компьютера"
        case .studio: return Self.isImageModel(item.id) ? "AI Studio · создаёт изображения" : "AI Studio"
        }
    }

    private func row(_ item: ModelOption) -> some View {
        let selected = item.id == model.activeModelID
        let avatar = ChatConfig.text(ChatConfig.dict(model.settings.modelProfiles[item.id])["avatar"])
        return Button {
            Task { await model.selectModel(item.id) }
            dismiss()
        } label: {
            HStack(spacing: 12) {
                // Аватарка из профиля модели (как в выборе модели на сайте), иначе — буква.
                AvatarView(image: avatar, name: item.name, size: 34)
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.name)
                        .font(.system(size: 17))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    Text(detail(item))
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(Theme.accent)
                }
            }
            .padding(.leading, 16)
            .padding(.trailing, 18)
            .frame(minHeight: 66)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Подпись над карточкой.
private struct SectionLabel: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(Theme.subtle)
            .padding(.horizontal, 18)
            .padding(.top, 6)
    }
}

/// «Рассуждения» выбранной модели — как «Усилия» в Claude: уровни списком с галочкой
/// или выключатель. Значение общее для всех чатов с этой моделью (как в настройках модели).
private struct ReasoningPage: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var back
    let modelID: String

    var body: some View {
        let config = model.modelConfig(modelID)
        VStack(spacing: 0) {
            SheetBar(title: "Рассуждения", symbol: "chevron.left", label: "Назад", action: { back() })
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    SettingsCard {
                        switch reasoning {
                        case .levels(let levels)?:
                            let value = ChatConfig.text(config["reasoning_strength"]) ?? "high"
                            ForEach(Array(levels.enumerated()), id: \.element.id) { index, level in
                                if index > 0 { CardDivider() }
                                levelRow(level, selected: level.value == value)
                            }
                        case .toggle?, nil:
                            ToggleRow(title: "Рассуждения", hint: "Больше времени на обдумывание ответа",
                                      isOn: (config["thinking"] as? Bool) ?? !PhoneModelID.isPhone(modelID)) { on in
                                Task { await model.setModelValue("thinking", on, model: modelID) }
                            }
                        }
                    }
                    Text("Чем выше уровень, тем дольше модель думает перед ответом и тем точнее ответ. Действует во всех чатах с \(model.activeModelName).")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.subtle)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 18)
                }
                .padding(.horizontal, 18)
                .padding(.top, 6)
                .padding(.bottom, 24)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.sheet.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }

    private var reasoning: ChatParameters.Reasoning? {
        PhoneModelID.isPhone(modelID) ? .toggle : ChatParameters.reasoning(modelID)
    }

    private func levelRow(_ level: Choice, selected: Bool) -> some View {
        Button {
            Haptics.selection()
            Task { await model.setModelValue("reasoning_strength", level.value, model: modelID) }
            back()
        } label: {
            HStack {
                Text(level.label)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.ink)
                Spacer()
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(Theme.accent)
                }
            }
            .padding(.horizontal, 18)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
