import Foundation
import Observation
import UIKit

/// Состояние приложения: адрес ПК, вход, список диалогов.
enum MainScreen: Equatable {
    case chat, studio, recents
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
    var activeChatID: String? {
        didSet {
            guard oldValue != activeChatID else { return }
            // Ушли из сессии «Инкогнито» — она закрывается на сервере и больше не открывается (как на сайте).
            if let old = oldValue, chats.first(where: { $0.id == old })?.temporary == true {
                closeTemporary(old)
                incognito = false
            }
            markSeen()
        }
    }
    /// «Инкогнито» для новой сессии: первый вопрос создаст временную сессию сервера,
    /// которая не попадает в историю, память и поиск (`POST /api/temporary-chats`).
    var incognito = false
    /// Сессии, ответ в которых пришёл, пока их не открывали: синяя точка в шторке и «Недавних».
    var unread: Set<String> = Set(UserDefaults.standard.stringArray(forKey: AppModel.unreadKey) ?? []) {
        didSet {
            guard preview == nil, unread != oldValue else { return }
            UserDefaults.standard.set(Array(unread), forKey: AppModel.unreadKey)
        }
    }

    enum ThreadState: Equatable {
        case idle, loading, loaded, failed(String)
    }

    /// Лента открытого чата.
    var thread: [FeedMessage] = []
    var threadState: ThreadState = .idle
    /// Чей это `thread`: пока не совпал с `activeChatID`, лента показывает загрузку.
    var threadChatID: String?

    /// Идущий ответ модели в чате: этап, флаги, картинки. Текст приходит целиком с каждым событием сервера,
    /// но хранится не здесь, а в `content` (`LiveText`): он меняется ~30 раз в секунду, и, лежи он в `lives`,
    /// каждый шаг вывода пересчитывал бы всё, что читает `lives`, — ленту целиком и поле ввода (аудит 20.11.2026).
    struct LiveState: Equatable {
        var phase = "Обработка запроса…"
        /// Показанный текст, его разметка и рассуждения. Объект общий у всех копий этого состояния,
        /// поэтому новый текст не меняет само состояние в `lives`.
        let content = LiveText()
        var text: String {
            get { content.text }
            nonmutating set { content.text = newValue }
        }
        var blocks: [MarkdownBlock] {
            get { content.blocks }
            nonmutating set { content.blocks = newValue }
        }
        var reasoning: String {
            get { content.reasoning }
            nonmutating set { content.reasoning = newValue }
        }
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
    /// Ответ дописан, но сохранённое сообщение ещё не пришло в ленту: до тех пор лента показывает его
    /// на месте живого. Иначе на этот промежуток ответ пропадал, лента укорачивалась на всю его высоту,
    /// и читающего начало выбрасывало в другую часть чата (замечание 18.11.2026).
    var settling: [String: LiveState] = [:]
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
    var screen: MainScreen = .chat {
        didSet { if screen != oldValue { markSeen() } }
    }
    /// Тема (Настройки → Внешний вид). В режиме снимков не сохраняется.
    var appearance: Appearance = .dark {
        didSet {
            guard preview == nil else { return }
            UserDefaults.standard.set(appearance.rawValue, forKey: Appearance.key)
        }
    }
    /// Тактильный отклик (Настройки → Приложение).
    var haptics = true {
        didSet {
            guard preview == nil else { return }
            UserDefaults.standard.set(haptics, forKey: Haptics.key)
        }
    }
    /// Отклик при выводе ответа (Настройки → Приложение): лёгкие толчки по мере появления текста.
    var streamHaptics = true {
        didSet {
            guard preview == nil else { return }
            UserDefaults.standard.set(streamHaptics, forKey: Haptics.streamKey)
        }
    }
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
    /// Последние открытые сессии, новые — в конце: по ним `trimCaches` решает, чьи ленты держать в памяти.
    @ObservationIgnored var recentChatIDs: [String] = []
    /// Картинки модели, которые сейчас качаются: одна загрузка на арт, сколько бы мест её ни ждало.
    @ObservationIgnored var artLoads: [String: Task<UIImage?, Never>] = [:]
    @ObservationIgnored var eventsTask: Task<Void, Never>?
    @ObservationIgnored var eventsConnectedOnce = false
    /// Последний текст потока; в `lives` переносится не чаще нескольких раз в секунду.
    @ObservationIgnored var liveRaw: [String: (text: String, reasoning: String)] = [:]
    @ObservationIgnored var liveFlushScheduled = false
    /// Ответ закончен на сервере, но лента ещё дописывает его последний кусок.
    @ObservationIgnored var pendingFinish: [String: (chat: [String: Any]?, notify: Bool)] = [:]
    @ObservationIgnored var lastEventAt: [String: Date] = [:]
    @ObservationIgnored var watching: Set<String> = []
    /// Сессии, в которых ответ запросили с этого телефона: только их готовый ответ отмечается
    /// непрочитанным (ответы, начатые на сайте, точку не ставят).
    @ObservationIgnored var askedHere: Set<String> = []

    static let draftModelKey = "draft_model"
    static let unreadKey = "unread_chats"

    private static let serverKey = "server_url"
    private static let tokenKey = "token"

