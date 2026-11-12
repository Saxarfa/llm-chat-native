import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// Экран чата: шапка, лента сообщений (или приветствие нового чата) и поле ввода у клавиатуры.
struct ChatScreen: View {
    @Environment(AppModel.self) private var model
    let onMenu: () -> Void
    @State private var draft = ""
    @State private var showParameters = false
    @State private var showBranches = false
    @State private var renaming: ChatSummary?
    @State private var deleting: ChatSummary?

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
            VStack(spacing: 0) {
                header
                if model.offline {
                    OfflineBanner()
                        .padding(.horizontal, 12)
                        .padding(.bottom, 6)
                        .background(Theme.canvas)
                        .transition(.opacity)
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ComposerBar(text: $draft)
        }
        .task(id: model.activeChatID) {
            model.editing = nil
            await model.loadThread()
        }
        .fullScreenCover(item: $bound.viewer) { item in
            if case .video(_, let url) = item.source {
                VideoViewer(url: url)
            } else {
                ImageViewer(item: item)
            }
        }
        .sheet(isPresented: $showParameters) {
            ModelSettingsSheet()
        }
        .sheet(isPresented: $showBranches) {
            BranchesSheet()
        }
        .chatActions(renaming: $renaming, deleting: $deleting)
        .confirmationDialog(model.pendingDelete?.isUser == true ? "Удалить сообщение?" : "Удалить ответ?",
                            isPresented: Binding(get: { model.pendingDelete != nil },
                                                 set: { if !$0 { model.pendingDelete = nil } }),
                            titleVisibility: .visible) {
            Button("Удалить", role: .destructive) {
                if let message = model.pendingDelete {
                    Task { await model.deleteMessage(message) }
                }
                model.pendingDelete = nil
            }
            Button("Отмена", role: .cancel) { model.pendingDelete = nil }
        } message: {
            Text("Сообщение исчезнет из этой ветки. Другие ветки не изменятся.")
        }
        .onAppear {
            if [.parameters, .nano, .omni, .phoneParameters].contains(model.preview) { showParameters = true }
            if model.preview == .branches { showBranches = true }
        }
    }

