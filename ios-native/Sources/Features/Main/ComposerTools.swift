import SwiftUI

/// Меню «+» у поля ввода — как `ComposerTools.tsx` на сайте, но в виде шторки: сверху вложения
/// плитками, ниже то, что меняет ответ. Поиск и базы знаний — для этого чата, рассуждения
/// и память — для всех чатов с моделью.
struct ComposerToolsSheet: View {
    enum Source {
        case camera, photo, file
    }

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let onPick: (Source) -> Void
    @State private var knowledge = false

    var body: some View {
        let id = model.activeModelID
        let onPhone = PhoneModelID.isPhone(id)
        let nano = ChatParameters.isNano(id)
        let detents: Set<PresentationDetent> = onPhone ? [.height(250)] : nano ? [.height(150)] : [.fraction(0.66), .large]

        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    tiles(onPhone: onPhone)
                    if onPhone {
                        PhoneReasoning(modelID: id)
                    } else if !nano {
                        SettingsCard {
                            SegmentRow(title: ChatParameters.usesGoogleSearch(id) ? "Google Search" : "Веб-поиск",
                                       choices: ChatParameters.searchModes, selected: model.activeSearchMode) { value in
                                Task { await model.setSearchMode(value) }
                            }
                            .accessibilityIdentifier("tools.search")
                            if let reasoning = ChatParameters.reasoning(id) {
                                CardDivider()
                                ReasoningRow(modelID: id, reasoning: reasoning)
                            }
                            CardDivider()
                            ToggleRow(title: "Память",
                                      hint: model.memoryEnabled(id) ? "Модель помнит сохранённые факты о вас"
                                                                    : "Не читает и не меняет сохранённые факты",
                                      isOn: model.memoryEnabled(id)) { value in
                                Task { await model.setModelValue("memoryEnabled", value, model: id) }
                            }
                            CardDivider()
                            knowledgeRow
                        }
                        SettingsNote(text: "Поиск и базы знаний — для этого чата. Рассуждения и память — для всех чатов с этой моделью.")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 20)
                .padding(.bottom, 24)
            }
            .scrollBounceBehavior(.basedOnSize)
            .background(Theme.surface)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(isPresented: $knowledge) {
                KnowledgeChoice()
            }
        }
        .accessibilityIdentifier("tools.sheet")
        .presentationDetents(detents)
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.surface)
        .presentationCornerRadius(28)
        .preferredColorScheme(.dark)
        .settingsNotice()
    }

    private func tiles(onPhone: Bool) -> some View {
        HStack(spacing: 10) {
            if UIImagePickerController.isSourceTypeAvailable(.camera) || model.preview != nil {
                tile("Камера", symbol: "camera", source: .camera, enabled: !onPhone)
            }
            tile("Фото", symbol: "photo.on.rectangle", source: .photo, enabled: !onPhone)
            tile("Файл", symbol: "doc", source: .file, enabled: !onPhone)
        }
        .overlay(alignment: .bottom) {
            if onPhone {
                Text("Модель на телефоне понимает только текст")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.subtle)
                    .offset(y: 24)
            }
        }
        .padding(.bottom, onPhone ? 24 : 0)
    }

    private func tile(_ title: String, symbol: String, source: Source, enabled: Bool) -> some View {
        Button {
            Haptics.tap()
            onPick(source)
            dismiss()
        } label: {
            VStack(spacing: 6) {
                Image(systemName: symbol)
                    .font(.system(size: 20, weight: .regular))
                Text(title)
                    .font(.system(size: 14))
            }
            .foregroundStyle(enabled ? Theme.ink : Theme.subtle)
            .frame(maxWidth: .infinity, minHeight: 76)
            .background(Theme.fill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!enabled)
        .accessibilityIdentifier("tools.\(source)")
    }

    private var knowledgeRow: some View {
        let selection = model.activeKnowledge
        let value = selection.enabled && !selection.collections.isEmpty
            ? Plural.knowledge(selection.collections.count, .library) : "Выкл"
        return Button {
            Haptics.tap()
            knowledge = true
        } label: {
            HStack(spacing: 12) {
                Text("Базы знаний")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                Spacer(minLength: 8)
                Text(value)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.subtle)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .accessibilityIdentifier("tools.knowledge")
    }
}

/// Рассуждения модели ПК: выключатель или уровень (для всех чатов с моделью).
private struct ReasoningRow: View {
    @Environment(AppModel.self) private var model
    let modelID: String
    let reasoning: ChatParameters.Reasoning

    var body: some View {
        let config = model.modelConfig(modelID)
        switch reasoning {
        case .toggle:
            ToggleRow(title: "Рассуждения", hint: "Больше времени на обдумывание ответа",
                      isOn: (config["thinking"] as? Bool) ?? true) { value in
                Task { await model.setModelValue("thinking", value, model: modelID) }
            }
        case .levels(let levels):
            ChoiceRow(title: "Рассуждения", choices: levels,
                      selected: ChatConfig.text(config["reasoning_strength"]) ?? "high") { value in
                Task { await model.setModelValue("reasoning_strength", value, model: modelID) }
            }
        }
    }
}

/// Рассуждения модели телефона — если её шаблон умеет их выключать.
private struct PhoneReasoning: View {
    @Environment(AppModel.self) private var model
    let modelID: String

    var body: some View {
        let file = PhoneModelID.file(of: modelID)
        let kind = model.phone.infos[file]?.thinking
        SettingsCard {
            if kind?.canToggle == true {
                ToggleRow(title: "Рассуждения", hint: "Модель сначала думает, потом отвечает. Дольше, но точнее",
                          isOn: (model.modelConfig(modelID)["thinking"] as? Bool) ?? false) { value in
                    Task { await model.setModelValue("thinking", value, model: modelID) }
                }
            } else {
                Text(kind == .always ? "Эта модель рассуждает всегда." : (kind == nil ? "Читаю сведения о модели…" : "Эта модель не умеет рассуждать перед ответом."))
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .task { await model.phone.loadInfo(file) }
    }
}

/// Экран «Базы знаний» внутри меню «+».
private struct KnowledgeChoice: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Назад")
                Text("Базы знаний")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                Spacer()
            }
            .padding(.horizontal, 8)
            .padding(.top, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    KnowledgePicker()
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        }
        .background(Theme.surface)
        .toolbar(.hidden, for: .navigationBar)
    }
}

/// Базы знаний чата — как `KnowledgePicker` в `KnowledgeSettings.tsx`.
struct KnowledgePicker: View {
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
