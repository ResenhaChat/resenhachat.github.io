import type CustomListItem from "sap/m/CustomListItem";
import type List from "sap/m/List";
import type { ListBase$UpdateFinishedEvent } from "sap/m/ListBase";
import type ScrollContainer from "sap/m/ScrollContainer";
import type Text from "sap/m/Text";
import type VBox from "sap/m/VBox";
import type Page from "sap/m/Page";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type Context from "sap/ui/model/odata/v4/Context";
import type Chat from "../Chat.controller";
import formatter from "../../model/formatter";
import { isUnauthorized } from "../../util/errors";
import type { MessageCreatedPayload } from "../../service/RealtimeEvents";

interface MessageRow {
    ID: string;
    createdAt: string;
    Sender?: { ID: string };
}

const NEW_MESSAGE_ANIMATION_MS = 400;
const ACCENT_CLASSES = Array.from({ length: 10 }, (_, index) => `rsAccent${index + 1}`);
const MEMBERS_LIMIT = 500;
const NEAR_BOTTOM_PX = 80;

/** Cabeçalho + lista de mensagens da conversa aberta (/Conversations(<id>)/Messages). */
export default class MessagesSection {

    private conversationId = "";

    private scrollPending = false;

    private isFirstRender = true;

    private memberIds: string[] = [];

    /** Não lidas da conversa aberta: começa no UnreadCount da página e zera após o MarkAsRead. */
    private unreadCount = 0;

    private readonly seenMessageIds = new Set<string>();

    private readonly names = new Map<string, string>();

    private unsubscribePresence?: () => void;

    /** Mensagem própria não recarrega nem marca como lida: o envio já atualiza a lista. */
    private readonly onMessageCreated = (payload: MessageCreatedPayload): void => {
        this.controller.getPresence().clearTyping(payload.ConversationId, payload.SenderId);

        if (payload.ConversationId !== this.conversationId || payload.SenderId === this.getMyId()) {
            return;
        }

        this.unreadCount += 1;

        if (this.isNearBottom()) {
            this.scrollPending = true;
        }

        void this.reloadMessages();
        void this.markAsReadIfVisible();
    };

    private readonly onReconnected = (): void => {
        if (this.conversationId) {
            this.refreshMessages();
            void this.loadUnread(this.conversationId);
        }
    };

    private readonly onVisibilityChange = (): void => {
        void this.markAsReadIfVisible();
    };

    public constructor(private readonly controller: Chat) { }

    public init(): void {
        const realtime = this.controller.getRealtime();

        realtime.on("message.created", this.onMessageCreated);
        realtime.on("reconnected", this.onReconnected);
        this.unsubscribePresence = this.controller.getPresence().onPresenceChange(() => void this.updateSubtitle());
        document.addEventListener("visibilitychange", this.onVisibilityChange);
    }

    public destroy(): void {
        const realtime = this.controller.getRealtime();

        realtime.off("message.created", this.onMessageCreated);
        realtime.off("reconnected", this.onReconnected);
        this.unsubscribePresence?.();
        document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }

    public open(conversationId: string): void {
        if (conversationId === this.conversationId) {
            return;
        }

        this.conversationId = conversationId;
        this.memberIds = [];
        this.unreadCount = 0;
        this.seenMessageIds.clear();
        this.isFirstRender = true;
        this.scrollPending = true;

        const ui = this.controller.getUiModel();

        ui.setProperty("/conversationId", conversationId);
        ui.setProperty("/subtitle", "");
        (this.controller.byId("messagesPage") as Page).bindElement({ path: `/Conversations(${conversationId})` });

        void this.loadMembers(conversationId);
        void this.loadUnread(conversationId);
    }

    public close(): void {
        this.conversationId = "";
        this.memberIds = [];
        this.controller.getUiModel().setProperty("/conversationId", "");
        (this.controller.byId("messagesPage") as Page).unbindElement();
    }

    public onBack = (): void => this.controller.navTo("chat");

    public scrollOnNextUpdate(): void {
        this.scrollPending = true;
    }

    public refreshMessages(): void {
        this.scrollPending = true;
        void this.reloadMessages();
    }

    /** Roda a cada renderização: separador de dia, agrupamento por autor, animação e rolagem. */
    public onUpdateFinished = (event: ListBase$UpdateFinishedEvent): void => {
        const items = this.getList().getItems() as CustomListItem[];
        const isGrowing = event.getParameter("reason") === "Growing";

        items.forEach((item, index) => this.decorate(item, items[index + 1], !this.isFirstRender && !isGrowing));

        if (items.length) {
            this.isFirstRender = false;
        }

        if (this.scrollPending && !isGrowing) {
            this.scrollPending = false;
            window.setTimeout(() => this.scrollToEnd(), 0);
        }
    };

    private decorate(item: CustomListItem, older: CustomListItem | undefined, animate: boolean): void {
        const message = item.getBindingContext()?.getObject() as MessageRow | undefined;
        const previous = older?.getBindingContext()?.getObject() as MessageRow | undefined;

        if (!message) {
            return;
        }

        const startsDay = !previous || !formatter.sameDay(message.createdAt, previous.createdAt);
        const separator = (item.getContent()[0] as VBox).getItems()[0] as Text;

        separator.setVisible(startsDay);
        separator.setText(formatter.dayLabel(message.createdAt));
        const accentClass = `rsAccent${formatter.accentIndex(message.Sender?.ID)}`;

        ACCENT_CLASSES.forEach((cssClass) => item.toggleStyleClass(cssClass, cssClass === accentClass));
        item.toggleStyleClass("rsGrouped", !startsDay && previous?.Sender?.ID === message.Sender?.ID);

        if (animate && !this.seenMessageIds.has(message.ID)) {
            item.addStyleClass("rsNew");
            window.setTimeout(() => item.removeStyleClass("rsNew"), NEW_MESSAGE_ANIMATION_MS);
        }

        this.seenMessageIds.add(message.ID);
    }

