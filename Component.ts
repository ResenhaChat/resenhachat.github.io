import UIComponent from "sap/ui/core/UIComponent";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Device from "sap/ui/Device";
import type ResourceModel from "sap/ui/model/resource/ResourceModel";
import type ResourceBundle from "sap/base/i18n/ResourceBundle";
import AuthService from "./auth/AuthService";
import type { AuthSession } from "./auth/AuthService";
import { getRuntimeConfig, loadRuntimeConfig } from "./auth/RuntimeConfig";
import ChatService from "./service/ChatService";
import PushService from "./service/PushService";
import RealtimeService from "./service/RealtimeService";
import PresenceModel from "./model/PresenceModel";
import { setFormatterTextProvider } from "./model/formatter";
import ThemeManager from "./util/ThemeManager";
import { createPwaModel } from "./util/pwa";
import { createNotificationsModel } from "./util/notifications";
import { registerServiceWorker } from "./util/push";

export interface UiState {
    mobileView: "list" | "chat";
    darkMode: boolean;
    conversationId: string;
    draft: string;
    drafts: Record<string, string>;
    sending: boolean;
    subtitle: string;
    subtitleOnline: boolean;
    typingLabel: string;
    isTyping: boolean;
    login: {
        mode: "login" | "register";
        login: string;
        password: string;
        email: string;
        username: string;
        displayName: string;
        error: string;
    };
}

const LOGIN_HASH = "/login";

/**
 * @namespace apps.dflc.resenha
 */
export default class Component extends UIComponent {

    public static metadata = {
        manifest: "json",
        interfaces: ["sap.ui.core.IAsyncContentCreation"]
    };

    private chatService?: ChatService;

    private pushService?: PushService;

    private realtime?: RealtimeService;

    private chatModel?: ODataModel;

    private lastAccessToken = "";

    public init(): void {
        super.init();

        ThemeManager.init();
        setFormatterTextProvider((key, parameters) => this.getBundle().getText(key, parameters as string[]) ?? key);
        void this.start();
    }

    public getAuth(): AuthService {
        return AuthService.getInstance();
    }

    public getChatService(): ChatService {
        if (!this.chatService) {
            throw new Error("Chat service is not available before login");
        }

        return this.chatService;
    }

    public getPushService(): PushService {
        if (!this.pushService) {
            throw new Error("Push service is not available before login");
        }

        return this.pushService;
    }

    public getRealtime(): RealtimeService {
        if (!this.realtime) {
            throw new Error("Realtime service is not available before login");
        }

        return this.realtime;
    }

    public getPresence(): PresenceModel {
        return this.getModel("presence") as PresenceModel;
    }

    public getBundle(): ResourceBundle {
        return (this.getModel("i18n") as ResourceModel).getResourceBundle() as ResourceBundle;
    }

    public isSessionStarted(): boolean {
        return !!this.chatModel;
    }

    public destroy(): void {
        this.realtime?.stop();
        super.destroy();
    }

    private async start(): Promise<void> {
        await loadRuntimeConfig();

        this.setModel(new JSONModel(Device), "device");
        this.setModel(new JSONModel({ user: {} }), "session");
        this.setModel(new PresenceModel(), "presence");
        this.setModel(this.createUiModel(), "ui");
        this.setModel(createPwaModel(), "pwa");
        this.setModel(createNotificationsModel(), "notifications");

        const auth = this.getAuth();

        if (auth.hasSession() && await auth.ensureFreshSession()) {
            this.startSession(auth.getSession());
        }

        auth.onChange((session) => this.onAuthChanged(session));

        if (!this.isSessionStarted() && window.location.hash !== `#${LOGIN_HASH}`) {
            window.location.replace(`#${LOGIN_HASH}`);
        }

        this.getRouter().initialize();
    }

    private createUiModel(): JSONModel {
        const state: UiState = {
            mobileView: "list",
            darkMode: ThemeManager.isDark(),
            conversationId: "",
            draft: "",
            drafts: {},
            sending: false,
            subtitle: "",
            subtitleOnline: false,
            typingLabel: "",
            isTyping: false,
            login: { mode: "login", login: "", password: "", email: "", username: "", displayName: "", error: "" }
        };

        const model = new JSONModel(state);

        ThemeManager.onChange((dark) => model.setProperty("/darkMode", dark));

        return model;
    }

    private onAuthChanged(session: AuthSession | null): void {
        if (!session) {
            this.realtime?.stop();

            if (this.chatModel) {
                window.location.hash = LOGIN_HASH;
                // recarrega para descartar modelos, WebSocket e estados da sessao encerrada
                // eslint-disable-next-line fiori-custom/sap-no-location-reload
                window.location.reload();
            }

            return;
        }

        if (!this.chatModel) {
            this.startSession(session);
            return;
        }

        this.chatModel.changeHttpHeaders({ Authorization: `Bearer ${session.AccessToken}` });

        if (session.AccessToken !== this.lastAccessToken) {
            this.lastAccessToken = session.AccessToken;
            this.realtime?.renew();
        }
    }

    private startSession(session: AuthSession | null): void {
        if (!session || this.chatModel) {
            return;
        }

        const userId = session.User.ID;

        (this.getModel("session") as JSONModel).setProperty("/user", { ID: userId });
        this.getPresence().setSelf(userId);
        this.lastAccessToken = session.AccessToken;

        this.chatModel = new ODataModel({
            serviceUrl: getRuntimeConfig().chatService,
            httpHeaders: { Authorization: `Bearer ${session.AccessToken}` },
            operationMode: "Server",
            autoExpandSelect: true,
            earlyRequests: true
        });

        this.setModel(this.chatModel);
        this.chatService = new ChatService(this.chatModel);
        this.pushService = new PushService(this.chatModel);
        this.startRealtime();
        void registerServiceWorker();
        void this.pushService.sync().catch(() => false);
    }

    private startRealtime(): void {
        const realtime = new RealtimeService((forceRefresh) => this.buildWsUrl(forceRefresh));
        const presence = this.getPresence();

        realtime.on("presence.snapshot", (payload) => presence.setSnapshot(payload.OnlineUserIds ?? []));
        realtime.on("presence.changed", (payload) => presence.setUserOnline(payload.UserId, payload.IsOnline));
        realtime.on("typing", (payload) => presence.markTyping(payload.ConversationId, payload.UserId));

        this.realtime = realtime;
        realtime.start();
    }

    private async buildWsUrl(forceRefresh: boolean): Promise<string | null> {
        const auth = this.getAuth();
        const hasSession = forceRefresh ? await auth.handleUnauthorized() : await auth.ensureFreshSession();

        if (!hasSession) {
            return null;
        }

        const { wsUrl } = getRuntimeConfig();
        const separator = wsUrl.includes("?") ? "&" : "?";

        return `${wsUrl}${separator}token=${encodeURIComponent(auth.getAccessToken() ?? "")}`;
    }

}
