sap.ui.define(["../../model/formatter", "../../util/errors", "../../util/mediaTools"], function (__formatter, ____util_errors, ____util_mediaTools) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const formatter = _interopRequireDefault(__formatter);
  const isUnauthorized = ____util_errors["isUnauthorized"];
  const pickAvatar = ____util_mediaTools["pickAvatar"];
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
    /** ID da pessoa do par que o painel mostra agora (Direct); null fora de Direct. */
    boundPeerId = null;
    constructor(controller) {
      this.controller = controller;
    }
    init() {
      this.controller.getRealtime().on("user.updated", this.onUserUpdated);
    }
    destroy() {
      this.controller.getRealtime().off("user.updated", this.onUserUpdated);
      this.close();
    }
    onOpen = () => {
      void this.open();
    };

    /** Foto do grupo: o menu só abre para dono e admin; "Remover" só aparece quando há foto. */
    onAvatarPress = event => {
      const context = this.getPanel().getBindingContext();
      const role = context?.getProperty("MyRole");
      const kind = context?.getProperty("Kind");
      if (!formatter.canEditGroupPhoto(role, kind)) {
        return;
      }
      this.controller.byId("groupPhotoRemove").setVisible(!!context?.getProperty("AvatarMimeType"));
      this.controller.byId("groupAvatarMenu").openBy(event.getSource());
    };
    onChangeGroupPhoto = async () => {
      const photo = await pickAvatar();
      if (photo) {
        await this.saveGroupPhoto(() => this.controller.getAppComponent().getMediaService().putAvatar(this.ownerPath(), photo));
      }
    };
    onRemoveGroupPhoto = async () => {
      if (await this.controller.confirm("confirmRemovePhoto")) {
        await this.saveGroupPhoto(() => this.controller.getAppComponent().getMediaService().deleteAvatar(this.ownerPath()));
      }
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

    /** Pessoa mudou de perfil ou foto: relê o par só se for o par aberto e a lista de membros só se ela estiver nela. */
    onUserUpdated = payload => {
      if (!this.isOpen()) {
        return;
      }
      if (payload.UserId === this.boundPeerId) {
        this.controller.refreshElementBinding(this.controller.byId("detailsPeer"));
      }
      if (this.controller.messages.hasMember(payload.UserId)) {
        this.controller.byId("membersList").getBinding("items")?.refresh();
      }
    };
    ownerPath() {
      return `Conversations(${this.controller.getOpenConversationId()})`;
    }
    async saveGroupPhoto(action) {
      try {
        await action();
        this.controller.showToast("photoSaved");
        await this.controller.messages.refreshConversation();
      } catch (error) {
        await this.controller.handleError(error, "photoError");
      }
    }
    async open() {
      const conversationId = this.controller.getOpenConversationId();
      const context = this.controller.byId("messagesPage").getBindingContext();
      if (!conversationId || !context) {
        return;
      }
      this.resetPendingChanges();
      this.releaseMembership();
      this.bindPeer(null);
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
      this.boundPeerId = peerId;
      if (peerId) {
        peerBox.bindElement({
          path: `/People(${peerId})`,
          parameters: {
            $select: "ID,DisplayName,Username,About,LastSeenAt,AvatarMimeType,AvatarVersion"
          }
        });
        return;
      }

      // Contexto null explícito: sem ele o bloco herdaria /Conversations e pediria DisplayName etc. lá,
      // o que derruba o batch (membros e rodapé não carregam).
      peerBox.unbindElement();
      peerBox.setBindingContext(NO_CONTEXT);
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
