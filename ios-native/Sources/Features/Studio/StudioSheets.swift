import SwiftUI

/// Окно студии снизу: чекпоинт, формат, настройки, LoRA, история, сведения об арте.
struct StudioPanelSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let kind: StudioPanel
    let onOpenArt: (String) -> Void

    private var detents: Set<PresentationDetent> {
        kind == .model || kind == .format ? [.medium, .large] : [.large]
    }

    var body: some View {
        Group {
            switch kind {
            case .model: StudioModelPanel(done: { dismiss() })
            case .format: StudioFormatPanel(done: { dismiss() })
            case .settings: StudioSettingsPanel()
            case .loras: StudioLoraPanel()
            case .history: StudioHistoryPanel(onOpenArt: onOpenArt, done: { dismiss() })
            case .details: StudioDetailsPanel(onOpenArt: onOpenArt, done: { dismiss() })
            }
        }
        .presentationDetents(detents)
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.canvas)
        .preferredColorScheme(.dark)
    }
}

// MARK: - Чекпоинт

private struct StudioModelPanel: View {
    @Environment(AppModel.self) private var model
    let done: () -> Void

    var body: some View {
        let studio = model.studio
        let names = studio.config?.models.isEmpty == false ? studio.config!.models : [studio.draft.model]
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                SheetHeader(title: "Чекпоинт", subtitle: studio.available ? nil : "ComfyUI не запущен — выбор недоступен",
                            busy: studio.switching)
                ForEach(StudioModels.groups(names)) { group in
                    SectionCaption(text: group.title)
                    SettingsCard {
                        ForEach(Array(group.models.enumerated()), id: \.element) { index, name in
                            if index > 0 { CardDivider() }
                            Button {
                                Task {
                                    await studio.switchModel(name)
                                    done()
                                }
                            } label: {
                                HStack {
                                    Text(StudioModels.name(name))
                                        .font(.system(size: 16))
                                        .foregroundStyle(Theme.ink)
                                    Spacer()
                                    if name == studio.draft.model {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 14, weight: .semibold))
                                            .foregroundStyle(Theme.ink)
                                    }
                                }
                                .padding(.horizontal, 16)
                                .frame(minHeight: 52)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(RowPressStyle())
                            .disabled(!studio.available || studio.switching)
                        }
                    }
                }
                .padding(.horizontal, 16)
                SettingsNote(text: "У каждого движка свои сохранённые настройки — они подставятся сами.")
                    .padding(.horizontal, 16)
            }
            .padding(.bottom, 24)
        }
    }
}

// MARK: - Формат

private struct StudioFormatPanel: View {
    @Environment(AppModel.self) private var model
    let done: () -> Void

    var body: some View {
        let studio = model.studio
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "Формат изображения")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(StudioFormat.all) { format in
                        tile(name: format.name, detail: "\(format.width) × \(format.height)",
                             ratio: CGFloat(format.width) / CGFloat(format.height),
                             active: studio.draft.size == format.value) {
                            studio.edit { $0.size = format.value }
                            done()
                        }
                    }
                    tile(name: "Свой размер", detail: "Ширина и высота", ratio: nil, active: studio.draft.size == "custom") {
                        studio.edit { $0.size = "custom" }
                    }
                }
                .padding(.horizontal, 16)
                if studio.draft.size == "custom" {
                    CustomSize()
                        .padding(.horizontal, 16)
                    Button("Готово", action: done)
                        .buttonStyle(PrimaryButtonStyle())
                        .padding(.horizontal, 16)
                }
            }
            .padding(.bottom, 24)
        }
    }

    private func tile(name: String, detail: String, ratio: CGFloat?, active: Bool, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            VStack(spacing: 8) {
                Group {
                    if let ratio {
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .strokeBorder(Theme.ink.opacity(0.7), lineWidth: 1.5)
                            .frame(width: ratio >= 1 ? 34 : 34 * ratio, height: ratio >= 1 ? 34 / ratio : 34)
                    } else {
                        Image(systemName: "slider.horizontal.3").font(.system(size: 20))
                    }
                }
                .frame(height: 38)
                Text(name).font(.system(size: 15, weight: .semibold))
                Text(detail).font(.system(size: 13).monospacedDigit()).foregroundStyle(Theme.muted)
            }
            .foregroundStyle(Theme.ink)
            .frame(maxWidth: .infinity, minHeight: 108)
            .background(active ? Theme.fillActive : Theme.fill, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(active ? Theme.ink.opacity(0.5) : Color.clear))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityAddTraits(active ? .isSelected : [])
    }
}

