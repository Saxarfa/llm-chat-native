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

    /// Главная карточка: сначала Claude (как в приложении Claude: Fable, Opus, Sonnet, Haiku, новые выше),
    /// затем AI Studio, затем модели ПК; внутри группы — порядок сервера.
    private var mainModels: [ModelOption] {
        let list = model.models.filter { [.claude, .studio, .local].contains($0.group) && !Self.isImageModel($0.id) }
        return list.enumerated().sorted { left, right in
            let a = Self.rank(left.element.group), b = Self.rank(right.element.group)
            if a != b { return a < b }
            if left.element.group == .claude {
                let x = HostedService.claudeOrder(left.element.id), y = HostedService.claudeOrder(right.element.id)
                if x.family != y.family { return x.family < y.family }
                if x.version != y.version { return y.version.lexicographicallyPrecedes(x.version) }
            }
            return left.offset < right.offset
        }.map(\.element)
    }

    private static func rank(_ group: ModelOption.Group) -> Int {
        switch group {
        case .claude: return 0
        case .studio: return 1
        default: return 2
        }
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

    private func navRow(title: String, value: String?, identifier: String,
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
        case .phone: return "На телефоне"
        case .studio: return Self.isImageModel(item.id) ? "AI Studio · создаёт изображения" : "AI Studio"
        case .hosted: return "\(HostedService.of(item.id)?.title ?? "API") · бесплатный API"
        case .claude: return "Claude API"
        }
    }

    /// Строка модели, как у Claude (замер 16.11.2026): шаг 71 pt, название 17, описание 15, текст в 20 pt
    /// от края карточки, синяя галочка у выбранной.
    /// Выбор сразу закрывает окно (просьба пользователя 23.11.2026): смену видно в чипе капсулы,
    /// а не в списке. Окно не ждёт ответа сервера: модель в чате меняется сразу, ещё до запроса.
    private func row(_ item: ModelOption) -> some View {
        let selected = item.id == model.activeModelID
        return Button {
            if !selected {
                Haptics.selection()
                Task { await model.selectModel(item.id) }
            }
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

/// Части «скользящей отметки» в списке уровней рассуждений.
enum SlidingMark {
    static let check = "check"
    static let fill = "fill"
    /// Отскок, с которым подсветка и галочка переезжают на новую строку.
    static let spring = Animation.spring(response: 0.42, dampingFraction: 0.64)
    /// Сколько окно ждёт после нажатия, чтобы переезд было видно (наносекунды).
    static let hold: UInt64 = 320_000_000

    static var highlight: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(Theme.fillActive)
            .padding(.horizontal, 6)
            .padding(.vertical, 5)
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

/// «Рассуждения» выбранной модели — как «Усилия» в Claude: уровни списком с галочкой
/// или выключатель. Значение общее для всех чатов с этой моделью (как в настройках модели).
private struct ReasoningPage: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var back
    let modelID: String
    /// Только что нажатый уровень: отметка уже на нём, назад вернёмся через `SlidingMark.hold`.
    @State private var picked: String?
    @Namespace private var mark

    var body: some View {
        let config = model.modelConfig(modelID)
        VStack(spacing: 0) {
            SheetBar(title: "Рассуждения", symbol: "chevron.left", label: "Назад", action: { back() })
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    SettingsCard {
                        switch reasoning {
                        case .levels(let levels)?:
                            let value = picked ?? ChatConfig.text(config["reasoning_strength"]) ?? "high"
                            ForEach(Array(levels.enumerated()), id: \.element.id) { index, level in
                                if index > 0 { CardDivider() }
                                levelRow(level, selected: level.value == value)
                            }
                        case .toggle?, nil:
                            ToggleRow(title: "Рассуждения",
                                      isOn: (config["thinking"] as? Bool) ?? !PhoneModelID.isPhone(modelID)) { on in
                                Task { await model.setModelValue("thinking", on, model: modelID) }
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

    private var reasoning: ChatParameters.Reasoning? {
        PhoneModelID.isPhone(modelID) ? .toggle : ChatParameters.reasoning(modelID)
    }

    private func levelRow(_ level: Choice, selected: Bool) -> some View {
        Button {
            guard picked == nil else { return }
            guard !selected else { back(); return }
            Haptics.selection()
            withAnimation(SlidingMark.spring) { picked = level.value }
            Task { await model.setModelValue("reasoning_strength", level.value, model: modelID) }
            Task {
                try? await Task.sleep(nanoseconds: SlidingMark.hold)
                back()
            }
        } label: {
            HStack(spacing: 8) {
                Text(level.label)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.ink)
                Spacer()
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                        .matchedGeometryEffect(id: SlidingMark.check, in: mark)
                }
            }
            .padding(.horizontal, RowMetrics.plainLeading)
            .frame(minHeight: 58)
            .background {
                if selected {
                    SlidingMark.highlight
                        .opacity(picked == nil ? 0 : 1)
                        .matchedGeometryEffect(id: SlidingMark.fill, in: mark)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
