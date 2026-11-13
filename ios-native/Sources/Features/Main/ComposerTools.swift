import Photos
import SwiftUI

/// Меню «+» у поля ввода, как «Добавление в сессию» в приложении Claude: камера и лента
/// последних фото, ниже — файлы и то, что меняет ответ. Поиск и базы знаний — для этого чата,
/// рассуждения и память — для всех чатов с моделью.
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
        let detents: Set<PresentationDetent> = onPhone ? [.height(420)] : nano ? [.height(330)] : [.fraction(0.72), .large]

        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    PhotoStrip(enabled: !onPhone, onCamera: { pick(.camera) }, onLibrary: { pick(.photo) })
                    if onPhone {
                        SettingsNote(text: "Модель на телефоне понимает только текст.")
                    }
                    SettingsCard {
                        ToolRow(title: "Добавить файлы", symbol: "doc.badge.plus", enabled: !onPhone) { pick(.file) }
                            .accessibilityIdentifier("tools.file")
                    }
                    if onPhone {
                        PhoneReasoning(modelID: id)
                    } else if !nano {
                        SettingsCard {
                            searchRow(id)
                            CardDivider(inset: 53)
                            knowledgeRow
                        }
                        SettingsCard {
                            if let reasoning = ChatParameters.reasoning(id) {
                                ReasoningRow(modelID: id, reasoning: reasoning)
                                CardDivider()
                            }
                            ToggleRow(title: "Память",
                                      hint: model.memoryEnabled(id) ? "Модель помнит сохранённые факты о вас"
                                                                    : "Не читает и не меняет сохранённые факты",
                                      isOn: model.memoryEnabled(id)) { value in
                                Task { await model.setModelValue("memoryEnabled", value, model: id) }
                            }
                        }
                        SettingsNote(text: "Поиск и базы знаний — для этого чата. Рассуждения и память — для всех чатов с этой моделью.")
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 4)
                .padding(.bottom, 24)
            }
            .scrollBounceBehavior(.basedOnSize)
            .background(Theme.sheet)
            .safeAreaInset(edge: .top, spacing: 0) { header }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(isPresented: $knowledge) {
                KnowledgeChoice()
            }
        }
        .accessibilityIdentifier("tools.sheet")
        .presentationDetents(detents)
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.sheet)
        .presentationCornerRadius(28)
        .settingsNotice()
    }

    private var header: some View {
        ZStack {
            Text("Добавление в чат")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.ink)
            HStack {
                CircleIconButton(symbol: "xmark", label: "Закрыть") { dismiss() }
                Spacer()
                Button("Фото") { pick(.photo) }
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                    .frame(minWidth: 44, minHeight: 44)
                    .disabled(PhoneModelID.isPhone(model.activeModelID))
                    .accessibilityIdentifier("tools.photo")
            }
        }
        .padding(.leading, 15)
        .padding(.trailing, 18)
        .padding(.top, 14)
        .padding(.bottom, 8)
        .background(Theme.sheet)
    }

    private func pick(_ source: Source) {
        Haptics.tap()
        onPick(source)
        dismiss()
    }

    /// «Веб-поиск» — значение справа, выбор из меню.
    private func searchRow(_ id: String) -> some View {
        let title = ChatParameters.usesGoogleSearch(id) ? "Google Search" : "Веб-поиск"
        let current = ChatParameters.searchModes.first { $0.value == model.activeSearchMode }?.label ?? "Авто"
        return Menu {
            Picker(title, selection: Binding(get: { model.activeSearchMode }, set: { value in
                Haptics.tap()
                Task { await model.setSearchMode(value) }
            })) {
                ForEach(ChatParameters.searchModes) { choice in
                    Text(choice.label).tag(choice.value)
                }
            }
        } label: {
            ToolRowLabel(title: title, symbol: "globe", value: current, chevron: "chevron.up.chevron.down")
        }
        .accessibilityIdentifier("tools.search")
    }

    private var knowledgeRow: some View {
        let selection = model.activeKnowledge
        let value = selection.enabled && !selection.collections.isEmpty
            ? Plural.knowledge(selection.collections.count, .library) : "Выкл"
        return Button {
            Haptics.tap()
            knowledge = true
        } label: {
            ToolRowLabel(title: "Базы знаний", symbol: "books.vertical", value: value)
        }
        .buttonStyle(RowPressStyle())
        .accessibilityIdentifier("tools.knowledge")
    }
}

/// Строка меню: значок, название, справа значение и стрелка.
struct ToolRowLabel: View {
    let title: String
    let symbol: String
    var value: String?
    var chevron: String? = "chevron.right"
    var enabled = true

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .light))
                .foregroundStyle(enabled ? Theme.ink.opacity(0.9) : Theme.subtle)
                .frame(width: 22)
            Text(title)
                .font(.system(size: 16))
                .foregroundStyle(enabled ? Theme.ink : Theme.subtle)
                .lineLimit(1)
            Spacer(minLength: 8)
            if let value {
                Text(value)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.subtle)
                    .lineLimit(1)
            }
            if let chevron {
                Image(systemName: chevron)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.subtle)
            }
        }
        .padding(.leading, 17)
        .padding(.trailing, 16)
        .frame(minHeight: 46)
        .contentShape(Rectangle())
    }
}