/// Ширина и высота своего размера.
private struct CustomSize: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let studio = model.studio
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                field("Ширина", text: Binding(get: { studio.draft.width }, set: { value in studio.edit { $0.width = digits(value) } }))
                field("Высота", text: Binding(get: { studio.draft.height }, set: { value in studio.edit { $0.height = digits(value) } }))
            }
            Text("256–4096 px · кратно \(StudioModels.alignment(studio.draft.model))")
                .font(.system(size: 13))
                .foregroundStyle(Theme.subtle)
        }
    }

    private func digits(_ value: String) -> String { String(value.filter(\.isNumber).prefix(4)) }

    private func field(_ title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.muted)
            TextField("1024", text: text)
                .keyboardType(.numberPad)
                .font(.system(size: 17).monospacedDigit())
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 14)
                .frame(height: 48)
                .background(Theme.fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .accessibilityLabel(title)
        }
    }
}

// MARK: - Настройки генерации

private struct StudioSettingsPanel: View {
    @Environment(AppModel.self) private var model

    private static let steps = ParameterSpec(key: "steps", label: "Шаги", min: 1, max: 80, step: 1,
                                             hint: "Сколько раз модель уточняет картинку. Больше — детальнее, но дольше.")
    private static let cfg = ParameterSpec(key: "cfg", label: "CFG", min: 0, max: 20, step: 0.1,
                                           hint: "Насколько строго следовать промпту. Слишком высокое значение пережигает цвета.")
    private static let denoise = ParameterSpec(key: "denoise", label: "Denoise", min: 0, max: 1, step: 0.01,
                                               hint: "Доля шума, которую модель убирает. Для новой картинки — 1.")

    var body: some View {
        let studio = model.studio
        let config = studio.config
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                SheetHeader(title: "Настройки генерации", subtitle: StudioModels.name(studio.draft.model), busy: studio.switching)
                Group {
                    SettingsCard {
                        ChoiceRow(title: "Разрешение",
                                  choices: StudioFormat.all.map { Choice($0.value, "\($0.name) · \($0.width) × \($0.height)") }
                                    + [Choice("custom", "Свой размер")],
                                  selected: studio.draft.size) { value in studio.edit { $0.size = value } }
                        if studio.draft.size == "custom" {
                            CardDivider()
                            CustomSize().padding(16)
                        }
                    }
                    SettingsCard {
                        ParameterRow(spec: Self.steps, value: Double(studio.draft.steps)) { value in
                            studio.edit { $0.steps = Int(value.rounded()) }
                        }
                        CardDivider()
                        ParameterRow(spec: Self.cfg, value: studio.draft.cfg) { value in
                            studio.edit { $0.cfg = (value * 10).rounded() / 10 }
                        }
                        CardDivider()
                        ParameterRow(spec: Self.denoise, value: studio.draft.denoise) { value in
                            studio.edit { $0.denoise = (value * 100).rounded() / 100 }
                        }
                    }
                    SettingsCard {
                        ChoiceRow(title: "Семплер", choices: options(config?.samplers, current: studio.draft.sampler),
                                  selected: studio.draft.sampler) { value in studio.edit { $0.sampler = value } }
                        CardDivider()
                        ChoiceRow(title: "Scheduler", choices: options(config?.schedulers, current: studio.draft.scheduler),
                                  selected: studio.draft.scheduler) { value in studio.edit { $0.scheduler = value } }
                    }
                    .disabled(!studio.available)
                    SectionCaption(text: "Seed")
                    SeedCard()
                    SectionCaption(text: "Негативный промпт")
                    TextEditorCard(text: Binding(get: { studio.draft.negative },
                                                 set: { value in studio.edit { $0.negative = String(value.prefix(16000)) } }),
                                   placeholder: "Чего не должно быть на арте")
                    if let problem = studio.problem {
                        SettingsNote(text: problem, symbol: "exclamationmark.triangle")
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func options(_ list: [String]?, current: String) -> [Choice] {
        let names = (list?.isEmpty == false ? list! : []) + (list?.contains(current) == true ? [] : [current])
        return names.map { Choice($0, $0) }
    }
}

private struct SeedCard: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let studio = model.studio
        let random = studio.draft.seed == "-1"
        SettingsCard {
            ToggleRow(title: "Случайный", hint: "Новый seed для каждого арта", isOn: random) { on in
                studio.edit { $0.seed = on ? "-1" : String(Int.random(in: 0...4_294_967_295)) }
            }
            if !random {
                CardDivider()
                TextField("Seed", text: Binding(get: { studio.draft.seed },
                                                set: { value in studio.edit { $0.seed = String(value.filter(\.isNumber).prefix(16)) } }))
                    .keyboardType(.numberPad)
                    .font(.system(size: 17).monospacedDigit())
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 52)
                    .accessibilityLabel("Seed")
            }
        }
    }
}

