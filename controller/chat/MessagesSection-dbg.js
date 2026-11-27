sap.ui.define(["../../model/formatter", "../../util/errors"], function (__formatter, ____util_errors) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const formatter = _interopRequireDefault(__formatter);
  const isNotFound = ____util_errors["isNotFound"];
  const isUnauthorized = ____util_errors["isUnauthorized"];
  const NEW_MESSAGE_ANIMATION_MS = 400;
  const ACCENT_CLASSES = Array.from({
    length: 10
  }, (_, index) => `rsAccent${index + 1}`);
  const MEMBERS_LIMIT = 500;
  const NEAR_BOTTOM_PX = 80;
  const CONVERSATION_GROUP = "conversation";

  /**
   * Cabeçalho + lista de mensagens da conversa aberta (/Conversations(<id>)/Messages).
   * Dono do contexto /Conversations(<id>) que o painel de detalhes compartilha: é aqui que a conversa é relida.
   */
  class MessagesSection {
    conversationId = "";
    scrollPending = false;
    isFirstRender = true;
    memberIds = [];

    /** Fatos do cabeçalho (Kind, par do Direct, nº de membros) lidos da própria página da conversa. */
    kind = "";
    peerId = null;
    memberCount = null;

    /** Não lidas da conversa aberta: começa no UnreadCount da página e zera após o MarkAsRead. */
    unreadCount = 0;
    seenMessageIds = new Set();
    names = new Map();
    /** Mensagem própria não recarrega nem marca como lida: o envio já atualiza a lista. */
    onMessageCreated = payload => {
      if (payload.SenderId) {
        this.controller.getPresence().clearTyping(payload.ConversationId, payload.SenderId);
      }
      if (payload.ConversationId !== this.conversationId || payload.SenderId === this.controller.getMyId()) {
        return;
      }
      this.unreadCount += 1;
      if (this.isNearBottom()) {
        this.scrollPending = true;
      }
      void this.reloadMessages();
      void this.markAsReadIfVisible();
    };

    /** Só quem está na conversa aberta importa: membro relê os balões; o par do Direct relê também o cabeçalho. Sem rolar. */
    onUserUpdated = payload => {
      if (this.hasMember(payload.UserId)) {
        void this.reloadMessages();
      }
      if (payload.UserId === this.peerId) {
        void this.refreshConversation();
      }
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

    /** Título, membros ou papel mudaram: relê a conversa aberta (uma vez só, aqui). */
    onConversationChanged = payload => {
      if (payload.ConversationId === this.conversationId) {
        void this.refreshConversation();
      }
    };
    constructor(controller) {
      this.controller = controller;
    }
    init() {
      const realtime = this.controller.getRealtime();
      realtime.on("message.created", this.onMessageCreated);
      realtime.on("reconnected", this.onReconnected);
      realtime.on("conversation.updated", this.onConversationChanged);
      realtime.on("members.changed", this.onConversationChanged);
      realtime.on("user.updated", this.onUserUpdated);
      this.unsubscribePresence = this.controller.getPresence().onPresenceChange(() => void this.updateSubtitle());
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    }
    destroy() {
      const realtime = this.controller.getRealtime();
      realtime.off("message.created", this.onMessageCreated);
      realtime.off("reconnected", this.onReconnected);
      realtime.off("conversation.updated", this.onConversationChanged);
      realtime.off("members.changed", this.onConversationChanged);
      realtime.off("user.updated", this.onUserUpdated);
      this.unsubscribePresence?.();
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }
    open(conversationId) {
      if (conversationId === this.conversationId) {
        return;
      }
      this.conversationId = conversationId;
      this.memberIds = [];
      this.kind = "";
      this.peerId = null;
      this.memberCount = null;
      this.unreadCount = 0;
      this.seenMessageIds.clear();
      this.isFirstRender = true;
      this.scrollPending = true;
      const ui = this.controller.getUiModel();
      ui.setProperty("/conversationId", conversationId);
      ui.setProperty("/subtitle", "");
      ui.setProperty("/subtitleOnline", false);
      this.controller.byId("messagesPage").bindElement({
        path: `/Conversations(${conversationId})`,
        parameters: {
          $$updateGroupId: CONVERSATION_GROUP
        }
      });
      this.refreshHeader();
      void this.loadUnread(conversationId);
    }

    /** Membro da conversa aberta (lista carregada no cabeçalho): decide se uma mudança de pessoa afeta os balões. */
    hasMember(userId) {
      return this.memberIds.includes(userId);
    }
    close() {
      this.conversationId = "";
      this.memberIds = [];
      this.controller.getUiModel().setProperty("/conversationId", "");
      this.controller.byId("messagesPage").unbindElement();
    }

    /** Relê Kind, par do Direct, nº de membros e os membros (para o online) da conversa aberta. */
    refreshHeader() {
      const id = this.conversationId;
      if (id) {
        void this.loadHeader(id);
        void this.loadMembers(id);
      }
    }

    /**
     * Recarrega a conversa aberta uma vez (contexto compartilhado com o painel) e confere MyRole:
     * se não há MyRole ou o servidor responde 404, eu saí ou fui removido e a conversa fecha.
     */
    async refreshConversation() {
      const context = this.controller.byId("messagesPage").getBindingContext();
      if (!this.conversationId || !context) {
        return;
      }
      try {
        if (!this.controller.getODataModel().hasPendingChanges(CONVERSATION_GROUP)) {
          await this.controller.byId("messagesPage").getElementBinding().requestRefresh();
        }
        if (!(await context.requestProperty("MyRole"))) {
          this.leaveConversation();
          return;
        }
        this.refreshHeader();
      } catch (error) {
        if (isNotFound(error)) {
          this.leaveConversation();
        } else if (isUnauthorized(error)) {
          await this.controller.handleError(error, "conversationsError");
        }
      }
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
    leaveConversation() {
      this.controller.showToast("removedFromConversation");
      this.controller.conversations.refresh();
      this.controller.navTo("chat", {}, true);
    }
    decorate(item, older, animate) {
      const message = item.getBindingContext()?.getObject();
      const previous = older?.getBindingContext()?.getObject();
      if (!message) {
        return;
      }
      const isSystem = message.Kind === "System";
      const startsDay = !previous || !formatter.sameDay(message.createdAt, previous.createdAt);
      const separator = item.getContent()[0].getItems()[0];
      separator.setVisible(startsDay);
      separator.setText(formatter.dayLabel(message.createdAt));
      const accentClass = `rsAccent${formatter.accentIndex(message.Sender?.ID)}`;
      ACCENT_CLASSES.forEach(cssClass => item.toggleStyleClass(cssClass, !isSystem && cssClass === accentClass));
      item.toggleStyleClass("rsGrouped", !isSystem && !startsDay && previous?.Sender?.ID === message.Sender?.ID);
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
          // "$auto" explícito: sem ele o pedido herda o update group "conversation" (deferred) da página e fica preso
          // até um submitBatch que nunca vem.
          await header.requestSideEffects([""], "$auto");
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
      const status = this.statusLine();
      ui.setProperty("/isTyping", false);
      ui.setProperty("/subtitleOnline", status.online);
      ui.setProperty("/subtitle", status.text);
    }

    /** Direct: online ou visto por último da outra pessoa. Grupo e canal: nº de membros e quantos estão online. */
    statusLine() {
      const presence = this.controller.getPresence();
      if (formatter.isDirect(this.kind) && this.peerId) {
        const isOnline = presence.isOnline(this.peerId);
        return {
          text: formatter.directStatus(isOnline, presence.getLastSeen(this.peerId) ?? null),
          online: isOnline
        };
      }
      if (this.memberCount === null) {
        return {
          text: "",
          online: false
        };
      }
      const myId = this.controller.getMyId();
      const online = this.memberIds.filter(userId => userId !== myId && presence.isOnline(userId)).length;
      return {
        text: formatter.memberSummary(this.memberCount, online),
        online: online > 0
      };
    }

    /** Kind, par do Direct e nº de membros vêm da própria página da conversa (sem request extra). */
    async loadHeader(conversationId) {
      const context = this.controller.byId("messagesPage").getBindingContext();
      if (!context) {
        return;
      }
      try {
        const [kind, peerId, memberCount] = await context.requestProperty(["Kind", "DirectPeer_ID", "MemberCount"]);
        if (conversationId === this.conversationId) {
          this.kind = kind;
          this.peerId = peerId;
          this.memberCount = memberCount;
          void this.loadPeerLastSeen(conversationId);
          void this.updateSubtitle();
        }
      } catch (error) {
        if (isUnauthorized(error)) {
          await this.controller.handleError(error, "conversationsError");
        }
      }
    }

    /** "Visto por último" do Direct vem de /People; o presence.changed mantém o valor atualizado depois. */
    async loadPeerLastSeen(conversationId) {
      const peerId = this.peerId;
      if (!peerId || !formatter.isDirect(this.kind)) {
        return;
      }
      const binding = this.controller.getODataModel().bindContext(`/People(${peerId})`, undefined, {
        $select: "LastSeenAt"
      });
      try {
        const person = await binding.requestObject();
        this.controller.getPresence().rememberLastSeen(peerId, person?.LastSeenAt);
      } catch (error) {
        if (isUnauthorized(error)) {
          await this.controller.handleError(error, "conversationsError");
        }
      } finally {
        binding.destroy();
      }
      if (conversationId === this.conversationId) {
        void this.updateSubtitle();
      }
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
