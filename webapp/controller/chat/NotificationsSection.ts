import Fragment from "sap/ui/core/Fragment";
import MessageBox from "sap/m/MessageBox";
import type Dialog from "sap/m/Dialog";
import type { Switch$ChangeEvent } from "sap/m/Switch";
import type JSONModel from "sap/ui/model/json/JSONModel";
import type Chat from "../Chat.controller";
import type PushService from "../../service/PushService";
import type { PushEnableResult } from "../../service/PushService";
import type { NotifiableMessage } from "../../service/ChatService";
import type { MessageCreatedPayload } from "../../service/RealtimeEvents";
import { playMessageChime } from "../../util/sound";
import {
    bannerDismissed,
    dismissBanner,
    notificationPermission,
    showLocalNotification
} from "../../util/notifications";

const UPDATE_GROUP = "settings";

const ENABLE_MESSAGES: Partial<Record<PushEnableResult, string>> = {
    denied: "notifyDenied",
    dismissed: "notifyNotGranted",
    unsupported: "notifyUnsupported",
    notConfigured: "notifyUnsupported"
};

function isMuted(mutedUntil: string | null): boolean {
    return !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();
}

/**
 * Notificações: banner de ativação, diálogo de configurações (MySettings two-way no update group
 * "settings") e aviso local com o app aberto em segundo plano (som + notificação do navegador).
 */
export default class NotificationsSection {

    private dialog?: Dialog;

    private readonly onMessageCreated = (payload: MessageCreatedPayload): void => {
        void this.alertIfNeeded(payload);
    };

    public constructor(private readonly controller: Chat) { }

    public init(): void {
        this.controller.getRealtime().on("message.created", this.onMessageCreated);
        void this.loadState();
    }

    public destroy(): void {
        this.controller.getRealtime().off("message.created", this.onMessageCreated);
        this.dialog?.destroy();
    }

    public onBannerEnable = async (): Promise<void> => {
        this.hideBanner();
        await this.saveSettings(() => this.activateDevice());
    };

    public onBannerLater = (): void => {
        this.hideBanner();
    };

    public onOpen = async (): Promise<void> => {
        try {
            const dialog = await this.getDialog();

            dialog.bindElement({ path: `/MySettings(User_ID=${this.myId()})`, parameters: { $$updateGroupId: UPDATE_GROUP } });
            this.refreshPermission();
            dialog.open();
        } catch (error) {
            await this.controller.handleError(error, "notificationsError");
        }
    };

    public onClose = (): void => {
        this.dialog?.close();
    };

    public onAfterClose = (): void => {
        const model = this.controller.getODataModel();

        if (model.hasPendingChanges(UPDATE_GROUP)) {
            model.resetChanges(UPDATE_GROUP);
        }
    };

    /** Interruptor principal: ativa o push neste aparelho (com permissão) ou desativa; depois salva o flag. */
    public onToggle = async (event: Switch$ChangeEvent): Promise<void> => {
        const enabling = event.getParameter("state") === true;

        await this.saveSettings(() => (enabling ? this.activateDevice() : this.deactivateDevice()));
    };

    public onSoundChange = async (): Promise<void> => {
        await this.saveSettings();
    };

    public onSendTest = async (): Promise<void> => {
        try {
            await this.push().sendTest();
            this.controller.showToast("notifyTestSent");
        } catch (error) {
            await this.controller.handleError(error, "notificationsError");
        }
    };

    /** Carrega a chave VAPID e a permissão; sem chave o push some e o banner não aparece. */
    private async loadState(): Promise<void> {
        const key = await this.push().publicKey().catch(() => null);
        const permission = notificationPermission();
        const model = this.getModel();

        model.setProperty("/configured", key !== null);
        model.setProperty("/permission", permission);
        model.setProperty("/bannerVisible", key !== null && permission === "default" && !bannerDismissed(this.myId()));
    }

