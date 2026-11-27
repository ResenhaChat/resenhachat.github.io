import type CustomListItem from "sap/m/CustomListItem";
import type List from "sap/m/List";
import type { ListBase$UpdateFinishedEvent } from "sap/m/ListBase";
import type ScrollContainer from "sap/m/ScrollContainer";
import type Text from "sap/m/Text";
import type VBox from "sap/m/VBox";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type ODataContextBinding from "sap/ui/model/odata/v4/ODataContextBinding";
import type Context from "sap/ui/model/odata/v4/Context";
import type Chat from "../Chat.controller";
import formatter from "../../model/formatter";
import { isNotFound, isUnauthorized } from "../../util/errors";
import type { ConversationChangedPayload, MessageCreatedPayload } from "../../service/RealtimeEvents";

interface MessageRow {
    ID: string;
    createdAt: string;
    Kind?: string;
    Sender?: { ID: string };
}

const NEW_MESSAGE_ANIMATION_MS = 400;
const ACCENT_CLASSES = Array.from({ length: 10 }, (_, index) => `rsAccent${index + 1}`);
const MEMBERS_LIMIT = 500;
const NEAR_BOTTOM_PX = 80;
const CONVERSATION_GROUP = "conversation";

/**
 * Cabeçalho + lista de mensagens da conversa aberta (/Conversations(<id>)/Messages).
 * Dono do contexto /Conversations(<id>) que o painel de detalhes compartilha: é aqui que a conversa é relida.
 */
export default class MessagesSection {

    private conversationId = "";

    private scrollPending = false;

    private isFirstRender = true;

    private memberIds: string[] = [];

    /** Fatos do cabeçalho (Kind, par do Direct, nº de membros) lidos da própria página da conversa. */
    private kind = "";

    private peerId: string | null = null;

    private memberCount: number | null = null;

    /** Não lidas da conversa aberta: começa no UnreadCount da página e zera após o MarkAsRead. */
    private unreadCount = 0;

    private readonly seenMessageIds = new Set<string>();

    private readonly names = new Map<string, string>();

    private unsubscribePresence?: () => void;

