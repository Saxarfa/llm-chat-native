import Photos
import SwiftUI

/// Меню «+» у поля ввода, как «Добавление в сессию» в приложении Claude: лента последних фото,
/// карточка «Камера» и «Добавить файлы», затем поиск, базы знаний и переключатели ответа.
/// Поиск и базы знаний — для этой сессии, рассуждения и память — для всех сессий с моделью.
struct ComposerToolsSheet: View {
    enum Source {
        case camera, photo, file
    }

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let onPick: (Source) -> Void
    @State private var knowledge = false
    /// Отмеченные в ленте снимки, по порядку нажатия; в капсулу — по «Добавить».
    @State private var chosen: [PHAsset] = []

    var body: some View {
        let id = model.activeModelID
        let onPhone = PhoneModelID.isPhone(id)
        // Модель телефона видит картинки, если рядом с ней скачан проектор зрения (mmproj).
        let seesImages = onPhone && model.phone.visionFile(for: PhoneModelID.file(of: id)) != nil
        let nano = ChatParameters.isNano(id)
        let detents: Set<PresentationDetent> = onPhone ? [.height(420)] : nano ? [.height(330)] : [.fraction(0.72), .large]

        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    PhotoStrip(enabled: !onPhone || seesImages, chosen: $chosen,
                               room: max(0, AttachmentPrep.limit - model.draftAttachments.count),
                               onLibrary: { pick(.photo) })
                    // Первая группа, как у Claude: «Камера» и «Добавить файлы» одной карточкой.
                    SettingsCard {
                        if UIImagePickerController.isSourceTypeAvailable(.camera) || model.preview != nil {
                            ToolRow(title: "Камера", symbol: "camera", enabled: !onPhone || seesImages) { pick(.camera) }
                                .accessibilityIdentifier("tools.camera")
                            CardDivider(inset: RowMetrics.textInset)
                        }
                        ToolRow(title: "Добавить файлы", symbol: "doc.badge.plus", enabled: !onPhone) { pick(.file) }
                            .accessibilityIdentifier("tools.file")
                    }
                    if onPhone {
                        PhoneReasoning(modelID: id)
                    } else if !nano {
                        SettingsCard {
                            searchRow(id)
                            CardDivider(inset: RowMetrics.textInset)
                            knowledgeRow
                        }
                        SettingsCard {
                            if let reasoning = ChatParameters.reasoning(id) {
                                ReasoningRow(modelID: id, reasoning: reasoning)
                                CardDivider(inset: RowMetrics.textInset)
                            }
                            ToggleRow(title: "Память", symbol: "brain",
                                      isOn: model.memoryEnabled(id)) { value in
                                Task { await model.setModelValue("memoryEnabled", value, model: id) }
                            }
                        }
                    }
                }
                .padding(.horizontal, RowMetrics.cardInset)
                .padding(.top, 4)
                .padding(.bottom, 24)
            }
            .scrollBounceBehavior(.basedOnSize)
            .background(Theme.sheet)
            .safeAreaInset(edge: .top, spacing: 0) { header }
            .safeAreaInset(edge: .bottom, spacing: 0) { confirmBar }
            .animation(.spring(response: 0.35, dampingFraction: 0.85), value: chosen.isEmpty)
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
        SheetBar(title: "Добавление в сессию", symbol: "xmark", label: "Закрыть", action: { dismiss() }) {
            Button("Фото") { pick(.photo) }
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Theme.ink)
                .frame(minWidth: 44, minHeight: 44)
                .disabled(PhoneModelID.isPhone(model.activeModelID)
                          && model.phone.visionFile(for: PhoneModelID.file(of: model.activeModelID)) == nil)
                .accessibilityIdentifier("tools.photo")
        }
        .background(Theme.sheet)
    }

    /// Подтверждение снизу окна, пока в ленте отмечены снимки: «Добавить N фото».
    @ViewBuilder
    private var confirmBar: some View {
        if !chosen.isEmpty {
            HStack(spacing: 12) {
                Button {
                    Haptics.tap()
                    chosen = []
                } label: {
                    Text("Сбросить")
                        .font(.system(size: 17))
                        .foregroundStyle(Theme.muted)
                        .frame(minWidth: 44, minHeight: 50)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle())
                Button(action: confirmPhotos) {
                    Text("Добавить \(chosen.count) фото")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.buttonPrimaryText)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(Theme.buttonPrimary, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityIdentifier("tools.addPhotos")
            }
            .padding(.horizontal, RowMetrics.cardInset + 4)
            .padding(.top, 10)
            .padding(.bottom, 8)
            .background(Theme.sheet)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    /// «Добавить»: отмеченные снимки уходят в капсулу, меню закрывается.
    private func confirmPhotos() {
        let assets = chosen
        Haptics.tap()
        Task { await model.addLibraryPhotos(assets) }
        dismiss()
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
    /// Высота строки: в меню «+» у Claude ~54 pt, в настройках ~52.
    var height: CGFloat = RowMetrics.toolHeight

    var body: some View {
        HStack(spacing: RowMetrics.iconGap) {
            RowIcon(symbol: symbol, enabled: enabled)
            Text(title)
                .font(.system(size: RowMetrics.text))
                .foregroundStyle(enabled ? Theme.ink : Theme.subtle)
                .lineLimit(1)
            Spacer(minLength: 8)
            HStack(spacing: 8) {
                if let value {
                    Text(value)
                        .font(.system(size: RowMetrics.text))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                if let chevron {
                    Image(systemName: chevron)
                        .font(.system(size: chevron == "chevron.right" ? RowMetrics.chevron : 12, weight: .semibold))
                        .foregroundStyle(Theme.subtle)
                }
            }
        }
        .padding(.leading, RowMetrics.leading)
        .padding(.trailing, RowMetrics.trailing)
        .frame(minHeight: height)
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

/// Лента последних снимков из «Фото»: нажатие отмечает снимок номером по порядку (повторное —
/// снимает отметку), в капсулу отмеченные уходят по «Добавить N фото» внизу окна
/// (просьба пользователя 18.11.2026: раньше снимок прикреплялся сразу). Не больше `room` —
/// сколько ещё вложений помещается в сообщение. Без доступа к «Фото» — плитка системного выбора.
private struct PhotoStrip: View {
    @Environment(AppModel.self) private var model
    let enabled: Bool
    @Binding var chosen: [PHAsset]
    let room: Int
    let onLibrary: () -> Void
    @State private var assets: [PHAsset] = []
    @State private var thumbs: [String: UIImage] = [:]
    @State private var allowed = true

    /// Плитки ленты, как у Claude: ~102×105 pt почти без зазора (3 pt), скруглены только края ленты.
    private static let width: CGFloat = 102
    private static let height: CGFloat = 105
    private static let manager = PHCachingImageManager()

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 3) {
                if !allowed || (assets.isEmpty && thumbs.isEmpty) {
                    tile("Фото", symbol: "photo.on.rectangle", action: onLibrary)
                }
                if model.preview != nil {
                    ForEach(Array(thumbs.keys.sorted()), id: \.self) { key in
                        thumb(image: thumbs[key], number: nil, full: false) {}
                    }
                } else {
                    ForEach(assets, id: \.localIdentifier) { asset in
                        let number = chosen.firstIndex { $0.localIdentifier == asset.localIdentifier }.map { $0 + 1 }
                        thumb(image: thumbs[asset.localIdentifier], number: number, full: chosen.count >= room) { toggle(asset) }
                            .task { load(asset) }
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(.horizontal, RowMetrics.cardInset)
        }
        .padding(.horizontal, -RowMetrics.cardInset)
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
            .frame(width: Self.width, height: Self.height)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
    }

    /// Плитка снимка: справа сверху пустой кружок, у отмеченной — номер на синем; отмеченная чуть
    /// притемнена. `full` — места под вложения больше нет: неотмеченные не нажимаются.
    private func thumb(image: UIImage?, number: Int?, full: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                Group {
                    if let image {
                        Image(uiImage: image).resizable().scaledToFill()
                    } else {
                        Theme.card
                    }
                }
                .frame(width: Self.width, height: Self.height)
                .overlay(Color.black.opacity(number == nil ? 0 : 0.22))
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                ZStack {
                    if let number {
                        Circle().fill(Theme.accent)
                        Text("\(number)")
                            .font(.system(size: 13, weight: .bold).monospacedDigit())
                            .foregroundStyle(.white)
                            .transition(.scale.combined(with: .opacity))
                    } else {
                        Circle().fill(Color.black.opacity(0.18))
                    }
                    Circle().strokeBorder(.white, lineWidth: 1.5)
                }
                .frame(width: 24, height: 24)
                .padding(7)
            }
            .animation(.spring(response: 0.28, dampingFraction: 0.7), value: number)
        }
        .buttonStyle(PressScaleStyle())
        .disabled(number == nil && full)
        .opacity(number == nil && full ? 0.5 : 1)
        .accessibilityLabel(number == nil ? "Отметить фото" : "Фото \(number ?? 0), снять отметку")
    }

    /// Отметить снимок или снять отметку (номера остальных сдвигаются).
    private func toggle(_ asset: PHAsset) {
        Haptics.selection()
        if let index = chosen.firstIndex(where: { $0.localIdentifier == asset.localIdentifier }) {
            chosen.remove(at: index)
        } else if chosen.count < room {
            chosen.append(asset)
        }
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
        let size = CGSize(width: Self.width * 3, height: Self.height * 3)
        Self.manager.requestImage(for: asset, targetSize: size, contentMode: .aspectFill, options: options) { image, _ in
            guard let image else { return }
            DispatchQueue.main.async { thumbs[asset.localIdentifier] = image }
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
            ToggleRow(title: "Рассуждения", symbol: "lightbulb",
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
                ToggleRow(title: "Рассуждения", symbol: "lightbulb",
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
            SheetBar(title: "Базы знаний", symbol: "chevron.left", label: "Назад", action: { dismiss() })
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    KnowledgePicker()
                }
                .padding(.horizontal, RowMetrics.cardInset)
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
            ToggleRow(title: "Использовать базу знаний",
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
                            VStack(alignment: .leading, spacing: 3) {
                                Text(library.name)
                                    .font(.system(size: RowMetrics.text))
                                    .foregroundStyle(Theme.ink)
                                    .lineLimit(1)
                                Text(Plural.knowledge(library.documents, .document))
                                    .font(.system(size: 14))
                                    .foregroundStyle(Theme.subtle)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, RowMetrics.plainLeading)
                        .frame(minHeight: 60)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowPressStyle())
                    .accessibilityAddTraits(chosen ? .isSelected : [])
                }
                CardDivider()
                ToggleRow(title: "Отвечать только по базе",
                          isOn: selection.strict) { value in
                    var next = selection
                    next.strict = value
                    save(next)
                }
            }
        }
        if selection.enabled {
            if loaded && libraries.isEmpty {
                SettingsNote(text: "Баз пока нет.")
            } else if selection.collections.isEmpty {
                SettingsNote(text: "Выберите хотя бы одну базу.", symbol: "exclamationmark.circle")
            }
            if loaded && !missing.isEmpty {
                Button {
                    var next = selection
                    next.collections.removeAll { missing.contains($0) }
                    save(next)
                } label: {
                    SettingsNote(text: "Одна из выбранных баз недоступна. Убрать из выбора",
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
