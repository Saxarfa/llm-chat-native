import SwiftUI
import UniformTypeIdentifiers

/// «Базы знаний» — документы, по которым модель ищет ответ (`knowledge.py`, `KnowledgeSettings.tsx`).
/// Список баз и одна открытая база показываются в одном окне.
struct KnowledgeSheet: View {
    @Environment(AppModel.self) private var model
    @State private var opened: KnowledgeLibrary?
    @State private var loaded = false
    @State private var failed = false
    @State private var creating = false
    @State private var newName = ""
    @State private var notice: String?

    var body: some View {
        Group {
            if let library = opened {
                LibraryView(library: library, onBack: {
                    withAnimation(Theme.spring) { opened = nil }
                }, onRemoved: {
                    opened = nil
                })
                .transition(.move(edge: .trailing).combined(with: .opacity))
            } else {
                list
                    .transition(.move(edge: .leading).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.surface)
        .presentationCornerRadius(28)
        .preferredColorScheme(.dark)
        .task(id: model.knowledgeRevision) {
            failed = !(await model.loadLibraries())
            loaded = true
            if let current = opened {
                opened = model.knowledgeLibraries.first { $0.id == current.id }
            }
            if model.preview == .knowledge, opened == nil, loaded {
                opened = model.knowledgeLibraries.first
            }
        }
        .alert("Новая база", isPresented: $creating) {
            TextField("Название", text: $newName)
            Button("Создать") { Task { await create() } }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text("Например: «Документы по работе» или «Лор мира».")
        }
        .alert("Не получилось", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("Понятно", role: .cancel) { notice = nil }
        } message: {
            Text(notice ?? "")
        }
    }

    private var list: some View {
        let libraries = model.knowledgeLibraries
        return VStack(spacing: 0) {
            SheetHeader(title: "Базы знаний", subtitle: loaded ? libraryCount(libraries.count) : nil, busy: !loaded)
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsNote(text: "Чтобы модель искала в базе, включите её в «Параметрах чата → Базы знаний».")
                    if failed && libraries.isEmpty {
                        SettingsNote(text: "Не удалось загрузить базы знаний.", symbol: "exclamationmark.circle")
                    }
                    if !libraries.isEmpty {
                        SettingsCard {
                            ForEach(Array(libraries.enumerated()), id: \.element.id) { index, library in
                                if index > 0 { CardDivider() }
                                Button {
                                    Haptics.tap()
                                    withAnimation(Theme.spring) { opened = library }
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: "books.vertical")
                                            .font(.system(size: 15))
                                            .foregroundStyle(Theme.muted)
                                            .frame(width: 22)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(library.name)
                                                .font(.system(size: 16))
                                                .foregroundStyle(Theme.ink)
                                                .lineLimit(1)
                                            Text(Plural.knowledge(library.documents, .document))
                                                .font(.system(size: 13))
                                                .foregroundStyle(Theme.subtle)
                                        }
                                        Spacer(minLength: 8)
                                        Image(systemName: "chevron.right")
                                            .font(.system(size: 13, weight: .semibold))
                                            .foregroundStyle(Theme.subtle)
                                    }
                                    .padding(.horizontal, 16)
                                    .frame(minHeight: 60)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(RowPressStyle())
                            }
                        }
                    } else if loaded && !failed {
                        SettingsNote(text: "Баз пока нет. Создайте базу и добавьте в неё документы или заметки.")
                    }
                    WideButton(title: "Новая база", symbol: "plus") {
                        newName = ""
                        creating = true
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
        }
    }

    private func libraryCount(_ count: Int) -> String {
        let tail = count % 100
        let form: String
        if (11...14).contains(tail) {
            form = "баз"
        } else if count % 10 == 1 {
            form = "база"
        } else if (2...4).contains(count % 10) {
            form = "базы"
        } else {
            form = "баз"
        }
        return "\(count) \(form)"
    }

    private func create() async {
        let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        do {
            try await model.createLibrary(String(name.prefix(100)))
            Haptics.success()
        } catch {
            Haptics.error()
            notice = (error as? APIError)?.message ?? "Не удалось создать базу."
        }
    }
}

/// Одна база: документы, загрузка файла, заметка.
private struct LibraryView: View {
    @Environment(AppModel.self) private var model
    let library: KnowledgeLibrary
    let onBack: () -> Void
    let onRemoved: () -> Void

