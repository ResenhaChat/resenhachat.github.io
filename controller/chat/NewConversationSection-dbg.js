sap.ui.define(["sap/ui/core/library", "../../model/formatter", "./PeoplePicker"], function (sap_ui_core_library, __formatter, __PeoplePicker) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const ValueState = sap_ui_core_library["ValueState"];
  const formatter = _interopRequireDefault(__formatter);
  const PeoplePicker = _interopRequireDefault(__PeoplePicker);
  const EMPTY_STATE = {
    kind: "Group",
    name: "",
    description: "",
    isPublic: true,
    onlyAdminsCanPost: false,
    term: "",
    selected: []
  };

  /** Diálogo de novo grupo ou novo canal (mesmo layout, o Kind muda os campos). */
  class NewConversationSection {
    formatter = formatter;
    constructor(controller) {
      this.controller = controller;
    }
    destroy() {
      this.picker?.destroy();
      this.dialog?.destroy();
    }
    open = async kind => {
      try {
        const dialog = await this.getDialog();
        this.getState().setData({
          ...EMPTY_STATE,
          selected: [],
          kind
        });
        this.getNameInput().setValueState(ValueState.None);
        this.picker?.apply();
        dialog.open();
      } catch (error) {
        await this.controller.handleError(error, "peopleError");
      }
    };
    onSearch = event => {
      this.picker?.onSearch(event);
    };

    /** Marcar ou desmarcar um item da lista (seleção múltipla) atualiza os chips. */
    onSelectionChange = event => {
      this.picker?.toggleItem(event.getParameter("listItem"));
    };

    /** Remove a pessoa pelo chip do Tokenizer. */
    onRemoveChip = event => {
      const person = event.getSource().getBindingContext("compose")?.getObject();
      if (person) {
        this.picker?.toggle(person);
      }
    };
    onNameChange = () => {
      this.getNameInput().setValueState(ValueState.None);
    };
    onSave = async () => {
      const name = this.readField("name");
      if (!name) {
        this.getNameInput().setValueState(ValueState.Error);
        this.getNameInput().setValueStateText(this.controller.getText("errorConversationName"));
        return;
      }
      const dialog = this.dialog;
      try {
        dialog?.setBusy(true);
        const id = await this.controller.getChatService().createConversation(this.buildInput(name));
        dialog?.close();
        this.controller.conversations.refresh();
        this.controller.navTo("conversation", {
          id
        });
        this.controller.showToast("conversationCreated");
      } catch (error) {
        await this.controller.handleError(error, "conversationCreateError");
      } finally {
        dialog?.setBusy(false);
      }
    };
    onCancel = () => {
      this.dialog?.close();
    };
    buildInput(name) {
      const isChannel = this.getKind() === "Channel";
      return {
        Kind: this.getKind(),
        Name: name,
        Description: this.readField("description"),
        MemberIds: this.picker?.selectedIds() ?? [],
        IsPublic: isChannel && this.getFlag("isPublic"),
        OnlyAdminsCanPost: isChannel && this.getFlag("onlyAdminsCanPost")
      };
    }
    getKind() {
      return this.getState().getProperty("/kind") === "Channel" ? "Channel" : "Group";
    }
    getFlag(path) {
      return this.getState().getProperty(`/${path}`) === true;
    }
    readField(path) {
      return (this.getState().getProperty(`/${path}`) ?? "").trim();
    }
    getState() {
      return this.dialog?.getModel("compose");
    }
    getNameInput() {
      return this.controller.getFragmentControl("conversationNameInput");
    }
    async getDialog() {
      this.dialog ??= await this.controller.loadDialog("NewConversationDialog", this, {
        ...EMPTY_STATE,
        selected: []
      });
      this.picker ??= new PeoplePicker(this.controller, this.controller.getFragmentControl("conversationPeopleList"), this.getState());
      return this.dialog;
    }
  }
  return NewConversationSection;
});
//# sourceMappingURL=NewConversationSection-dbg.js.map
