sap.ui.define(["../../model/formatter"], function (__formatter) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const formatter = _interopRequireDefault(__formatter);
  /** Canais públicos (/PublicChannels): entrar em um canal ou abri-lo se já sou membro. */
  class ExploreChannelsSection {
    formatter = formatter;
    constructor(controller) {
      this.controller = controller;
    }
    destroy() {
      this.dialog?.destroy();
    }

    /** A binding nasce suspensa; na primeira abertura ela é liberada, depois só recarrega. */
    open = async () => {
      try {
        const dialog = await this.getDialog();
        const binding = this.getBinding();
        if (binding?.isSuspended()) {
          binding.resume();
        } else {
          binding?.refresh();
        }
        dialog.open();
      } catch (error) {
        await this.controller.handleError(error, "conversationsError");
      }
    };
    onClose = () => {
      this.dialog?.close();
    };

    /** Botão da linha: "Abrir" para quem já é membro, "Entrar" para os demais. */
    onJoinOrOpen = event => {
      const context = event.getSource().getBindingContext();
      const id = context?.getProperty("ID");
      if (!id) {
        return;
      }
      if (context?.getProperty("IsMember") === true) {
        this.openConversation(id);
      } else {
        void this.join(id);
      }
    };
    async join(conversationId) {
      const dialog = this.dialog;
      try {
        dialog?.setBusy(true);
        await this.controller.getChatService().joinChannel(conversationId);
        dialog?.close();
        this.controller.conversations.refresh();
        this.openConversation(conversationId);
      } catch (error) {
        await this.controller.handleError(error, "joinChannelError");
      } finally {
        dialog?.setBusy(false);
      }
    }
    openConversation(conversationId) {
      this.dialog?.close();
      this.controller.navTo("conversation", {
        id: conversationId
      });
    }
    getBinding() {
      return this.controller.getFragmentControl("publicChannelList").getBinding("items");
    }
    async getDialog() {
      this.dialog ??= await this.controller.loadDialog("ExploreChannelsDialog", this, {});
      return this.dialog;
    }
  }
  return ExploreChannelsSection;
});
//# sourceMappingURL=ExploreChannelsSection-dbg.js.map
