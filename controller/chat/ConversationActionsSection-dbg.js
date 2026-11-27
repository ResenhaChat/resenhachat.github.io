sap.ui.define(["../../service/ChatService"], function (____service_ChatService) {
  "use strict";

  const MEMBERSHIP_GROUP = ____service_ChatService["MEMBERSHIP_GROUP"];
  const HOUR_MS = 3_600_000;
  const WEEK_MS = 7 * 24 * HOUR_MS;
  const MUTED_FOREVER = "9999-12-31T23:59:59Z";
  function mutedUntil(duration) {
    if (duration === "forever") {
      return MUTED_FOREVER;
    }
    return new Date(Date.now() + (duration === "8h" ? 8 * HOUR_MS : WEEK_MS)).toISOString();
  }

  /**
   * Fixar, silenciar e arquivar a conversa: PATCH na minha linha de Members (update group "membership").
   * O menu "⋯" da lista e o rodapé do painel de detalhes usam estes mesmos métodos.
   */
  class ConversationActionsSection {
    constructor(controller) {
      this.controller = controller;
    }

    /** O menu recebe o contexto da linha do botão; os itens herdam esse contexto. */
    onOpenRowMenu = event => {
      const button = event.getSource();
      const menu = this.controller.byId("rowMenu");
      menu.setBindingContext(button.getBindingContext());
      menu.openBy(button);
    };

    /** Botão "Silenciar" do rodapé do painel: só as opções de silenciar (ou reativar). */
    onOpenMuteMenu = event => {
      const button = event.getSource();
      const menu = this.controller.byId("muteMenu");
      menu.setBindingContext(button.getBindingContext());
      menu.openBy(button);
    };
    onTogglePin = event => {
      void this.togglePin(this.contextOf(event));
    };
    onMute = event => {
      void this.mute(this.contextOf(event), event.getSource().data("duration"));
    };
    onUnmute = event => {
      void this.unmute(this.contextOf(event));
    };
    onToggleArchive = event => {
      void this.toggleArchive(this.contextOf(event));
    };
    togglePin(context) {
      return this.patch(context, "IsPinned", !context.getProperty("IsPinned"));
    }
    mute(context, duration) {
      return this.patch(context, "MutedUntil", mutedUntil(duration));
    }
    unmute(context) {
      return this.patch(context, "MutedUntil", null);
    }
    toggleArchive(context) {
      return this.patch(context, "IsArchived", !context.getProperty("IsArchived"));
    }
    async patch(context, property, value) {
      const model = this.controller.getODataModel();
      try {
        const patch = context.setProperty(property, value, MEMBERSHIP_GROUP);
        await Promise.all([patch, model.submitBatch(MEMBERSHIP_GROUP)]);
        this.controller.conversations.refresh();
      } catch (error) {
        model.resetChanges(MEMBERSHIP_GROUP);
        await this.controller.handleError(error, "conversationActionError");
      }
    }
    contextOf(event) {
      return event.getSource().getBindingContext();
    }
  }
  return ConversationActionsSection;
});
//# sourceMappingURL=ConversationActionsSection-dbg.js.map
