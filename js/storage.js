/**
 * Storage Manager for LlamaChat Studio (Client-Server Architecture)
 * Supports SQLite backend via FastAPI, JWT authentication,
 * automatic migration from legacy localStorage, and optimistic in-memory caching.
 */

const STORAGE_KEYS = {
  SETTINGS: 'llamachat_settings',
  CHATS: 'llamachat_conversations',
  ACTIVE_CHAT: 'llamachat_active_chat_id',
  SIDEBAR_COLLAPSED: 'llamachat_sidebar_collapsed',
  AUTH_TOKEN: 'llamachat_auth_token',
  AUTH_USER: 'llamachat_auth_user',
  MIGRATED: 'llamachat_migrated_to_db'
};

const DEFAULT_MODEL_CONFIG = {
  systemPrompt: 'You are a helpful, knowledgeable, and precise AI assistant. Provide concise, high-quality answers formatted in Markdown. When writing code, specify the language and follow modern best practices.',
  temperature: 0.7,
  min_p: 0.05,
  top_p: 0.9,
  top_k: 40,
  repeat_penalty: 1.1,
  presence_penalty: 0.0,
  frequency_penalty: 0.0,
  max_tokens: -1,
  contextSize: 8192,
  stop: []
};

const KNOWN_MODEL_CONTEXTS = {
  'gemma-31b-iq3': 32768,
  'gemma-26b-uncensored': 62768,
  'gemma-26b-qat': 64000,
  'muse-glimmer-30b': 64072,
  'qwen-3.8-27b-it': 64384
};

const DEFAULT_SETTINGS = {
  endpoint: (typeof window !== 'undefined' && window.location.origin) ? `${window.location.origin}/v1` : 'http://127.0.0.1:8000/v1',
  apiKey: '',
  model: 'muse-glimmer-30b',
  availableModels: [],
  modelProfiles: {},
  modelConfigs: {},
  systemPrompt: DEFAULT_MODEL_CONFIG.systemPrompt,
  temperature: DEFAULT_MODEL_CONFIG.temperature,
  min_p: DEFAULT_MODEL_CONFIG.min_p,
  top_p: DEFAULT_MODEL_CONFIG.top_p,
  top_k: DEFAULT_MODEL_CONFIG.top_k,
  repeat_penalty: DEFAULT_MODEL_CONFIG.repeat_penalty,
  presence_penalty: DEFAULT_MODEL_CONFIG.presence_penalty,
  frequency_penalty: DEFAULT_MODEL_CONFIG.frequency_penalty,
  stop_tokens: '',
  max_tokens: DEFAULT_MODEL_CONFIG.max_tokens,
  contextSize: DEFAULT_MODEL_CONFIG.contextSize,
  searchProvider: 'searxng',
  searxngUrl: 'http://127.0.0.1:8080',
  tavilyApiKey: '',
  searchMode: 'auto',
  searchMaxResults: 5,
  searchBlacklist: '',
  fontSize: 16,
  autoScroll: true,
  autoTitle: true,
  chatSuggestions: true
};

class StorageManager {
  constructor() {
    this.currentUser = null;
    this.authToken = null;
    this.isServerConnected = true;
    this.serverSettingsReady = false;
    this.chats = [];
    this.settings = { ...DEFAULT_SETTINGS };
    this.activeChatId = null;
    this.tabId = 'tab_' + Math.random().toString(36).substring(2, 9);
    this.syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('saxarachat_tab_sync') : null;

    try {
      this.authToken = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || null;
      this.currentUser = JSON.parse(localStorage.getItem(STORAGE_KEYS.AUTH_USER) || 'null');
    } catch (_) {}
    this.initLocalCache();
    this.settingsSnapshot = JSON.parse(JSON.stringify(this.settings));
    this.pendingSettingsPatches = [];
    window.addEventListener('storage', event => {
      if (event.key !== STORAGE_KEYS.AUTH_USER) return;
      let other = null; try { other = JSON.parse(event.newValue || 'null'); } catch (_) {}
      if (other?.id !== this.currentUser?.id) window.location.reload();
    });
  }

  accountKey(key) { return `llm-account-${this.currentUser?.id ?? 'guest'}:${key}`; }