    private scrollToEnd(): void {
        const scroller = this.controller.byId("messageScroll") as ScrollContainer;
        const dom = scroller.getDomRef();

        if (dom) {
            scroller.scrollTo(0, dom.scrollHeight, 0);
        }
    }

    private getList(): List {
        return this.controller.byId("messageList") as List;
    }

    private getBinding(): ODataListBinding | undefined {
        return this.getList().getBinding("items") as ODataListBinding | undefined;
    }

    private getMyId(): string {
        return this.controller.getSessionModel().getProperty("/user/ID") as string;
    }

    private isNearBottom(): boolean {
        const dom = (this.controller.byId("messageScroll") as ScrollContainer).getDomRef();

        return !dom || dom.scrollHeight - dom.scrollTop - dom.clientHeight < NEAR_BOTTOM_PX;
    }

    /** Com header context o side effect recarrega a lista (traz itens novos); sem binding, cai no refresh. */
    private async reloadMessages(): Promise<void> {
        const binding = this.getBinding();
        const header = binding?.getHeaderContext();

        try {
            if (header) {
                await header.requestSideEffects([""]);
            } else {
                binding?.refresh();
            }
        } catch (error) {
            if (isUnauthorized(error)) {
                await this.controller.handleError(error, "messagesError");
            }
        }
    }

    /** Lê UnreadCount do contexto da página; sem contexto (ou falha) assume uma não lida para não perder a marcação. */
    private async loadUnread(conversationId: string): Promise<void> {
        const context = (this.controller.byId("messagesPage") as Page).getBindingContext() as Context | null;
        let unread = 1;

        try {
            unread = context ? (await context.requestProperty("UnreadCount") as number | null) ?? 0 : 1;
        } catch {
            // sem contagem: a próxima mensagem recebida volta a marcar como lida
        }

        if (conversationId === this.conversationId) {
            this.unreadCount = Math.max(this.unreadCount, unread);
            await this.markAsReadIfVisible();
        }
    }

    /** MarkAsRead só quando a conversa aberta tem não lidas e a aba está visível. */
    private async markAsReadIfVisible(): Promise<void> {
        const id = this.conversationId;

        if (!id || this.unreadCount <= 0 || document.visibilityState !== "visible") {
            return;
        }

        const pending = this.unreadCount;

        this.unreadCount = 0;

        try {
            await this.controller.getChatService().markAsRead(id);
        } catch (error) {
            if (id === this.conversationId) {
                this.unreadCount = pending;
            }

            if (isUnauthorized(error)) {
                await this.controller.handleError(error, "markReadError");
            }
        }
    }

    private async loadMembers(conversationId: string): Promise<void> {
        const binding = this.controller.getODataModel().bindList(
            `/Conversations(${conversationId})/Members`, undefined, undefined, undefined, { $select: "User_ID" }
        );
        let memberIds: string[] = [];

        try {
            const contexts = await binding.requestContexts(0, MEMBERS_LIMIT);

            memberIds = contexts.map((context) => context.getProperty("User_ID") as string);
        } catch {
            memberIds = [];
        } finally {
            binding.destroy();
        }

        if (conversationId === this.conversationId) {
            this.memberIds = memberIds;
            void this.updateSubtitle();
        }
    }

    private async updateSubtitle(): Promise<void> {
        const id = this.conversationId;

        if (!id) {
            return;
        }

        const presence = this.controller.getPresence();
        const typingIds = presence.getTypingUserIds(id);
        const ui = this.controller.getUiModel();

        if (typingIds.length) {
            const label = await this.typingLabel(typingIds);

            if (id === this.conversationId) {
                ui.setProperty("/typingLabel", label);
                ui.setProperty("/isTyping", true);
            }

            return;
        }

        const online = this.memberIds.filter((userId) => presence.isOnline(userId)).length;

        ui.setProperty("/isTyping", false);
        ui.setProperty("/subtitle", online ? this.controller.getText("subtitleOnline", [online]) : "");
    }

    private async typingLabel(userIds: string[]): Promise<string> {
        if (userIds.length > 2) {
            return this.controller.getText("typingMany");
        }

        const names = await Promise.all(userIds.map((userId) => this.resolveName(userId)));

        return this.controller.getText(names.length === 1 ? "typingOne" : "typingTwo", names);
    }

    private async resolveName(userId: string): Promise<string> {
        const cached = this.names.get(userId);

        if (cached) {
            return cached;
        }

        const binding = this.controller.getODataModel().bindContext(`/People(${userId})`, undefined, { $select: "DisplayName" });

        try {
            const person = await binding.requestObject() as { DisplayName?: string } | undefined;
            const name = person?.DisplayName ?? this.controller.getText("someone");

            this.names.set(userId, name);

            return name;
        } catch {
            return this.controller.getText("someone");
        } finally {
            binding.destroy();
        }
    }

}
