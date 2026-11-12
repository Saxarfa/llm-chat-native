import Foundation
import Observation

/// Состояние приложения: адрес ПК, вход, список диалогов.
enum MainScreen: Equatable {
    case chat, studio
}

@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable {
        case launching, needsServer, needsLogin, offline, ready
    }

    var phase: Phase = .launching
    var serverURL: URL?
    var user: User?
    var chats: [ChatSummary] = []
    var chatsLoading = false
    var chatsError: String?
    /// Ошибка действия над чатом в шторке (переименование, закрепление, удаление).
    var chatsNotice: String?
    var activeChatID: String?

    enum ThreadState: Equatable {
        case idle, loading, loaded, failed(String)
    }

    /// Лента открытого чата.
    var thread: [FeedMessage] = []
    var threadState: ThreadState = .idle
    /// Чей это `thread`: пока не совпал с `activeChatID`, лента показывает загрузку.
    var threadChatID: String?

    /// Идущий ответ модели в чате: текст приходит целиком с каждым событием сервера.
    struct LiveState: Equatable {
        var phase = "Обработка запроса…"
        var text = ""
        var blocks: [MarkdownBlock] = []
        var reasoning = ""
        var isThinking = false
        var stopping = false
        /// Запрос на отправку ещё не подтверждён сервером.
        var sending = false
        /// Вопрос, показанный в ленте до ответа сервера.
        var pendingUserID: String?
        /// Картинки, которые модель создаёт в этом ответе.
        var arts: [FeedArt] = []
        /// Ответ, который перегенерируется: в ленте его временно заменяет живая строка.
        var replacingID: String?
    }

    /// Ответы, которые сейчас пишутся, по id чата.
    var lives: [String: LiveState] = [:]
    /// Ошибка отправки или генерации — показывается над полем ввода.
    var sendError: String?
    var models: [ModelOption] = []
    var modelsLoading = false
    /// Модель для нового чата.
    var draftModel = UserDefaults.standard.string(forKey: AppModel.draftModelKey) ?? ""
    var settings = ServerSettings()
    /// Вложения ещё не отправленного сообщения.
    var draftAttachments: [DraftAttachment] = []
    var attachmentsBusy = false
    /// Картинка, открытая на весь экран.
    var viewer: ViewerItem?
    /// Своё сообщение, которое сейчас правится в поле ввода.
    var editing: FeedMessage?
    /// Параметры открытых чатов: веб-поиск и базы знаний (меню «+» у поля ввода), ветка.
    var chatMeta: [String: ChatMeta] = [:]
    /// Параметры нового чата до первой отправки.
    var draftOverrides: [String: Any] = [:]
    /// Сколько контекста модели занимает чат (по id чата).
    var contextUsage: [String: ContextUsage] = [:]
    /// Вопросы, отправленные, пока модель ещё отвечала (по id чата).
    var queued: [String: [QueuedMessage]] = [:]
    /// Описание моделей картинок AI Studio: соотношения сторон, размеры, возможности.
    var imageCatalog: [String: [String: Any]] = [:]
    /// Ошибка сохранения параметров или настроек.
    var settingsNotice: String?
    /// Идёт смена ветки или варианта ответа: кнопки под ответами недоступны.
    var branchBusy = false
    /// Сообщение, удаление которого ждёт подтверждения.
    var pendingDelete: FeedMessage?
    /// Растут с событиями `memory_updated` / `knowledge_updated` — открытые окна перечитывают данные.
    var memoryRevision = 0
    var knowledgeRevision = 0
    /// Базы знаний аккаунта (для выбора в «Параметрах чата»).
    var knowledgeLibraries: [KnowledgeLibrary] = []
    /// Что открыто справа от шторки: чат или студия картинок.
    var screen: MainScreen = .chat
    /// Студия картинок; своё наблюдаемое состояние.
    @ObservationIgnored let studio = StudioModel()
    /// Модели на самом iPhone (этап 8); своё наблюдаемое состояние.
    @ObservationIgnored let phone = PhoneModels()
    /// Сообщения чатов в том виде, как их хранит сервер: ответ модели телефона
    /// дописывается к ним и уходит на ПК целиком (`PUT /api/chats/{id}`).
    @ObservationIgnored var rawChats: [String: RawChat] = [:]
    /// Чаты, где сейчас отвечает модель телефона.
    @ObservationIgnored var phoneRuns: Set<String> = []
    /// ПК не ответил при запуске: работают только модели телефона и их чаты (этап 8.2).
    var offline = false
    /// Чаты телефона и снимок входа на самом телефоне.
    @ObservationIgnored let store: PhoneStore
    @ObservationIgnored var reconnectTask: Task<Void, Never>?
    @ObservationIgnored var syncing = false

    struct RawChat {
        var messages: [[String: Any]]
        var updatedAt: Double
        var title: String? = nil
    }

    let preview: PreviewScene?
    @ObservationIgnored var api: APIClient?
    /// Уже открывавшиеся чаты показываются сразу, пока идёт обновление с сервера.
    @ObservationIgnored var threadCache: [String: [FeedMessage]] = [:]
    @ObservationIgnored var eventsTask: Task<Void, Never>?
    @ObservationIgnored var eventsConnectedOnce = false
    /// Последний текст потока; в `lives` переносится не чаще нескольких раз в секунду.
    @ObservationIgnored var liveRaw: [String: (text: String, reasoning: String)] = [:]
    @ObservationIgnored var liveFlushScheduled = false
    /// Ответ закончен на сервере, но лента ещё дописывает его последний кусок.
    @ObservationIgnored var pendingFinish: [String: (chat: [String: Any]?, notify: Bool)] = [:]
    @ObservationIgnored var lastEventAt: [String: Date] = [:]
    @ObservationIgnored var watching: Set<String> = []

    static let draftModelKey = "draft_model"

    private static let serverKey = "server_url"
    private static let tokenKey = "token"

    init(preview: PreviewScene? = PreviewScene.current) {
        self.preview = preview
        store = PhoneStore(folder: preview == nil ? PhoneStore.defaultFolder : nil)
        studio.app = self
        phone.app = self
    }

    /// Модели для выбора: с ПК и с самого телефона.
    var allModels: [ModelOption] { models + phone.options }

    var activeChat: ChatSummary? {
        chats.first { $0.id == activeChatID }
    }

    /// Адрес без схемы — для подписи на экране входа.
    var serverLabel: String {
        guard let url = serverURL, let host = url.host else { return "" }
        if let port = url.port { return "\(host):\(port)" }
        return host
    }

    func bootstrap() async {
        if let preview {
            applyPreview(preview)
            return
        }
        guard let saved = UserDefaults.standard.string(forKey: Self.serverKey),
              let url = APIClient.normalize(saved) else {
            phase = .needsServer
            return
        }
        serverURL = url
        guard let token = Keychain.get(Self.tokenKey), !token.isEmpty else {
            api = APIClient(baseURL: url)
            phase = .needsLogin
            return
        }
        api = APIClient(baseURL: url, token: token)
        await restoreSession()
    }

    /// Проверяет сохранённый вход; сервер заодно выдаёт свежий токен.
    func restoreSession() async {
        guard let api else {
            phase = .needsServer
            return
        }
        do {
            let auth = try await api.me()
            accept(auth)
            await refreshChats()
            startSession()
        } catch let error as APIError where error.status == 401 {
            Keychain.set(nil, for: Self.tokenKey)
            api.token = nil
            phase = .needsLogin
        } catch {
            // Вход на этом телефоне уже был — работаем с моделями телефона, пока ПК не ответит.
            if !enterOffline() { phase = .offline }
        }
    }

    func connect(to raw: String) async throws {
        guard let url = APIClient.normalize(raw) else {
            throw APIError(status: 0, message: "Введите адрес компьютера, например 192.168.1.5:8000.")
        }
        let client = APIClient(baseURL: url)
        try await client.probe()
        UserDefaults.standard.set(url.absoluteString, forKey: Self.serverKey)
        Keychain.set(nil, for: Self.tokenKey)
        serverURL = url
        api = client
        phase = .needsLogin
    }

    func login(username: String, password: String) async throws {
        guard let api else { throw APIError.unreachable }
        let auth = try await api.login(username: username, password: password)
        accept(auth)
        await refreshChats()
        startSession()
    }

    func logout() async {
        eventsTask?.cancel()
        eventsTask = nil
        eventsConnectedOnce = false
        await api?.logout()
        reconnectTask?.cancel()
        reconnectTask = nil
        offline = false
        store.clear()
        lives = [:]
        liveRaw = [:]
        pendingFinish = [:]
        lastEventAt = [:]
        watching = []
        chatMeta = [:]
        draftOverrides = [:]
        imageCatalog = [:]
        settingsNotice = nil
        branchBusy = false
        pendingDelete = nil
        knowledgeLibraries = []
        studio.reset()
        phone.reset()
        for id in phoneRuns { lives[id] = nil }
        phone.cancel()
        phoneRuns = []
        rawChats = [:]
        screen = .chat
        models = []
        settings = ServerSettings()
        sendError = nil
        draftAttachments = []
        viewer = nil
        editing = nil
        Keychain.set(nil, for: Self.tokenKey)
        api?.token = nil
        user = nil
        chats = []
        activeChatID = nil
        thread = []
        threadState = .idle
        threadChatID = nil
        threadCache = [:]
        phase = .needsLogin
    }

    func changeServer() {
        phase = .needsServer
    }

    func refreshChats() async {
        guard preview == nil, !offline, let api else { return }
        chatsLoading = true
        defer { chatsLoading = false }
        do {
            chats = mergeLocal(try await api.chats())
            chatsError = nil
            if let active = activeChatID, !chats.contains(where: { $0.id == active }) {
                activeChatID = nil
            }
        } catch let error as APIError where error.status == 401 {
            await logout()
        } catch {
            chatsError = (error as? APIError)?.message ?? "Не удалось загрузить диалоги."
        }
    }

    func accept(_ auth: AuthResponse) {
        api?.token = auth.token
        Keychain.set(auth.token, for: Self.tokenKey)
        user = auth.user
        if preview == nil { store.saveSession(user: auth.user, settings: nil) }
        phase = .ready
    }

    private func applyPreview(_ scene: PreviewScene) {
        serverURL = URL(string: "http://192.168.1.5:8000")
        switch scene {
        case .connect:
            phase = .needsServer
        case .login:
            phase = .needsLogin
        case .offline:
            phase = .offline
        case .phoneOffline:
            user = PreviewScene.user
            phone.loadPreview()
            store.seed(PreviewScene.localChats)
            chats = store.summaries
            offline = true
            draftModel = PhoneModelID.make(file: PreviewScene.phoneInstalled[0].file)
            activeChatID = store.summaries.first?.id
            if let id = activeChatID { showLocal(id) }
            phase = .ready
        case .chat, .sidebar, .thread, .threadTop, .streaming, .models, .media, .parameters, .nano, .settings,
             .branches, .memory, .knowledge, .omni, .studio, .studioSettings, .studioHistory, .studioArt,
             .phoneModels, .phoneChat, .phoneSettings, .phoneParameters, .tools, .queue:
            user = PreviewScene.user
            chats = PreviewScene.chats
            models = PreviewScene.modelOptions
            draftModel = "gemma-26b-qat"
            if scene == .parameters {
                activeChatID = "7"
                thread = PreviewScene.feed
                threadState = .loaded
                threadChatID = "7"
                chatMeta["7"] = ChatMeta(overrides: [:], branch: "main")
                settings.modelConfigs["gemma-26b-qat"] = ["temperature": 0.9]
            }
            if scene == .nano {
                draftModel = "aistudio/gemini-3.1-flash-image"
                imageCatalog = ["aistudio/gemini-3.1-flash-image": PreviewScene.nanoCatalog]
            }
            if scene == .media || scene == .nano {
                activeChatID = "3"
                thread = PreviewScene.mediaFeed()
                threadState = .loaded
                threadChatID = "3"
                draftAttachments = PreviewScene.mediaDraft()
            }
            if [.thread, .threadTop, .streaming, .tools, .queue].contains(scene) {
                activeChatID = "7"
                thread = scene == .streaming || scene == .queue ? Array(PreviewScene.feed.prefix(3)) : PreviewScene.feed
                threadState = .loaded
                threadChatID = "7"
                chatMeta["7"] = ChatMeta(overrides: ["searchMode": "auto"], branch: "main")
            }
            if scene == .streaming || scene == .queue {
                lives["7"] = PreviewScene.live
            }
            if scene == .queue {
                queued["7"] = [QueuedMessage(text: "А что взять из еды на два дня?", attachments: [])]
            }
            if scene == .tools || scene == .thread {
                contextUsage["7"] = ContextUsage(used: 9_840, capacity: 32_768, estimated: false)
            }
            if scene == .queue {
                contextUsage["7"] = ContextUsage(used: 23_310, capacity: 32_768, estimated: false)
            }
            if scene == .branches {
                activeChatID = "7"
                thread = PreviewScene.variantFeed
                threadState = .loaded
                threadChatID = "7"
                chatMeta["7"] = ChatMeta(overrides: [:], branch: "b2", branches: PreviewScene.branchSample)
            }
            if scene == .omni {
                draftModel = "aistudio/gemini-omni-1.2-flash"
                imageCatalog = ["aistudio/gemini-omni-1.2-flash": PreviewScene.omniCatalog]
                activeChatID = "3"
                thread = PreviewScene.omniFeed()
                threadState = .loaded
                threadChatID = "3"
            }
            if scene == .parameters || scene == .knowledge || scene == .tools {
                knowledgeLibraries = PreviewScene.libraries
            }
            if scene == .tools {
                chatMeta["7"]?.overrides["knowledge"] = ["enabled": true, "collections": ["l1"], "strict": false] as [String: Any]
                settings.modelConfigs["gemma-26b-qat"] = ["thinking": true]
            }
            if [.studio, .studioSettings, .studioHistory, .studioArt].contains(scene) {
                screen = .studio
                studio.loadPreview()
            }
            if [.models, .phoneModels, .phoneChat, .phoneSettings, .phoneParameters].contains(scene) {
                phone.loadPreview()
            }
            if scene == .phoneParameters {
                settings.modelConfigs[PhoneModelID.make(file: PreviewScene.phoneInstalled[0].file)] = ["thinking": true, "temperature": 0.6]
            }
            if scene == .phoneChat || scene == .phoneParameters {
                draftModel = PhoneModelID.make(file: PreviewScene.phoneInstalled[0].file)
            }
            if scene == .parameters {
                chatMeta["7"]?.overrides["knowledge"] = ["enabled": true, "collections": ["l1"], "strict": false] as [String: Any]
            }
            phase = .ready
        }
    }
}