/// Многострочное поле на подложке.
private struct TextEditorCard: View {
    @Binding var text: String
    let placeholder: String

    var body: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(placeholder)
                    .foregroundStyle(Theme.subtle)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 8)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .scrollContentBackground(.hidden)
                .foregroundStyle(Theme.ink)
                .frame(minHeight: 110, maxHeight: 220)
        }
        .font(.system(size: 16))
        .padding(8)
        .background(Theme.fill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

// MARK: - LoRA

private struct StudioLoraPanel: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""
    @State private var notice: String?

    var body: some View {
        let studio = model.studio
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                SheetHeader(title: "LoRA", subtitle: "Выбрано \(studio.draft.loras.count) из 8", busy: studio.lorasLoading)
                Group {
                    if !studio.draft.loras.isEmpty {
                        SettingsCard {
                            ForEach(Array(studio.draft.loras.enumerated()), id: \.element.name) { index, lora in
                                if index > 0 { CardDivider() }
                                LoraStrengthRow(lora: lora)
                            }
                        }
                    }
                    let sets = studio.loraSets.filter { $0.architecture == StudioModels.engine(studio.draft.model) }
                    if !sets.isEmpty {
                        SectionCaption(text: "Наборы")
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(sets) { set in
                                    Button {
                                        notice = studio.applySet(set) ? nil : "Некоторых LoRA из набора нет в ComfyUI."
                                    } label: {
                                        Text(set.name)
                                            .font(.system(size: 14, weight: .medium))
                                            .foregroundStyle(Theme.ink)
                                            .padding(.horizontal, 14)
                                            .frame(height: 36)
                                            .background(Theme.fill, in: Capsule())
                                            .frame(minHeight: 44)
                                    }
                                    .buttonStyle(PressScaleStyle())
                                }
                            }
                        }
                    }
                    if let notice { SettingsNote(text: notice, symbol: "exclamationmark.triangle") }
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass").foregroundStyle(Theme.muted)
                        TextField("Найти LoRA", text: $query)
                            .foregroundStyle(Theme.ink)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                        Button {
                            Task { await studio.loadLoras() }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                                .foregroundStyle(Theme.muted)
                                .frame(width: 40, height: 40)
                        }
                        .accessibilityLabel("Обновить список LoRA")
                    }
                    .font(.system(size: 16))
                    .padding(.leading, 14)
                    .frame(height: 48)
                    .background(Theme.fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    catalog
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    @ViewBuilder
    private var catalog: some View {
        let studio = model.studio
        let rows = studio.catalog.filter { query.isEmpty || "\($0.title) \($0.name) \($0.description)".localizedCaseInsensitiveContains(query) }
        if let error = studio.lorasError {
            SettingsNote(text: error, symbol: "exclamationmark.triangle")
        } else if rows.isEmpty, !studio.lorasLoading {
            SettingsNote(text: query.isEmpty ? "В ComfyUI нет LoRA." : "LoRA не найдена.")
        }
        if !rows.isEmpty {
            SettingsCard {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, entry in
                    if index > 0 { CardDivider() }
                    LoraCatalogRow(entry: entry)
                }
            }
        }
    }
}

private struct LoraCatalogRow: View {
    @Environment(AppModel.self) private var model
    let entry: LoraEntry

