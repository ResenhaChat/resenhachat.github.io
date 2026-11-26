sap.ui.define(["sap/ui/Device"], function (Device) {
  "use strict";

  /** Campo de mensagem: Enter envia, Shift+Enter quebra linha, "digitando…" e rascunho por conversa. */
  class ComposerSection {
    currentConversationId = "";
    constructor(controller) {
      this.controller = controller;
    }
    init() {
      this.getInput().addEventDelegate({
        onsapenter: event => {
          if (!Device.system.phone && !this.isComposing(event)) {
            event.preventDefault();
            void this.onSend();
          }
        }
      });
    }

    /** Guarda o rascunho da conversa atual e carrega o da nova. */
    switchTo(conversationId) {
      const ui = this.controller.getUiModel();
      if (this.currentConversationId) {
        ui.setProperty(`/drafts/${this.currentConversationId}`, ui.getProperty("/draft"));
      }
      this.currentConversationId = conversationId;
      ui.setProperty("/draft", ui.getProperty(`/drafts/${conversationId}`) ?? "");
    }
    onLiveChange = () => {
      const draft = this.controller.getUiModel().getProperty("/draft");
      if (draft.trim() && this.currentConversationId) {
        this.controller.getRealtime().sendTyping(this.currentConversationId);
      }
    };
    onSend = async () => {
      const ui = this.controller.getUiModel();
      const text = ui.getProperty("/draft").trim();
      const conversationId = this.currentConversationId;
      if (!text || !conversationId || ui.getProperty("/sending") === true) {
        return;
      }
      ui.setProperty("/sending", true);
      try {
        await this.controller.getChatService().sendMessage(conversationId, text);
        ui.setProperty("/draft", "");
        this.controller.messages.refreshMessages();
        this.controller.conversations.refresh();
      } catch (error) {
        await this.controller.handleError(error, "sendError");
      } finally {
        ui.setProperty("/sending", false);
        this.getInput().focus();
      }
    };

    /** Enter durante a composição de IME (acentos, CJK) confirma a escolha e não envia. */
    isComposing(event) {
      return event.originalEvent?.isComposing === true;
    }
    getInput() {
      return this.controller.byId("composerInput");
    }
  }
  return ComposerSection;
});
//# sourceMappingURL=ComposerSection-dbg.js.map
