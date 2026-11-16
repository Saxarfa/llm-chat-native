import SwiftUI

/// Шторка «Выбор модели», как в приложении Claude: главная карточка с моделями (название,
/// описание, синяя галочка у выбранной, без аватарок), под ней строка «Рассуждения» с уровнем
/// (переход на список уровней) и «Другие модели» — модели телефона и модели картинок.
struct ModelPickerSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var path: [Page] = []
    @State private var showPhone = false
    @State private var showSettings = false

    enum Page: Hashable { case reasoning, other }

    /// Модели картинок (Nano Banana, Omni) — во «Других моделях», как старые модели у Claude.
    static func isImageModel(_ id: String) -> Bool {
        ChatParameters.isNano(id) || id.localizedCaseInsensitiveContains("omni")
    }

    private var mainModels: [ModelOption] {
        model.models.filter { [.studio, .local].contains($0.group) && !Self.isImageModel($0.id) }
            .sorted { $0.group.rawValue > $1.group.rawValue }   // сначала AI Studio, затем ПК
    }

    /// Модели телефона, картинок и облачных сервисов (NVIDIA, OpenRouter, Groq).
    private var otherModels: [ModelOption] {
        model.allModels.filter { $0.group == .phone || $0.group == .hosted || Self.isImageModel($0.id) }
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
        .sheet(isPresented: $showSettings) {
            ModelSettingsSheet()
        }
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
                                if index > 0 { CardDivider() }
                                row(item)
                            }
                        }
                    }
                    if let reasoning = reasoningSummary {
                        SettingsCard {
                            navRow(title: "Рассуждения", value: reasoning.label,
                                   badge: reasoning.recommended ? "Рекомендуется" : nil,
                                   identifier: "picker.reasoning") {
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
                    // Параметры ответа выбранной модели (то же окно, что «⋯ → Настройки модели»):
                    // в «Инкогнито» шапка без кнопки настроек, отсюда до них всегда один шаг.
                    SettingsCard {
                        navRow(title: "Настройки модели", value: nil, identifier: "picker.settings") {
                            showSettings = true
                        }
                    }
                }
                .padding(.horizontal, RowMetrics.cardInset)
                .padding(.top, 6)
                .padding(.bottom, 24)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.sheet.ignoresSafeArea())
    }

    /// Что стоит в строке «Рассуждения»: уровень, «Вкл.»/«Выкл.» или ничего (модель не рассуждает).
    /// `recommended` — выбран уровень по умолчанию: у Claude рядом стоит отметка «Рекомендуется».
    private var reasoningSummary: (label: String, recommended: Bool)? {
        let id = model.activeModelID
        let config = model.modelConfig(id)
        if PhoneModelID.isPhone(id) {
            guard model.phone.infos[PhoneModelID.file(of: id)]?.thinking.canToggle == true else { return nil }
            return ((config["thinking"] as? Bool) == true ? "Вкл." : "Выкл.", false)
        }
        switch ChatParameters.reasoning(id) {
        case .toggle:
            return ((config["thinking"] as? Bool) ?? true ? "Вкл." : "Выкл.", false)
        case .levels(let levels):
            let value = ChatConfig.text(config["reasoning_strength"]) ?? "high"
            return (levels.first { $0.value == value }?.label ?? value,
                    value == ChatParameters.recommendedLevel(id))
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
                            if index > 0 { CardDivider() }
                            row(item)
                        }
                        if !phone.isEmpty { CardDivider() }
                        managePhone
                    }
                    let images = otherModels.filter { Self.isImageModel($0.id) }
                    if !images.isEmpty {
                        SectionLabel("Картинки")
                            .padding(.top, 10)
                        SettingsCard {
                            ForEach(Array(images.enumerated()), id: \.element.id) { index, item in
                                if index > 0 { CardDivider() }
                                row(item)
                            }
                        }
                    }
                    // Облачные сервисы — по разделу на каждый, как вкладка «API» на сайте.
                    ForEach(HostedService.allCases, id: \.self) { service in
                        let list = otherModels.filter { HostedService.of($0.id) == service }
                        if !list.isEmpty {
                            SectionLabel(service.title)
                                .padding(.top, 10)
                            SettingsCard {
                                ForEach(Array(list.enumerated()), id: \.element.id) { index, item in
                                    if index > 0 { CardDivider() }
                                    row(item)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, RowMetrics.cardInset)
                .padding(.top, 6)
                .padding(.bottom, 24)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.sheet.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }

    private func navRow(title: String, value: String?, badge: String? = nil, identifier: String,
                        action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 8) {
                Text(title)
                    .font(.system(size: RowMetrics.text))
                    .foregroundStyle(Theme.ink)
                Spacer(minLength: 8)
                if let badge {
                    RecommendedBadge(text: badge)
                }
                if let value {
                    Text(value)
                        .font(.system(size: RowMetrics.text))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: RowMetrics.chevron, weight: .semibold))
                    .foregroundStyle(Theme.subtle)
            }
            .padding(.horizontal, RowMetrics.plainLeading)
            .frame(minHeight: 51)
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
            HStack(spacing: RowMetrics.iconGap) {
                RowIcon(symbol: "iphone")
                Text(model.phone.installed.isEmpty ? "Скачать модель на телефон" : "Модели на телефоне")
                    .font(.system(size: RowMetrics.text))
                    .foregroundStyle(Theme.ink)
                Spacer(minLength: 8)
                if !model.phone.downloads.isEmpty {
                    ProgressView().controlSize(.small).tint(Theme.muted)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: RowMetrics.chevron, weight: .semibold))
                    .foregroundStyle(Theme.subtle)
            }
            .padding(.leading, RowMetrics.leading)
            .padding(.trailing, RowMetrics.trailing)
            .frame(minHeight: RowMetrics.height)
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
        case .hosted: return "\(HostedService.of(item.id)?.title ?? "API") · бесплатный API"
        }
    }

    /// Строка модели, как у Claude (замер 16.11.2026): шаг 71 pt, название 17, описание 15, текст в 20 pt
    /// от края карточки, синяя галочка у выбранной.
    private func row(_ item: ModelOption) -> some View {
        let selected = item.id == model.activeModelID
        return Button {
            Task { await model.selectModel(item.id) }
            dismiss()
        } label: {
            HStack(spacing: 12) {
                // Как у Claude: название и описание без аватарки (фото модели видно на её странице в настройках).
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.name)
                        .font(.system(size: 17))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    Text(detail(item))
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.leading, RowMetrics.plainLeading)
            .padding(.trailing, RowMetrics.trailing)
            .frame(minHeight: 71)
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
            .font(.system(size: 15))
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 20)
            .padding(.top, 6)
    }
}