    var body: some View {
        let studio = model.studio
        let selected = studio.draft.loras.contains { $0.name == entry.name }
        HStack(spacing: 10) {
            Button {
                studio.toggleLora(entry.name)
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: selected ? "checkmark.circle.fill" : "plus.circle")
                        .font(.system(size: 19))
                        .foregroundStyle(selected ? Theme.ink : Theme.muted)
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 5) {
                            Text(entry.title).font(.system(size: 16)).foregroundStyle(Theme.ink).lineLimit(1)
                            if entry.favorite {
                                Image(systemName: "star.fill").font(.system(size: 10)).foregroundStyle(Theme.muted)
                            }
                        }
                        if !entry.description.isEmpty {
                            Text(entry.description).font(.system(size: 13)).foregroundStyle(Theme.subtle).lineLimit(2)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!selected && studio.draft.loras.count >= 8)
            .accessibilityLabel("\(selected ? "Убрать" : "Добавить") LoRA \(entry.title)")
            if !entry.triggers.isEmpty {
                Button {
                    Haptics.tap()
                    studio.addTriggers(entry.triggers)
                } label: {
                    Image(systemName: "text.badge.plus")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.muted)
                        .frame(width: 40, height: 40)
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Добавить слова активации \(entry.title) в промпт")
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(minHeight: 52)
    }
}

/// Сила выбранной LoRA для модели и для CLIP.
private struct LoraStrengthRow: View {
    @Environment(AppModel.self) private var model
    let lora: StudioLora
    @State private var strength: Double = 1
    @State private var clip: Double = 1

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(StudioModels.loraName(lora.name))
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Spacer()
                Button {
                    model.studio.toggleLora(lora.name)
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .frame(width: 36, height: 36)
                }
                .accessibilityLabel("Убрать LoRA \(StudioModels.loraName(lora.name))")
            }
            slider("Модель", value: $strength) { value in
                model.studio.edit { draft in
                    guard let index = draft.loras.firstIndex(where: { $0.name == lora.name }) else { return }
                    draft.loras[index].strengthClip = draft.loras[index].clip
                    draft.loras[index].strength = value
                }
            }
            slider("CLIP", value: $clip) { value in
                model.studio.edit { draft in
                    guard let index = draft.loras.firstIndex(where: { $0.name == lora.name }) else { return }
                    draft.loras[index].strengthClip = value
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .onAppear { sync() }
        .onChange(of: lora) { _, _ in sync() }
    }

    private func sync() {
        strength = lora.strength
        clip = lora.clip
    }

    private func slider(_ title: String, value: Binding<Double>, commit: @escaping (Double) -> Void) -> some View {
        HStack(spacing: 10) {
            Text(title).font(.system(size: 14)).foregroundStyle(Theme.muted).frame(width: 58, alignment: .leading)
            Slider(value: value, in: 0...2, step: 0.05, onEditingChanged: { editing in
                if !editing { commit((value.wrappedValue * 100).rounded() / 100) }
            })
            .tint(Theme.buttonPrimary)
            .accessibilityLabel("\(title) LoRA \(StudioModels.loraName(lora.name))")
            Text(value.wrappedValue.formatted(.number.precision(.fractionLength(2))))
                .font(.system(size: 14).monospacedDigit())
                .foregroundStyle(Theme.muted)
                .frame(width: 40, alignment: .trailing)
        }
    }
}

// MARK: - История

private struct StudioHistoryPanel: View {
    @Environment(AppModel.self) private var model
    let onOpenArt: (String) -> Void
    let done: () -> Void
    @State private var confirmClear = false

    var body: some View {
        let studio = model.studio
        let jobs = studio.completed
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                SheetHeader(title: "История артов", subtitle: jobs.isEmpty ? nil : "Всего \(jobs.count)")
                HStack {
                    Text("Нажми, чтобы показать на сцене")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.subtle)
                    Spacer()
                    Button(role: .destructive) {
                        confirmClear = true
                    } label: {
                        Label("Очистить", systemImage: "trash")
                            .font(.system(size: 14, weight: .medium))
                            .frame(minHeight: 40)
                    }
                    .foregroundStyle(Theme.danger)
                    .disabled(studio.deleting || studio.clearableCount == 0)
                }
                .padding(.horizontal, 16)
                if jobs.isEmpty {
                    SettingsNote(text: "Здесь появятся готовые арты.")
                        .padding(.horizontal, 16)
                } else {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 6) {
                        ForEach(jobs) { job in
                            cell(job)
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            .padding(.bottom, 32)
        }
        .confirmationDialog("Очистить историю артов?", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("Очистить историю", role: .destructive) {
                Task { await studio.clearHistory() }
            }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text("Будет удалено артов: \(studio.clearableCount). Избранное останется. Вернуть можно сразу после очистки.")
        }
    }

