sap.ui.define(["sap/ui/core/Fragment", "sap/ui/core/library", "../../model/formatter", "../../util/errors"], function (Fragment, sap_ui_core_library, __formatter, ____util_errors) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const ValueState = sap_ui_core_library["ValueState"];
  const formatter = _interopRequireDefault(__formatter);
  const isUnauthorized = ____util_errors["isUnauthorized"];
  const UPDATE_GROUP = "profile";

  /** Edição do próprio perfil: /Me(<id>) two-way no update group "profile". */
  class ProfileSection {
    formatter = formatter;
    constructor(controller) {
      this.controller = controller;
    }
    destroy() {
      this.dialog?.destroy();
    }
    onOpen = async () => {
      try {
        const dialog = await this.getDialog();
        const userId = this.controller.getSessionModel().getProperty("/user/ID");
        this.getInput().setValueState(ValueState.None);
        dialog.bindElement({
          path: `/Me(${userId})`,
          parameters: {
            $$updateGroupId: UPDATE_GROUP
          }
        });
        dialog.open();
      } catch (error) {
        await this.controller.handleError(error, "profileError");
      }
    };
    onSave = async () => {
      const input = this.getInput();
      if (!input.getValue().trim()) {
        input.setValueState(ValueState.Error);
        input.setValueStateText(this.controller.getText("errorDisplayNameRequired"));
        return;
      }
      const dialog = this.dialog;
      try {
        dialog.setBusy(true);
        await this.submitProfile();
        dialog.close();
        this.controller.showToast("profileSaved");
        this.controller.conversations.refresh();
        this.controller.messages.refreshMessages();
      } catch (error) {
        await this.controller.handleError(error, "profileError");
      } finally {
        dialog.setBusy(false);
      }
    };
    onNameChange = () => {
      this.getInput().setValueState(ValueState.None);
    };
    onCancel = () => {
      this.dialog?.close();
    };
    onAfterClose = () => {
      const model = this.controller.getODataModel();
      if (model.hasPendingChanges(UPDATE_GROUP)) {
        model.resetChanges(UPDATE_GROUP);
      }
    };

    /** Envia o update group; com 401 renova o token e repete o envio uma única vez. */
    async submitProfile() {
      const model = this.controller.getODataModel();
      try {
        await model.submitBatch(UPDATE_GROUP);
      } catch (error) {
        if (!isUnauthorized(error)) {
          throw error;
        }
        const renewed = await this.controller.getAuth().handleUnauthorized();
        if (!renewed) {
          throw error;
        }
        await model.submitBatch(UPDATE_GROUP);
      }
      if (model.hasPendingChanges(UPDATE_GROUP)) {
        throw new Error(this.controller.getText("profileNotSaved"));
      }
    }
    getInput() {
      return Fragment.byId(this.controller.getView()?.getId() ?? "", "profileDisplayName");
    }
    async getDialog() {
      if (!this.dialog) {
        const view = this.controller.getView();
        this.dialog = await Fragment.load({
          id: view?.getId(),
          name: "apps.dflc.resenha.view.fragments.ProfileDialog",
          controller: this
        });
        view?.addDependent(this.dialog);
      }
      return this.dialog;
    }
  }
  return ProfileSection;
});
//# sourceMappingURL=ProfileSection-dbg.js.map
