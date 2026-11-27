sap.ui.define(["../../util/errors"], function (____util_errors) {
  "use strict";

  const isUnauthorized = ____util_errors["isUnauthorized"];
  const CONVERSATION_GROUP = "conversation";

  /** UI5 aceita null para limpar o contexto de binding, mas a tipagem de setBindingContext não o declara. */
  const NO_CONTEXT = null;

  /**
   * Painel de detalhes da conversa aberta (coluna à direita no desktop, tela cheia no celular).
   * Compartilha o contexto de /Conversations(<id>) do cabeçalho (MessagesSection), que é quem recarrega
   * a conversa em conversation.updated e members.changed. Edição no update group "conversation".
   * O rodapé usa a minha linha de Members (update group "membership") via contexto próprio.
   */
  class DetailsSection {
    constructor(controller) {
      this.controller = controller;
    }
    destroy() {
      this.close();
    }
    onOpen = () => {
      void this.open();
    };
    onClose = () => {
      this.close();
    };

    /** Troca de conversa com o painel aberto: o painel acompanha a nova conversa. */
    onConversationOpened() {
      if (this.isOpen()) {
        void this.open();
      }
    }
    onFieldChange = () => {
      this.controller.getUiModel().setProperty("/detailsDirty", this.controller.getODataModel().hasPendingChanges(CONVERSATION_GROUP));
    };
    onSave = async () => {
      const model = this.controller.getODataModel();
      try {
        await model.submitBatch(CONVERSATION_GROUP);
        if (model.hasPendingChanges(CONVERSATION_GROUP)) {
          throw new Error(this.controller.getText("conversationSaveError"));
        }
        this.onFieldChange();
        this.controller.showToast("conversationSaved");
        this.controller.conversations.refresh();
      } catch (error) {
        await this.controller.handleError(error, "conversationSaveError");
      }
    };
    onCancel = () => {
      this.controller.getODataModel().resetChanges(CONVERSATION_GROUP);
      this.onFieldChange();
    };
    onToggleArchive = () => {
      if (this.membership) {
        void this.controller.actions.toggleArchive(this.membership);
      }
    };

    /** Sair do grupo ou canal (o Geral e o Direct não têm essa ação). */
    onLeave = async () => {
      const conversationId = this.controller.getOpenConversationId();
      if (!conversationId || !(await this.controller.confirm("confirmLeave"))) {
        return;
      }
      try {
        await this.controller.getChatService().leaveConversation(conversationId);
        this.close();
        this.controller.showToast("leftConversation");
        this.controller.conversations.refresh();
        this.controller.navTo("chat", {}, true);
      } catch (error) {
        await this.controller.handleError(error, "leaveError");
      }
    };
    async open() {
      const conversationId = this.controller.getOpenConversationId();
      const context = this.controller.byId("messagesPage").getBindingContext();
      if (!conversationId || !context) {
        return;
      }
      this.resetPendingChanges();
      this.releaseMembership();
      this.controller.getUiModel().setProperty("/detailsOpen", true);
      this.getPanel().setBindingContext(context);
      this.onFieldChange();
      try {
        const peerId = await context.requestProperty("DirectPeer_ID");
        if (!this.isStillOpen(conversationId)) {
          return;
        }
        this.bindPeer(peerId);
        await this.loadMembership(conversationId);
      } catch (error) {
        if (isUnauthorized(error)) {
          await this.controller.handleError(error, "conversationsError");
        }
      }
    }

    /** Minha linha de Members; se a conversa mudou enquanto eu esperava, a linha é descartada. */
    async loadMembership(conversationId) {
      const membership = await this.controller.getChatService().findMyMembership(conversationId, this.controller.getMyId());
      if (!this.isStillOpen(conversationId)) {
        membership?.getBinding().destroy();
        return;
      }
      this.membership = membership;
      this.controller.byId("detailsFooter").setBindingContext(membership ?? NO_CONTEXT);
    }
    close() {
      this.resetPendingChanges();
      this.controller.getUiModel().setProperty("/detailsOpen", false);
      this.getPanel().setBindingContext(NO_CONTEXT);
      this.bindPeer(null);
      this.releaseMembership();
      this.onFieldChange();
    }
    resetPendingChanges() {
      const model = this.controller.getODataModel();
      if (model.hasPendingChanges(CONVERSATION_GROUP)) {
        model.resetChanges(CONVERSATION_GROUP);
      }
    }

    /** Em Direct, o painel mostra o perfil da outra pessoa (People), não a lista de membros. */
    bindPeer(peerId) {
      const peerBox = this.controller.byId("detailsPeer");
      if (peerId) {
        peerBox.bindElement({
          path: `/People(${peerId})`,
          parameters: {
            $select: "ID,DisplayName,Username,About,LastSeenAt"
          }
        });
      } else {
        peerBox.unbindElement();
      }
    }
    releaseMembership() {
      this.controller.byId("detailsFooter").setBindingContext(NO_CONTEXT);
      this.membership?.getBinding().destroy();
      this.membership = undefined;
    }
    isStillOpen(conversationId) {
      return this.isOpen() && this.controller.getOpenConversationId() === conversationId;
    }
    isOpen() {
      return this.controller.getUiModel().getProperty("/detailsOpen") === true;
    }
    getPanel() {
      return this.controller.byId("detailsPanel");
    }
  }
  return DetailsSection;
});
//# sourceMappingURL=DetailsSection-dbg.js.map
