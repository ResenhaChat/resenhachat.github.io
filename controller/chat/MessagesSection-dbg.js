sap.ui.define(["../../model/formatter", "../../util/errors"], function (__formatter, ____util_errors) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const formatter = _interopRequireDefault(__formatter);
  const isUnauthorized = ____util_errors["isUnauthorized"];
  const NEW_MESSAGE_ANIMATION_MS = 400;
  const ACCENT_CLASSES = Array.from({
    length: 10
  }, (_, index) => `rsAccent${index + 1}`);
  const MEMBERS_LIMIT = 500;
  const NEAR_BOTTOM_PX = 80;

  /** Cabeçalho + lista de mensagens da conversa aberta (/Conversations(<id>)/Messages). */
  class MessagesSection {
    conversationId = "";
    scrollPending = false;
    isFirstRender = true;
    memberIds = [];

    /** Não lidas da conversa aberta: começa no UnreadCount da página e zera após o MarkAsRead. */
    unreadCount = 0;
    seenMessageIds = new Set();
    names = new Map();
    /** Mensagem própria não recarrega nem marca como lida: o envio já atualiza a lista. */
    onMessageCreated = payload => {
      this.controller.getPresence().clearTyping(payload.ConversationId, payload.SenderId);
      if (payload.ConversationId !== this.conversationId || payload.SenderId === this.getMyId()) {
        return;
      }
      this.unreadCount += 1;
      if (this.isNearBottom()) {
        this.scrollPending = true;
      }
      void this.reloadMessages();
      void this.markAsReadIfVisible();
    };
    onReconnected = () => {
      if (this.conversationId) {
        this.refreshMessages();
        void this.loadUnread(this.conversationId);
      }
    };
    onVisibilityChange = () => {
      void this.markAsReadIfVisible();
    };
    constructor(controller) {
      this.controller = controller;
    }
    init() {
      const realtime = this.controller.getRealtime();
      realtime.on("message.created", this.onMessageCreated);
      realtime.on("reconnected", this.onReconnected);
      this.unsubscribePresence = this.controller.getPresence().onPresenceChange(() => void this.updateSubtitle());
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    }
    destroy() {
      const realtime = this.controller.getRealtime();
      realtime.off("message.created", this.onMessageCreated);
      realtime.off("reconnected", this.onReconnected);
      this.unsubscribePresence?.();
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }
    open(conversationId) {
      if (conversationId === this.conversationId) {
        return;
      }
      this.conversationId = conversationId;
      this.memberIds = [];
      this.unreadCount = 0;
      this.seenMessageIds.clear();
      this.isFirstRender = true;
      this.scrollPending = true;
      const ui = this.controller.getUiModel();
      ui.setProperty("/conversationId", conversationId);
      ui.setProperty("/subtitle", "");
      ui.setProperty("/subtitleOnline", false);
      this.controller.byId("messagesPage").bindElement({
        path: `/Conversations(${conversationId})`
      });
      void this.loadMembers(conversationId);
      void this.loadUnread(conversationId);
    }
    close() {
      this.conversationId = "";
      this.memberIds = [];
      this.controller.getUiModel().setProperty("/conversationId", "");
      this.controller.byId("messagesPage").unbindElement();
    }
    onBack = () => this.controller.navTo("chat");
    scrollOnNextUpdate() {
      this.scrollPending = true;
    }
    refreshMessages() {
      this.scrollPending = true;
      void this.reloadMessages();
    }

    /** Roda a cada renderização: separador de dia, agrupamento por autor, animação e rolagem. */
    onUpdateFinished = event => {
      const items = this.getList().getItems();
      const isGrowing = event.getParameter("reason") === "Growing";
      items.forEach((item, index) => this.decorate(item, items[index + 1], !this.isFirstRender && !isGrowing));
      if (items.length) {
        this.isFirstRender = false;
      }
      if (this.scrollPending && !isGrowing) {
        this.scrollPending = false;
        window.setTimeout(() => this.scrollToEnd(), 0);
      }
    };
    decorate(item, older, animate) {
      const message = item.getBindingContext()?.getObject();
      const previous = older?.getBindingContext()?.getObject();
      if (!message) {
        return;
      }
      const startsDay = !previous || !formatter.sameDay(message.createdAt, previous.createdAt);
      const separator = item.getContent()[0].getItems()[0];
      separator.setVisible(startsDay);
      separator.setText(formatter.dayLabel(message.createdAt));
      const accentClass = `rsAccent${formatter.accentIndex(message.Sender?.ID)}`;
      ACCENT_CLASSES.forEach(cssClass => item.toggleStyleClass(cssClass, cssClass === accentClass));
      item.toggleStyleClass("rsGrouped", !startsDay && previous?.Sender?.ID === message.Sender?.ID);
      if (animate && !this.seenMessageIds.has(message.ID)) {
        item.addStyleClass("rsNew");
        window.setTimeout(() => item.removeStyleClass("rsNew"), NEW_MESSAGE_ANIMATION_MS);
      }
      this.seenMessageIds.add(message.ID);
    }
    scrollToEnd() {
      const scroller = this.controller.byId("messageScroll");
      const dom = scroller.getDomRef();
      if (dom) {
        scroller.scrollTo(0, dom.scrollHeight, 0);
      }
    }
    getList() {
      return this.controller.byId("messageList");
    }
    getBinding() {
      return this.getList().getBinding("items");
    }
    getMyId() {
      return this.controller.getSessionModel().getProperty("/user/ID");
    }
    isNearBottom() {
      const dom = this.controller.byId("messageScroll").getDomRef();
      return !dom || dom.scrollHeight - dom.scrollTop - dom.clientHeight < NEAR_BOTTOM_PX;
    }

    /** Com header context o side effect recarrega a lista (traz itens novos); sem binding, cai no refresh. */
    async reloadMessages() {
      const binding = this.getBinding();
      const header = binding?.getHeaderContext();
      try {
        if (header) {
          await header.requestSideEffects([""]);
        } else {
          binding?.refresh();
        }
      } catch (error) {
        if (isUnauthorized(error)) {
          await this.controller.handleError(error, "messagesError");
        }
      }
    }

    /** Lê UnreadCount do contexto da página; sem contexto (ou falha) assume uma não lida para não perder a marcação. */
    async loadUnread(conversationId) {
      const context = this.controller.byId("messagesPage").getBindingContext();
      let unread = 1;
      try {
        unread = context ? (await context.requestProperty("UnreadCount")) ?? 0 : 1;
      } catch {
        // sem contagem: a próxima mensagem recebida volta a marcar como lida
      }
      if (conversationId === this.conversationId) {
        this.unreadCount = Math.max(this.unreadCount, unread);
        await this.markAsReadIfVisible();
      }
    }

    /** MarkAsRead só quando a conversa aberta tem não lidas e a aba está visível. */
    async markAsReadIfVisible() {
      const id = this.conversationId;
      if (!id || this.unreadCount <= 0 || document.visibilityState !== "visible") {
        return;
      }
      const pending = this.unreadCount;
      this.unreadCount = 0;
      try {
        await this.controller.getChatService().markAsRead(id);
      } catch (error) {
        if (id === this.conversationId) {
          this.unreadCount = pending;
        }
        if (isUnauthorized(error)) {
          await this.controller.handleError(error, "markReadError");
        }
      }
    }
    async loadMembers(conversationId) {
      const binding = this.controller.getODataModel().bindList(`/Conversations(${conversationId})/Members`, undefined, undefined, undefined, {
        $select: "User_ID"
      });
      let memberIds = [];
      try {
        const contexts = await binding.requestContexts(0, MEMBERS_LIMIT);
        memberIds = contexts.map(context => context.getProperty("User_ID"));
      } catch {
        memberIds = [];
      } finally {
        binding.destroy();
      }
      if (conversationId === this.conversationId) {
        this.memberIds = memberIds;
        void this.updateSubtitle();
      }
    }
    async updateSubtitle() {
      const id = this.conversationId;
      if (!id) {
        return;
      }
      const presence = this.controller.getPresence();
      const typingIds = presence.getTypingUserIds(id);
      const ui = this.controller.getUiModel();
      if (typingIds.length) {
        const label = await this.typingLabel(typingIds);
        if (id === this.conversationId) {
          ui.setProperty("/typingLabel", label);
          ui.setProperty("/isTyping", true);
        }
        return;
      }
      const myId = this.getMyId();
      const online = this.memberIds.filter(userId => userId !== myId && presence.isOnline(userId)).length;
      ui.setProperty("/isTyping", false);
      ui.setProperty("/subtitleOnline", online > 0);
      ui.setProperty("/subtitle", online ? this.controller.getText("subtitleOnline", [online]) : "");
    }
    async typingLabel(userIds) {
      if (userIds.length > 2) {
        return this.controller.getText("typingMany");
      }
      const names = await Promise.all(userIds.map(userId => this.resolveName(userId)));
      return this.controller.getText(names.length === 1 ? "typingOne" : "typingTwo", names);
    }
    async resolveName(userId) {
      const cached = this.names.get(userId);
      if (cached) {
        return cached;
      }
      const binding = this.controller.getODataModel().bindContext(`/People(${userId})`, undefined, {
        $select: "DisplayName"
      });
      try {
        const person = await binding.requestObject();
        const name = person?.DisplayName ?? this.controller.getText("someone");
        this.names.set(userId, name);
        return name;
      } catch {
        return this.controller.getText("someone");
      } finally {
        binding.destroy();
      }
    }
  }
  return MessagesSection;
});
//# sourceMappingURL=MessagesSection-dbg.js.map