/// Строка-действие без значения справа.
struct ToolRow: View {
    let title: String
    let symbol: String
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ToolRowLabel(title: title, symbol: symbol, chevron: nil, enabled: enabled)
        }
        .buttonStyle(RowPressStyle())
        .disabled(!enabled)
    }
}

/// Плитка «Камера» и лента последних снимков из «Фото»: нажатие сразу прикрепляет снимок
/// (отмечается галочкой). Без доступа к «Фото» — плитка, открывающая системный выбор.
private struct PhotoStrip: View {
    @Environment(AppModel.self) private var model
    let enabled: Bool
    let onCamera: () -> Void
    let onLibrary: () -> Void
    @State private var assets: [PHAsset] = []
    @State private var thumbs: [String: UIImage] = [:]
    @State private var added: Set<String> = []
    @State private var allowed = true
    @State private var loading: String?

    private static let side: CGFloat = 90
    private static let manager = PHCachingImageManager()

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if UIImagePickerController.isSourceTypeAvailable(.camera) || model.preview != nil {
                    tile("Камера", symbol: "camera", action: onCamera)
                        .accessibilityIdentifier("tools.camera")
                }
                if !allowed || (assets.isEmpty && thumbs.isEmpty) {
                    tile("Фото", symbol: "photo.on.rectangle", action: onLibrary)
                }
                if model.preview != nil {
                    ForEach(Array(thumbs.keys.sorted()), id: \.self) { key in
                        thumb(key: key, image: thumbs[key]) {}
                    }
                } else {
                    ForEach(assets, id: \.localIdentifier) { asset in
                        thumb(key: asset.localIdentifier, image: thumbs[asset.localIdentifier]) { add(asset) }
                            .task { load(asset) }
                    }
                }
            }
            .padding(.horizontal, 18)
        }
        .padding(.horizontal, -18)
        .modifier(DrawerFreeZone())
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
        .task { await fetch() }
        .accessibilityIdentifier("tools.strip")
    }

    private func tile(_ title: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 17, weight: .light))
                Text(title)
                    .font(.system(size: 14))
            }
            .foregroundStyle(Theme.ink)
            .frame(width: Self.side, height: Self.side)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
    }

    private func thumb(key: String, image: UIImage?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                Group {
                    if let image {
                        Image(uiImage: image).resizable().scaledToFill()
                    } else {
                        Theme.card
                    }
                }
                .frame(width: Self.side, height: Self.side)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                if added.contains(key) || loading == key {
                    Group {
                        if loading == key {
                            ProgressView().controlSize(.small).tint(.white)
                        } else {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 22))
                                .foregroundStyle(.white, Theme.accent)
                        }
                    }
                    .padding(8)
                }
            }
        }
        .buttonStyle(PressScaleStyle())
        .disabled(added.contains(key) || loading != nil)
        .accessibilityLabel("Прикрепить фото")
    }

    private func fetch() async {
        if model.preview != nil {
            thumbs = PreviewScene.stripThumbs
            return
        }
        var status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        if status == .notDetermined {
            status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        }
        allowed = status == .authorized || status == .limited
        guard allowed else { return }
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        options.fetchLimit = 24
        let result = PHAsset.fetchAssets(with: .image, options: options)
        var list: [PHAsset] = []
        result.enumerateObjects { asset, _, _ in list.append(asset) }
        assets = list
    }

    private func load(_ asset: PHAsset) {
        guard thumbs[asset.localIdentifier] == nil else { return }
        let options = PHImageRequestOptions()
        options.deliveryMode = .opportunistic
        options.isNetworkAccessAllowed = true
        let size = CGSize(width: Self.side * 3, height: Self.side * 3)
        Self.manager.requestImage(for: asset, targetSize: size, contentMode: .aspectFill, options: options) { image, _ in
            guard let image else { return }
            DispatchQueue.main.async { thumbs[asset.localIdentifier] = image }
        }
    }

    private func add(_ asset: PHAsset) {
        Haptics.tap()
        let key = asset.localIdentifier
        loading = key
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = true
        options.deliveryMode = .highQualityFormat
        PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, _, _, _ in
            DispatchQueue.main.async {
                guard let data else {
                    loading = nil
                    model.sendError = "Не удалось загрузить фото из галереи."
                    return
                }
                Task {
                    await model.addPhotoData(data)
                    loading = nil
                    added.insert(key)
                }
            }
        }
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
        .background(Theme.sheet)
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