    /** Mensagem própria não recarrega nem marca como lida: o envio já atualiza a lista. */
    private readonly onMessageCreated = (payload: MessageCreatedPayload): void => {
        if (payload.SenderId) {
            this.controller.getPresence().clearTyping(payload.ConversationId, payload.SenderId);
        }

        if (payload.ConversationId !== this.conversationId || payload.SenderId === this.controller.getMyId()) {
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

    /** Título, membros ou papel mudaram: relê a conversa aberta (uma vez só, aqui). */
    private readonly onConversationChanged = (payload: ConversationChangedPayload): void => {
        if (payload.ConversationId === this.conversationId) {
            void this.refreshConversation();
        }
    };

    public constructor(private readonly controller: Chat) { }

    public init(): void {
        const realtime = this.controller.getRealtime();

        realtime.on("message.created", this.onMessageCreated);
        realtime.on("reconnected", this.onReconnected);
        realtime.on("conversation.updated", this.onConversationChanged);
        realtime.on("members.changed", this.onConversationChanged);
        this.unsubscribePresence = this.controller.getPresence().onPresenceChange(() => void this.updateSubtitle());
        document.addEventListener("visibilitychange", this.onVisibilityChange);
    }

    public destroy(): void {
        const realtime = this.controller.getRealtime();

        realtime.off("message.created", this.onMessageCreated);
        realtime.off("reconnected", this.onReconnected);
        realtime.off("conversation.updated", this.onConversationChanged);
        realtime.off("members.changed", this.onConversationChanged);
        this.unsubscribePresence?.();
        document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }

    public open(conversationId: string): void {
        if (conversationId === this.conversationId) {
            return;
        }

        this.conversationId = conversationId;
        this.memberIds = [];
        this.kind = "";
        this.peerId = null;
        this.memberCount = null;
        this.unreadCount = 0;
        this.seenMessageIds.clear();
        this.isFirstRender = true;
        this.scrollPending = true;

        const ui = this.controller.getUiModel();

        ui.setProperty("/conversationId", conversationId);
        ui.setProperty("/subtitle", "");
        ui.setProperty("/subtitleOnline", false);
        (this.controller.byId("messagesPage") as VBox).bindElement({
            path: `/Conversations(${conversationId})`,
            parameters: { $$updateGroupId: CONVERSATION_GROUP }
        });

        this.refreshHeader();
        void this.loadUnread(conversationId);
    }

    public close(): void {
        this.conversationId = "";
        this.memberIds = [];
        this.controller.getUiModel().setProperty("/conversationId", "");
        (this.controller.byId("messagesPage") as VBox).unbindElement();
    }

    /** Relê Kind, par do Direct, nº de membros e os membros (para o online) da conversa aberta. */
    public refreshHeader(): void {
        const id = this.conversationId;

        if (id) {
            void this.loadHeader(id);
            void this.loadMembers(id);
        }
    }

    /**
     * Recarrega a conversa aberta uma vez (contexto compartilhado com o painel) e confere MyRole:
     * se não há MyRole ou o servidor responde 404, eu saí ou fui removido e a conversa fecha.
     */
    public async refreshConversation(): Promise<void> {
        const context = (this.controller.byId("messagesPage") as VBox).getBindingContext() as Context | null;

        if (!this.conversationId || !context) {
            return;
        }

        try {
            if (!this.controller.getODataModel().hasPendingChanges(CONVERSATION_GROUP)) {
                await ((this.controller.byId("messagesPage") as VBox).getElementBinding() as ODataContextBinding).requestRefresh();
            }

            if (!await context.requestProperty("MyRole")) {
                this.leaveConversation();
                return;
            }

            this.refreshHeader();
        } catch (error) {
            if (isNotFound(error)) {
                this.leaveConversation();
            } else if (isUnauthorized(error)) {
                await this.controller.handleError(error, "conversationsError");
            }
        }
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

    private leaveConversation(): void {
        this.controller.showToast("removedFromConversation");
        this.controller.conversations.refresh();
        this.controller.navTo("chat", {}, true);
    }

    private decorate(item: CustomListItem, older: CustomListItem | undefined, animate: boolean): void {
        const message = item.getBindingContext()?.getObject() as MessageRow | undefined;
        const previous = older?.getBindingContext()?.getObject() as MessageRow | undefined;

        if (!message) {
            return;
        }

        const isSystem = message.Kind === "System";
        const startsDay = !previous || !formatter.sameDay(message.createdAt, previous.createdAt);
        const separator = (item.getContent()[0] as VBox).getItems()[0] as Text;

        separator.setVisible(startsDay);
        separator.setText(formatter.dayLabel(message.createdAt));
        const accentClass = `rsAccent${formatter.accentIndex(message.Sender?.ID)}`;

        ACCENT_CLASSES.forEach((cssClass) => item.toggleStyleClass(cssClass, !isSystem && cssClass === accentClass));
        item.toggleStyleClass("rsGrouped", !isSystem && !startsDay && previous?.Sender?.ID === message.Sender?.ID);

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
        const context = (this.controller.byId("messagesPage") as VBox).getBindingContext() as Context | null;
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

        const status = this.statusLine();

        ui.setProperty("/isTyping", false);
        ui.setProperty("/subtitleOnline", status.online);
        ui.setProperty("/subtitle", status.text);
    }

    /** Direct: online ou visto por último da outra pessoa. Grupo e canal: nº de membros e quantos estão online. */
    private statusLine(): { text: string; online: boolean } {
        const presence = this.controller.getPresence();

        if (formatter.isDirect(this.kind) && this.peerId) {
            const isOnline = presence.isOnline(this.peerId);

            return { text: formatter.directStatus(isOnline, presence.getLastSeen(this.peerId) ?? null), online: isOnline };
        }

        if (this.memberCount === null) {
            return { text: "", online: false };
        }

        const myId = this.controller.getMyId();
        const online = this.memberIds.filter((userId) => userId !== myId && presence.isOnline(userId)).length;

        return { text: formatter.memberSummary(this.memberCount, online), online: online > 0 };
    }

    /** Kind, par do Direct e nº de membros vêm da própria página da conversa (sem request extra). */
    private async loadHeader(conversationId: string): Promise<void> {
        const context = (this.controller.byId("messagesPage") as VBox).getBindingContext() as Context | null;

        if (!context) {
            return;
        }

        try {
            const [kind, peerId, memberCount] = await context.requestProperty(["Kind", "DirectPeer_ID", "MemberCount"]) as [string, string | null, number | null];

            if (conversationId === this.conversationId) {
                this.kind = kind;
                this.peerId = peerId;
                this.memberCount = memberCount;
                void this.loadPeerLastSeen(conversationId);
                void this.updateSubtitle();
            }
        } catch (error) {
            if (isUnauthorized(error)) {
                await this.controller.handleError(error, "conversationsError");
            }
        }
    }

    /** "Visto por último" do Direct vem de /People; o presence.changed mantém o valor atualizado depois. */
    private async loadPeerLastSeen(conversationId: string): Promise<void> {
        const peerId = this.peerId;

        if (!peerId || !formatter.isDirect(this.kind)) {
            return;
        }

        const binding = this.controller.getODataModel().bindContext(`/People(${peerId})`, undefined, { $select: "LastSeenAt" });

        try {
            const person = await binding.requestObject() as { LastSeenAt: string | null } | undefined;

            this.controller.getPresence().rememberLastSeen(peerId, person?.LastSeenAt);
        } catch (error) {
            if (isUnauthorized(error)) {
                await this.controller.handleError(error, "conversationsError");
            }
        } finally {
            binding.destroy();
        }

        if (conversationId === this.conversationId) {
            void this.updateSubtitle();
        }
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
