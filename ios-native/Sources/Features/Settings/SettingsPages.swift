import PhotosUI
import SwiftUI

// Разделы настроек. Всё сохраняется сразу (имя — когда закончили печатать), без кнопки «Сохранить».

/// «Профиль»: фото, имя, логин.
struct ProfilePage: View {
    @Environment(AppModel.self) private var model
    @State private var name = ""
    @State private var picked: PhotosPickerItem?
    @State private var choosing = false
    @FocusState private var typing: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                VStack(spacing: 12) {
                    AvatarView(image: model.user?.avatar, name: model.user?.shownName ?? "?", size: 96)
                    HStack(spacing: 10) {
                        Button("Изменить фото") { choosing = true }
                            .buttonStyle(PillButtonStyle())
                        if AvatarCache.image(model.user?.avatar) != nil {
                            Button("Удалить") {
                                Task { _ = await model.updateProfile(avatar: "") }
                            }
                            .buttonStyle(PillButtonStyle())
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)

                SectionCaption(text: "Имя")
                SettingsCard {
                    TextField("", text: $name, prompt: Text(model.user?.username ?? "Имя").foregroundStyle(Theme.subtle))
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.ink)
                        .textContentType(.nickname)
                        .submitLabel(.done)
                        .focused($typing)
                        .onSubmit(saveName)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 46)
                        .accessibilityIdentifier("profile.name")
                }
                SettingsNote(text: "Так модель и приложение обращаются к вам.")

                SectionCaption(text: "Аккаунт")
                SettingsCard {
                    ValueRow(title: "Логин", value: model.user?.username ?? "")
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .photosPicker(isPresented: $choosing, selection: $picked, matching: .images)
        .onAppear { name = model.user?.displayName ?? "" }
        .onChange(of: typing) { _, focused in
            if !focused { saveName() }
        }
        .onDisappear(perform: saveName)
        .onChange(of: picked) { _, item in
            guard let item else { return }
            picked = nil
            Task {
                guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data),
                      let avatar = AvatarCache.encode(image) else {
                    model.settingsNotice = "Не удалось открыть фото."
                    return
                }
                _ = await model.updateProfile(avatar: avatar)
            }
        }
    }

    private func saveName() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed != (model.user?.displayName ?? "").trimmingCharacters(in: .whitespacesAndNewlines) else { return }
        Task { _ = await model.updateProfile(name: String(trimmed.prefix(80))) }
    }
}

/// Небольшая кнопка-капсула (действия под аватаром).
struct PillButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 16)
            .frame(minHeight: 38)
            .background(Theme.card, in: Capsule())
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// «Компьютер»: адрес, сервисы, нагрузка и задачи с остановкой — как «Система и задачи» на сайте.
struct ComputerPage: View {
    @Environment(AppModel.self) private var model
    let onChangeServer: () -> Void
    @State private var overview: SystemOverview?
    @State private var failure: String?
    @State private var stopping: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                SettingsCard {
                    ValueRow(title: "Адрес", value: model.serverLabel)
                    CardDivider()
                    Button(action: onChangeServer) {
                        ToolRowLabel(title: "Сменить адрес компьютера", symbol: "arrow.left.arrow.right")
                    }
                    .buttonStyle(RowPressStyle())
                }

