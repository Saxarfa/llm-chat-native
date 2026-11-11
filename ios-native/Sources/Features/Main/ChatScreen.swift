import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// Экран чата: шапка, лента сообщений (или приветствие нового чата) и поле ввода у клавиатуры.
struct ChatScreen: View {
    @Environment(AppModel.self) private var model
    let onMenu: () -> Void
    @State private var draft = ""
    @State private var showParameters = false

    var body: some View {
        @Bindable var bound = model
        Group {
            if model.activeChatID == nil {
                ScrollView {
                    welcome
                        .padding(.horizontal, 24)
                        .frame(maxWidth: .infinity)
                        .containerRelativeFrame(.vertical, alignment: .center)
                }
                .scrollDismissesKeyboard(.interactively)
                .scrollBounceBehavior(.basedOnSize)
            } else {
                MessageFeed()
                    // Свой экземпляр ленты на каждый чат: позиция прокрутки не переносится.
                    .id(model.activeChatID)
            }
        }
        // Нажатие на пустое место или на текст ленты убирает клавиатуру.
        .contentShape(Rectangle())
        .onTapGesture { Keyboard.hide() }
        .safeAreaInset(edge: .top, spacing: 0) {
            header
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ComposerBar(text: $draft)
        }
        .task(id: model.activeChatID) {
            model.editing = nil
            await model.loadThread()
        }
        .fullScreenCover(item: $bound.viewer) { item in
            ImageViewer(item: item)
        }
        .sheet(isPresented: $showParameters) {
            ChatParametersSheet()
        }
        .onAppear {
            if model.preview == .parameters || model.preview == .nano { showParameters = true }
        }
    }

