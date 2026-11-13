import SwiftUI

/// «Настройки модели» — значения для всех чатов с моделью (`model_configs` на ПК, как
/// «Профиль модели» на сайте). Открывается кнопкой в шапке чата (модель чата) и из «Моделей
/// на телефоне» (любая скачанная). Веб-поиск, память и базы знаний — в меню «+» у поля ввода.
struct ModelSettingsSheet: View {
    @Environment(AppModel.self) private var model
    /// `nil` — модель открытого чата.
    var modelID: String? = nil

    var body: some View {
        let id = modelID ?? model.activeModelID
        VStack(spacing: 0) {
            SheetHeader(title: "Настройки модели", subtitle: ChatConfig.modelName(id, profiles: model.settings.modelProfiles))
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ModelParameters(modelID: id)
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
        .accessibilityIdentifier("model.settings")
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.sheet)
        .presentationCornerRadius(28)
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

/// Все параметры ответа модели: у моделей картинок — свои (Nano Banana, Omni), у остальных —
/// рассуждения, контекст (у моделей телефона), числа и инструкция. Встраивается и в окно
/// «Настройки модели», и прямо в страницу модели в настройках.
struct ModelParameters: View {
    let modelID: String
    /// Страница модели показывает инструкцию отдельным разделом выше — здесь её тогда нет.
    var showsInstruction = true

    var body: some View {
        if ChatParameters.isNano(modelID) {
            NanoParameters(modelID: modelID)
        } else {
            TextParameters(modelID: modelID, showsInstruction: showsInstruction)
        }
    }
}

/// Текстовые модели: рассуждения, контекст (у моделей телефона), числовые параметры, инструкция.
private struct TextParameters: View {
    @Environment(AppModel.self) private var model
    let modelID: String
    var showsInstruction = true
    @State private var advanced = false
    @State private var instruction = false
    @State private var confirmReset = false

    var body: some View {
        let config = model.modelConfig(modelID)
        let saved = model.savedModelValues(modelID)
        let onPhone = PhoneModelID.isPhone(modelID)
        let specs = ChatParameters.specs
            .filter { ChatParameters.supported(modelID, $0.key) }
            .filter { !onPhone || ($0.key != "presence_penalty" && $0.key != "frequency_penalty") }
            .map { ChatParameters.spec($0, for: modelID) }
        let main = specs.filter { ChatParameters.mainKeys.contains($0.key) }
        let rest = specs.filter { !ChatParameters.mainKeys.contains($0.key) }
        // У моделей телефона рассуждения по умолчанию выключены: они заметно замедляют ответ.
        let thinkingOn = (config["thinking"] as? Bool) ?? !onPhone
        let file = PhoneModelID.file(of: modelID)
        let phoneThinking = model.phone.infos[file]?.thinking

        if onPhone {
            SectionCaption(text: "Рассуждения")
            SettingsCard {
                if phoneThinking?.canToggle == true {
                    ToggleRow(title: "Рассуждения", hint: "Модель сначала думает, потом отвечает. Дольше, но точнее",
                              isOn: thinkingOn) { value in
                        set("thinking", value)
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
            .task { await model.phone.loadInfo(file) }
            PhoneContextSection(modelID: modelID)
            PhoneAbilitiesSection(modelID: modelID)
        } else if let reasoning = ChatParameters.reasoning(modelID) {
            SectionCaption(text: "Рассуждения")
            SettingsCard {
                switch reasoning {
                case .toggle:
                    ToggleRow(title: "Рассуждения", hint: "Больше времени на обдумывание ответа",
                              isOn: thinkingOn) { value in
                        set("thinking", value)
                    }
                case .levels(let levels):
                    ChoiceRow(title: "Рассуждения", choices: levels,
                              selected: ChatConfig.text(config["reasoning_strength"]) ?? "high") { value in
                        set("reasoning_strength", value)
                    }
                }
            }
        }


        if !main.isEmpty {
            SectionCaption(text: "Ответ")
            SettingsCard {
                ForEach(Array(main.enumerated()), id: \.element.id) { index, spec in
                    if index > 0 { CardDivider() }
                    row(spec, config: config, saved: saved)
                }
            }
        }

        if !rest.isEmpty {
            DisclosureHeader(title: "Расширенные параметры", open: $advanced)
            if advanced {
                SettingsCard {
                    ForEach(Array(rest.enumerated()), id: \.element.id) { index, spec in
                        if index > 0 { CardDivider() }
                        row(spec, config: config, saved: saved)
                    }
                }
                .transition(.opacity)
            }
        }

        if showsInstruction {
            DisclosureHeader(title: "Инструкция модели", open: $instruction)
        }
        if showsInstruction && instruction {
            SettingsCard {
                InstructionEditor(placeholder: "Например: отвечай кратко и по делу",
                                  saved: ChatConfig.text(config["systemPrompt"]) ?? "") { text in
                    await model.saveModelInstruction(text, model: modelID)
                }
            }
            .transition(.opacity)
        }

        if specs.contains(where: { saved[$0.key] != nil }) {
            Button {
                confirmReset = true
            } label: {
                Label("Вернуть значения по умолчанию", systemImage: "arrow.uturn.backward")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(Theme.fill, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(PressScaleStyle())
            .padding(.top, 6)
            .confirmationDialog("Вернуть значения по умолчанию?", isPresented: $confirmReset, titleVisibility: .visible) {
                Button("Вернуть", role: .destructive) {
                    Task { await model.resetModelValues(specs.map(\.key), model: modelID) }
                }
                Button("Отмена", role: .cancel) {}
            } message: {
                Text("Температура, длина ответа и остальные параметры снова будут как у модели по умолчанию. Рассуждения и инструкция не изменятся.")
            }
        }
    }

    private func row(_ spec: ParameterSpec, config: [String: Any], saved: [String: Any]) -> some View {
        ParameterRow(spec: spec, value: ChatParameters.number(config[spec.key]) ?? spec.min,
                     changed: saved[spec.key] != nil,
                     changedLabel: "Своё значение", sourceLabel: "По умолчанию",
                     onCommit: { value in set(spec.key, ChatParameters.stored(value, spec: spec)) },
                     onReset: { set(spec.key, nil) })
    }

    private func set(_ key: String, _ value: Any?) {
        Task { await model.setModelValue(key, value, model: modelID) }
    }
}

/// Контекст модели телефона и сколько памяти он займёт.
private struct PhoneContextSection: View {
    @Environment(AppModel.self) private var model
    let modelID: String

    var body: some View {
        let phone = model.phone
        let file = PhoneModelID.file(of: modelID)
        let wanted = phone.wantedContext(file)
        let choices = phone.contextChoices(file)
        let size = phone.installed.first { $0.file == file }?.size

        SectionCaption(text: "Память")
        SettingsCard {
            ChoiceRow(title: "Контекст", choices: choices.map { Choice(String($0), Self.tokens($0)) },
                      selected: String(min(wanted, choices.last ?? wanted))) { value in
                Task { await model.setModelValue(PhoneModels.contextKey, Int(value) ?? PhoneModels.context, model: modelID) }
            }
        }
        if let size {
            let need = phone.needed(size, context: wanted, file: file)
            let fit = phone.fit(size, context: wanted, file: file)
            SettingsNote(text: fit == .tooBig
                         ? "Сколько переписки модель помнит за раз. Нужно около \(PhoneMemory.gigabytes(need)), свободно \(PhoneMemory.gigabytes(phone.availableMemory)) — памяти может не хватить, и iOS закроет приложение. Уменьшите контекст, если так случится."
                         : "Сколько переписки модель помнит за раз. Больше контекст — больше памяти: сейчас нужно около \(PhoneMemory.gigabytes(need)) из \(PhoneMemory.gigabytes(phone.availableMemory)).",
                         symbol: fit == .tooBig ? "exclamationmark.triangle" : "memorychip")
        }
    }

    static func tokens(_ count: Int) -> String {
        count >= 1024 ? "\(count / 1024)K" : String(count)
    }
}

/// Зрение (проектор картинок рядом с моделью) и ускорение MTP (голова в самом файле модели).
private struct PhoneAbilitiesSection: View {
    @Environment(AppModel.self) private var model
    let modelID: String

    var body: some View {
        let phone = model.phone
        let file = PhoneModelID.file(of: modelID)
        let hasMTP = phone.infos[file]?.hasMTP == true
        let sees = phone.visionFile(for: file) != nil
        let item = phone.installed.first { $0.file == file }
        let fetching = phone.downloads[PhoneModels.visionKey(for: file)] != nil

        SectionCaption(text: "Умения")
        SettingsCard {
            if hasMTP {
                ToggleRow(title: "Ускорение MTP",
                          hint: "Модель угадывает несколько слов наперёд и проверяет их разом — ответ идёт быстрее",
                          isOn: (model.modelConfig(modelID)["mtp"] as? Bool) ?? true) { value in
                    Task { await model.setModelValue("mtp", value, model: modelID) }
                }
                CardDivider()
            }
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Зрение")
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.ink)
                    Text(sees ? "Видит картинки из вопроса" : fetching ? "Скачиваю файл зрения…" : "Понимает только текст")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.subtle)
                }
                Spacer(minLength: 8)
                if sees {
                    Image(systemName: "checkmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                } else if fetching {
                    ProgressView().controlSize(.small).tint(Theme.muted)
                } else if let item, item.repo != nil {
                    Button("Добавить") {
                        Haptics.tap()
                        Task { await phone.addVision(for: item) }
                    }
                    .buttonStyle(PillButtonStyle())
                    .accessibilityIdentifier("phone.vision.add")
                }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 58)
        }
        if !hasMTP {
            SettingsNote(text: "Ускорение MTP появится у моделей, в файле которых есть голова MTP (например, Qwen 3.5 и 3.6).")
        }
    }
}

/// Модели картинок AI Studio (Nano Banana, Omni): как `NanoChatParameters.tsx`.
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
        let config = model.modelConfig(modelID)
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
                    await model.setModelValue("nano_system_instruction", text, model: modelID)
                    return model.settingsNotice == nil
                }
            }
        }
    }

    private func set(_ key: String, _ value: Any) {
        Task { await model.setModelValue(key, value, model: modelID) }
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