                if let overview {
                    content(overview)
                } else if let failure {
                    SettingsNote(text: failure, symbol: "exclamationmark.circle")
                } else {
                    ProgressView().tint(Theme.muted).frame(maxWidth: .infinity, minHeight: 120)
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 32)
        }
        .refreshable { await load() }
        .task {
            // Как на сайте: состояние обновляется раз в 5 секунд, пока раздел открыт.
            while !Task.isCancelled {
                await load()
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
        }
    }

    @ViewBuilder
    private func content(_ overview: SystemOverview) -> some View {
        SectionCaption(text: "Сервисы")
        SettingsCard {
            ForEach(Array(overview.services.enumerated()), id: \.element.id) { index, service in
                if index > 0 { CardDivider() }
                HStack(spacing: 12) {
                    Circle()
                        .fill(service.online ? Color(hex: 0x4CAF6A) : Theme.danger)
                        .frame(width: 8, height: 8)
                        .frame(width: 24)
                    Text(service.name)
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.ink)
                    Spacer()
                    Text(service.online ? "Доступен" : "Нет связи")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.subtle)
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 46)
            }
        }

        SectionCaption(text: "Нагрузка")
        SettingsCard {
            meter("Процессор", value: "\(Int(overview.cpuPercent.rounded()))%", fraction: overview.cpuPercent / 100)
            CardDivider()
            meter("Оперативная память", value: "\(Self.gb(overview.ramUsedMB)) из \(Self.gb(overview.ramTotalMB))",
                  fraction: overview.ramTotalMB > 0 ? overview.ramUsedMB / overview.ramTotalMB : 0)
            ForEach(overview.gpus) { gpu in
                CardDivider()
                meter(gpu.name, value: "\(Self.gb(gpu.usedMB)) из \(Self.gb(gpu.totalMB)) · \(gpu.utilization)%",
                      fraction: gpu.totalMB > 0 ? gpu.usedMB / gpu.totalMB : 0)
            }
            CardDivider()
            ValueRow(title: "Загружены", value: overview.loadedModels.isEmpty ? "нет моделей"
                     : overview.loadedModels.map { ChatConfig.modelName($0, profiles: model.settings.modelProfiles) }.joined(separator: ", "))
        }

        let tasks = overview.tasks + model.queuedTasks
        SectionCaption(text: "Задачи · \(tasks.count)" + (overview.gpuBusy ? " · видеокарта занята" : ""))
        SettingsCard {
            if tasks.isEmpty {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark")
                    Text("Нет активных задач")
                }
                .font(.system(size: 16))
                .foregroundStyle(Theme.muted)
                .padding(.horizontal, 16)
                .frame(minHeight: 46)
            }
            ForEach(Array(tasks.enumerated()), id: \.element.id) { index, task in
                if index > 0 { CardDivider() }
                taskRow(task)
            }
        }
    }

    private func meter(_ title: String, value: String, fraction: Double) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text(value)
                    .font(.system(size: 14).monospacedDigit())
                    .foregroundStyle(Theme.subtle)
                    .lineLimit(1)
            }
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.fillActive)
                    Capsule().fill(fraction >= 0.9 ? Theme.danger : Theme.accent)
                        .frame(width: max(3, geometry.size.width * min(max(fraction, 0), 1)))
                }
            }
            .frame(height: 4)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func taskRow(_ task: SystemTask) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("\(task.kindTitle) · \(task.title)")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(2)
                Text(task.phase + (task.progress.map { " · \($0)%" } ?? ""))
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.subtle)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if task.stoppable {
                Button {
                    Task { await stop(task) }
                } label: {
                    Group {
                        if stopping == task.id {
                            ProgressView().controlSize(.small).tint(Theme.muted)
                        } else {
                            Image(systemName: "stop.fill")
                                .font(.system(size: 12, weight: .semibold))
                        }
                    }
                    .foregroundStyle(Theme.ink)
                    .frame(width: 36, height: 36)
                    .background(Theme.fillActive, in: Circle())
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle())
                .disabled(stopping != nil)
                .accessibilityLabel("Остановить задачу")
                .accessibilityIdentifier("computer.stop")
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 8)
        .padding(.vertical, 8)
    }

    private func load() async {
        do {
            overview = try await model.systemOverview()
            failure = nil
        } catch is CancellationError {
        } catch {
            if overview == nil { failure = (error as? APIError)?.message ?? "Не удалось получить состояние компьютера." }
        }
    }

    private func stop(_ task: SystemTask) async {
        Haptics.tap()
        stopping = task.id
        do {
            try await model.stopTask(task)
            if model.preview != nil { overview?.tasks.removeAll { $0.id == task.id && $0.kind == task.kind } }
        } catch {
            model.settingsNotice = (error as? APIError)?.message ?? "Не удалось остановить задачу."
        }
        stopping = nil
        if model.preview == nil { await load() }
    }

    nonisolated static func gb(_ megabytes: Double) -> String {
        String(format: "%.1f ГБ", megabytes / 1024).replacingOccurrences(of: ".", with: ",")
    }
}

