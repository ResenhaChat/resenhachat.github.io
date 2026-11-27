import BaseController from "./BaseController";
import Device from "sap/ui/Device";
import type Event from "sap/ui/base/Event";
import type Avatar from "sap/m/Avatar";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import ConversationsSection from "./chat/ConversationsSection";
import MessagesSection from "./chat/MessagesSection";
import ComposerSection from "./chat/ComposerSection";
import ProfileSection from "./chat/ProfileSection";
import OnlineSection from "./chat/OnlineSection";
import InstallSection from "./chat/InstallSection";
import NotificationsSection from "./chat/NotificationsSection";
import ConversationActionsSection from "./chat/ConversationActionsSection";
import NewChatSection from "./chat/NewChatSection";
import NewConversationSection from "./chat/NewConversationSection";
import ExploreChannelsSection from "./chat/ExploreChannelsSection";
import MembersSection from "./chat/MembersSection";
import DetailsSection from "./chat/DetailsSection";
import { isUnauthorized } from "../util/errors";

const MOBILE_LIST = "list";
const MOBILE_CHAT = "chat";
const UNAUTHORIZED_RETRY_GAP_MS = 10_000;

/**
 * @namespace apps.dflc.resenha.controller
 */
export default class Chat extends BaseController {

    public readonly conversations = new ConversationsSection(this);

    public readonly messages = new MessagesSection(this);

    public readonly composer = new ComposerSection(this);

    public readonly profile = new ProfileSection(this);

    public readonly online = new OnlineSection(this);

    public readonly install = new InstallSection(this);

    public readonly notifications = new NotificationsSection(this);

    public readonly actions = new ConversationActionsSection(this);

    public readonly newChat = new NewChatSection(this);

    public readonly newConversation = new NewConversationSection(this);

    public readonly explore = new ExploreChannelsSection(this);

    public readonly members = new MembersSection(this);

    public readonly details = new DetailsSection(this);

    private lastUnauthorizedRetry = 0;

    public onInit(): void {
        this.getRouter().getRoute("chat")?.attachPatternMatched(this.onChatMatched);
        this.getRouter().getRoute("conversation")?.attachPatternMatched(this.onConversationMatched);
        this.bindOwnAvatar();

        this.conversations.init();
        this.messages.init();
        this.composer.init();
        this.online.init();
        this.notifications.init();
    }

    public onExit(): void {
        this.getRouter().getRoute("chat")?.detachPatternMatched(this.onChatMatched);
        this.getRouter().getRoute("conversation")?.detachPatternMatched(this.onConversationMatched);
        this.conversations.destroy();
        this.messages.destroy();
        this.profile.destroy();
        this.online.destroy();
        this.notifications.destroy();
        this.install.destroy();
        this.details.destroy();
        this.newChat.destroy();
        this.newConversation.destroy();
        this.explore.destroy();
        this.members.destroy();
    }

    /** Lista de conversas carregada: atualiza o contador de não lidas (título e selo) e trata o 401. */
    public onConversationsDataReceived = (event: Event<{ error?: unknown }>): void => {
        if (!event.getParameter("error")) {
            this.conversations.updateUnread();
        }

        void this.onDataReceived(event);
    };

    /** Binding de lista com 401: renova o token e relê, no máximo uma vez a cada 10 s. */
    public onDataReceived = async (event: Event<{ error?: unknown }>): Promise<void> => {
        if (!isUnauthorized(event.getParameter("error")) || Date.now() - this.lastUnauthorizedRetry < UNAUTHORIZED_RETRY_GAP_MS) {
            return;
        }

        this.lastUnauthorizedRetry = Date.now();

        if (await this.getAuth().handleUnauthorized()) {
            event.getSource<ODataListBinding>().refresh();
        }
    };

    /** Avatar do cabeçalho lê nome e id do próprio usuário em /Me(<id>). */
    private bindOwnAvatar(): void {
        const userId = this.getAuth().getUser()?.ID;

        if (userId) {
            (this.byId("meAvatar") as Avatar).bindElement({ path: `/Me(${userId})` });
        }
    }

    private onChatMatched = (): void => {
        if (!this.hasSession()) {
            return;
        }

        if (Device.system.desktop) {
            void this.openGeneralConversation();
            return;
        }

        this.getUiModel().setProperty("/mobileView", MOBILE_LIST);
        this.details.onClose();
        this.messages.close();
        this.conversations.syncSelection();
    };

    private onConversationMatched = (event: Route$PatternMatchedEvent): void => {
        if (!this.hasSession()) {
            return;
        }

        const { id } = event.getParameter("arguments") as { id: string };

        this.getUiModel().setProperty("/mobileView", MOBILE_CHAT);
        this.composer.switchTo(id);
        this.messages.open(id);
        this.details.onConversationOpened();
        this.conversations.syncSelection();
    };

    /** Desktop abre direto a conversa geral, localizada por Kind = General (não por id fixo). */
    private async openGeneralConversation(): Promise<void> {
        try {
            const id = await this.getChatService().findGeneralConversationId();

            if (id) {
                this.navTo("conversation", { id }, true);
            }
        } catch (error) {
            await this.handleError(error, "conversationsError");
        }
    }

    private hasSession(): boolean {
        if (this.getAuth().hasSession()) {
            return true;
        }

        this.navTo("login", {}, true);

        return false;
    }

}
