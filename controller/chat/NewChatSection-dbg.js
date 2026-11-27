sap.ui.define(["../../model/formatter", "./PeoplePicker"], function (__formatter, __PeoplePicker) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const formatter = _interopRequireDefault(__formatter);
  const PeoplePicker = _interopRequireDefault(__PeoplePicker);
  /** Botão "+" da sidebar (nova conversa, grupo, canal, explorar) e o diálogo de conversa direta. */
  class NewChatSection {
    formatter = formatter;
    constructor(controller) {
      this.controller = controller;
    }
    destroy() {
      this.picker?.destroy();
      this.dialog?.destroy();
    }
    onOpenMenu = event => {
      this.controller.byId("newChatMenu").openBy(event.getSource());
    };
    onNewDirect = () => {
      void this.openDirect();
    };
    onNewGroup = () => {
      void this.controller.newConversation.open("Group");
    };
    onNewChannel = () => {
      void this.controller.newConversation.open("Channel");
    };
    onExplore = () => {
      void this.controller.explore.open();
    };
    onSearch = event => {
      this.picker?.onSearch(event);
    };

    /** Clicar numa pessoa inicia a conversa direta com ela. */
    onPick = event => {
      const person = event.getSource().getBindingContext()?.getObject();
      if (person) {
        void this.startDirect(person.ID);
      }
    };
    onClose = () => {
      this.dialog?.close();
    };
    async openDirect() {
      try {
        const dialog = await this.getDialog();
        this.picker?.reset();
        dialog.open();
      } catch (error) {
        await this.controller.handleError(error, "peopleError");
      }
    }
    async startDirect(userId) {
      const dialog = this.dialog;
      try {
        dialog?.setBusy(true);
        const id = await this.controller.getChatService().startDirect(userId);
        dialog?.close();
        this.controller.conversations.refresh();
        this.controller.navTo("conversation", {
          id
        });
        this.controller.showToast("directStarted");
      } catch (error) {
        await this.controller.handleError(error, "newChatError");
      } finally {
        dialog?.setBusy(false);
      }
    }
    async getDialog() {
      this.dialog ??= await this.controller.loadDialog("NewDirectDialog", this, {
        term: "",
        selected: []
      });
      this.picker ??= new PeoplePicker(this.controller, this.controller.getFragmentControl("newDirectList"), this.dialog.getModel("compose"));
      return this.dialog;
    }
  }
  return NewChatSection;
});
//# sourceMappingURL=NewChatSection-dbg.js.map
