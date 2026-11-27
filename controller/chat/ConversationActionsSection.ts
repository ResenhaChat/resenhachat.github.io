import type Event from "sap/ui/base/Event";
import type Control from "sap/ui/core/Control";
import type Menu from "sap/m/Menu";
import type MenuItem from "sap/m/MenuItem";
import type { MenuItem$PressEvent } from "sap/m/MenuItem";
import type Context from "sap/ui/model/odata/v4/Context";
import type Chat from "../Chat.controller";
import { MEMBERSHIP_GROUP } from "../../service/ChatService";
import formatter from "../../model/formatter";
import MenuItemSync from "../../util/MenuItemSync";

const HOUR_MS = 3_600_000;
const WEEK_MS = 7 * 24 * HOUR_MS;
const MUTED_FOREVER = "9999-12-31T23:59:59Z";

export type MuteDuration = "8h" | "1w" | "forever";

function mutedUntil(duration: MuteDuration): string {
    if (duration === "forever") {
        return MUTED_FOREVER;
    }

    return new Date(Date.now() + (duration === "8h" ? 8 * HOUR_MS : WEEK_MS)).toISOString();
}

/**
 * Fixar, silenciar e arquivar a conversa: PATCH na minha linha de Members (update group "membership").
 * O menu "⋯" da lista e o rodapé do painel de detalhes usam estes mesmos métodos.
 */
export default class ConversationActionsSection {

    private rowMenuItems?: MenuItemSync;
    private muteMenuItems?: MenuItemSync;

    public constructor(private readonly controller: Chat) { }

    public destroy(): void {
        this.rowMenuItems?.destroy();
        this.muteMenuItems?.destroy();
    }

    /** O menu recebe o contexto da linha do botão; os itens herdam esse contexto. */
    public onOpenRowMenu = (event: Event): void => {
        const button = event.getSource<Control>();
        const menu = this.controller.byId("rowMenu") as Menu;
        const context = button.getBindingContext() as Context;

        menu.setBindingContext(context);
        this.rowMenuItems ??= new MenuItemSync(menu);
        this.rowMenuItems.sync((item) => this.isVisibleInRowMenu(item, context));
        menu.openBy(button);
    };

    /** Botão "Silenciar" do rodapé do painel: só as opções de silenciar (ou reativar). */
    public onOpenMuteMenu = (event: Event): void => {
        const button = event.getSource<Control>();
        const menu = this.controller.byId("muteMenu") as Menu;
        const context = button.getBindingContext() as Context;

        menu.setBindingContext(context);
        this.muteMenuItems ??= new MenuItemSync(menu);
        this.muteMenuItems.sync((item) => this.isVisibleInMuteMenu(item, context));
        menu.openBy(button);
    };

    public onTogglePin = (event: MenuItem$PressEvent): void => {
        void this.togglePin(this.contextOf(event));
    };

    public onMute = (event: MenuItem$PressEvent): void => {
        void this.mute(this.contextOf(event), event.getSource().data("duration") as MuteDuration);
    };

    public onUnmute = (event: MenuItem$PressEvent): void => {
        void this.unmute(this.contextOf(event));
    };

    public onToggleArchive = (event: MenuItem$PressEvent): void => {
        void this.toggleArchive(this.contextOf(event));
    };

    public togglePin(context: Context): Promise<void> {
        return this.patch(context, "IsPinned", !context.getProperty("IsPinned"));
    }

    public mute(context: Context, duration: MuteDuration): Promise<void> {
        return this.patch(context, "MutedUntil", mutedUntil(duration));
    }

    public unmute(context: Context): Promise<void> {
        return this.patch(context, "MutedUntil", null);
    }

    public toggleArchive(context: Context): Promise<void> {
        return this.patch(context, "IsArchived", !context.getProperty("IsArchived"));
    }

    private async patch(context: Context, property: string, value: unknown): Promise<void> {
        const model = this.controller.getODataModel();

        try {
            const patch = context.setProperty(property, value, MEMBERSHIP_GROUP);

            await Promise.all([patch, model.submitBatch(MEMBERSHIP_GROUP)]);
            this.controller.conversations.refresh();
        } catch (error) {
            model.resetChanges(MEMBERSHIP_GROUP);
            await this.controller.handleError(error, "conversationActionError");
        }
    }

    /** "Silenciar" só quando não está silenciada; "Reativar som" só quando está. */
    private isVisibleInRowMenu(item: MenuItem, context: Context): boolean {
        const muted = formatter.isMuted(context.getProperty("MutedUntil") as string | null);

        if (item === this.controller.byId("rowMenuMute")) {
            return !muted;
        }

        return item !== this.controller.byId("rowMenuUnmute") || muted;
    }

    private isVisibleInMuteMenu(item: MenuItem, context: Context): boolean {
        return item !== this.controller.byId("muteMenuUnmute") || formatter.isMuted(context.getProperty("MutedUntil") as string | null);
    }

    private contextOf(event: MenuItem$PressEvent): Context {
        return event.getSource<MenuItem>().getBindingContext() as Context;
    }

}
