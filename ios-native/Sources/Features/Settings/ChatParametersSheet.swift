import SwiftUI

/// «Параметры чата» — как окно с тем же названием на сайте (`Settings.tsx: Parameters`).
/// Правки действуют в этом чате; рассуждения и инструкция запоминаются для модели.
struct ChatParametersSheet: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let id = model.activeModelID
        VStack(spacing: 0) {
            SheetHeader(title: "Параметры чата", subtitle: model.activeModelName)
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if ChatParameters.isNano(id) {
                        NanoParameters(modelID: id)
                    } else {
                        TextParameters(modelID: id)
                    }
                }
                .id(id)
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
                // Без «нажатия по пустому месту»: оно срабатывало и от нажатия по полю ввода
                // и сразу прятало клавиатуру. Клавиатура уходит, если потянуть список.
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.surface)
        .presentationCornerRadius(28)
        .preferredColorScheme(.dark)
        .settingsNotice()
    }
}

/// Ошибка сохранения — одно и то же окно для шторок параметров и настроек.
extension View {
    func settingsNotice() -> some View {
        modifier(SettingsNoticeAlert())
    }
}

private struct SettingsNoticeAlert: ViewModifier {
    @Environment(AppModel.self) private var model

    func body(content: Content) -> some View {
        content.alert("Не сохранилось", isPresented: Binding(
            get: { model.settingsNotice != nil },
            set: { if !$0 { model.settingsNotice = nil } }
        )) {
            Button("Понятно", role: .cancel) { model.settingsNotice = nil }
        } message: {
            Text(model.settingsNotice ?? "")
        }
    }
}

/// Текстовые модели: поиск, рассуждения, числовые параметры, инструкция.
private struct TextParameters: View {
    @Environment(AppModel.self) private var model
    let modelID: String
    @State private var advanced = false
    @State private var instruction = false
    @State private var knowledge = PreviewScene.current == .parameters
    @State private var confirmReset = false