    @State private var documents: [KnowledgeDocument]?
    @State private var busy = false
    @State private var notice: String?
    @State private var importing = false
    @State private var writingNote = false
    @State private var renaming = false
    @State private var newName = ""
    @State private var confirmDelete = false
    @State private var deleting: KnowledgeDocument?

    private static let fileTypes: [UTType] = {
        var types: [UTType] = [.pdf, .plainText]
        for kind in ["docx", "md", "markdown"] {
            if let type = UTType(filenameExtension: kind) { types.append(type) }
        }
        return types
    }()

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Все базы")
                VStack(alignment: .leading, spacing: 2) {
                    Text(library.name)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    Text(Plural.knowledge(documents?.count ?? library.documents, .document))
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                }
                Spacer()
                if busy {
                    ProgressView().controlSize(.small).tint(Theme.muted)
                }
                Menu {
                    Button {
                        newName = library.name
                        renaming = true
                    } label: {
                        Label("Переименовать", systemImage: "pencil")
                    }
                    Button(role: .destructive) {
                        confirmDelete = true
                    } label: {
                        Label("Удалить базу", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 40, height: 40)
                        .background(Theme.fill, in: Circle())
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Действия с базой")
            }
            .padding(.leading, 8)
            .padding(.trailing, 14)
            .padding(.top, 20)
            .padding(.bottom, 10)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 10) {
                        WideButton(title: "Файл", symbol: "doc.badge.plus") { importing = true }
                        WideButton(title: "Заметка", symbol: "square.and.pencil") { writingNote = true }
                    }
                    .disabled(busy)
                    SettingsNote(text: "PDF, DOCX, TXT или Markdown до 20 МБ. Документ обрабатывается на компьютере — это может занять несколько минут.")

                    if let documents {
                        if documents.isEmpty {
                            SettingsNote(text: "В базе пока нет документов.")
                        } else {
                            SettingsCard {
                                ForEach(Array(documents.enumerated()), id: \.element.id) { index, document in
                                    if index > 0 { CardDivider() }
                                    row(document)
                                }
                            }
                        }
                    } else {
                        ProgressView()
                            .tint(Theme.muted)
                            .frame(maxWidth: .infinity, minHeight: 100)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
        }
        .task(id: "\(library.id)-\(model.knowledgeRevision)") {
            await load()
            // Пока документы обрабатываются, список обновляется сам.
            while !Task.isCancelled, documents?.contains(where: \.working) == true {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                await load()
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: Self.fileTypes, allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            Task { await upload(urls) }
        }
        .sheet(isPresented: $writingNote) {
            NoteEditor { title, text in
                await perform { try await model.addNote(title: title, text: text, to: library) }
            }
        }
        .alert("Переименовать базу", isPresented: $renaming) {
            TextField("Название", text: $newName)
            Button("Сохранить") {
                let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty, name != library.name else { return }
                Task { await perform { try await model.renameLibrary(library, to: String(name.prefix(100))) } }
            }
            Button("Отмена", role: .cancel) {}
        }
        .confirmationDialog("Удалить базу «\(library.name)»?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) {
                Task {
                    if await perform({ try await model.deleteLibrary(library) }) { onRemoved() }
                }
            }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text("Чаты перестанут искать в ней. Вернуть базу можно на сайте.")
        }
        .confirmationDialog("Удалить документ?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible) {
            Button("Удалить", role: .destructive) {
                if let document = deleting {
                    Task { await perform { try await model.deleteDocument(document) } }
                }
                deleting = nil
            }
            Button("Отмена", role: .cancel) { deleting = nil }
        } message: {
            Text(deleting?.title ?? "")
        }
        .alert("Не получилось", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("Понятно", role: .cancel) { notice = nil }
        } message: {
            Text(notice ?? "")
        }
    }