    /// Шапка как у Claude: слева меню, справа «Новый чат» и «⋯» в общей капсуле; названия чата нет.
    private var header: some View {
        HStack(spacing: 8) {
            CircleIconButton(symbol: "line.3.horizontal", label: "Меню", action: onMenu)
            Spacer()
            if let chat = model.activeChat {
                HStack(spacing: 0) {
                    headerIcon("square.and.pencil", label: "Новый чат") {
                        model.activeChatID = nil
                    }
                    Menu {
                        Button {
                            openParameters()
                        } label: {
                            Label("Настройки модели", systemImage: "slider.horizontal.3")
                        }
                        Button {
                            Keyboard.hide()
                            showBranches = true
                        } label: {
                            Label("Ветки диалога", systemImage: "arrow.triangle.branch")
                        }
                        Divider()
                        ChatMenuItems(chat: chat, onRename: { renaming = chat }, onDelete: { deleting = chat })
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                            .frame(width: 44, height: 40)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Ещё")
                    .accessibilityIdentifier("chat.more")
                }
                .padding(.horizontal, 2)
                .background(Theme.fill, in: Capsule())
            } else {
                CircleIconButton(symbol: "slider.horizontal.3", label: "Настройки модели") {
                    openParameters()
                }
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 52)
        .background(Theme.canvas)
    }

    private func headerIcon(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Theme.ink)
                .frame(width: 44, height: 40)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(label)
    }

    private func openParameters() {
        Keyboard.hide()
        Haptics.tap()
        showParameters = true
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
/// Слева — меню «+» и выбор модели, справа — отправка; пока модель отвечает — «Стоп», а набранный
/// вопрос встаёт в очередь. Тонкая линия внизу — сколько контекста модели занято.
struct ComposerBar: View {
    @Environment(AppModel.self) private var model
    @Binding var text: String
    @FocusState private var focused: Bool
    @State private var showModels = false
    @State private var showPhotos = false
    @State private var showCamera = false
    @State private var showFiles = false
    @State private var showTools = false
    @State private var showContext = false
    /// Что выбрали в меню «+»: открывается, когда меню закрылось.
    @State private var pendingSource: ComposerToolsSheet.Source?
    @State private var picked: [PhotosPickerItem] = []
    /// Черновик, отложенный на время правки старого сообщения.
    @State private var parkedDraft = ""
    @State private var dictation = Dictation()

    private static let fileTypes: [UTType] = {
        var types: [UTType] = [.pdf, .png, .jpeg, .webP, .heic, .mpeg4Movie]
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
            if let problem = dictation.problem {
                errorBanner(problem) { dictation.problem = nil }
            }
            ForEach(model.activeQueue) { item in
                queuedRow(item)
            }

            VStack(alignment: .leading, spacing: 10) {
                if model.editing != nil {
                    editBanner
                } else if !model.draftAttachments.isEmpty || model.attachmentsBusy {
                    DraftAttachmentStrip()
                }

                TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(Theme.subtle), axis: .vertical)
                    .lineLimit(1...8)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.ink)
                    .focused($focused)
                    .padding(.horizontal, 6)
                    .padding(.top, 4)
                    .accessibilityIdentifier("chat.input")

                HStack(spacing: 6) {
                    if model.editing == nil {
                        attachButton
                    }
                    modelButton
                    Spacer(minLength: 8)
                    if live != nil {
                        actionButton(symbol: "stop.fill", label: "Остановить ответ", active: live?.stopping != true,
                                     primary: !(model.editing == nil && hasText)) {
                            Task { await model.stop() }
                        }
                        if model.editing == nil && hasText {
                            actionButton(symbol: "arrow.up", label: "Добавить в очередь", active: canSend, action: submit)
                                .transition(.scale.combined(with: .opacity))
                        }
                    } else {
                        if model.editing == nil {
                            micButton
                        }
                        actionButton(symbol: model.editing == nil ? "arrow.up" : "checkmark",
                                     label: model.editing == nil ? "Отправить" : "Сохранить правку",
                                     active: canSend, action: submit)
                    }
                }
                if let usage = model.activeContext, let fraction = usage.fraction {
                    contextLine(usage, fraction: fraction)
                }
            }
            .padding(10)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).strokeBorder(Theme.line))
            .shadow(color: .black.opacity(0.12), radius: 16, y: 4)
            .contentShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .onTapGesture { focused = true }
        }
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .padding(.bottom, 8)
        .background(Theme.canvas)
        .animation(.easeOut(duration: 0.18), value: model.sendError)
        .animation(.easeOut(duration: 0.18), value: model.draftAttachments)
        .animation(.easeOut(duration: 0.18), value: model.activeQueue)
        .sheet(isPresented: $showModels) {
            ModelPickerSheet()
        }
        .sheet(isPresented: $showTools, onDismiss: openPending) {
            ComposerToolsSheet { source in pendingSource = source }
        }
        .photosPicker(isPresented: $showPhotos, selection: $picked, maxSelectionCount: AttachmentPrep.limit,
                      matching: .images)
        .fileImporter(isPresented: $showFiles, allowedContentTypes: Self.fileTypes,
                      allowsMultipleSelection: true) { result in
            if case .success(let urls) = result {
                Task { await model.addFiles(urls) }
            }
        }
        // Модель дописала ответ (или открыт другой чат) — уходит следующий вопрос из очереди.
        .onChange(of: model.activeLive == nil) { _, idle in
            if idle { model.runQueue() }
        }
        .onChange(of: model.activeChatID) { _, _ in model.runQueue() }
        // Контекст пересчитывается, когда меняется переписка, модель или закончился ответ.
        .task(id: contextKey) {
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }
            await model.measureContext()
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                showCamera = false
                if let image { Task { await model.addCamera(image) } }
            }
            .ignoresSafeArea()
        }
        .onAppear {
            if model.preview == .models || model.preview == .phoneModels || model.preview == .phoneSettings { showModels = true }
            if model.preview == .tools { showTools = true }
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

    private func errorBanner(_ error: String, onClose: (() -> Void)? = nil) -> some View {
        Button {
            if let onClose { onClose() } else { model.sendError = nil }
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
        Button {
            Keyboard.hide()
            Haptics.tap()
            showTools = true
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Theme.muted)
                .frame(width: 36, height: 36)
                .background(Theme.fill, in: Circle())
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Вложения и инструменты")
        .accessibilityIdentifier("composer.tools")
    }

    private func openPending() {
        guard let source = pendingSource else { return }
        pendingSource = nil
        switch source {
        case .camera: showCamera = true
        case .photo: showPhotos = true
        case .file: showFiles = true
        }
    }

    private var contextKey: String {
        "\(model.activeChatID ?? "")|\(model.activeModelID)|\(model.thread.count)|\(model.activeLive == nil)|\(model.activeBranchName)"
    }

    /// Линия по низу капсулы: занятая часть контекста. Нажатие — подробности.
    private func contextLine(_ usage: ContextUsage, fraction: Double) -> some View {
        Button {
            Haptics.tap()
            showContext = true
        } label: {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.line)
                    Capsule().fill(fraction >= 0.9 ? Theme.danger : Theme.subtle)
                        .frame(width: max(2, geometry.size.width * fraction))
                }
                .frame(height: 2)
                .frame(maxHeight: .infinity, alignment: .center)
            }
            .frame(height: 12)
            .padding(.horizontal, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.top, -6)
        .padding(.bottom, -4)
        .accessibilityLabel("Контекст модели: \(Int((fraction * 100).rounded()))%")
        .accessibilityIdentifier("composer.context")
        .popover(isPresented: $showContext, arrowEdge: .bottom) {
            ContextDetails(usage: usage)
                .presentationCompactAdaptation(.popover)
        }
    }

    /// Вопрос в очереди над полем ввода: отменить или (если не ушёл) повторить.
    private func queuedRow(_ item: QueuedMessage) -> some View {
        HStack(spacing: 8) {
            Image(systemName: item.failed ? "exclamationmark.circle" : "clock")
                .font(.system(size: 13, weight: .medium))
            Text(item.failed ? "Не ушло: «\(item.text)»" : "В очереди: «\(item.text)»")
                .font(.system(size: 14))
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
            if item.failed {
                Button {
                    model.retryQueued(item)
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 13, weight: .semibold))
                        .frame(width: 36, height: 32)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Повторить")
            }
            Button {
                model.cancelQueued(item)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .frame(width: 36, height: 32)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Убрать из очереди")
        }
        .foregroundStyle(item.failed ? Theme.danger : Theme.muted)
        .padding(.leading, 14)
        .padding(.trailing, 4)
        .frame(minHeight: 40)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.line))
        .accessibilityIdentifier("composer.queued")
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    /// Подсказка в пустом поле, как у Claude: «Общайтесь с …» в новом чате, «Ответьте …» в начатом.
    private var placeholder: String {
        let name = model.activeModelName
        return model.activeChatID == nil ? "Общайтесь с \(name)" : "Ответьте \(name)"
    }

    /// Уровень рассуждений рядом с названием модели: «Средний», «Рассуждения» или ничего.
    private var reasoningLabel: String? {
        let id = model.activeModelID
        let config = model.modelConfig(id)
        if PhoneModelID.isPhone(id) {
            return (config["thinking"] as? Bool) == true ? "Рассуждения" : nil
        }
        switch ChatParameters.reasoning(id) {
        case .toggle:
            return (config["thinking"] as? Bool) ?? true ? "Рассуждения" : nil
        case .levels(let levels):
            let value = ChatConfig.text(config["reasoning_strength"]) ?? "high"
            return levels.first { $0.value == value }?.label
        case nil:
            return nil
        }
    }

    private var modelButton: some View {
        Button {
            Keyboard.hide()
            Haptics.tap()
            showModels = true
        } label: {
            // Целиком «модель + уровень», если влезает; иначе только модель, а не два обрезанных слова.
            ViewThatFits(in: .horizontal) {
                chip(level: reasoningLabel).fixedSize()
                chip(level: nil).fixedSize()
                chip(level: nil)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Модель: \(model.activeModelName)")
        .accessibilityHint("Выбрать модель")
    }

    private func chip(level: String?) -> some View {
        HStack(spacing: 5) {
            Text(model.activeModelName)
                .foregroundStyle(Theme.ink.opacity(0.85))
                .lineLimit(1)
            if let level {
                Text(level)
                    .foregroundStyle(Theme.subtle)
                    .lineLimit(1)
            }
        }
        .font(.system(size: 14, weight: .medium))
        .padding(.horizontal, 12)
        .frame(height: 34)
        .background(Theme.fill, in: Capsule())
    }

    /// Микрофон: диктовка в поле ввода (речь распознаёт iOS).
    private var micButton: some View {
        Button {
            Task {
                await dictation.toggle(current: text) { value in text = value }
            }
        } label: {
            Image(systemName: dictation.active ? "waveform" : "mic")
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(dictation.active ? Theme.accent : Theme.muted)
                .symbolEffect(.variableColor.iterative, isActive: dictation.active)
                .frame(width: 36, height: 36)
                .background(dictation.active ? Theme.accent.opacity(0.16) : Color.clear, in: Circle())
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(dictation.active ? "Остановить диктовку" : "Диктовка")
        .accessibilityIdentifier("composer.mic")
    }

    private func actionButton(symbol: String, label: String, active: Bool, primary: Bool = true,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: symbol == "stop.fill" ? 13 : 16, weight: .semibold))
                .foregroundStyle(primary ? Theme.buttonPrimaryText : Theme.ink)
                .frame(width: 36, height: 36)
                .background(primary ? Theme.buttonPrimary.opacity(active ? 1 : 0.25) : Theme.fill, in: Circle())
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!active)
        .accessibilityLabel(label)
    }

    private func submit() {
        guard canSend else { return }
        dictation.stop()
        let message = text
        if model.activeLive != nil, model.editing == nil {
            // Модель ещё отвечает: вопрос уйдёт сразу после ответа.
            model.enqueue(message.trimmingCharacters(in: .whitespacesAndNewlines), attachments: model.draftAttachments)
            text = ""
            model.draftAttachments = []
            return
        }
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

/// Подробности контекста — как всплывающее окно индикатора на сайте.
private struct ContextDetails: View {
    let usage: ContextUsage

    var body: some View {
        let approx = usage.estimated ? "≈ " : ""
        VStack(alignment: .leading, spacing: 12) {
            Text("Контекст модели")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.ink)
            HStack(spacing: 24) {
                number("Использовано", approx + Self.format(usage.used))
                number("Свободно", usage.capacity.map { approx + Self.format(max(0, $0 - usage.used)) } ?? "—")
            }
            HStack {
                Text("Лимит контекста")
                Spacer()
                Text(usage.capacity.map(Self.format) ?? "Неизвестен")
                    .monospacedDigit()
            }
            .font(.system(size: 13))
            .foregroundStyle(Theme.muted)
            Text(usage.estimated ? "Оценка по длине переписки и инструкции."
                                 : "Токены запроса по токенизатору модели, включая инструкции и инструменты.")
                .font(.system(size: 12))
                .foregroundStyle(Theme.subtle)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(width: 280, alignment: .leading)
        .background(Theme.surface)
        .accessibilityIdentifier("context.details")
    }

    private func number(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 12))
                .foregroundStyle(Theme.subtle)
            Text(value)
                .font(.system(size: 17, weight: .semibold).monospacedDigit())
                .foregroundStyle(Theme.ink)
        }
    }

    static func format(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.groupingSeparator = "\u{00A0}"
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }
}