/// Серая капсула «Рекомендуется» у уровня рассуждений по умолчанию, как у Claude.
struct RecommendedBadge: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Theme.fillActive, in: Capsule())
            .fixedSize()
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
                            let recommended = ChatParameters.recommendedLevel(modelID)
                            ForEach(Array(levels.enumerated()), id: \.element.id) { index, level in
                                if index > 0 { CardDivider() }
                                levelRow(level, selected: level.value == value, recommended: level.value == recommended)
                            }
                        case .toggle?, nil:
                            ToggleRow(title: "Рассуждения", hint: "Больше времени на обдумывание ответа",
                                      isOn: (config["thinking"] as? Bool) ?? !PhoneModelID.isPhone(modelID)) { on in
                                Task { await model.setModelValue("thinking", on, model: modelID) }
                            }
                        }
                    }
                    Text("Чем выше уровень, тем дольше модель думает перед ответом и тем точнее ответ. Действует во всех сессиях с \(model.activeModelName).")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 20)
                }
                .padding(.horizontal, RowMetrics.cardInset)
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

    private func levelRow(_ level: Choice, selected: Bool, recommended: Bool) -> some View {
        Button {
            Haptics.selection()
            Task { await model.setModelValue("reasoning_strength", level.value, model: modelID) }
            back()
        } label: {
            HStack(spacing: 8) {
                Text(level.label)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.ink)
                if recommended {
                    RecommendedBadge(text: "Рекомендуется")
                }
                Spacer()
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                }
            }
            .padding(.horizontal, RowMetrics.plainLeading)
            .frame(minHeight: 58)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
