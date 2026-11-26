sap.ui.define(["sap/ui/core/Fragment", "../../util/pwa"], function (Fragment, ____util_pwa) {
  "use strict";

  const promptInstall = ____util_pwa["promptInstall"];
  /** "Instalar app" do menu do usuário: prompt nativo (Chrome/Edge) ou passo a passo no iPhone. */
  class InstallSection {
    constructor(controller) {
      this.controller = controller;
    }
    destroy() {
      this.dialog?.destroy();
    }
    onInstall = async () => {
      const model = this.controller.getAppComponent().getModel("pwa");
      const result = await promptInstall(model);
      if (result === "ios") {
        await this.openIosSteps();
      } else if (result === "unavailable") {
        this.controller.showToast("installUnavailable");
      }
    };
    onCloseIos = () => {
      this.dialog?.close();
    };
    async openIosSteps() {
      this.dialog ??= await this.loadDialog();
      this.dialog.open();
    }
    async loadDialog() {
      const view = this.controller.getView();
      const dialog = await Fragment.load({
        id: view?.getId(),
        name: "apps.dflc.resenha.view.fragments.IosInstallDialog",
        controller: this
      });
      view?.addDependent(dialog);
      return dialog;
    }
  }
  return InstallSection;
});
//# sourceMappingURL=InstallSection-dbg.js.map
