sap.ui.define(["sap/ui/core/UIComponent", "sap/ui/model/json/JSONModel", "sap/ui/model/odata/v4/ODataModel", "sap/ui/Device", "./auth/AuthService", "./auth/RuntimeConfig", "./service/ChatService", "./service/PushService", "./service/RealtimeService", "./model/PresenceModel", "./model/formatter", "./util/ThemeManager", "./util/pwa", "./util/notifications", "./util/push"], function (UIComponent, JSONModel, ODataModel, Device, __AuthService, ___auth_RuntimeConfig, __ChatService, __PushService, __RealtimeService, __PresenceModel, ___model_formatter, __ThemeManager, ___util_pwa, ___util_notifications, ___util_push) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const AuthService = _interopRequireDefault(__AuthService);
  const getRuntimeConfig = ___auth_RuntimeConfig["getRuntimeConfig"];
  const loadRuntimeConfig = ___auth_RuntimeConfig["loadRuntimeConfig"];
  const ChatService = _interopRequireDefault(__ChatService);
  const PushService = _interopRequireDefault(__PushService);
  const RealtimeService = _interopRequireDefault(__RealtimeService);
  const PresenceModel = _interopRequireDefault(__PresenceModel);
  const setFormatterTextProvider = ___model_formatter["setFormatterTextProvider"];
  const ThemeManager = _interopRequireDefault(__ThemeManager);
  const createPwaModel = ___util_pwa["createPwaModel"];
  const createNotificationsModel = ___util_notifications["createNotificationsModel"];
  const listenOpenConversation = ___util_push["listenOpenConversation"];
  const registerServiceWorker = ___util_push["registerServiceWorker"];
  const LOGIN_HASH = "/login";

  /**
   * @namespace apps.dflc.resenha
   */
  const Component = UIComponent.extend("apps.dflc.resenha.Component", {
    constructor: function constructor() {
      UIComponent.prototype.constructor.apply(this, arguments);
      this.lastAccessToken = "";
    },
    metadata: {
      manifest: "json",
      interfaces: ["sap.ui.core.IAsyncContentCreation"]
    },
    init: function _init() {
      UIComponent.prototype.init.call(this);
      ThemeManager.init();
      setFormatterTextProvider((key, parameters) => this.getBundle().getText(key, parameters) ?? key);
      void this.start();
    },
    getAuth: function _getAuth() {
      return AuthService.getInstance();
    },
    getChatService: function _getChatService() {
      if (!this.chatService) {
        throw new Error("Chat service is not available before login");
      }
      return this.chatService;
    },
    getPushService: function _getPushService() {
      if (!this.pushService) {
        throw new Error("Push service is not available before login");
      }
      return this.pushService;
    },
    getRealtime: function _getRealtime() {
      if (!this.realtime) {
        throw new Error("Realtime service is not available before login");
      }
      return this.realtime;
    },
    getPresence: function _getPresence() {
      return this.getModel("presence");
    },
    getBundle: function _getBundle() {
      return this.getModel("i18n").getResourceBundle();
    },
    isSessionStarted: function _isSessionStarted() {
      return !!this.chatModel;
    },
    destroy: function _destroy() {
      this.realtime?.stop();
      this.stopOpenConversation?.();
      UIComponent.prototype.destroy.call(this);
    },
    start: async function _start() {
      await loadRuntimeConfig();
      this.setModel(new JSONModel(Device), "device");
      this.setModel(new JSONModel({
        user: {}
      }), "session");
      this.setModel(new PresenceModel(), "presence");
      this.setModel(this.createUiModel(), "ui");
      this.setModel(createPwaModel(), "pwa");
      this.setModel(createNotificationsModel(), "notifications");
      const auth = this.getAuth();
      if (auth.hasSession() && (await auth.ensureFreshSession())) {
        this.startSession(auth.getSession());
      }
      auth.onChange(session => this.onAuthChanged(session));
      if (!this.isSessionStarted() && window.location.hash !== `#${LOGIN_HASH}`) {
        window.location.replace(`#${LOGIN_HASH}`);
      }
      this.getRouter().initialize();
      this.stopOpenConversation = listenOpenConversation(conversationId => this.getRouter().navTo("conversation", {
        id: conversationId
      }));
    },
    createUiModel: function _createUiModel() {
      const state = {
        mobileView: "list",
        darkMode: ThemeManager.isDark(),
        conversationId: "",
        draft: "",
        drafts: {},
        sending: false,
        subtitle: "",
        subtitleOnline: false,
        typingLabel: "",
        isTyping: false,
        detailsOpen: false,
        showArchived: false,
        detailsDirty: false,
        login: {
          mode: "login",
          login: "",
          password: "",
          email: "",
          username: "",
          displayName: "",
          error: ""
        }
      };
      const model = new JSONModel(state);
      ThemeManager.onChange(dark => model.setProperty("/darkMode", dark));
      return model;
    },
    onAuthChanged: function _onAuthChanged(session) {
      if (!session) {
        this.realtime?.stop();
        if (this.chatModel) {
          window.location.hash = LOGIN_HASH;
          // recarrega para descartar modelos, WebSocket e estados da sessao encerrada
          // eslint-disable-next-line fiori-custom/sap-no-location-reload
          window.location.reload();
        }
        return;
      }
      if (!this.chatModel) {
        this.startSession(session);
        return;
      }
      this.chatModel.changeHttpHeaders({
        Authorization: `Bearer ${session.AccessToken}`
      });
      if (session.AccessToken !== this.lastAccessToken) {
        this.lastAccessToken = session.AccessToken;
        this.realtime?.renew();
      }
    },
    startSession: function _startSession(session) {
      if (!session || this.chatModel) {
        return;
      }
      const userId = session.User.ID;
      this.getModel("session").setProperty("/user", {
        ID: userId
      });
      this.getPresence().setSelf(userId);
      this.lastAccessToken = session.AccessToken;
      this.chatModel = new ODataModel({
        serviceUrl: getRuntimeConfig().chatService,
        httpHeaders: {
          Authorization: `Bearer ${session.AccessToken}`
        },
        operationMode: "Server",
        autoExpandSelect: true,
        earlyRequests: true
      });
      this.setModel(this.chatModel);
      this.chatService = new ChatService(this.chatModel);
      this.pushService = new PushService(this.chatModel);
      this.startRealtime();
      void registerServiceWorker();
      void this.pushService.sync().catch(() => false);
    },
    startRealtime: function _startRealtime() {
      const realtime = new RealtimeService(forceRefresh => this.buildWsUrl(forceRefresh));
      const presence = this.getPresence();
      realtime.on("presence.snapshot", payload => presence.setSnapshot(payload.OnlineUserIds ?? []));
      realtime.on("presence.changed", payload => presence.setUserOnline(payload.UserId, payload.IsOnline, payload.LastSeenAt));
      realtime.on("typing", payload => presence.markTyping(payload.ConversationId, payload.UserId));
      this.realtime = realtime;
      realtime.start();
    },
    buildWsUrl: async function _buildWsUrl(forceRefresh) {
      const auth = this.getAuth();
      const hasSession = forceRefresh ? await auth.handleUnauthorized() : await auth.ensureFreshSession();
      if (!hasSession) {
        return null;
      }
      const {
        wsUrl
      } = getRuntimeConfig();
      const separator = wsUrl.includes("?") ? "&" : "?";
      return `${wsUrl}${separator}token=${encodeURIComponent(auth.getAccessToken() ?? "")}`;
    }
  });
  return Component;
});
//# sourceMappingURL=Component-dbg.js.map