    init(preview: PreviewScene? = PreviewScene.current) {
        self.preview = preview
        store = PhoneStore(folder: preview == nil ? PhoneStore.defaultFolder : nil)
        studio.app = self
        phone.app = self
        appearance = preview?.appearance ?? Appearance.saved
        haptics = preview == nil ? Haptics.enabled : true
        streamHaptics = preview == nil ? Haptics.streamSetting : true
    }

    /// Модели для выбора: с ПК и с самого телефона.
    var allModels: [ModelOption] { models + phone.options }

    var activeChat: ChatSummary? {
        chats.first { $0.id == activeChatID }
    }

    /// Сессии для шторки, «Недавних» и поиска — без временной («Инкогнито»).
    var listedChats: [ChatSummary] {
        chats.filter { !$0.temporary }
    }

    /// Открыта сессия «Инкогнито» или новая сессия в этом режиме.
    var incognitoMode: Bool {
        activeChatID == nil ? incognito : activeChat?.temporary == true
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
        askedHere = []
        incognito = false
        unread = []
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
        recentChatIDs = []
        artLoads = [:]
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
            let fresh = mergeLocal(try await api.chats())
            // Список мог уйти на сервер раньше, чем только что отправленный вопрос создал чат
            // (например, при возврате в приложение): такой чат не теряем и не закрываем —
            // иначе вопрос исчезал и открывался пустой чат (баг 13.11.2026).
            let known = Set(fresh.map(\.id))
            let now = Date().timeIntervalSince1970 * 1000
            // Временную сессию («Инкогнито») сервер в списке не отдаёт — она остаётся, пока открыта.
            let creating = chats.filter { chat in
                !known.contains(chat.id)
                    && (chat.temporary || lives[chat.id] != nil
                        || (chat.id == activeChatID && now - chat.updatedAt < 120_000))
            }
            chats = creating + fresh
            chatsError = nil
            // Точки у сессий, которых больше нет (удалены на сайте), не копятся.
            let alive = Set(chats.map(\.id))
            if !unread.isSubset(of: alive) { unread = unread.intersection(alive) }
            if let active = activeChatID, !chats.contains(where: { $0.id == active }) {
                activeChatID = nil
            }
        } catch let error as APIError where error.status == 401 {
            await logout()
        } catch {
            chatsError = (error as? APIError)?.message ?? "Не удалось загрузить сессии."
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
             .phoneModels, .phoneChat, .phoneSettings, .phoneParameters, .tools, .queue,
             .recents, .light, .settingsLight, .computer, .modelProfile, .incognito, .sources, .cost:
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
            if scene == .recents { screen = .recents }
            // Точка «новый ответ» у второй сессии — в шторке и на «Недавних».
            if scene == .sidebar || scene == .recents, chats.count > 2 { unread = [chats[2].id] }
            if scene == .incognito { incognito = true }
            if scene == .sources {
                activeChatID = "7"
                thread = PreviewScene.sourcesFeed
                threadState = .loaded
                threadChatID = "7"
                chatMeta["7"] = ChatMeta(overrides: ["searchMode": "auto"], branch: "main")
            }
            if [.thread, .threadTop, .streaming, .tools, .queue, .light, .cost].contains(scene) {
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
            if scene == .tools || scene == .thread || scene == .light {
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

/// Текст идущего ответа: показанная часть, её разметка и рассуждения. Отдельный наблюдаемый объект —
/// новые куски перерисовывают только строку живого ответа (`LiveAnswerView`), а не всё, что читает `lives`.
@Observable
final class LiveText {
    var text = ""
    var blocks: [MarkdownBlock] = []
    var reasoning = ""
    /// Слова сейчас выводятся: у конца ответа мягкий край (`StreamTail`). Гаснет, если новых слов нет ~0,4 с
    /// (`AppModel.settleFlow`), — при паузе модели конец ответа не остаётся бледным.
    var flowing = false
    /// Когда вывод последний раз показал новые знаки.
    @ObservationIgnored var lastReveal = Date.distantPast
    /// Сколько символов (`Character`) в `text`; −1 — ещё не посчитано. Вывод по шагам не пересчитывает
    /// длину всего текста на каждом шаге.
    @ObservationIgnored var shownCount = -1
    /// Полученный текст, из которого идёт вывод, и его длина в символах (считается раз на событие сервера).
    @ObservationIgnored var source = ""
    @ObservationIgnored var sourceCount = 0
    @ObservationIgnored private var stream = MarkdownStream()

    /// Новый показанный текст. Разметка разбирается только для чата на экране (`parse`) и только с начала
    /// предпоследнего блока (`MarkdownStream`); `count` — длина `value` в символах, если уже известна.
    func show(_ value: String, count: Int? = nil, parse: Bool) {
        if let count { shownCount = count }
        if value == text, !parse || !blocks.isEmpty || value.isEmpty { return }
        if value != text {
            text = value
            if count == nil { shownCount = -1 }
        }
        if parse {
            let next = stream.update(value)
            if next != blocks { blocks = next }
        } else if !blocks.isEmpty {
            blocks = []
            stream.reset()
        }
    }

    /// Рассуждения; одинаковый текст не перерисовывает строку заново.
    func setReasoning(_ value: String) {
        if value != reasoning { reasoning = value }
    }
}

extension LiveText: Equatable {
    /// Один и тот же ответ — один и тот же объект.
    static func == (left: LiveText, right: LiveText) -> Bool { left === right }
}