  authError(data, fallback) {
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) return 'Проверьте логин (2–40 символов) и пароль (8–128 символов).';
    return fallback;
  }

  persistAuthSession() {
    try {
      localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, this.authToken);
      localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(this.currentUser));
    } catch (_) {
      // Quota failures still allow removal: discard stale credentials, use the server cookie.
      try { localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN); } catch (_) {}
      try { localStorage.removeItem(STORAGE_KEYS.AUTH_USER); } catch (_) {}
    }
  }

  adoptSession(data) {
    this.currentUser = data.user;
    this.authToken = data.token;
    // Only the existing owner's authenticated session can claim the old device cache.
    // A full or unavailable device cache must never reject a valid server session.
    try {
    if (data.user.legacy_owner && localStorage.getItem(this.accountKey('migration-v1')) !== 'true') {
      let migrated = true;
      const keys = [STORAGE_KEYS.SETTINGS, STORAGE_KEYS.CHATS, STORAGE_KEYS.ACTIVE_CHAT,
        STORAGE_KEYS.SIDEBAR_COLLAPSED, 'saxara_chat_font', 'saxara_chat_theme',
        'llm_interface_size', 'saxarachat_custom_logo', 'llamachat_sidebar_width',
        'art-video-draft', 'llm.translationModel.v2', 'llm.upscaleModel'];
      for (const key of keys) {
        try {
          const saved = localStorage.getItem(key);
          if (saved !== null && localStorage.getItem(this.accountKey(key)) === null)
            localStorage.setItem(this.accountKey(key), saved);
        } catch (_) { migrated = false; }
      }
      try {
      for (const key of Object.keys(sessionStorage)) {
        if ((key === 'llm-react-queue' || key.startsWith('llm-draft-')) && sessionStorage.getItem(this.accountKey(key)) === null)
          sessionStorage.setItem(this.accountKey(key), sessionStorage.getItem(key));
      }
      } catch (_) { migrated = false; }
      if (migrated) localStorage.setItem(this.accountKey('migration-v1'), 'true');
    }
    } catch (_) {}
    this.persistAuthSession();
    this.chats = []; this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    this.activeChatId = null; this.serverSettingsReady = false;
    this.pendingSettingsPatches = []; this.settingsSnapshot = {};
    this.initLocalCache();
    window.dispatchEvent(new Event('account-changed'));
  }

  /* ----------------- Initialization & Local Cache ----------------- */

  initLocalCache() {
    // Restore cached settings
    try {
      const data = localStorage.getItem(this.accountKey(STORAGE_KEYS.SETTINGS));
      if (data && !['undefined','null','none'].includes(data)) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
      }
    } catch (e) {
      console.warn('Failed to parse settings from localStorage:', e);
    }

    // Restore cached chats for instantaneous initial render (filter out empty chats)
    try {
      const chatData = localStorage.getItem(this.accountKey(STORAGE_KEYS.CHATS));
      if (chatData && !['undefined','null','none'].includes(chatData)) {
        const parsed = JSON.parse(chatData);
        if (Array.isArray(parsed)) {
          this.chats = parsed.filter(c => c && Array.isArray(c.messages) && c.messages.length > 0);
          this.saveChatsLocally(this.chats);
        }
      }
    } catch (e) {
      console.warn('Failed to parse chats from localStorage:', e);
    }

    // Restore active chat id
    try {
      this.activeChatId = localStorage.getItem(this.accountKey(STORAGE_KEYS.ACTIVE_CHAT));
    } catch (_) {}

    // Authentication is read once by the constructor, then comes from the server.
    // Re-reading here could replace a new session with stale storage after a failed write.
  }

  /* ----------------- Authentication API ----------------- */

  getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.authToken && this.authToken !== 'null' && this.authToken !== 'undefined' && this.authToken !== 'none') {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  async checkAuth() {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.user) {
          this.adoptSession(data);
          this.isServerConnected = true;

          // Fetch full data from server & auto-migrate if needed
          await this.syncFromServer();
          return { ok: true, user: this.currentUser };
        }
      } else if (res.status === 401) {
        this.clearAuthSession();
        return { ok: false, error: 'Unauthorized' };
      }
    } catch (e) {
      console.warn('Auth check network warning (offline mode fallback):', e);
    }

    // An unverified cached profile is never an authenticated session.
    return { ok: false };
  }

  async login(username, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(this.authError(data, 'Неверный логин или пароль'));
      }

      this.adoptSession(data);

      await this.syncFromServer();
      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: err instanceof TypeError ? 'Не удалось связаться с сервером. Попробуйте ещё раз.' : err.message || 'Ошибка входа' };
    }
  }

  async register(username, password) {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(this.authError(data, 'Ошибка регистрации'));
      }

      this.adoptSession(data);
      await this.syncFromServer();

      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: err instanceof TypeError ? 'Не удалось связаться с сервером. Попробуйте ещё раз.' : err.message || 'Ошибка регистрации' };
    }
  }

  async logout() {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      if (!response.ok) throw new Error('Не удалось завершить сессию. Попробуйте ещё раз.');

    this.clearAuthSession();
    this.chats = [];
    this.activeChatId = null;
  }

  clearAuthSession() {
    this.currentUser = null;
    this.authToken = null;
    try { localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN); } catch (_) {}
    try { localStorage.removeItem(STORAGE_KEYS.AUTH_USER); } catch (_) {}
    this.chats = []; this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    this.activeChatId = null; this.serverSettingsReady = false;
    this.pendingSettingsPatches = []; this.settingsSnapshot = {};
    window.dispatchEvent(new Event('account-changed'));
  }

  isAuthenticated() {
    return !!this.currentUser;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  async updateProfile(username, avatar, display_name) {
    const owner = this.currentUser?.id, token = this.authToken;
    const headers = { 'Content-Type': 'application/json' };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    const res = await fetch('/api/auth/profile', {
      method: 'POST',
      headers,
      body: JSON.stringify({ username, avatar, display_name })
    });
    const data = await res.json();
    if (owner !== this.currentUser?.id || token !== this.authToken) {
      throw new Error('Аккаунт изменился. Повторите действие.');
    }
    if (!res.ok) {
      throw new Error(data.detail || 'Не удалось обновить профиль');
    }
    if (data.token) {
      this.authToken = data.token;
    }
    if (data.user) {
      this.currentUser = data.user;
    }
    this.persistAuthSession();
    return data.user;
  }

  /* ----------------- Full Server Synchronization ----------------- */

  async syncFromServer() {
    if (!this.isAuthenticated()) return;
    const owner = this.currentUser.id;

    try {
      // 2. Fetch chats from server
      const chatRes = await fetch('/api/chats', {
        method: 'GET',
        headers: this.getAuthHeaders()
      });
      if (this.currentUser?.id !== owner) return;
      if (chatRes.ok) {
        const chatData = await chatRes.json();
        if (this.currentUser?.id !== owner) return;
        if (chatData.ok && Array.isArray(chatData.chats)) {
          this.saveChatsLocally(chatData.chats);
        }
      }

      // 3. Fetch user settings from server
      const settingsRes = await fetch('/api/settings', {
        method: 'GET',
        headers: this.getAuthHeaders()
      });
      if (this.currentUser?.id !== owner) return;
      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        if (this.currentUser?.id !== owner) return;
        if (sData.ok) {
          this.applyRemoteSettings(sData, true);
          this.serverSettingsReady = true;
        }
      }
    } catch (e) {
      console.warn('syncFromServer warning:', e);
    }
  }

  /**
   * Automatically migrates legacy localStorage chats and configs to the backend SQLite DB.
   * Guarantees zero data loss when transitioning from local mode to accounts.
   */
  /* ----------------- Settings Methods ----------------- */

  getSettings() {
    return { ...DEFAULT_SETTINGS, ...this.settings };
  }

  saveSettings(settings) {
    this.settingsRevision = (this.settingsRevision || 0) + 1;
    this.settings = { ...this.settings, ...settings };
    try {
      localStorage.setItem(this.accountKey(STORAGE_KEYS.SETTINGS), JSON.stringify(this.settings));
    } catch (_) {}

    // Async sync to server
    if (this.isAuthenticated() && this.serverSettingsReady) {
      const previous = this.settingsSnapshot || {};
      const patch = { source_tab: this.tabId, settings: {}, model_configs: {}, model_profiles: {}, deleted_model_profiles: [] };
      const sharedKeys = ['endpoint','apiKey','model','autoScroll','autoTitle','chatSuggestions','searchProvider','searxngUrl','tavilyApiKey','searchMode','searchMaxResults','searchBlacklist'];
      for (const key of sharedKeys) {
        if (JSON.stringify(previous[key]) !== JSON.stringify(this.settings[key])) patch.settings[key] = this.settings[key];
      }
      for (const [localKey, remoteKey] of [['modelConfigs','model_configs'],['modelProfiles','model_profiles']]) {
        for (const [model, values] of Object.entries(this.settings[localKey] || {})) {
          const fields = {};
          for (const [key, value] of Object.entries(values)) {
            if (JSON.stringify(previous[localKey]?.[model]?.[key]) !== JSON.stringify(value)) fields[key] = value;
          }
          if (Object.keys(fields).length) patch[remoteKey][model] = fields;
        }
      }
      patch.deleted_model_profiles = Object.keys(previous.modelProfiles || {}).filter(model => !Object.hasOwn(this.settings.modelProfiles || {}, model));
      if (Object.keys(patch.settings).length || Object.keys(patch.model_configs).length || Object.keys(patch.model_profiles).length || patch.deleted_model_profiles.length) {
        this.pendingSettingsPatches.push(patch);
        const owner = this.currentUser.id, headers = this.getAuthHeaders();
        this.settingsWrite = (this.settingsWrite || Promise.resolve()).then(async () => {
          if (this.currentUser?.id !== owner) return;
          const response = await fetch('/api/settings', {method:'POST', headers, body:JSON.stringify(patch)});
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        }).catch(err => {
          if (this.currentUser?.id !== owner) return;
          console.warn('Failed to sync settings to server:', err);
          window.chatApp?.showToast('Настройки сохранены на устройстве, но не отправлены на сервер. Проверьте соединение и сохраните ещё раз.', 'error');
          // Retain the old baseline so an explicit retry includes failed fields.
          this.settingsSnapshot = previous;
        }).finally(() => {
          this.pendingSettingsPatches = this.pendingSettingsPatches.filter(item => item !== patch);
        });
      }
    }
    this.settingsSnapshot = JSON.parse(JSON.stringify(this.settings));
    return this.settings;
  }

  applyRemoteSettings(data, replace = false) {
    this.settingsRevision = (this.settingsRevision || 0) + 1;
    const merge = patch => {
      // Appearance belongs to this browser/account cache, never to another device.
      const {fontSize: _remoteFontSize, ...sharedSettings} = patch.settings || {};
      Object.assign(this.settings, sharedSettings);
      for (const [localKey, remoteKey] of [['modelConfigs','model_configs'],['modelProfiles','model_profiles']]) {
        const target = this.settings[localKey] ||= {};
        for (const [model, fields] of Object.entries(patch[remoteKey] || {})) {
          const previous = target[model] || {};
          target[model] = {...previous, ...fields};
          if (localKey === 'modelConfigs' && fields?.toolPermissions) {
            target[model].toolPermissions = {...previous.toolPermissions, ...fields.toolPermissions};
          }
        }
      }
      for (const model of patch.deleted_model_profiles || []) delete this.settings.modelProfiles[model];
    };
    if (replace) {
      this.settings.modelConfigs = {};
      this.settings.modelProfiles = {};
    }
    merge(data);
    for (const patch of this.pendingSettingsPatches || []) merge(patch);
    this.settingsSnapshot = JSON.parse(JSON.stringify(this.settings));
    try { localStorage.setItem(this.accountKey(STORAGE_KEYS.SETTINGS), JSON.stringify(this.settings)); } catch (_) {}
  }

  async refreshSettingsFromServer() {
    const owner = this.currentUser?.id;
    const revision = this.settingsRevision || 0;
    const response = await fetch('/api/settings', {headers:this.getAuthHeaders()});
    if (!response.ok) return false;
    const data = await response.json();
    if (!data.ok || owner !== this.currentUser?.id || revision !== (this.settingsRevision || 0)) return false;
    this.applyRemoteSettings(data, true);
    return true;
  }

  resetSettings() {
    const current = this.getSettings();
    const cleanDefaults = {
      ...DEFAULT_SETTINGS,
      modelProfiles: current.modelProfiles || {},
      modelConfigs: current.modelConfigs || {},
      availableModels: current.availableModels || []
    };
    this.saveSettings(cleanDefaults);
    return cleanDefaults;
  }

  getSidebarCollapsed() {
    try {
      return localStorage.getItem(this.accountKey(STORAGE_KEYS.SIDEBAR_COLLAPSED)) === 'true';
    } catch (_) {
      return false;
    }
  }

  setSidebarCollapsed(collapsed) {
    try {
      localStorage.setItem(this.accountKey(STORAGE_KEYS.SIDEBAR_COLLAPSED), collapsed ? 'true' : 'false');
    } catch (_) {}
  }

  /* ----------------- Model Inference Configs (Per-Model) ----------------- */

  getModelConfig(modelId) {
    if (!modelId) {
      modelId = this.getSettings().model || 'local-model';
    }
    const s = this.getSettings();
    const configs = s.modelConfigs || {};
    const modelKnownCtx = (modelId && KNOWN_MODEL_CONTEXTS[modelId]) ? KNOWN_MODEL_CONTEXTS[modelId] : null;

    if (!configs[modelId]) {
      const initial = { ...DEFAULT_MODEL_CONFIG };
      if (modelKnownCtx) {
        initial.contextSize = modelKnownCtx;
      } else if (typeof s.contextSize === 'number' && s.contextSize > 0) {
        initial.contextSize = s.contextSize;
      }
      if (s.modelProfiles?.[modelId]?.systemPrompt) {
        initial.systemPrompt = s.modelProfiles[modelId].systemPrompt;
      } else if (s.systemPrompt) {
        initial.systemPrompt = s.systemPrompt;
      }
      this.saveModelConfig(modelId, initial);
      return initial;
    }

    const cfg = configs[modelId];
    let stopTokens = [];
    if (Array.isArray(cfg.stop)) {
      stopTokens = cfg.stop;
    } else if (typeof cfg.stop === 'string' && cfg.stop.trim()) {
      stopTokens = cfg.stop.split(',').map(t => t.trim()).filter(Boolean);
    } else if (typeof cfg.stop_tokens === 'string' && cfg.stop_tokens.trim()) {
      stopTokens = cfg.stop_tokens.split(',').map(t => t.trim()).filter(Boolean);
    }

    let resolvedCtx = (typeof cfg.contextSize === 'number' && cfg.contextSize > 0) ? cfg.contextSize : null;
    if (!resolvedCtx || (resolvedCtx === 8192 && modelKnownCtx && modelKnownCtx !== 8192)) {
      resolvedCtx = modelKnownCtx || (typeof s.contextSize === 'number' ? s.contextSize : DEFAULT_MODEL_CONFIG.contextSize);
    }

    return {
      imageGeneration: cfg.imageGeneration,
      systemPrompt: typeof cfg.systemPrompt === 'string' ? cfg.systemPrompt : DEFAULT_MODEL_CONFIG.systemPrompt,
      temperature: typeof cfg.temperature === 'number' ? cfg.temperature : DEFAULT_MODEL_CONFIG.temperature,
      min_p: typeof cfg.min_p === 'number' ? cfg.min_p : DEFAULT_MODEL_CONFIG.min_p,
      top_p: typeof cfg.top_p === 'number' ? cfg.top_p : DEFAULT_MODEL_CONFIG.top_p,
      top_k: typeof cfg.top_k === 'number' ? cfg.top_k : DEFAULT_MODEL_CONFIG.top_k,
      repeat_penalty: typeof cfg.repeat_penalty === 'number' ? cfg.repeat_penalty : DEFAULT_MODEL_CONFIG.repeat_penalty,
      presence_penalty: typeof cfg.presence_penalty === 'number' ? cfg.presence_penalty : DEFAULT_MODEL_CONFIG.presence_penalty,
      frequency_penalty: typeof cfg.frequency_penalty === 'number' ? cfg.frequency_penalty : DEFAULT_MODEL_CONFIG.frequency_penalty,
      max_tokens: typeof cfg.max_tokens === 'number' ? cfg.max_tokens : DEFAULT_MODEL_CONFIG.max_tokens,
      contextSize: resolvedCtx,
      stop: stopTokens
    };
  }

  saveModelConfig(modelId, configData) {
    if (!modelId) return null;
    const s = this.getSettings();
    const configs = s.modelConfigs || {};
    const existing = configs[modelId] || DEFAULT_MODEL_CONFIG;

    let stopArr = [];
    if (configData.stop !== undefined) {
      if (Array.isArray(configData.stop)) {
        stopArr = configData.stop;
      } else if (typeof configData.stop === 'string') {
        stopArr = configData.stop.split(',').map(t => t.trim()).filter(Boolean);
      }
    } else if (existing.stop) {
      stopArr = Array.isArray(existing.stop) ? existing.stop : [];
    }

    if (configData.contextSize !== undefined) {
      const parsedCtx = parseInt(configData.contextSize, 10);
      if (!isNaN(parsedCtx) && parsedCtx > 0) {
        configData.contextSize = parsedCtx;
      }
    }

    configs[modelId] = {
      ...existing,
      ...configData,
      stop: stopArr
    };

    if (configData.systemPrompt !== undefined) {
      const profiles = s.modelProfiles || {};
      if (!profiles[modelId]) {
        profiles[modelId] = { alias: '', avatar: '', systemPrompt: configData.systemPrompt };
      } else {
        profiles[modelId].systemPrompt = configData.systemPrompt;
      }
      this.saveSettings({ modelConfigs: configs, modelProfiles: profiles });
    } else {
      this.saveSettings({ modelConfigs: configs });
    }

    return configs[modelId];
  }

  resetModelConfig(modelId) {
    if (!modelId) return { ...DEFAULT_MODEL_CONFIG };
    const s = this.getSettings();
    const configs = s.modelConfigs || {};
    configs[modelId] = { ...DEFAULT_MODEL_CONFIG };
    this.saveSettings({ modelConfigs: configs });
    return configs[modelId];
  }

  /* ----------------- Model Profiles (Visual & Meta) ----------------- */

  getModelProfile(modelId) {
    if (!modelId) return { alias: '', avatar: '', systemPrompt: '', params: {} };
    const s = this.getSettings();
    const profiles = s.modelProfiles || {};
    return profiles[modelId] || {
      alias: '',
      avatar: '',
      systemPrompt: '',
      params: {}
    };
  }

  saveModelProfile(modelId, profileData) {
    if (!modelId) return null;
    const s = this.getSettings();
    const profiles = s.modelProfiles || {};
    profiles[modelId] = {
      ...(profiles[modelId] || {}),
      ...profileData
    };

    const configs = s.modelConfigs || {};
    if (profileData.systemPrompt !== undefined) {
      if (!configs[modelId]) {
        configs[modelId] = { ...DEFAULT_MODEL_CONFIG, systemPrompt: profileData.systemPrompt };
      } else {
        configs[modelId].systemPrompt = profileData.systemPrompt;
      }
      this.saveSettings({ modelProfiles: profiles, modelConfigs: configs });
    } else {
      this.saveSettings({ modelProfiles: profiles });
    }
    return profiles[modelId];
  }

  resetModelProfile(modelId) {
    if (!modelId) return;
    const s = this.getSettings();
    const profiles = s.modelProfiles || {};
    if (profiles[modelId]) {
      delete profiles[modelId];
      this.saveSettings({ modelProfiles: profiles });
    }
  }

  /* ----------------- Chat CRUD Methods ----------------- */

  getChats() {
    // Only return non-empty conversations (no empty 'New chat' ghosts in history)
    return (this.chats || []).filter(c => c && !c.temporary && !c.id?.startsWith('temp_') && Array.isArray(c.messages) && c.messages.length > 0);
  }

  saveChatsLocally(chats) {
    chats = chats.filter(c => c && !c.temporary && !c.id?.startsWith('temp_'));
    this.chats = chats;
    try {
      localStorage.setItem(this.accountKey(STORAGE_KEYS.CHATS), JSON.stringify(chats));
    } catch (_) {}
  }

  getChat(id) {
    if (!id || id === 'new') {
      return {
        id: 'new',
        title: 'Новый диалог',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model_id: this.getSettings().model || 'local-model'
      };
    }
    const found = (this.chats || []).find(c => c.id === id);
    if (found) {
      if (Array.isArray(found.messages)) {
        found.messages = this.deduplicateMessages(found.messages);
      }
      return found;
    }
    return {
      id: id,
      title: 'Новый диалог',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model_id: this.getSettings().model || 'local-model'
    };
  }

  saveChat(chat, syncToServer = true) {
    if (!chat) return null;
    if (chat.temporary || chat.id?.startsWith('temp_')) return chat;

    // If chat is an empty draft, don't persist to SQLite or spam sidebar
    if ((!chat.messages || chat.messages.length === 0) && (!chat.id || chat.id === 'new')) {
      return chat;
    }

    // When the first message is sent in draft mode, generate a real unique ID!
    if (!chat.id || chat.id === 'new') {
      chat.id = 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      this.setActiveChatId(chat.id);
    }

    chat.updatedAt = Date.now();

    const index = this.chats.findIndex(c => c.id === chat.id);
    if (index !== -1) {
      this.chats[index] = chat;
    } else {
      this.chats.unshift(chat);
    }
    this.saveChatsLocally(this.chats);

    if (!syncToServer) {
      return chat;
    }

    // Protection: If currently generating this chat on server, do not send a full messages overwrite to SQLite
    if (window.chatApp && window.chatApp.isGenerating && window.chatApp.activeChatId === chat.id) {
      return chat;
    }

    // Sync to SQLite API asynchronously
    fetch('/api/chats', {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        id: chat.id,
        title: chat.title || 'Новый диалог',
        messages: chat.messages || [],
        overrides: chat.overrides || {},
        active_branch_id: chat.active_branch_id,
        branches: chat.branches,
        expected_branch_id: chat.active_branch_id || 'main',
        model_id: chat.model_id || this.getSettings().model || 'local-model',
        createdAt: chat.createdAt || chat.updatedAt,
        updatedAt: chat.updatedAt
      })
    }).catch(e => console.warn('Failed to save chat to SQLite:', e));

    // Broadcast update across browser tabs
    try {
      this.syncChannel?.postMessage({
        type: 'chat_updated',
        chatId: chat.id,
        chat: { ...chat },
        senderTab: this.tabId
      });
    } catch (_) {}

    return chat;
  }

  createChat(title = 'Новый диалог') {
    // Returns a draft chat without persisting to database until first message is sent
    const draftChat = {
      id: 'new',
      title: title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      model_id: this.getSettings().model || 'local-model'
    };
    this.setActiveChatId('new');
    return draftChat;
  }

  updateChat(chatId, updateFn) {
    const index = this.chats.findIndex(c => c.id === chatId);
    if (index !== -1) {
      updateFn(this.chats[index]);
      this.chats[index].updatedAt = Date.now();
      const updated = this.chats[index];
      this.saveChatsLocally(this.chats);

      fetch(`/api/chats/${chatId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          id: updated.id,
          title: updated.title,
          messages: updated.messages,
          model_id: updated.model_id || 'local-model',
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt
        })
      }).catch(e => console.warn('Failed to update chat in SQLite:', e));

      try {
        this.syncChannel?.postMessage({
          type: 'chat_updated',
          chatId: updated.id,
          chat: { ...updated },
          senderTab: this.tabId
        });
      } catch (_) {}

      return updated;
    }
    return null;
  }

  renameChat(id, newTitle) {
    return this.saveChatMetadata(id, {title:(newTitle || 'Без названия').trim()});
  }

  saveChatMetadata(id, fields) {
    const chat = this.chats.find(item => item.id === id);
    if (!chat) return null;
    if (chat.temporary || chat.id?.startsWith('temp_')) return chat;
    const patch = {};
    for (const key of ['title','model_id']) if (Object.hasOwn(fields,key)) patch[key] = fields[key];
    Object.assign(chat,patch);
    this.saveChatsLocally(this.chats);
    this.metadataWrites ||= new Map();
    const write = (this.metadataWrites.get(id) || Promise.resolve()).then(async () => {
      const response = await fetch(`/api/chats/${encodeURIComponent(id)}/metadata`, {
        method:'PATCH', headers:this.getAuthHeaders(), body:JSON.stringify({...patch,source_tab:this.tabId})
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }).catch(error => {
      console.warn('Failed to save chat metadata:',error);
      window.chatApp?.showToast('Не удалось сохранить изменения чата на сервере. Проверьте соединение.', 'error');
    });
    this.metadataWrites.set(id,write);
    return chat;
  }

  deleteChat(id) {
    this.chats = this.chats.filter(c => c.id !== id);
    this.saveChatsLocally(this.chats);

    fetch(`/api/chats/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders()
    }).catch(e => console.warn('Failed to delete chat in SQLite:', e));

    try {
      this.syncChannel?.postMessage({
        type: 'chat_deleted',
        chatId: id,
        senderTab: this.tabId
      });
    } catch (_) {}

    if (this.getActiveChatId() === id) {
      const nextId = this.chats.length > 0 ? this.chats[0].id : null;
      this.setActiveChatId(nextId);
      return nextId;
    }
    return this.getActiveChatId();
  }

  clearAllChats() {
    this.saveChatsLocally([]);
    this.setActiveChatId(null);

    fetch('/api/chats', {
      method: 'DELETE',
      headers: this.getAuthHeaders()
    }).catch(e => console.warn('Failed to clear chats in SQLite:', e));

    try {
      this.syncChannel?.postMessage({
        type: 'all_chats_cleared',
        senderTab: this.tabId
      });
    } catch (_) {}
  }

  deduplicateMessages(messages) {
    if (!Array.isArray(messages)) return [];
    const seen = new Set();
    const result = [];
    for (const msg of messages) {
      if (!msg) continue;
      const idKey = msg.id || `${msg.role}_${(msg.content || '').slice(0, 40)}_${Math.floor((msg.timestamp || 0) / 4000)}`;
      if (!seen.has(idKey)) {
        seen.add(idKey);
        result.push(msg);
      }
    }
    return result;
  }

  /* ----------------- Remote Sync Handlers ----------------- */

  applyRemoteChat(remoteChat) {
    if (!remoteChat || !remoteChat.id || remoteChat.temporary || remoteChat.id.startsWith('temp_')) return;
    if (Array.isArray(remoteChat.messages)) {
      remoteChat.messages = this.deduplicateMessages(remoteChat.messages);
    }
    const idx = this.chats.findIndex(c => c.id === remoteChat.id);
    if (idx !== -1) {
      this.chats[idx] = { ...this.chats[idx], ...remoteChat };
    } else {
      this.chats.unshift({ ...remoteChat });
    }
    this.chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    this.saveChatsLocally(this.chats);
  }

  removeChatLocally(chatId) {
    this.chats = this.chats.filter(c => c.id !== chatId);
    this.saveChatsLocally(this.chats);
  }

  clearLocalChats() {
    this.chats = [];
    this.saveChatsLocally([]);
  }

  getActiveChatId() {
    return this.activeChatId;
  }

  setActiveChatId(id) {
    if (id?.startsWith('temp_')) id = 'new';
    this.activeChatId = id;
    try {
      if (id) {
        localStorage.setItem(this.accountKey(STORAGE_KEYS.ACTIVE_CHAT), id);
      } else {
        localStorage.removeItem(this.accountKey(STORAGE_KEYS.ACTIVE_CHAT));
      }
    } catch (_) {}
  }

  /* ----------------- Export / Import ----------------- */

  exportData() {
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      user: this.currentUser,
      settings: this.getSettings(),
      chats: this.getChats()
    };
    return JSON.stringify(data, null, 2);
  }

  async importData(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.settings) {
        this.saveSettings(parsed.settings);
      }
      if (Array.isArray(parsed.chats) && parsed.chats.length > 0) {
        this.saveChatsLocally(parsed.chats);
        this.setActiveChatId(parsed.chats[0].id);

        if (this.isAuthenticated()) {
          const result = await fetch('/api/chats/bulk', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ chats: parsed.chats })
          });
          if (!result.ok) throw new Error('Не удалось импортировать историю диалогов');
        }
      }
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  }
}

// Global instance
window.storageManager = new StorageManager();