    private func row(_ document: KnowledgeDocument) -> some View {
        HStack(spacing: 4) {
            Image(systemName: document.status == "error" ? "exclamationmark.triangle" : "doc.text")
                .font(.system(size: 15))
                .foregroundStyle(document.status == "error" ? Theme.danger : Theme.muted)
                .frame(width: 22)
                .padding(.trailing, 8)
            VStack(alignment: .leading, spacing: 3) {
                Text(document.title)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(2)
                HStack(spacing: 6) {
                    if document.working {
                        ProgressView().controlSize(.mini).tint(Theme.subtle)
                    }
                    Text(document.statusText)
                        .font(.system(size: 13))
                        .foregroundStyle(document.status == "error" ? Theme.danger : Theme.subtle)
                        .lineLimit(2)
                }
            }
            .padding(.vertical, 12)
            Spacer(minLength: 4)
            Menu {
                if document.status == "error" || document.status == "interrupted" {
                    Button {
                        Task { await perform { try await model.retryDocument(document) } }
                    } label: {
                        Label("Обработать заново", systemImage: "arrow.clockwise")
                    }
                }
                Button(role: .destructive) {
                    deleting = document
                } label: {
                    Label("Удалить", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 44, height: 48)
                    .contentShape(Rectangle())
            }
            .disabled(busy)
            .accessibilityLabel("Действия с документом")
        }
        .padding(.leading, 16)
        .padding(.trailing, 4)
    }

    private func load() async {
        do {
            documents = try await model.documents(in: library)
        } catch is CancellationError {
        } catch {
            if documents == nil { documents = [] }
            notice = (error as? APIError)?.message ?? "Не удалось загрузить документы."
        }
    }

    @discardableResult
    private func perform(_ work: () async throws -> Void) async -> Bool {
        busy = true
        defer { busy = false }
        do {
            try await work()
            Haptics.success()
            await load()
            return true
        } catch {
            Haptics.error()
            notice = (error as? APIError)?.message ?? "Не удалось выполнить действие."
            return false
        }
    }

    private func upload(_ urls: [URL]) async {
        busy = true
        defer { busy = false }
        var duplicates = 0
        for url in urls {
            do {
                if try await model.uploadDocument(url, to: library) { duplicates += 1 }
            } catch {
                Haptics.error()
                notice = "\(url.lastPathComponent): " + ((error as? APIError)?.message ?? "не удалось загрузить.")
                break
            }
        }
        if notice == nil {
            Haptics.success()
            if duplicates > 0 { notice = duplicates == urls.count ? "Этот файл уже есть в базе." : "Часть файлов уже была в базе." }
        }
        await load()
    }
}

/// Новая заметка в базе знаний: название и текст.
private struct NoteEditor: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (String, String) async -> Bool
    @State private var title = ""
    @State private var text = ""
    @State private var saving = false

    private var canSave: Bool {
        !saving && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Button("Отмена") { dismiss() }
                    .foregroundStyle(Theme.muted)
                Spacer()
                Text("Заметка")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                Spacer()
                Button {
                    Task {
                        saving = true
                        let done = await onSave(title.trimmingCharacters(in: .whitespacesAndNewlines),
                                                text.trimmingCharacters(in: .whitespacesAndNewlines))
                        saving = false
                        if done { dismiss() }
                    }
                } label: {
                    if saving {
                        ProgressView().tint(Theme.muted)
                    } else {
                        Text("Сохранить").fontWeight(.semibold)
                    }
                }
                .foregroundStyle(canSave ? Theme.ink : Theme.subtle)
                .disabled(!canSave)
            }
            .font(.system(size: 16))
            .frame(minHeight: 44)
            .padding(.top, 14)

            TextField("Название", text: $title)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 14)
                .frame(minHeight: 50)
                .background(Theme.fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text("Текст заметки. Поддерживается Markdown.")
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.subtle)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 14)
                }
                TextEditor(text: $text)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 6)
            }
            .frame(maxHeight: .infinity)
            .background(Theme.fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
        .presentationDetents([.large])
        .presentationBackground(Theme.surface)
        .presentationCornerRadius(28)
        .preferredColorScheme(.dark)
    }
}

/// Широкая кнопка-действие в окнах настроек.
struct WideButton: View {
    let title: String
    let symbol: String
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            Label(title, systemImage: symbol)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Theme.ink)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(Theme.fill, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
    }
}
