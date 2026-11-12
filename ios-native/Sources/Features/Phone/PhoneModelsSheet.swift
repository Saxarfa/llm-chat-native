import SwiftUI
import UniformTypeIdentifiers

/// «Модели на телефоне»: скачанные модели, загрузки, поиск GGUF на Hugging Face, свой файл, токен.
struct PhoneModelsSheet: View {
    @Environment(AppModel.self) private var model
    /// Выбрать модель для чата и закрыть окна выбора.
    let onChoose: (String) -> Void

    @State private var path: [String] = []
    @State private var importing = false
    @State private var editingToken = false
    @State private var tokenDraft = ""
    @State private var removing: PhoneModel?
    @State private var configuring: PhoneModel?

    private var phone: PhoneModels { model.phone }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "Модели на телефоне",
                                subtitle: "Доступно памяти \(PhoneMemory.gigabytes(phone.availableMemory)) · на диске \(PhoneMemory.gigabytes(phone.diskUsed))")
                        .padding(.horizontal, -20)
                    installedSection
                    downloadsSection
                    searchSection
                    toolsSection
                    SettingsNote(text: "Ответ считает сам телефон — llama.cpp на Metal. Переписка сохраняется на ПК, как у других чатов. Быстрее всего работают модели до 4 млрд параметров в квантовании Q4_K_M.")
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.sheet)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { repo in
                PhoneRepoView(repo: repo)
            }
        }
        .accessibilityIdentifier("phone.sheet")
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.sheet)
        .presentationCornerRadius(28)
        .task {
            if phone.results.isEmpty { await phone.search() }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [UTType(filenameExtension: "gguf") ?? .data, .data]) { result in
            if case .success(let url) = result { phone.importFile(url) }
        }
        .alert("Токен Hugging Face", isPresented: $editingToken) {
            SecureField("hf_…", text: $tokenDraft)
            Button("Сохранить") { phone.setToken(tokenDraft) }
            if phone.hasToken {
                Button("Удалить токен", role: .destructive) { phone.setToken(nil) }
            }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text("Нужен только для закрытых моделей (Llama, Gemma и других с условиями). Хранится в связке ключей телефона и уходит только на huggingface.co.")
        }
        .confirmationDialog("Удалить модель с телефона?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                            titleVisibility: .visible, presenting: removing) { item in
            Button("Удалить \(PhoneMemory.gigabytes(item.size))", role: .destructive) {
                Task { await phone.delete(item) }
            }
            Button("Отмена", role: .cancel) {}
        } message: { item in
            Text("«\(item.name)» освободит место. Чаты с ней на ПК останутся.")
        }
        .sheet(item: $configuring) { item in
            ModelSettingsSheet(modelID: item.chatID)
                .environment(model)
        }
        .task {
            // В режиме снимков окно настроек открывается само.
            guard model.preview == .phoneSettings, configuring == nil, let first = phone.installed.first else { return }
            try? await Task.sleep(nanoseconds: 700_000_000)
            configuring = first
        }
        .alert("Модели на телефоне", isPresented: Binding(get: { phone.notice != nil }, set: { if !$0 { phone.notice = nil } })) {
            Button("Понятно", role: .cancel) {}
        } message: {
            Text(phone.notice ?? "")
        }
    }

    // MARK: - Установленные

    @ViewBuilder private var installedSection: some View {
        SectionCaption(text: "На телефоне")
        if phone.installed.isEmpty {
            SettingsNote(text: "Пока нет ни одной модели. Найдите GGUF на Hugging Face ниже или добавьте файл из «Файлов».")
        } else {
            SettingsCard {
                ForEach(Array(phone.installed.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { CardDivider() }
                    installedRow(item)
                }
            }
        }
    }

    private func installedRow(_ item: PhoneModel) -> some View {
        let loaded = phone.loadedFile == item.file
        let selected = model.activeModelID == item.chatID
        return HStack(spacing: 12) {
            Button {
                onChoose(item.chatID)
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.name)
                        .font(.system(size: 16, weight: selected ? .semibold : .regular))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(2)
                    HStack(spacing: 6) {
                        Text([item.quant, PhoneMemory.gigabytes(item.size), loaded ? "в памяти" : nil]
                            .compactMap { $0 }.joined(separator: " · "))
                        FitBadge(fit: phone.fit(item.size, context: phone.wantedContext(item.file), file: item.file))
                    }
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.subtle)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Выбрать для чата: \(item.name)")
            .accessibilityIdentifier("phone.installed")
            if selected {
                Image(systemName: "checkmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.ink)
            }
            Button {
                Haptics.tap()
                configuring = item
            } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 40, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Настройки: \(item.name)")
            .accessibilityIdentifier("phone.settings")
            Menu {
                Button("Выбрать для чата", systemImage: "bubble.left") { onChoose(item.chatID) }
                Button("Настройки модели", systemImage: "slider.horizontal.3") { configuring = item }
                if loaded {
                    Button("Выгрузить из памяти", systemImage: "memorychip") { Task { await phone.unload() } }
                        .disabled(phone.generating)
                }
                Button("Удалить", systemImage: "trash", role: .destructive) { removing = item }
                    .disabled(loaded && phone.generating)
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 40, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Действия: \(item.name)")
        }
        .padding(.leading, 16)
        .padding(.trailing, 6)
        .padding(.vertical, 8)
        .frame(minHeight: 56)
        // Заголовок файла нужен для честной оценки памяти под контекст.
        .task { await phone.loadInfo(item.file) }
    }

    // MARK: - Загрузки

    @ViewBuilder private var downloadsSection: some View {
        let items = phone.downloads.values.sorted { $0.file < $1.file }
        if !items.isEmpty {
            SectionCaption(text: "Загрузки")
            SettingsCard {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { CardDivider() }
                    DownloadRow(item: item)
                }
            }
            SettingsNote(text: "Загрузка продолжается, даже если свернуть приложение.")
        }
    }

    // MARK: - Поиск

    @ViewBuilder private var searchSection: some View {
        @Bindable var search = model.phone
        SectionCaption(text: "Найти на Hugging Face")
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Theme.subtle)
            TextField("Название модели, например qwen3 4b", text: $search.query)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .foregroundStyle(Theme.ink)
                .onSubmit { Task { await phone.search() } }
                .accessibilityIdentifier("phone.search")
            if phone.searching {
                ProgressView().controlSize(.small).tint(Theme.muted)
            }
        }
        .font(.system(size: 16))
        .padding(.horizontal, 14)
        .frame(minHeight: 48)
        .background(Theme.fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))

        if let error = phone.searchError {
            SettingsNote(text: error, symbol: "exclamationmark.triangle")
        }
        if !phone.results.isEmpty {
            SettingsCard {
                ForEach(Array(phone.results.prefix(25).enumerated()), id: \.element.id) { index, repo in
                    if index > 0 { CardDivider() }
                    Button {
                        Haptics.tap()
                        path.append(repo.id)
                    } label: {
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(repo.name)
                                    .font(.system(size: 16))
                                    .foregroundStyle(Theme.ink)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                                Text("\(repo.author) · ↓ \(Self.compact(repo.downloads)) · ♥ \(Self.compact(repo.likes))")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.subtle)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 8)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Theme.subtle)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .frame(minHeight: 56)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PressScaleStyle())
                    .accessibilityIdentifier("phone.repo")
                }
            }
        }
    }

    static func compact(_ value: Int) -> String {
        value.formatted(.number.notation(.compactName).locale(Locale(identifier: "ru_RU")))
    }

    // MARK: - Свой файл и токен

    @ViewBuilder private var toolsSection: some View {
        SectionCaption(text: "Ещё")
        SettingsCard {
            Button {
                Haptics.tap()
                importing = true
            } label: {
                HStack {
                    Label("Добавить файл GGUF из «Файлов»", systemImage: "folder")
                        .foregroundStyle(Theme.ink)
                    Spacer()
                }
                .font(.system(size: 16))
                .padding(.horizontal, 16)
                .frame(minHeight: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            CardDivider()
            Button {
                tokenDraft = ""
                editingToken = true
            } label: {
                HStack {
                    Label("Токен Hugging Face", systemImage: "key")
                        .foregroundStyle(Theme.ink)
                    Spacer()
                    Text(phone.hasToken ? "Задан" : "Не задан")
                        .foregroundStyle(Theme.muted)
                }
                .font(.system(size: 16))
                .padding(.horizontal, 16)
                .frame(minHeight: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityIdentifier("phone.token")
        }
    }
}

/// Строка загрузки: ход, отмена или повтор.
private struct DownloadRow: View {
    @Environment(AppModel.self) private var model
    let item: PhoneModels.Download

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(PhoneModelNames.title(item.file))
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                if let quant = PhoneModelNames.quant(item.file) {
                    Text(quant).font(.system(size: 13)).foregroundStyle(Theme.subtle)
                }
                Spacer(minLength: 8)
                Button {
                    model.phone.cancelDownload(item.file)
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Отменить загрузку")
            }
            switch item.state {
            case .preparing:
                ProgressView().progressViewStyle(.linear).tint(Theme.buttonPrimary)
                Text("Готовлю загрузку…").font(.system(size: 13)).foregroundStyle(Theme.subtle)
            case .running:
                ProgressView(value: item.progress).tint(Theme.buttonPrimary)
                // Раз в секунду: если данные перестали приходить, вместо скорости — «нет данных».
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(item.meter.line(received: item.received, total: item.total,
                                         at: context.date.timeIntervalSince1970))
                        .font(.system(size: 13).monospacedDigit())
                        .foregroundStyle(Theme.subtle)
                        .accessibilityIdentifier("phone.download.speed")
                }
            case .failed(let message):
                Text(message)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.danger)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Повторить") {
                    Task { await model.phone.retry(item) }
                }
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .frame(minHeight: 36)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .accessibilityIdentifier("phone.download")
    }
}