/// «Модели»: поиск и список; у модели — свой профиль.
struct ModelsPage: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""

    var body: some View {
        let ids = model.profileModels.filter { id in
            query.isEmpty || "\(id) \(name(id))".localizedCaseInsensitiveContains(query)
        }
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(Theme.subtle)
                    TextField("", text: $query, prompt: Text("Название модели").foregroundStyle(Theme.subtle))
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.ink)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }
                .padding(.horizontal, 14)
                .frame(minHeight: 46)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                SettingsCard {
                    if ids.isEmpty {
                        Text("Модели не найдены")
                            .font(.system(size: 16))
                            .foregroundStyle(Theme.muted)
                            .padding(16)
                    }
                    ForEach(Array(ids.enumerated()), id: \.element) { index, id in
                        if index > 0 { CardDivider() }
                        NavigationLink(value: SettingsPage.model(id)) {
                            HStack(spacing: 12) {
                                AvatarView(image: ChatConfig.text(ChatConfig.dict(model.settings.modelProfiles[id])["avatar"]),
                                           name: name(id), size: 34)
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 6) {
                                        Text(name(id))
                                            .font(.system(size: 16))
                                            .foregroundStyle(Theme.ink)
                                            .lineLimit(1)
                                        if id == ChatConfig.text(model.settings.shared["model"]) {
                                            Text("По умолчанию")
                                                .font(.system(size: 11, weight: .medium))
                                                .foregroundStyle(Theme.subtle)
                                                .padding(.horizontal, 6)
                                                .padding(.vertical, 2)
                                                .background(Theme.fillActive, in: Capsule())
                                        }
                                    }
                                    Text(id)
                                        .font(.system(size: 12))
                                        .foregroundStyle(Theme.subtle)
                                        .lineLimit(1)
                                }
                                Spacer(minLength: 8)
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(Theme.subtle)
                            }
                            .padding(.horizontal, 16)
                            .frame(minHeight: 56)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(RowPressStyle())
                        .accessibilityIdentifier("models.row")
                    }
                }
                SettingsNote(text: "Название, фото и описание видны в выборе модели и в чатах — и здесь, и на сайте.")
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func name(_ id: String) -> String {
        ChatConfig.modelName(id, profiles: model.settings.modelProfiles)
    }
}

/// «Профиль модели»: фото, название, описание, инструкция; параметры ответа — отдельным окном.
struct ModelProfilePage: View {
    @Environment(AppModel.self) private var model
    let modelID: String
    @State private var alias = ""
    @State private var tagline = ""
    @State private var picked: PhotosPickerItem?
    @State private var choosing = false
    @State private var showParameters = false
    @FocusState private var focus: Field?

    private enum Field { case alias, tagline }

    private var profile: [String: Any] { ChatConfig.dict(model.settings.modelProfiles[modelID]) }
    private var defaultName: String { ChatConfig.modelName(modelID, profiles: [:]) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                VStack(spacing: 12) {
                    AvatarView(image: ChatConfig.text(profile["avatar"]), name: alias.isEmpty ? defaultName : alias, size: 84)
                    HStack(spacing: 10) {
                        Button("Изменить фото") { choosing = true }
                            .buttonStyle(PillButtonStyle())
                        if AvatarCache.image(ChatConfig.text(profile["avatar"])) != nil {
                            Button("Удалить") {
                                Task { await model.saveModelProfile(modelID, ["avatar": ""]) }
                            }
                            .buttonStyle(PillButtonStyle())
                        }
                    }
                    Text(modelID)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.subtle)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)

                SectionCaption(text: "Оформление")
                SettingsCard {
                    field("Название", text: $alias, prompt: defaultName, which: .alias)
                    CardDivider()
                    field("Описание", text: $tagline, prompt: "Для чего эта модель", which: .tagline)
                }
                SettingsNote(text: "Описание видно под названием в выборе модели.")

                SectionCaption(text: "Ответы")
                SettingsCard {
                    Button {
                        Haptics.tap()
                        showParameters = true
                    } label: {
                        ToolRowLabel(title: "Параметры ответа", symbol: "slider.horizontal.3")
                    }
                    .buttonStyle(RowPressStyle())
                    .accessibilityIdentifier("profile.parameters")
                }

