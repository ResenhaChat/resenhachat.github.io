sap.ui.define(["./PeoplePicker", "../../model/formatter"], function (__PeoplePicker, __formatter) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const PeoplePicker = _interopRequireDefault(__PeoplePicker);
  const formatter = _interopRequireDefault(__formatter);
  /** Índice do botão "⋯" dentro da linha de membro (avatar, corpo, botão). */
  const MEMBER_MENU_BUTTON = 2;

  /** Membros do grupo ou canal: menu por membro (admin, remover) e diálogo "Adicionar pessoas". */
  class MembersSection {
    formatter = formatter;
    constructor(controller) {
      this.controller = controller;
    }
    destroy() {
      this.picker?.destroy();
      this.dialog?.destroy();
    }

    /** Mostra o "⋯" só nas linhas em que há alguma ação para mim (papel do painel + papel do membro). */
    onMembersUpdated = () => {
      const myRole = this.myRole();
      const myId = this.controller.getMyId();
      this.controller.byId("membersList").getItems().forEach(item => {
        const context = item.getBindingContext();
        if (context) {
          const row = item.getContent()[0];
          const button = row.getItems()[MEMBER_MENU_BUTTON];
          button.setVisible(formatter.canManageMember(myRole, context.getProperty("Role"), context.getProperty("User_ID"), myId));
        }
      });
    };

    /** Antes de abrir, o menu mostra só as ações permitidas para o meu papel e para o papel do membro. */
    onOpenMemberMenu = event => {
      const button = event.getSource();
      const context = button.getBindingContext();
      if (!context) {
        return;
      }
      const menu = this.controller.byId("memberMenu");
      menu.setBindingContext(context);
      this.configureMenu(context);
      menu.openBy(button);
    };
    onToggleAdmin = event => {
      void this.toggleAdmin(this.contextOf(event));
    };
    onRemove = event => {
      void this.remove(this.contextOf(event));
    };
    onAddPeople = async () => {
      try {
        const dialog = await this.getDialog();
        this.getState().setData({
          term: "",
          selected: []
        });
        this.picker?.apply();
        dialog.open();
      } catch (error) {
        await this.controller.handleError(error, "peopleError");
      }
    };
    onSearch = event => {
      this.picker?.onSearch(event);
    };

    /** Marcar ou desmarcar uma pessoa na lista (seleção múltipla). */
    onSelectionChange = event => {
      this.picker?.toggleItem(event.getParameter("listItem"));
    };
    onConfirmAdd = async () => {
      const dialog = this.dialog;
      const userIds = this.picker?.selectedIds() ?? [];
      if (!userIds.length) {
        dialog?.close();
        return;
      }
      try {
        dialog?.setBusy(true);
        await this.controller.getChatService().addMembers(this.controller.getOpenConversationId(), userIds);
        dialog?.close();
        this.controller.showToast("membersAdded");
        void this.controller.messages.refreshConversation();
      } catch (error) {
        await this.controller.handleError(error, "membersError");
      } finally {
        dialog?.setBusy(false);
      }
    };
    onCancelAdd = () => {
      this.dialog?.close();
    };
    configureMenu(context) {
      const role = context.getProperty("Role");
      const isMe = context.getProperty("User_ID") === this.controller.getMyId();
      this.controller.byId("memberPromote").setVisible(formatter.canToggleAdmin(this.myRole(), role, isMe));
      this.controller.byId("memberRemove").setVisible(formatter.canRemoveMember(this.myRole(), role, isMe));
    }
    async toggleAdmin(context) {
      const role = context.getProperty("Role") === "Admin" ? "Member" : "Admin";
      try {
        await this.controller.getChatService().setMemberRole(this.controller.getOpenConversationId(), context.getProperty("User_ID"), role);
        void this.controller.messages.refreshConversation();
      } catch (error) {
        await this.controller.handleError(error, "memberError");
      }
    }
    async remove(context) {
      const name = context.getProperty("User/DisplayName");
      if (!(await this.controller.confirm("confirmRemoveMember", [name]))) {
        return;
      }
      try {
        await this.controller.getChatService().removeMember(this.controller.getOpenConversationId(), context.getProperty("User_ID"));
        void this.controller.messages.refreshConversation();
      } catch (error) {
        await this.controller.handleError(error, "memberError");
      }
    }

    /** Quem já é membro não aparece na busca de "Adicionar pessoas". */
    currentMemberIds() {
      return this.controller.byId("membersList").getItems().map(item => item.getBindingContext()?.getProperty("User_ID")).filter(Boolean);
    }

    /** Papel na conversa aberta: vem do próprio contexto do painel (MyRole), sem cópia em JSON. */
    myRole() {
      return this.controller.byId("detailsPanel").getBindingContext()?.getProperty("MyRole");
    }
    contextOf(event) {
      return event.getSource().getBindingContext();
    }
    getState() {
      return this.dialog?.getModel("compose");
    }
    async getDialog() {
      if (!this.dialog) {
        this.dialog = await this.controller.loadDialog("AddMembersDialog", this, {
          term: "",
          selected: []
        });
        this.picker = new PeoplePicker(this.controller, this.controller.getFragmentControl("addMembersList"), this.getState(), () => this.currentMemberIds());
      }
      return this.dialog;
    }
  }
  return MembersSection;
});
//# sourceMappingURL=MembersSection-dbg.js.map