    var body: some View {
        let config = model.activeConfig
        let changes = model.activeChatChanges
        let overrides = model.activeOverrides
        let subscription = ChatParameters.isSubscription(modelID)
        let specs = ChatParameters.specs
            .filter { ChatParameters.supported(modelID, $0.key) }
            .map { ChatParameters.spec($0, for: modelID) }
        let main = specs.filter { ChatParameters.mainKeys.contains($0.key) }
        let rest = specs.filter { !ChatParameters.mainKeys.contains($0.key) }
        let mode = ChatConfig.text(overrides["searchMode"]) ?? ChatConfig.text(model.settings.shared["searchMode"]) ?? "auto"
        let onPhone = PhoneModelID.isPhone(modelID)
        // У моделей телефона рассуждения по умолчанию выключены: они заметно замедляют ответ.
        let thinkingOn = (config["thinking"] as? Bool) ?? (overrides["thinking"] as? Bool) ?? !onPhone
        let phoneThinking = model.phone.infos[PhoneModelID.file(of: modelID)]?.thinking

        SettingsNote(text: "Рассуждения сохраняются для модели. Остальные параметры — только для этого чата.")

        if onPhone {
            SettingsCard {
                if phoneThinking?.canToggle == true {
                    ToggleRow(title: "Рассуждения", hint: "Модель сначала думает, потом отвечает. Дольше, но точнее",
                              isOn: thinkingOn) { value in
                        Task { await model.setParameter("thinking", value) }
                    }
                } else {
                    Text(phoneThinking == .always ? "Эта модель рассуждает всегда — выключить нельзя."
                         : (phoneThinking == nil ? "Читаю сведения о модели…" : "Эта модель не умеет рассуждать перед ответом."))
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.muted)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .task { await model.phone.loadInfo(PhoneModelID.file(of: modelID)) }
            SettingsNote(text: "Модель работает на телефоне: веб-поиск и базы знаний ей недоступны. Размер контекста и значения для всех чатов — в «Модели на телефоне» → настройки модели.")
        } else {
        SettingsCard {
            SegmentRow(title: ChatParameters.usesGoogleSearch(modelID) ? "Google Search" : "Веб-поиск",
                       choices: ChatParameters.searchModes, selected: mode) { value in
                var all = model.activeOverrides
                all["searchMode"] = value
                Task { await model.saveOverrides(all) }
            }
            if let reasoning = ChatParameters.reasoning(modelID) {
                CardDivider()
                switch reasoning {
                case .toggle:
                    ToggleRow(title: "Рассуждения", hint: "Больше времени на обдумывание ответа",
                              isOn: thinkingOn) { value in
                        Task { await model.setParameter("thinking", value) }
                    }
                case .levels(let levels):
                    ChoiceRow(title: "Рассуждения", choices: levels,
                              selected: ChatConfig.text(config["reasoning_strength"]) ?? "high") { value in
                        Task { await model.setParameter("reasoning_strength", value) }
                    }
                }
            }
        }

        DisclosureHeader(title: model.activeKnowledge.enabled ? "Базы знаний · включены" : "Базы знаний", open: $knowledge)
        if knowledge {
            KnowledgePicker()
                .transition(.opacity)
        }
        }

        if subscription {
            SettingsNote(text: "Доступны инструкции и уровень рассуждений. Температурой и длиной ответа управляет сервис подписки.")
        }

        if !main.isEmpty {
            SettingsCard {
                ForEach(Array(main.enumerated()), id: \.element.id) { index, spec in
                    if index > 0 { CardDivider() }
                    row(spec, config: config, changes: changes)
                }
            }
        }

        if !rest.isEmpty {
            DisclosureHeader(title: "Расширенные параметры", open: $advanced)
            if advanced {
                SettingsCard {
                    ForEach(Array(rest.enumerated()), id: \.element.id) { index, spec in
                        if index > 0 { CardDivider() }
                        row(spec, config: config, changes: changes)
                    }
                }
                .transition(.opacity)
            }
        }

        DisclosureHeader(title: "Инструкция модели", open: $instruction)
        if instruction {
            SettingsNote(text: "Для всех чатов с этой моделью — как «Профиль модели → Инструкции» на сайте.")
            SettingsCard {
                InstructionEditor(placeholder: "Например: отвечай кратко и по делу",
                                  saved: ChatConfig.text(config["systemPrompt"]) ?? "") { text in
                    await model.saveModelInstruction(text)
                }
            }
            .transition(.opacity)
        }

        if !changes.isEmpty || overrides["thinking"] != nil {
            Button {
                confirmReset = true
            } label: {
                Label("Вернуть параметры профиля", systemImage: "arrow.uturn.backward")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(Theme.fill, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(PressScaleStyle())
            .padding(.top, 6)
            .confirmationDialog("Вернуть параметры профиля?", isPresented: $confirmReset, titleVisibility: .visible) {
                Button("Вернуть", role: .destructive) {
                    Task { await model.resetChatParameters() }
                }
                Button("Отмена", role: .cancel) {}
            } message: {
                Text("Правки этого чата для модели будут убраны.")
            }
        }
    }

    private func row(_ spec: ParameterSpec, config: [String: Any], changes: [String: Any]) -> some View {
        let changed = changes[spec.key] != nil
        return ParameterRow(spec: spec, value: ChatParameters.number(config[spec.key]) ?? spec.min,
                            changed: changed,
                            onCommit: { value in
                                Task { await model.setParameter(spec.key, ChatParameters.stored(value, spec: spec)) }
                            },
                            onReset: { Task { await model.setParameter(spec.key, nil) } })
    }
}

/// Модели картинок AI Studio (Nano Banana): как `NanoChatParameters.tsx`.
private struct NanoParameters: View {
    @Environment(AppModel.self) private var model
    let modelID: String

    private struct Sample {
        let spec: ParameterSpec
        /// Значение модели, пока параметр не меняли (−1 у длины — «максимум»).
        let fallback: Double
    }

    private static func samples(for model: String) -> [Sample] {
        let sampling = ChatParameters.nanoSampling(model)
        var result: [Sample] = []
        if sampling.temperature, let spec = ChatParameters.nanoSpecs["nano_temperature"] {
            result.append(Sample(spec: spec, fallback: 1))
        }
        if sampling.topP, let spec = ChatParameters.nanoSpecs["nano_top_p"] {
            result.append(Sample(spec: spec, fallback: 0.95))
        }
        if sampling.textLimits, let spec = ChatParameters.nanoSpecs["nano_max_output_tokens"] {
            result.append(Sample(spec: spec, fallback: -1))
        }
        return result
    }

    private static func list(_ value: Any?) -> [String]? {
        let items = (value as? [Any])?.compactMap { $0 as? String } ?? []
        return items.isEmpty ? nil : items
    }

    var body: some View {
        let config = model.activeConfig
        let entry = model.imageCatalog[modelID] ?? [:]
        let features = ChatConfig.dict(entry["features"])
        let ratios = Self.list(entry["aspect_ratios"]) ?? ["auto"]
        let sizes = Self.list(entry["image_sizes"]) ?? ["1K"]
        let savedRatio = (config["nano_aspect_ratio"] as? String) ?? ""
        let ratio = ratios.contains(savedRatio) ? savedRatio : "auto"
        let savedSize = (config["nano_image_size"] as? String) ?? ""
        let size = sizes.contains(savedSize) ? savedSize : (sizes.contains("1K") ? "1K" : sizes[0])
        let levels = (features["thinking_level"] as? Bool) == true ? ChatParameters.nanoThinkingLevels(modelID) : nil
        let savedThinking = (config["nano_thinking"] as? String) ?? ""
        let thinking = levels?.contains { $0.value == savedThinking } == true
            ? savedThinking : ChatParameters.nanoDefaultThinking(modelID)
        let samplingSpecs = Self.samples(for: modelID)
        let googleSearch = (features["google_search"] as? Bool) == true
        let imageSearch = (features["image_search"] as? Bool) == true
        let video = ChatParameters.isOmni(modelID)
        let tasks = video && (features["video_tasks"] as? Bool) == true
        let savedTask = (config["nano_video_task"] as? String) ?? ""
        let task = tasks && ChatParameters.omniTasks.contains { $0.value == savedTask } ? savedTask : "auto"
        let durations = ChatParameters.omniDurations(modelID)
        let savedDuration = ChatParameters.number(config["nano_video_duration"]).map { Int($0) } ?? 0
        let duration = durations.contains(savedDuration) ? savedDuration : 5
        let savedResolution = (config["nano_video_resolution"] as? String) ?? ""
        let resolution = ChatParameters.omniResolutions.contains { $0.value == savedResolution } ? savedResolution : "720p"

        if (entry["available"] as? Bool) == false {
            SettingsNote(text: ChatConfig.text(entry["reason"]) ?? "Модель недоступна в текущем подключении AI Studio.",
                         symbol: "exclamationmark.circle")
        }
        SettingsNote(text: "Параметры действуют только в этом чате.")

        SettingsCard {
            if ChatParameters.nanoOutputFormat(modelID) {
                ChoiceRow(title: "Формат ответа",
                          choices: [Choice("text_image", "С текстом"), Choice("image", "Без текста")],
                          selected: (config["nano_response_mode"] as? String) == "image" ? "image" : "text_image") { value in
                    set("nano_response_mode", value)
                }
                CardDivider()
            }
            if tasks {
                ChoiceRow(title: "Задача видео", choices: ChatParameters.omniTasks, selected: task) { value in
                    set("nano_video_task", value)
                }
                CardDivider()
            }
            if !video || (task != "edit" && task != "extend") {
                ChoiceRow(title: "Соотношение сторон",
                          choices: ratios.map { Choice($0, $0 == "auto" ? "Авто" : $0) }, selected: ratio) { value in
                    set("nano_aspect_ratio", value)
                }
            }
            if !video && sizes.count > 1 {
                CardDivider()
                ChoiceRow(title: "Размер", choices: sizes.map { Choice($0, $0) }, selected: size) { value in
                    set("nano_image_size", value)
                }
            }
            if video && task != "edit" {
                if task != "extend" { CardDivider() }
                ChoiceRow(title: "Длительность", choices: durations.map { Choice(String($0), "\($0) с") },
                          selected: String(duration)) { value in
                    set("nano_video_duration", Int(value) ?? 5)
                }
                CardDivider()
                ChoiceRow(title: "Разрешение", choices: ChatParameters.omniResolutions, selected: resolution) { value in
                    set("nano_video_resolution", value)
                }
            }
            if let levels {
                CardDivider()
                ChoiceRow(title: "Рассуждения", choices: levels, selected: thinking) { value in
                    set("nano_thinking", value)
                }
            }
        }

        if tasks, let hint = ChatParameters.omniTaskHints[task] {
            SettingsNote(text: hint)
        }
        if video && task != "edit" {
            SettingsNote(text: "Длительность задаётся для первого ролика. При продолжении её определяет модель.")
        }

        if googleSearch || imageSearch {
            SettingsCard {
                if googleSearch {
                    ToggleRow(title: "Google Search", hint: "Сверяться с поиском перед рисованием",
                              isOn: (config["nano_google_search"] as? Bool) != false) { value in
                        set("nano_google_search", value)
                    }
                }
                if googleSearch && imageSearch { CardDivider() }
                if imageSearch {
                    ToggleRow(title: "Поиск по картинкам", hint: "Брать найденные изображения как образцы",
                              isOn: (config["nano_image_search"] as? Bool) == true) { value in
                        set("nano_image_search", value)
                    }
                }
            }
        }

        if !samplingSpecs.isEmpty {
            SettingsCard {
                ForEach(Array(samplingSpecs.enumerated()), id: \.element.spec.id) { index, item in
                    if index > 0 { CardDivider() }
                    ParameterRow(spec: item.spec, value: ChatParameters.number(config[item.spec.key]) ?? item.fallback,
                                 onCommit: { value in set(item.spec.key, ChatParameters.stored(value, spec: item.spec)) })
                }
            }
        }

        if (features["system_instruction"] as? Bool) != false {
            SectionCaption(text: "Инструкции для модели")
            SettingsCard {
                InstructionEditor(placeholder: video ? "Например: плавное движение камеры, естественный свет"
                                                     : "Например: стиль акварели, без текста на изображении",
                                  saved: (config["nano_system_instruction"] as? String) ?? "") { text in
                    await model.setParameter("nano_system_instruction", text)
                    return model.settingsNotice == nil
                }
            }
        }
    }

    private func set(_ key: String, _ value: Any) {
        Task { await model.setParameter(key, value) }
    }
}

/// Базы знаний чата — как `KnowledgePicker` в `KnowledgeSettings.tsx`.
private struct KnowledgePicker: View {
    @Environment(AppModel.self) private var model
    @State private var loaded = false
    @State private var manage = false

    var body: some View {
        let selection = model.activeKnowledge
        let libraries = model.knowledgeLibraries
        let missing = selection.collections.filter { id in !libraries.contains { $0.id == id } }

        SettingsCard {
            ToggleRow(title: "Использовать базу знаний", hint: "Модель ищет в выбранных документах",
                      isOn: selection.enabled) { value in
                var next = selection
                next.enabled = value
                save(next)
            }
            if selection.enabled {
                ForEach(libraries) { library in
                    CardDivider()
                    let chosen = selection.collections.contains(library.id)
                    Button {
                        Haptics.tap()
                        var next = selection
                        if chosen {
                            next.collections.removeAll { $0 == library.id }
                        } else {
                            next.collections.append(library.id)
                        }
                        save(next)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: chosen ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 20))
                                .foregroundStyle(chosen ? Theme.buttonPrimary : Theme.subtle)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(library.name)
                                    .font(.system(size: 16))
                                    .foregroundStyle(Theme.ink)
                                    .lineLimit(1)
                                Text(Plural.knowledge(library.documents, .document))
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.subtle)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 56)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowPressStyle())
                    .accessibilityAddTraits(chosen ? .isSelected : [])
                }
                CardDivider()
                ToggleRow(title: "Отвечать только по базе",
                          hint: "Поиск обязателен, веб-поиск отключён. Если подтверждения нет, модель скажет об этом",
                          isOn: selection.strict) { value in
                    var next = selection
                    next.strict = value
                    save(next)
                }
            }
        }
        if selection.enabled {
            if loaded && libraries.isEmpty {
                SettingsNote(text: "Баз пока нет. Создайте базу и добавьте материалы.")
            } else if selection.collections.isEmpty {
                SettingsNote(text: "Выберите хотя бы одну базу.", symbol: "exclamationmark.circle")
            }
            if loaded && !missing.isEmpty {
                Button {
                    var next = selection
                    next.collections.removeAll { missing.contains($0) }
                    save(next)
                } label: {
                    SettingsNote(text: "Одна из выбранных баз недоступна. Нажмите, чтобы убрать её из выбора.",
                                 symbol: "exclamationmark.triangle")
                }
                .buttonStyle(.plain)
            }
        }
        WideButton(title: "Управлять базами", symbol: "books.vertical") { manage = true }
            .task(id: model.knowledgeRevision) {
                loaded = await model.loadLibraries() || loaded
            }
            .sheet(isPresented: $manage) { KnowledgeSheet() }
    }

    private func save(_ selection: KnowledgeSelection) {
        Task { await model.saveKnowledge(selection) }
    }
}

/// Заголовок раскрывающейся группы.
struct DisclosureHeader: View {
    let title: String
    @Binding var open: Bool

    var body: some View {
        Button {
            Haptics.tap()
            withAnimation(Theme.spring) { open.toggle() }
        } label: {
            HStack(spacing: 6) {
                Text(title)
                    .font(.system(size: 15, weight: .medium))
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .rotationEffect(.degrees(open ? 90 : 0))
                Spacer()
            }
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 4)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(open ? "Свернуть" : "Развернуть")
    }
}
