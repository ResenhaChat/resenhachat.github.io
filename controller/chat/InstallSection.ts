import Fragment from "sap/ui/core/Fragment";
import type Dialog from "sap/m/Dialog";
import type JSONModel from "sap/ui/model/json/JSONModel";
import type Chat from "../Chat.controller";
import { promptInstall } from "../../util/pwa";

/** "Instalar app" do menu do usuário: prompt nativo (Chrome/Edge) ou passo a passo no iPhone. */
export default class InstallSection {

    private dialog?: Dialog;

    public constructor(private readonly controller: Chat) { }

    public destroy(): void {
        this.dialog?.destroy();
    }

    public onInstall = async (): Promise<void> => {
        const model = this.controller.getAppComponent().getModel("pwa") as JSONModel;
        const result = await promptInstall(model);

        if (result === "ios") {
            await this.openIosSteps();
        } else if (result === "unavailable") {
            this.controller.showToast("installUnavailable");
        }
    };

    public onCloseIos = (): void => {
        this.dialog?.close();
    };

    private async openIosSteps(): Promise<void> {
        this.dialog ??= await this.loadDialog();
        this.dialog.open();
    }

    private async loadDialog(): Promise<Dialog> {
        const view = this.controller.getView();
        const dialog = await Fragment.load({
            id: view?.getId(),
            name: "apps.dflc.resenha.view.fragments.IosInstallDialog",
            controller: this
        }) as Dialog;

        view?.addDependent(dialog);

        return dialog;
    }

}
