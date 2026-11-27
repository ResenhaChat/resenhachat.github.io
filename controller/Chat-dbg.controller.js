sap.ui.define(["./BaseController", "sap/ui/Device", "./chat/ConversationsSection", "./chat/MessagesSection", "./chat/ComposerSection", "./chat/ProfileSection", "./chat/OnlineSection", "./chat/InstallSection", "./chat/NotificationsSection", "./chat/ConversationActionsSection", "./chat/NewChatSection", "./chat/NewConversationSection", "./chat/ExploreChannelsSection", "./chat/MembersSection", "./chat/DetailsSection", "./chat/MediaSection", "../util/errors"], function (__BaseController, Device, __ConversationsSection, __MessagesSection, __ComposerSection, __ProfileSection, __OnlineSection, __InstallSection, __NotificationsSection, __ConversationActionsSection, __NewChatSection, __NewConversationSection, __ExploreChannelsSection, __MembersSection, __DetailsSection, __MediaSection, ___util_errors) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const BaseController = _interopRequireDefault(__BaseController);
  const ConversationsSection = _interopRequireDefault(__ConversationsSection);
  const MessagesSection = _interopRequireDefault(__MessagesSection);
  const ComposerSection = _interopRequireDefault(__ComposerSection);
  const ProfileSection = _interopRequireDefault(__ProfileSection);
  const OnlineSection = _interopRequireDefault(__OnlineSection);
  const InstallSection = _interopRequireDefault(__InstallSection);
  const NotificationsSection = _interopRequireDefault(__NotificationsSection);
  const ConversationActionsSection = _interopRequireDefault(__ConversationActionsSection);
  const NewChatSection = _interopRequireDefault(__NewChatSection);
  const NewConversationSection = _interopRequireDefault(__NewConversationSection);
  const ExploreChannelsSection = _interopRequireDefault(__ExploreChannelsSection);
  const MembersSection = _interopRequireDefault(__MembersSection);
  const DetailsSection = _interopRequireDefault(__DetailsSection);
  const MediaSection = _interopRequireDefault(__MediaSection);
  const isUnauthorized = ___util_errors["isUnauthorized"];
  const MOBILE_LIST = "list";
  const MOBILE_CHAT = "chat";
  const UNAUTHORIZED_RETRY_GAP_MS = 10_000;

  /**
   * @namespace apps.dflc.resenha.controller
   */
  const Chat = BaseController.extend("apps.dflc.resenha.controller.Chat", {
    constructor: function constructor() {
      BaseController.prototype.constructor.apply(this, arguments);
      this.conversations = new ConversationsSection(this);
      this.messages = new MessagesSection(this);
      this.composer = new ComposerSection(this);
      this.profile = new ProfileSection(this);
      this.online = new OnlineSection(this);
      this.install = new InstallSection(this);
      this.notifications = new NotificationsSection(this);
      this.actions = new ConversationActionsSection(this);
      this.newChat = new NewChatSection(this);
      this.newConversation = new NewConversationSection(this);
      this.explore = new ExploreChannelsSection(this);
      this.members = new MembersSection(this);
      this.details = new DetailsSection(this);
      this.media = new MediaSection(this);
      this.lastUnauthorizedRetry = 0;
      /** Lista de conversas carregada: atualiza o contador de não lidas (título e selo) e trata o 401. */
      this.onConversationsDataReceived = event => {
        if (!event.getParameter("error")) {
          this.conversations.updateUnread();
        }
        void this.onDataReceived(event);
      };
      /** Binding de lista com 401: renova o token e relê, no máximo uma vez a cada 10 s. */
      this.onDataReceived = async event => {
        if (!isUnauthorized(event.getParameter("error")) || Date.now() - this.lastUnauthorizedRetry < UNAUTHORIZED_RETRY_GAP_MS) {
          return;
        }
        this.lastUnauthorizedRetry = Date.now();
        if (await this.getAuth().handleUnauthorized()) {
          event.getSource().refresh();
        }
      };
      this.onChatMatched = () => {
        if (!this.hasSession()) {
          return;
        }
        if (Device.system.desktop) {
          void this.openGeneralConversation();
          return;
        }
        this.getUiModel().setProperty("/mobileView", MOBILE_LIST);
        this.details.onClose();
        this.messages.close();
        this.conversations.syncSelection();
      };
      this.onConversationMatched = event => {
        if (!this.hasSession()) {
          return;
        }
        const {
          id
        } = event.getParameter("arguments");
        this.getUiModel().setProperty("/mobileView", MOBILE_CHAT);
        this.composer.switchTo(id);
        this.messages.open(id);
        this.details.onConversationOpened();
        this.conversations.syncSelection();
      };
    },
    onInit: function _onInit() {
      this.getRouter().getRoute("chat")?.attachPatternMatched(this.onChatMatched);
      this.getRouter().getRoute("conversation")?.attachPatternMatched(this.onConversationMatched);
      this.bindOwnAvatar();
      this.conversations.init();
      this.messages.init();
      this.composer.init();
      this.online.init();
      this.notifications.init();
      this.details.init();
      this.media.init();
    },
    onExit: function _onExit() {
      this.getRouter().getRoute("chat")?.detachPatternMatched(this.onChatMatched);
      this.getRouter().getRoute("conversation")?.detachPatternMatched(this.onConversationMatched);
      this.conversations.destroy();
      this.messages.destroy();
      this.profile.destroy();
      this.online.destroy();
      this.notifications.destroy();
      this.install.destroy();
      this.details.destroy();
      this.newChat.destroy();
      this.newConversation.destroy();
      this.explore.destroy();
      this.members.destroy();
      this.media.destroy();
    },
    /** Avatar do cabeçalho lê nome e id do próprio usuário em /Me(<id>). */bindOwnAvatar: function _bindOwnAvatar() {
      const userId = this.getAuth().getUser()?.ID;
      if (userId) {
        this.byId("meAvatar").bindElement({
          path: `/Me(${userId})`
        });
      }
    },
    /** Desktop abre direto a conversa geral, localizada por Kind = General (não por id fixo). */openGeneralConversation: async function _openGeneralConversation() {
      try {
        const id = await this.getChatService().findGeneralConversationId();
        if (id) {
          this.navTo("conversation", {
            id
          }, true);
        }
      } catch (error) {
        await this.handleError(error, "conversationsError");
      }
    },
    hasSession: function _hasSession() {
      if (this.getAuth().hasSession()) {
        return true;
      }
      this.navTo("login", {}, true);
      return false;
    }
  });
  return Chat;
});
//# sourceMappingURL=Chat-dbg.controller.js.map
