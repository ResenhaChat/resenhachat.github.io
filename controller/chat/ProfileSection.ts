import Fragment from "sap/ui/core/Fragment";
import { ValueState } from "sap/ui/core/library";
import type Control from "sap/ui/core/Control";
import type Dialog from "sap/m/Dialog";
import type Input from "sap/m/Input";
import type Menu from "sap/m/Menu";
import type MenuItem from "sap/m/MenuItem";
import type { Avatar$PressEvent } from "sap/m/Avatar";
import type Chat from "../Chat.controller";
import formatter from "../../model/formatter";
import { isUnauthorized } from "../../util/errors";
import { pickAvatar } from "../../util/mediaTools";

const UPDATE_GROUP = "profile";

/** Edição do próprio perfil: /Me(<id>) two-way no update group "profile". */
export default class ProfileSection {

    public readonly formatter = formatter;

    private dialog?: Dialog;

    public constructor(private readonly controller: Chat) { }

    public destroy(): void {
        this.dialog?.destroy();
    }

    public onOpen = async (): Promise<void> => {
        try {
            const dialog = await this.getDialog();
            const userId = this.controller.getSessionModel().getProperty("/user/ID") as string;

            (this.getInput()).setValueState(ValueState.None);
            dialog.bindElement({ path: `/Me(${userId})`, parameters: { $$updateGroupId: UPDATE_GROUP } });
            dialog.open();
        } catch (error) {
            await this.controller.handleError(error, "profileError");
        }
    };

    public onSave = async (): Promise<void> => {
        const input = this.getInput();

        if (!input.getValue().trim()) {
            input.setValueState(ValueState.Error);
            input.setValueStateText(this.controller.getText("errorDisplayNameRequired"));
            return;
        }

        const dialog = this.dialog as Dialog;

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

    public onNameChange = (): void => {
        this.getInput().setValueState(ValueState.None);
    };

    public onCancel = (): void => {
        this.dialog?.close();
    };

    /** Menu da foto: "Remover" só aparece quando há foto. */
    public onAvatarPress = (event: Avatar$PressEvent): void => {
        const hasPhoto = !!(this.dialog?.getBindingContext()?.getProperty("AvatarMimeType") as string | null | undefined);

        this.controller.getFragmentControl<MenuItem>("profilePhotoRemove").setVisible(hasPhoto);
        this.controller.getFragmentControl<Menu>("profileAvatarMenu").openBy(event.getSource());
    };

    /** O seletor abre dentro do gesto do item de menu (sem await antes), senão o navegador bloqueia. */
    public onChangePhoto = async (): Promise<void> => {
        const photo = await pickAvatar();

        if (photo) {
            await this.savePhoto(() => this.controller.getAppComponent().getMediaService().putAvatar(this.ownerPath(), photo));
        }
    };

    public onRemovePhoto = async (): Promise<void> => {
        if (await this.controller.confirm("confirmRemovePhoto")) {
            await this.savePhoto(() => this.controller.getAppComponent().getMediaService().deleteAvatar(this.ownerPath()));
        }
    };

    public onAfterClose = (): void => {
        const model = this.controller.getODataModel();

        if (model.hasPendingChanges(UPDATE_GROUP)) {
            model.resetChanges(UPDATE_GROUP);
        }
    };

    /** Envia o update group; com 401 renova o token e repete o envio uma única vez. */
    private async submitProfile(): Promise<void> {
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

    private ownerPath(): string {
        return `Me(${this.controller.getMyId()})`;
    }

    /** Foto salva: relê o avatar do topo e o do diálogo (este só se não há edição pendente no perfil). */
    private async savePhoto(action: () => Promise<void>): Promise<void> {
        try {
            await action();
            this.refreshAvatars();
            this.controller.showToast("photoSaved");
        } catch (error) {
            await this.controller.handleError(error, "photoError");
        }
    }

    private refreshAvatars(): void {
        this.controller.refreshElementBinding(this.controller.byId("meAvatar") as Control | undefined);

        if (this.dialog && !this.controller.getODataModel().hasPendingChanges(UPDATE_GROUP)) {
            this.controller.refreshElementBinding(this.dialog);
        }
    }

    private getInput(): Input {
        return Fragment.byId(this.controller.getView()?.getId() ?? "", "profileDisplayName") as Input;
    }

    private async getDialog(): Promise<Dialog> {
        if (!this.dialog) {
            const view = this.controller.getView();

            this.dialog = await Fragment.load({
                id: view?.getId(),
                name: "apps.dflc.resenha.view.fragments.ProfileDialog",
                controller: this
            }) as Dialog;
            view?.addDependent(this.dialog);
        }

        return this.dialog;
    }

}
