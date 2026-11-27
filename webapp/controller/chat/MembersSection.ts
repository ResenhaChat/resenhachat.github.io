import type Event from "sap/ui/base/Event";
import type Control from "sap/ui/core/Control";
import type Button from "sap/m/Button";
import type CustomListItem from "sap/m/CustomListItem";
import type { ListBase$SelectionChangeEvent } from "sap/m/ListBase";
import type ListItemBase from "sap/m/ListItemBase";
import type Dialog from "sap/m/Dialog";
import type HBox from "sap/m/HBox";
import type List from "sap/m/List";
import type Menu from "sap/m/Menu";
import type MenuItem from "sap/m/MenuItem";
import type { MenuItem$PressEvent } from "sap/m/MenuItem";
import type VBox from "sap/m/VBox";
import type JSONModel from "sap/ui/model/json/JSONModel";
import type Context from "sap/ui/model/odata/v4/Context";
import type Chat from "../Chat.controller";
import PeoplePicker from "./PeoplePicker";
import formatter from "../../model/formatter";

/** Índice do botão "⋯" dentro da linha de membro (avatar, corpo, botão). */
const MEMBER_MENU_BUTTON = 2;

/** Membros do grupo ou canal: menu por membro (admin, remover) e diálogo "Adicionar pessoas". */
export default class MembersSection {

    public readonly formatter = formatter;

    private dialog?: Dialog;

    private picker?: PeoplePicker;

    public constructor(private readonly controller: Chat) { }

    public destroy(): void {
        this.picker?.destroy();
        this.dialog?.destroy();
    }

    /** Mostra o "⋯" só nas linhas em que há alguma ação para mim (papel do painel + papel do membro). */
    public onMembersUpdated = (): void => {
        const myRole = this.myRole();
        const myId = this.controller.getMyId();

        (this.controller.byId("membersList") as List).getItems().forEach((item) => {
            const context = item.getBindingContext() as Context | null;

            if (context) {
                const row = (item as CustomListItem).getContent()[0] as HBox;
                const button = row.getItems()[MEMBER_MENU_BUTTON] as Button;

                button.setVisible(formatter.canManageMember(myRole, context.getProperty("Role"), context.getProperty("User_ID"), myId));
            }
        });
    };

    /** Antes de abrir, o menu mostra só as ações permitidas para o meu papel e para o papel do membro. */
    public onOpenMemberMenu = (event: Event): void => {
        const button = event.getSource<Control>();
        const context = button.getBindingContext() as Context | null;

        if (!context) {
            return;
        }

        const menu = this.controller.byId("memberMenu") as Menu;

        menu.setBindingContext(context);
        this.configureMenu(context);
        menu.openBy(button);
    };

    public onToggleAdmin = (event: MenuItem$PressEvent): void => {
        void this.toggleAdmin(this.contextOf(event));
    };

    public onRemove = (event: MenuItem$PressEvent): void => {
        void this.remove(this.contextOf(event));
    };

    public onAddPeople = async (): Promise<void> => {
        try {
            const dialog = await this.getDialog();

            this.getState().setData({ term: "", selected: [] });
            this.picker?.apply();
            dialog.open();
        } catch (error) {
            await this.controller.handleError(error, "peopleError");
        }
    };

    public onSearch = (event: Event): void => {
        this.picker?.onSearch(event);
    };

    /** Marcar ou desmarcar uma pessoa na lista (seleção múltipla). */
    public onSelectionChange = (event: ListBase$SelectionChangeEvent): void => {
        this.picker?.toggleItem(event.getParameter("listItem") as ListItemBase);
    };

    public onConfirmAdd = async (): Promise<void> => {
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

    public onCancelAdd = (): void => {
        this.dialog?.close();
    };

    private configureMenu(context: Context): void {
        const role = context.getProperty("Role") as string;
        const isMe = context.getProperty("User_ID") === this.controller.getMyId();

        (this.controller.byId("memberPromote") as MenuItem).setVisible(formatter.canToggleAdmin(this.myRole(), role, isMe));
        (this.controller.byId("memberRemove") as MenuItem).setVisible(formatter.canRemoveMember(this.myRole(), role, isMe));
    }

    private async toggleAdmin(context: Context): Promise<void> {
        const role = context.getProperty("Role") === "Admin" ? "Member" : "Admin";

        try {
            await this.controller.getChatService().setMemberRole(this.controller.getOpenConversationId(), context.getProperty("User_ID") as string, role);
            void this.controller.messages.refreshConversation();
        } catch (error) {
            await this.controller.handleError(error, "memberError");
        }
    }

    private async remove(context: Context): Promise<void> {
        const name = context.getProperty("User/DisplayName") as string;

        if (!await this.controller.confirm("confirmRemoveMember", [name])) {
            return;
        }

        try {
            await this.controller.getChatService().removeMember(this.controller.getOpenConversationId(), context.getProperty("User_ID") as string);
            void this.controller.messages.refreshConversation();
        } catch (error) {
            await this.controller.handleError(error, "memberError");
        }
    }

    /** Quem já é membro não aparece na busca de "Adicionar pessoas". */
    private currentMemberIds(): string[] {
        return (this.controller.byId("membersList") as List).getItems()
            .map((item) => (item.getBindingContext() as Context | null)?.getProperty("User_ID") as string)
            .filter(Boolean);
    }

    /** Papel na conversa aberta: vem do próprio contexto do painel (MyRole), sem cópia em JSON. */
    private myRole(): string {
        return ((this.controller.byId("detailsPanel") as VBox).getBindingContext() as Context | null)?.getProperty("MyRole") as string;
    }

    private contextOf(event: MenuItem$PressEvent): Context {
        return event.getSource<MenuItem>().getBindingContext() as Context;
    }

    private getState(): JSONModel {
        return this.dialog?.getModel("compose") as JSONModel;
    }

    private async getDialog(): Promise<Dialog> {
        if (!this.dialog) {
            this.dialog = await this.controller.loadDialog("AddMembersDialog", this, { term: "", selected: [] });
            this.picker = new PeoplePicker(
                this.controller,
                this.controller.getFragmentControl<List>("addMembersList"),
                this.getState(),
                () => this.currentMemberIds()
            );
        }

        return this.dialog;
    }

}
