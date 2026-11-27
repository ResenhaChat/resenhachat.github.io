sap.ui.define(["../../service/ChatService", "../../model/formatter", "../../util/MenuItemSync"], function (____service_ChatService, __formatter, __MenuItemSync) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const MEMBERSHIP_GROUP = ____service_ChatService["MEMBERSHIP_GROUP"];
  const formatter = _interopRequireDefault(__formatter);
  const MenuItemSync = _interopRequireDefault(__MenuItemSync);
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
    destroy() {
      this.rowMenuItems?.destroy();
      this.muteMenuItems?.destroy();
    }

    /** O menu recebe o contexto da linha do botão; os itens herdam esse contexto. */
    onOpenRowMenu = event => {
      const button = event.getSource();
      const menu = this.controller.byId("rowMenu");
      const context = button.getBindingContext();
      menu.setBindingContext(context);
      this.rowMenuItems ??= new MenuItemSync(menu);
      this.rowMenuItems.sync(item => this.isVisibleInRowMenu(item, context));
      menu.openBy(button);
    };

    /** Botão "Silenciar" do rodapé do painel: só as opções de silenciar (ou reativar). */
    onOpenMuteMenu = event => {
      const button = event.getSource();
      const menu = this.controller.byId("muteMenu");
      const context = button.getBindingContext();
      menu.setBindingContext(context);
      this.muteMenuItems ??= new MenuItemSync(menu);
      this.muteMenuItems.sync(item => this.isVisibleInMuteMenu(item, context));
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

    /** "Silenciar" só quando não está silenciada; "Reativar som" só quando está. */
    isVisibleInRowMenu(item, context) {
      const muted = formatter.isMuted(context.getProperty("MutedUntil"));
      if (item === this.controller.byId("rowMenuMute")) {
        return !muted;
      }
      return item !== this.controller.byId("rowMenuUnmute") || muted;
    }
    isVisibleInMuteMenu(item, context) {
      return item !== this.controller.byId("muteMenuUnmute") || formatter.isMuted(context.getProperty("MutedUntil"));
    }
    contextOf(event) {
      return event.getSource().getBindingContext();
    }
  }
  return ConversationActionsSection;
});
//# sourceMappingURL=ConversationActionsSection-dbg.js.map