                SectionCaption(text: "Инструкция модели")
                SettingsCard {
                    InstructionEditor(placeholder: "Как этой модели отвечать",
                                      saved: ChatConfig.text(model.modelConfig(modelID)["systemPrompt"])
                                          ?? ChatConfig.text(profile["systemPrompt"]) ?? "") { text in
                        await model.saveModelInstruction(text, model: modelID)
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .photosPicker(isPresented: $choosing, selection: $picked, matching: .images)
        .sheet(isPresented: $showParameters) {
            ModelSettingsSheet(modelID: modelID)
        }
        .onAppear {
            alias = ChatConfig.text(profile["alias"]) ?? ""
            tagline = ChatConfig.text(profile["tagline"]) ?? ""
        }
        .onChange(of: focus) { old, _ in
            if let old { save(old) }
        }
        .onDisappear {
            save(.alias)
            save(.tagline)
        }
        .onChange(of: picked) { _, item in
            guard let item else { return }
            picked = nil
            Task {
                guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data),
                      let avatar = AvatarCache.encode(image) else {
                    model.settingsNotice = "Не удалось открыть фото."
                    return
                }
                await model.saveModelProfile(modelID, ["avatar": avatar])
            }
        }
    }

    private func field(_ title: String, text: Binding<String>, prompt: String, which: Field) -> some View {
        HStack(spacing: 12) {
            Text(title)
                .font(.system(size: 16))
                .foregroundStyle(Theme.ink)
                .frame(width: 96, alignment: .leading)
            TextField("", text: text, prompt: Text(prompt).foregroundStyle(Theme.subtle))
                .font(.system(size: 16))
                .foregroundStyle(Theme.ink)
                .focused($focus, equals: which)
                .submitLabel(.done)
                .onSubmit { save(which) }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 46)
    }

    private func save(_ which: Field) {
        let key = which == .alias ? "alias" : "tagline"
        let value = (which == .alias ? alias : tagline).trimmingCharacters(in: .whitespacesAndNewlines)
        guard value != (ChatConfig.text(profile[key]) ?? "") else { return }
        Task { await model.saveModelProfile(modelID, [key: value]) }
    }
}

/// «Веб-поиск»: режим для новых чатов и число результатов.
struct SearchPage: View {
    @Environment(AppModel.self) private var model

    private static let hints: [String: String] = [
        "disabled": "Модель отвечает без интернета",
        "auto": "Модель сама решает, когда искать",
        "forced": "Перед ответом ищет и читает до трёх источников",
    ]

    var body: some View {
        let shared = model.settings.shared
        let mode = ChatConfig.text(shared["searchMode"]) ?? "auto"
        let count = Int(ChatParameters.number(shared["searchMaxResults"]) ?? 5)
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                SectionCaption(text: "Режим для новых чатов")
                SettingsCard {
                    ForEach(Array(ChatParameters.searchModes.enumerated()), id: \.element.id) { index, choice in
                        if index > 0 { CardDivider() }
                        Button {
                            Haptics.tap()
                            Task { _ = await model.saveShared(["searchMode": choice.value]) }
                        } label: {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(choice.label)
                                        .font(.system(size: 16))
                                        .foregroundStyle(Theme.ink)
                                    Text(Self.hints[choice.value] ?? "")
                                        .font(.system(size: 13))
                                        .foregroundStyle(Theme.subtle)
                                }
                                Spacer()
                                if choice.value == mode {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundStyle(Theme.accent)
                                }
                            }
                            .padding(.horizontal, 16)
                            .frame(minHeight: 60)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(RowPressStyle())
                        .accessibilityAddTraits(choice.value == mode ? .isSelected : [])
                    }
                }
                SettingsNote(text: "В открытом чате поиск переключается в меню «+» у поля ввода.")

                SectionCaption(text: "Результаты")
                SettingsCard {
                    Stepper(value: Binding(get: { count }, set: { value in
                        Haptics.selection()
                        Task { _ = await model.saveShared(["searchMaxResults": value]) }
                    }), in: 1...10) {
                        HStack {
                            Text("Количество результатов")
                                .font(.system(size: 16))
                                .foregroundStyle(Theme.ink)
                            Spacer()
                            Text("\(count)")
                                .font(.system(size: 16).monospacedDigit())
                                .foregroundStyle(Theme.muted)
                        }
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 46)
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 32)
        }
    }
}

/// «Общая инструкция» — для моделей без своей.
struct InstructionPage: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                SettingsCard {
                    InstructionEditor(placeholder: "Как модели отвечать во всех чатах",
                                      saved: ChatConfig.text(model.settings.shared["systemPrompt"]) ?? ChatConfig.defaultPrompt) { text in
                        await model.saveShared(["systemPrompt": text])
                    }
                }
                SettingsNote(text: "Для моделей без своей инструкции. Свою задают в «Модели → профиль модели».")
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
    }
}