/// Хватит ли памяти телефона на модель.
struct FitBadge: View {
    let fit: PhoneMemory.Fit

    var body: some View {
        Text(text)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(color.opacity(0.14), in: Capsule())
    }

    private var text: String {
        switch fit {
        case .fits: return "Влезет"
        case .tight: return "Впритык"
        case .tooBig: return "Может не хватить"
        }
    }

    private var color: Color {
        switch fit {
        case .fits: return Theme.ink
        case .tight: return Theme.muted
        case .tooBig: return Theme.danger
        }
    }
}

/// Файлы GGUF одного репозитория: размер, квантование, хватит ли памяти, «Скачать».
struct PhoneRepoView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let repo: String

    private var phone: PhoneModels { model.phone }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 4) {
                    Button {
                        dismiss()
                    } label: {
                        Label("Назад", systemImage: "chevron.left")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(Theme.ink)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(PressScaleStyle())
                    Spacer()
                }
                .padding(.top, 14)
                VStack(alignment: .leading, spacing: 4) {
                    Text(HFRepo(id: repo).name)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                    Text(HFRepo(id: repo).author)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                }
                if let list = phone.files[repo] {
                    if !list.isEmpty {
                        SettingsCard {
                            ForEach(Array(list.enumerated()), id: \.element.id) { index, file in
                                if index > 0 { CardDivider() }
                                fileRow(file)
                            }
                        }
                    }
                    if let error = phone.filesError[repo] {
                        SettingsNote(text: error, symbol: "exclamationmark.triangle")
                    }
                    SettingsNote(text: "Q4_K_M — хороший баланс качества и размера. Q8_0 и F16 точнее, но в 2–4 раза тяжелее и медленнее.")
                } else if let error = phone.filesError[repo] {
                    SettingsNote(text: error, symbol: "exclamationmark.triangle")
                } else {
                    ProgressView().tint(Theme.muted).frame(maxWidth: .infinity).padding(.top, 30)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 32)
        }
        .background(Theme.sheet)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            if phone.files[repo] == nil { await phone.loadFiles(repo) }
        }
    }

    private func fileRow(_ file: HFFile) -> some View {
        let installed = phone.installed.contains { $0.file == file.file }
        let download = phone.downloads[file.file]
        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(file.quant ?? file.file)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Theme.ink)
                HStack(spacing: 6) {
                    Text(PhoneMemory.gigabytes(file.size))
                    FitBadge(fit: phone.fit(file.size))
                }
                .font(.system(size: 13))
                .foregroundStyle(Theme.subtle)
                if file.quant != nil {
                    Text(file.path)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.subtle)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }
            Spacer(minLength: 8)
            if installed {
                Label("На телефоне", systemImage: "checkmark")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.muted)
            } else if let download {
                if case .failed = download.state {
                    downloadButton(file, title: "Повторить")
                } else {
                    Text("\(Int(download.progress * 100))%")
                        .font(.system(size: 14).monospacedDigit())
                        .foregroundStyle(Theme.muted)
                }
            } else {
                downloadButton(file, title: "Скачать")
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 60)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("phone.file")
    }

    private func downloadButton(_ file: HFFile, title: String) -> some View {
        Button {
            Task { await phone.download(repo: repo, file: file) }
        } label: {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.buttonPrimaryText)
                .padding(.horizontal, 14)
                .frame(minHeight: 36)
                .background(Theme.buttonPrimary, in: Capsule())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("\(title) \(file.quant ?? file.file)")
    }
}
