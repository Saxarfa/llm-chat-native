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
                // Без прокрутки: приветствие стоит по центру свободного места и вместе с ним
                // плавно поднимается за клавиатурой и опускается обратно, как у Claude
                // (внутри ScrollView с containerRelativeFrame оно прыгало). Смахивание вниз убирает клавиатуру.
                welcome
                    .padding(.horizontal, 24)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .contentShape(Rectangle())
                    .gesture(DragGesture(minimumDistance: 12).onEnded { value in
                        if value.translation.height > 30 { Keyboard.hide() }
                    })
                    .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 0.97)),
                                            removal: .opacity))
            } else {
                MessageFeed()
                    // Свой экземпляр ленты на каждый чат: позиция прокрутки не переносится.
                    .id(model.activeChatID)
                    // Переход между чатами: прежний тает, новый проявляется, чуть поднимаясь.
                    .transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: 12)),
                                            removal: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.26), value: model.activeChatID)
        // Нажатие на пустое место или на текст ленты убирает клавиатуру.
        .contentShape(Rectangle())
        .onTapGesture { Keyboard.hide() }
        .softEdgeBar(edge: .top, tint: Theme.canvas) {
            VStack(spacing: 0) {
                header
                if model.offline {
                    OfflineBanner()
                        .padding(.horizontal, 12)
                        .padding(.bottom, 6)
                        .transition(.opacity)
                }
            }
        }
        .softEdgeBar(edge: .bottom, tint: Theme.canvas) {
            ComposerBar(text: $draft)
        }
        .task(id: model.activeChatID) {
            model.editing = nil
            await model.loadThread()
        }
        // Картинка — поверх экрана (под ней размыт сам чат); видео — отдельным окном с плеером.
        .overlay {
            if let item = model.viewer, !item.isVideo {
                ImageViewer(item: item) { model.viewer = nil }
                    .id(item.id)
            }
        }
        .fullScreenCover(item: Binding(get: { model.viewer?.isVideo == true ? model.viewer : nil },
                                       set: { bound.viewer = $0 })) { item in
            if case .video(_, let url) = item.source {
                VideoViewer(url: url)
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
    /// Кнопки стоят сразу под «островом» и плавают над лентой.
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
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Theme.ink.opacity(0.82))
                            .frame(width: 43, height: 38)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Ещё")
                    .accessibilityIdentifier("chat.more")
                }
                .background(Theme.surface, in: Capsule())
                .overlay(Capsule().strokeBorder(Theme.line))
                .transition(.opacity.combined(with: .scale(scale: 0.86, anchor: .trailing)))
            } else {
                CircleIconButton(symbol: "slider.horizontal.3", label: "Настройки модели") {
                    openParameters()
                }
                .padding(.trailing, -3)
                .transition(.opacity.combined(with: .scale(scale: 0.86, anchor: .trailing)))
            }
        }
        .animation(Theme.spring, value: model.activeChatID == nil)
        .padding(.horizontal, 16)
        .frame(height: 44)
        .padding(.top, -6)
        .padding(.bottom, 4)
    }

    private func headerIcon(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(Theme.ink.opacity(0.82))
                .frame(width: 43, height: 38)
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
        VStack(spacing: 12) {
            Wordmark(size: 30)
            Text(greeting)
                .font(Theme.display(21))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
    }

    private var greeting: String {
        guard let name = model.user?.shownName, !name.isEmpty else { return "Чем займёмся?" }
        return "Чем займёмся, \(name)?"
    }
}

/// Поле ввода, как у Claude. Без клавиатуры — строка-капсула: «+», подсказка, микрофон, «Отправить».
/// С клавиатурой (или когда уже есть текст и вложения) — карточка в две строки: сверху текст,
/// снизу «+», модель, микрофон и «Отправить»; пока модель отвечает — «Стоп», а набранный вопрос
/// встаёт в очередь.
struct ComposerBar: View {
    @Environment(AppModel.self) private var model
    @Binding var text: String
    @FocusState private var focused: Bool
    @State private var showModels = false
    @State private var showPhotos = false
    @State private var showCamera = false
    @State private var showFiles = false
    @State private var showTools = false
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

    /// Карточка в две строки — когда печатают или уже есть что отправить; иначе строка-капсула.
    private var expanded: Bool {
        focused || hasText || model.editing != nil || !model.draftAttachments.isEmpty
            || model.attachmentsBusy || dictation.active
    }

