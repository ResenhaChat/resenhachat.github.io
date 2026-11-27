import type Event from "sap/ui/base/Event";
import type Control from "sap/ui/core/Control";
import type Dialog from "sap/m/Dialog";
import type List from "sap/m/List";
import type Menu from "sap/m/Menu";
import type CustomListItem from "sap/m/CustomListItem";
import type JSONModel from "sap/ui/model/json/JSONModel";
import type Chat from "../Chat.controller";
import formatter from "../../model/formatter";
import PeoplePicker from "./PeoplePicker";
import type { PickedPerson } from "./PeoplePicker";

/** Botão "+" da sidebar (nova conversa, grupo, canal, explorar) e o diálogo de conversa direta. */
export default class NewChatSection {

    public readonly formatter = formatter;

    private dialog?: Dialog;

    private picker?: PeoplePicker;

    public constructor(private readonly controller: Chat) { }

    public destroy(): void {
        this.picker?.destroy();
        this.dialog?.destroy();
    }

    public onOpenMenu = (event: Event): void => {
        (this.controller.byId("newChatMenu") as Menu).openBy(event.getSource<Control>());
    };

    public onNewDirect = (): void => {
        void this.openDirect();
    };

    public onNewGroup = (): void => {
        void this.controller.newConversation.open("Group");
    };

    public onNewChannel = (): void => {
        void this.controller.newConversation.open("Channel");
    };

    public onExplore = (): void => {
        void this.controller.explore.open();
    };

    public onSearch = (event: Event): void => {
        this.picker?.onSearch(event);
    };

    /** Clicar numa pessoa inicia a conversa direta com ela. */
    public onPick = (event: Event): void => {
        const person = event.getSource<CustomListItem>().getBindingContext()?.getObject() as PickedPerson | undefined;

        if (person) {
            void this.startDirect(person.ID);
        }
    };

    public onClose = (): void => {
        this.dialog?.close();
    };

    private async openDirect(): Promise<void> {
        try {
            const dialog = await this.getDialog();

            this.picker?.reset();
            dialog.open();
        } catch (error) {
            await this.controller.handleError(error, "peopleError");
        }
    }

    private async startDirect(userId: string): Promise<void> {
        const dialog = this.dialog;

        try {
            dialog?.setBusy(true);
            const id = await this.controller.getChatService().startDirect(userId);
            dialog?.close();
            this.controller.conversations.refresh();
            this.controller.navTo("conversation", { id });
            this.controller.showToast("directStarted");
        } catch (error) {
            await this.controller.handleError(error, "newChatError");
        } finally {
            dialog?.setBusy(false);
        }
    }

    private async getDialog(): Promise<Dialog> {
        this.dialog ??= await this.controller.loadDialog("NewDirectDialog", this, { term: "", selected: [] });
        this.picker ??= new PeoplePicker(
            this.controller,
            this.controller.getFragmentControl<List>("newDirectList"),
            this.dialog.getModel("compose") as JSONModel
        );

        return this.dialog;
    }

}
