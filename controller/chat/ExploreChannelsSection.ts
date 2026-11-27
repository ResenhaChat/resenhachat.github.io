import type Event from "sap/ui/base/Event";
import type Control from "sap/ui/core/Control";
import type Dialog from "sap/m/Dialog";
import type List from "sap/m/List";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type Context from "sap/ui/model/odata/v4/Context";
import type Chat from "../Chat.controller";
import formatter from "../../model/formatter";

/** Canais públicos (/PublicChannels): entrar em um canal ou abri-lo se já sou membro. */
export default class ExploreChannelsSection {

    public readonly formatter = formatter;

    private dialog?: Dialog;

    public constructor(private readonly controller: Chat) { }

    public destroy(): void {
        this.dialog?.destroy();
    }

    /** A binding nasce suspensa; na primeira abertura ela é liberada, depois só recarrega. */
    public open = async (): Promise<void> => {
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

    public onClose = (): void => {
        this.dialog?.close();
    };

    /** Botão da linha: "Abrir" para quem já é membro, "Entrar" para os demais. */
    public onJoinOrOpen = (event: Event): void => {
        const context = event.getSource<Control>().getBindingContext() as Context | null;
        const id = context?.getProperty("ID") as string | undefined;

        if (!id) {
            return;
        }

        if (context?.getProperty("IsMember") === true) {
            this.openConversation(id);
        } else {
            void this.join(id);
        }
    };

    private async join(conversationId: string): Promise<void> {
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

    private openConversation(conversationId: string): void {
        this.dialog?.close();
        this.controller.navTo("conversation", { id: conversationId });
    }

    private getBinding(): ODataListBinding | undefined {
        return this.controller.getFragmentControl<List>("publicChannelList").getBinding("items") as ODataListBinding | undefined;
    }

    private async getDialog(): Promise<Dialog> {
        this.dialog ??= await this.controller.loadDialog("ExploreChannelsDialog", this, {});

        return this.dialog;
    }

}