    private func cell(_ job: StudioJob) -> some View {
        let studio = model.studio
        return Button {
            studio.select(job)
            done()
        } label: {
            StudioThumb(id: job.id)
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(alignment: .topTrailing) {
                    if job.favorite {
                        Image(systemName: "star.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(.white)
                            .padding(5)
                            .background(.black.opacity(0.45), in: Circle())
                            .padding(5)
                    }
                }
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(job.id == studio.selected?.id ? Theme.ink : Color.clear, lineWidth: 2)
                )
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Арт: \(job.prompt.prefix(60))")
        .accessibilityIdentifier("studio.history.cell")
        .contextMenu {
            Button("На весь экран", systemImage: "arrow.up.left.and.arrow.down.right") { onOpenArt(job.id) }
            Button(job.favorite ? "Убрать из избранного" : "В избранное", systemImage: job.favorite ? "star.slash" : "star") {
                Task { await studio.toggleFavorite(job) }
            }
            Button("Повторить настройки", systemImage: "repeat") {
                studio.reuse(job)
                done()
            }
            .disabled(studio.busy || studio.pendingJob != nil || studio.loop)
            Button("Удалить", systemImage: "trash", role: .destructive) {
                Task { await studio.delete(job) }
            }
        }
    }
}

// MARK: - Об арте

private struct StudioDetailsPanel: View {
    @Environment(AppModel.self) private var model
    let onOpenArt: (String) -> Void
    let done: () -> Void
    @State private var copied = false

    var body: some View {
        let studio = model.studio
        ScrollView {
            if let job = studio.selected {
                VStack(alignment: .leading, spacing: 12) {
                    SheetHeader(title: "Об этом арте", subtitle: job.model.isEmpty ? nil : StudioModels.name(job.model))
                    Group {
                        SettingsCard {
                            ValueRow(title: "Размер", value: "\(job.width) × \(job.height)")
                            if let steps = job.steps {
                                CardDivider()
                                ValueRow(title: "Шаги", value: String(steps))
                            }
                            if let cfg = job.cfg {
                                CardDivider()
                                ValueRow(title: "CFG", value: cfg.formatted(.number.precision(.fractionLength(0...1))))
                            }
                            if let seed = job.seed {
                                CardDivider()
                                Button {
                                    UIPasteboard.general.string = String(seed)
                                    Haptics.success()
                                    copied = true
                                } label: {
                                    HStack {
                                        Text("Seed").foregroundStyle(Theme.ink)
                                        Spacer()
                                        Text(String(seed)).foregroundStyle(Theme.muted).monospacedDigit()
                                        Image(systemName: copied ? "checkmark" : "doc.on.doc")
                                            .font(.system(size: 13))
                                            .foregroundStyle(Theme.muted)
                                    }
                                    .font(.system(size: 16))
                                    .padding(.horizontal, 16)
                                    .frame(minHeight: 52)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(RowPressStyle())
                                .accessibilityLabel(copied ? "Seed скопирован" : "Скопировать seed \(seed)")
                            }
                            if let loras = job.loras, !loras.isEmpty {
                                CardDivider()
                                ValueRow(title: "LoRA", value: loras.map { StudioModels.loraName($0.name) }.joined(separator: ", "))
                            }
                        }
                        SectionCaption(text: "Промпт")
                        Text(job.prompt)
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.ink)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                            .background(Theme.fill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        WideButton(title: "На весь экран", symbol: "arrow.up.left.and.arrow.down.right") {
                            onOpenArt(job.id)
                        }
                        WideButton(title: "Повторить настройки", symbol: "repeat") {
                            studio.reuse(job)
                            done()
                        }
                        .disabled(studio.busy || studio.pendingJob != nil || studio.loop)
                        Button(role: .destructive) {
                            Task {
                                await studio.delete(job)
                                done()
                            }
                        } label: {
                            Label("Удалить арт", systemImage: "trash")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(Theme.danger)
                                .frame(maxWidth: .infinity, minHeight: 50)
                        }
                        .disabled(studio.deleting)
                        SettingsNote(text: "Увеличение и правка арта появятся позже.")
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 32)
            } else {
                SheetHeader(title: "Об этом арте")
                SettingsNote(text: "Арт не выбран.").padding(.horizontal, 16)
            }
        }
    }
}