    /** Salva as alterações do update group; antes, `beforeSave` faz a parte do aparelho (false = cancelar). */
    private async saveSettings(beforeSave: () => Promise<boolean> = () => Promise.resolve(true)): Promise<void> {
        const model = this.controller.getODataModel();

        try {
            if (!await beforeSave()) {
                model.resetChanges(UPDATE_GROUP);
                return;
            }

            if (model.hasPendingChanges(UPDATE_GROUP)) {
                await model.submitBatch(UPDATE_GROUP);
            }
        } catch (error) {
            model.resetChanges(UPDATE_GROUP);
            await this.controller.handleError(error, "notificationsError");
        } finally {
            this.refreshPermission();
        }
    }

    /** Inscreve o aparelho; false quando o navegador não permitiu (a explicação já foi mostrada). */
    private async activateDevice(): Promise<boolean> {
        const result = await this.push().enable();

        if (result === "enabled") {
            this.controller.showToast("notifyEnabledOk");
            return true;
        }

        MessageBox.warning(this.controller.getText(ENABLE_MESSAGES[result] ?? "notificationsError"));

        return false;
    }

    private async deactivateDevice(): Promise<boolean> {
        await this.push().disable();
        this.controller.showToast("notifyDisabled");

        return true;
    }

    private hideBanner(): void {
        dismissBanner(this.myId());
        this.getModel().setProperty("/bannerVisible", false);
    }

    /**
     * Aviso local: outra pessoa escreveu e a aba está oculta ou a conversa não está aberta.
     * Conversa silenciada não avisa. Falhas aqui são silenciosas (o aviso é um extra).
     */
    private async alertIfNeeded(payload: MessageCreatedPayload): Promise<void> {
        const myId = this.myId();
        const openId = this.controller.getUiModel().getProperty("/conversationId") as string;

        if (payload.SenderId === myId || (document.visibilityState === "visible" && payload.ConversationId === openId)) {
            return;
        }

        try {
            const chat = this.controller.getChatService();
            const [settings, message, mutedUntil] = await Promise.all([
                chat.findMySettings(myId),
                chat.findMessageForNotification(payload.MessageId),
                chat.findMyMutedUntil(payload.ConversationId, myId)
            ]);

            if (!message || message.DeletedAt || isMuted(mutedUntil)) {
                return;
            }

            if (settings?.NotificationSound === true) {
                playMessageChime();
            }

            if (settings?.NotificationsEnabled === true) {
                await showLocalNotification({
                    conversationId: payload.ConversationId,
                    title: this.alertTitle(message),
                    body: message.Text?.trim() || this.controller.getText("newMessageBody")
                });
            }
        } catch {
            // aviso local é opcional: sem rede ou sem permissão, a resenha segue normal
        }
    }

    /** "Remetente" em conversa direta; "Remetente · conversa" nas demais. */
    private alertTitle(message: NotifiableMessage): string {
        const sender = message.Sender?.DisplayName || this.controller.getText("someone");
        const conversation = message.Conversation;

        if (!conversation?.Name || conversation.Kind === "Direct") {
            return sender;
        }

        return `${sender} · ${conversation.Name}`;
    }

    private refreshPermission(): void {
        this.getModel().setProperty("/permission", notificationPermission());
    }

    private push(): PushService {
        return this.controller.getAppComponent().getPushService();
    }

    private getModel(): JSONModel {
        return this.controller.getAppComponent().getModel("notifications") as JSONModel;
    }

    private myId(): string {
        return this.controller.getSessionModel().getProperty("/user/ID") as string;
    }

    private async getDialog(): Promise<Dialog> {
        if (!this.dialog) {
            const view = this.controller.getView();

            this.dialog = await Fragment.load({
                id: view?.getId(),
                name: "apps.dflc.resenha.view.fragments.NotificationsDialog",
                controller: this
            }) as Dialog;
            view?.addDependent(this.dialog);
        }

        return this.dialog;
    }

}