    var body: some View {
        let live = model.activeLive
        let expanded = self.expanded
        // Низ строки-капсулы — ровно по безопасной зоне, как у Claude (замер: 34 pt от низа экрана).
        let resting: CGFloat = Screen.bottomInset > 0 ? 0 : 8
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
            card(live: live, expanded: expanded)
        }
        .padding(.horizontal, expanded ? 8 : 15)
        .padding(.top, 6)
        .padding(.bottom, focused ? 8 : (expanded ? 2 : resting))
        // Размытием под капсулой управляет softEdgeBar родительского экрана.
        .animation(Theme.morph, value: expanded)
        .animation(Theme.morph, value: focused)
        .animation(.easeOut(duration: 0.15), value: canSend)
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

    // Размеры сняты со снимков приложения Claude на этом же iPhone (3 px = 1 pt):
    // строка — высота 50, кнопки 36 с полем 7–8; карточка с клавиатурой — высота 96,
    // текст 16 pt сверху (поле 16), ряд кнопок 36 снизу (поле 7).
    private func card(live: AppModel.LiveState?, expanded: Bool) -> some View {
        let shape = RoundedRectangle(cornerRadius: expanded ? 26 : 25, style: .continuous)
        return VStack(alignment: .leading, spacing: 0) {
            if model.editing != nil {
                editBanner
                    .padding(.horizontal, 8)
                    .padding(.top, 6)
            } else if !model.draftAttachments.isEmpty || model.attachmentsBusy {
                DraftAttachmentStrip()
                    .padding(.horizontal, 10)
                    .padding(.top, 10)
            }
            // Одно и то же поле в обоих видах (меняются только отступы) — фокус не теряется.
            ZStack(alignment: .bottom) {
                TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(Theme.muted), axis: .vertical)
                    .lineLimit(expanded ? 1...8 : 1...1)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                    .focused($focused)
                    // Пока поле не в фокусе, текст подсказки не ловит касания: иначе палец «таскал»
                    // её вверх-вниз (внутренняя прокрутка поля). Нажатие ловит подложка карточки.
                    .allowsHitTesting(focused)
                    .padding(.leading, expanded ? 13 : 58)
                    .padding(.trailing, expanded ? 13 : 96)
                    .padding(.top, expanded ? 16 : 15.5)
                    .padding(.bottom, expanded ? 61 : 15.5)
                    .accessibilityIdentifier("chat.input")
                controls(live: live, expanded: expanded)
            }
        }
        // Подложка ставит фокус. Она под кнопками, поэтому нажатие «Отправить» не возвращает клавиатуру.
        .background {
            shape.fill(expanded ? Theme.capsuleOpen : Theme.capsule)
                .onTapGesture { focused = true }
        }
        .overlay(shape.strokeBorder(Theme.capsuleLine).allowsHitTesting(false))
        // Линии контекста по низу карточки больше нет (замечание пользователя 13.11.2026:
        // «убери, потом подумаем, куда её засунуть»); подсчёт `measureContext` и окно
        // `ContextDetails` остались для будущего места.
        .shadow(color: .black.opacity(0.14), radius: 14, y: 4)
    }

    /// Нижний ряд: «+», модель (только в карточке), микрофон и «Отправить» / «Стоп».
    private func controls(live: AppModel.LiveState?, expanded: Bool) -> some View {
        HStack(spacing: 8) {
            if model.editing == nil {
                attachButton
            }
            if expanded {
                modelButton
                    .transition(.opacity.combined(with: .scale(scale: 0.92, anchor: .leading)))
            }
            Spacer(minLength: 4)
            if model.editing == nil {
                micButton
            }
            if live != nil {
                roundAction(symbol: "stop.fill", label: "Остановить ответ", style: .stop,
                            active: live?.stopping != true) {
                    Task { await model.stop() }
                }
                if model.editing == nil && hasText {
                    roundAction(symbol: "arrow.up", label: "Добавить в очередь", style: .send,
                                active: canSend, action: submit)
                        .transition(.scale.combined(with: .opacity))
                }
            } else {
                roundAction(symbol: model.editing == nil ? "arrow.up" : "checkmark",
                            label: model.editing == nil ? "Отправить" : "Сохранить правку",
                            style: canSend ? .send : .idle, active: canSend, action: submit)
            }
        }
        .padding(.horizontal, 8)
        .padding(.bottom, 7)
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
                .font(.system(size: 17, weight: .light))
                .foregroundStyle(Theme.ink.opacity(0.9))
                .frame(width: 36, height: 36)
                .background(Theme.capsuleControl, in: Circle())
                .modifier(ControlHit(size: 36))
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
                        .frame(width: 44, height: 40)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Повторить")
            }
            Button {
                model.cancelQueued(item)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .frame(width: 44, height: 40)
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
        .transition(.opacity)
    }

    /// Подсказка в пустом поле. Без имени модели: «Ответьте Gemini 4 Hydrogen» читалось криво
    /// (замечание пользователя 13.11.2026); модель и так видна на чипе.
    private var placeholder: String {
        if model.editing != nil { return "Исправьте сообщение" }
        return model.activeChatID == nil ? "Спросите что-нибудь" : "Напишите сообщение"
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
        let level = reasoningLabel
        return Button {
            Keyboard.hide()
            Haptics.tap()
            showModels = true
        } label: {
            // Как у Claude: рядом с моделью — уровень рассуждений. Если целиком не влезает,
            // сокращается название модели, а уровень остаётся виден.
            ViewThatFits(in: .horizontal) {
                chip(level: level).fixedSize()
                chip(level: level)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .padding(.vertical, -7)
        }
        .buttonStyle(PressScaleStyle())
        // Ряд кнопок отдаёт чипу всё свободное место; без этого HStack делил ширину
        // пополам с распоркой, и уровень рассуждений никогда не помещался.
        .layoutPriority(1)
        .accessibilityLabel("Модель: \(model.activeModelName)" + (level.map { ", \($0)" } ?? ""))
        .accessibilityHint("Выбрать модель")
    }

    private func chip(level: String?) -> some View {
        HStack(spacing: 6) {
            Text(model.activeModelName)
                .fontWeight(.medium)
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
                .truncationMode(.tail)
            if let level {
                Text(level)
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                    .fixedSize()
                    .layoutPriority(1)
            }
        }
        .font(.system(size: 14))
        .padding(.horizontal, 16)
        .frame(height: 36)
        .background(Theme.capsuleControl, in: Capsule())
    }

    /// Микрофон: диктовка в поле ввода (речь распознаёт iOS).
    private var micButton: some View {
        Button {
            Task {
                await dictation.toggle(current: text) { value in text = value }
            }
        } label: {
            Image(systemName: dictation.active ? "waveform" : "mic")
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(dictation.active ? Theme.accent : Theme.ink.opacity(0.75))
                .symbolEffect(.variableColor.iterative, isActive: dictation.active)
                .frame(width: 36, height: 36)
                .background(dictation.active ? Theme.accent.opacity(0.16) : Theme.capsuleControl, in: Circle())
                .modifier(ControlHit(size: 36))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(dictation.active ? "Остановить диктовку" : "Диктовка")
        .accessibilityIdentifier("composer.mic")
    }

    private enum ActionStyle {
        /// Есть что отправить — коралловая; нечего — светлая с бледной стрелкой; «Стоп» — серая.
        case send, idle, stop
    }

    private func roundAction(symbol: String, label: String, style: ActionStyle, active: Bool,
                             action: @escaping () -> Void) -> some View {
        let ink: Color = style == .send ? .white : style == .stop ? Theme.ink : Theme.buttonPrimaryText.opacity(0.4)
        let face: Color = style == .send ? Theme.send : style == .stop ? Theme.capsuleControl : Theme.buttonPrimary
        return Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: style == .stop ? 12 : 16, weight: style == .stop ? .bold : .medium))
                .foregroundStyle(ink)
                .frame(width: 36, height: 36)
                .background(face, in: Circle())
                .opacity(active || style == .idle ? 1 : 0.5)
                .modifier(ControlHit(size: 36))
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!active)
        .accessibilityLabel(label)
    }

    private func submit() {
        guard canSend else { return }
        dictation.stop()
        // Как у Claude: после отправки клавиатура уходит, капсула сворачивается в строку.
        focused = false
        Keyboard.hide()
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

/// Круглая кнопка капсулы: видимый размер `size`, зона нажатия шире и 44 по высоте.
private struct ControlHit: ViewModifier {
    let size: CGFloat

    func body(content: Content) -> some View {
        content
            .frame(width: size + 10, height: 44)
            .contentShape(Rectangle())
            .padding(.horizontal, -5)
            .padding(.vertical, -(44 - size) / 2)
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
