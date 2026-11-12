import SwiftUI

/// Настройки модели телефона — значения по умолчанию для всех чатов с ней: рассуждения,
/// размер контекста, выборка токенов, инструкция. Хранятся в параметрах модели на ПК
/// (`model_configs`, как «Профиль модели» на сайте); в отдельном чате их можно поменять
/// в «Параметрах чата».
struct PhoneModelSettingsSheet: View {
    @Environment(AppModel.self) private var model
    let item: PhoneModel

    @State private var advanced = false
    @State private var instruction = false

    private var phone: PhoneModels { model.phone }
    private var modelID: String { item.chatID }

    var body: some View {
        let saved = ChatConfig.dict(model.settings.modelConfigs[modelID])
        let config = ChatConfig.config(model: modelID, settings: model.settings, overrides: [:])
        let info = phone.infos[item.file]
        let thinking = info?.thinking ?? .none
        let wanted = phone.wantedContext(item.file)
        let choices = phone.contextChoices(item.file)
        let specs = ChatParameters.specs.filter { $0.key != "presence_penalty" && $0.key != "frequency_penalty" }
        let main = specs.filter { ChatParameters.mainKeys.contains($0.key) }
        let rest = specs.filter { !ChatParameters.mainKeys.contains($0.key) }

        VStack(spacing: 0) {
            SheetHeader(title: "Настройки модели", subtitle: PhoneModelNames.display(modelID))
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsNote(text: "Для всех чатов с этой моделью. В отдельном чате значения можно поменять в «Параметрах чата».")

                    SectionCaption(text: "Рассуждения")
                    SettingsCard {
                        if thinking.canToggle {
                            ToggleRow(title: "Рассуждения", hint: "Модель сначала думает, потом отвечает. Дольше, но точнее",
                                      isOn: (config["thinking"] as? Bool) ?? false) { value in
                                set("thinking", value)
                            }
                        } else {
                            Text(thinking == .always
                                 ? "Эта модель рассуждает всегда — выключить нельзя."
                                 : (info == nil ? "Читаю сведения о модели…" : "Эта модель не умеет рассуждать перед ответом."))
                                .font(.system(size: 15))
                                .foregroundStyle(Theme.muted)
                                .padding(16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }

                    SectionCaption(text: "Память")
                    SettingsCard {
                        ChoiceRow(title: "Контекст", choices: choices.map { Choice(String($0), Self.tokens($0)) },
                                  selected: String(min(wanted, choices.last ?? wanted))) { value in
                            set(PhoneModels.contextKey, Int(value) ?? PhoneModels.context)
                        }
                    }
                    let fit = phone.fit(item.size, context: wanted)
                    SettingsNote(text: "Сколько переписки модель помнит за раз. Больше контекст — больше памяти: сейчас нужно около \(PhoneMemory.gigabytes(PhoneMemory.needed(fileSize: item.size, context: wanted))) из \(PhoneMemory.gigabytes(phone.availableMemory)).",
                                 symbol: fit == .tooBig ? "exclamationmark.triangle" : "memorychip")

                    SectionCaption(text: "Ответ")
                    SettingsCard {
                        ForEach(Array(main.enumerated()), id: \.element.id) { index, spec in
                            if index > 0 { CardDivider() }
                            row(spec, config: config, saved: saved)
                        }
                    }

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

                    DisclosureHeader(title: "Инструкция модели", open: $instruction)
                    if instruction {
                        SettingsCard {
                            InstructionEditor(placeholder: "Например: отвечай кратко и по-русски",
                                              saved: ChatConfig.text(config["systemPrompt"]) ?? "") { text in
                                await model.saveModelInstruction(text, model: modelID)
                            }
                        }
                        .transition(.opacity)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
                .contentShape(Rectangle())
                .onTapGesture { Keyboard.hide() }
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .accessibilityIdentifier("phone.modelSettings")
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.surface)
        .presentationCornerRadius(28)
        .preferredColorScheme(.dark)
        .settingsNotice()
        .task { await phone.loadInfo(item.file) }
    }

    private func row(_ spec: ParameterSpec, config: [String: Any], saved: [String: Any]) -> some View {
        ParameterRow(spec: spec, value: ChatParameters.number(config[spec.key]) ?? spec.min,
                     changed: saved[spec.key] != nil,
                     changedLabel: "Своё значение", sourceLabel: "По умолчанию",
                     onCommit: { value in set(spec.key, ChatParameters.stored(value, spec: spec)) },
                     onReset: { set(spec.key, nil) })
    }

    private func set(_ key: String, _ value: Any?) {
        Task { await model.setModelDefault(model: modelID, key: key, value: value) }
    }

    static func tokens(_ count: Int) -> String {
        count >= 1024 ? "\(count / 1024)K" : String(count)
    }
}