    private var parametersButton: some View {
        CircleIconButton(symbol: "slider.horizontal.3", label: "Параметры чата") {
            Keyboard.hide()
            Haptics.tap()
            showParameters = true
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            CircleIconButton(symbol: "line.3.horizontal", label: "Меню", action: onMenu)
            if let chat = model.activeChat {
                Text(chat.title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity)
                parametersButton
                CircleIconButton(symbol: "square.and.pencil", label: "Новый чат") {
                    model.activeChatID = nil
                }
            } else {
                Spacer()
                parametersButton
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 52)
        .background(Theme.canvas)
    }

    private var welcome: some View {
        VStack(spacing: 14) {
            Wordmark(size: 34)
            Text(greeting)
                .font(Theme.display(24))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
    }

    private var greeting: String {
        guard let name = model.user?.shownName, !name.isEmpty else { return "Чем займёмся?" }
        return "Чем займёмся, \(name)?"
    }
}

/// Поле ввода. Прикреплено к нижней безопасной зоне, поэтому поднимается вместе с клавиатурой.
/// Слева — вложения и выбор модели, справа — отправка; пока модель отвечает, вместо отправки «Стоп».
struct ComposerBar: View {
    @Environment(AppModel.self) private var model
    @Binding var text: String
    @FocusState private var focused: Bool
    @State private var showModels = false
    @State private var showPhotos = false
    @State private var showCamera = false
    @State private var showFiles = false
    @State private var picked: [PhotosPickerItem] = []
    /// Черновик, отложенный на время правки старого сообщения.
    @State private var parkedDraft = ""

    private static let fileTypes: [UTType] = {
        var types: [UTType] = [.pdf, .png, .jpeg, .webP, .heic]
        for kind in ["md", "markdown"] {
            if let type = UTType(filenameExtension: kind) { types.append(type) }
        }
        return types
    }()

    private var hasText: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var canSend: Bool {
        if model.attachmentsBusy { return false }
        if let editing = model.editing { return hasText || !editing.attachments.isEmpty }
        return hasText || !model.draftAttachments.isEmpty
    }

    var body: some View {
        let live = model.activeLive
        VStack(spacing: 8) {
            if let error = model.sendError {
                errorBanner(error)
            }

            VStack(alignment: .leading, spacing: 10) {
                if model.editing != nil {
                    editBanner
                } else if !model.draftAttachments.isEmpty || model.attachmentsBusy {
                    DraftAttachmentStrip()
                }

                TextField("", text: $text, prompt: Text("Сообщение").foregroundStyle(Theme.subtle), axis: .vertical)
                    .lineLimit(1...8)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.ink)
                    .focused($focused)
                    .padding(.horizontal, 6)
                    .padding(.top, 4)

                HStack(spacing: 6) {
                    if model.editing == nil {
                        attachButton
                    }
                    modelButton
                    Spacer(minLength: 8)
                    if live != nil {
                        actionButton(symbol: "stop.fill", label: "Остановить ответ", active: live?.stopping != true) {
                            Task { await model.stop() }
                        }
                    } else {
                        actionButton(symbol: model.editing == nil ? "arrow.up" : "checkmark",
                                     label: model.editing == nil ? "Отправить" : "Сохранить правку",
                                     active: canSend, action: submit)
                    }
                }
            }
            .padding(10)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Theme.line))
            .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .onTapGesture { focused = true }
        }
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .padding(.bottom, 8)
        .background(Theme.canvas)
        .animation(.easeOut(duration: 0.18), value: model.sendError)
        .animation(.easeOut(duration: 0.18), value: model.draftAttachments)
        .sheet(isPresented: $showModels) {
            ModelPickerSheet()
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                showCamera = false
                if let image { Task { await model.addCamera(image) } }
            }
            .ignoresSafeArea()
        }
        .onAppear {
            if model.preview == .models { showModels = true }
        }
        .onChange(of: model.editing) { _, message in
            if let message {
                parkedDraft = text
                text = message.text
                focused = true
            } else {
                text = parkedDraft
                parkedDraft = ""
            }
        }
        .onChange(of: picked) { _, items in
            guard !items.isEmpty else { return }
            picked = []
            Task { await model.addPhotos(items) }
        }
    }

    private func errorBanner(_ error: String) -> some View {
        Button {
            model.sendError = nil
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "exclamationmark.circle")
                Text(error)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.muted)
            }
            .font(.system(size: 15))
            .foregroundStyle(Theme.danger)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Скрыть сообщение")
        .transition(.opacity)
    }

    private var editBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "pencil")
                .font(.system(size: 14, weight: .medium))
            Text("Правка сообщения")
                .font(.system(size: 14, weight: .medium))
            Spacer(minLength: 8)
            Button {
                model.editing = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .frame(width: 44, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Отменить правку")
        }
        .foregroundStyle(Theme.muted)
        .padding(.leading, 6)
    }

    private var attachButton: some View {
        Menu {
            Button {
                showPhotos = true
            } label: {
                Label("Фото", systemImage: "photo.on.rectangle")
            }
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button {
                    showCamera = true
                } label: {
                    Label("Камера", systemImage: "camera")
                }
            }
            Button {
                showFiles = true
            } label: {
                Label("Файл", systemImage: "doc")
            }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Theme.muted)
                .frame(width: 36, height: 36)
                .background(Theme.fill, in: Circle())
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .menuOrder(.fixed)
        .accessibilityLabel("Прикрепить")
        .photosPicker(isPresented: $showPhotos, selection: $picked, maxSelectionCount: AttachmentPrep.limit,
                      matching: .images)
        .fileImporter(isPresented: $showFiles, allowedContentTypes: Self.fileTypes,
                      allowsMultipleSelection: true) { result in
            if case .success(let urls) = result {
                Task { await model.addFiles(urls) }
            }
        }
    }

    private var modelButton: some View {
        Button {
            Keyboard.hide()
            Haptics.tap()
            showModels = true
        } label: {
            HStack(spacing: 5) {
                Text(model.activeModelName)
                    .font(.system(size: 14, weight: .medium))
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 12)
            .frame(height: 36)
            .background(Theme.fill, in: Capsule())
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Модель: \(model.activeModelName)")
        .accessibilityHint("Выбрать модель")
    }

    private func actionButton(symbol: String, label: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: symbol == "stop.fill" ? 13 : 16, weight: .semibold))
                .foregroundStyle(Theme.buttonPrimaryText)
                .frame(width: 36, height: 36)
                .background(Theme.buttonPrimary.opacity(active ? 1 : 0.25), in: Circle())
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!active)
        .accessibilityLabel(label)
    }

    private func submit() {
        guard canSend else { return }
        let message = text
        if let editing = model.editing {
            // Сначала закрываем правку (в поле вернётся отложенный черновик), потом отправляем.
            model.editing = nil
            Task {
                let sent = await model.edit(editing, text: message)
                if !sent, text.isEmpty { text = message }
            }
            return
        }
        let files = model.draftAttachments
        text = ""
        model.draftAttachments = []
        Task {
            // Не ушло — возвращаем текст и вложения, если пользователь не начал новое сообщение.
            let sent = await model.send(message, attachments: files)
            if !sent {
                if text.isEmpty { text = message }
                if model.draftAttachments.isEmpty { model.draftAttachments = files }
            }
        }
    }
}
