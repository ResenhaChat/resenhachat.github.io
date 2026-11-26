import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { notificationPermission, requestNotificationPermission } from "../util/notifications";
import type { NotificationPermissionState } from "../util/notifications";
import {
    arrayBufferToBase64Url,
    browserUserAgent,
    currentPushSubscription,
    ensurePushSubscription,
    pushSupported
} from "../util/push";

export type PushEnableResult = "enabled" | "notConfigured" | "dismissed" | "denied" | "unsupported";

/** Actions/functions do push no serviço Chat. O controller nunca monta request. */
export default class PushService {

    public constructor(private readonly model: ODataModel) { }

    /** Chave VAPID do servidor; null quando o push não está configurado (a opção some na tela). */
    public async publicKey(): Promise<string | null> {
        const operation = this.model.bindContext("/PushPublicKey(...)");

        await operation.invoke();

        const context = operation.getBoundContext();

        return (context?.getObject() as { value?: string | null } | undefined)?.value ?? null;
    }

    /** Ativa o push neste aparelho: pede a permissão (gesto do usuário), inscreve e registra no servidor. */
    public async enable(): Promise<PushEnableResult> {
        if (!pushSupported()) {
            return "unsupported";
        }

        const key = await this.publicKey();

        if (!key) {
            return "notConfigured";
        }

        const permission: NotificationPermissionState = await requestNotificationPermission();

        if (permission === "default") {
            return "dismissed";
        }

        if (permission === "denied") {
            return "denied";
        }

        if (permission !== "granted") {
            return "unsupported";
        }

        await this.register(await ensurePushSubscription(key));

        return "enabled";
    }

    /**
     * Vincula o aparelho ao usuário atual (ao logar ou recarregar). Só age com permissão já concedida;
     * nunca pede permissão nem cria inscrição do zero.
     */
    public async sync(): Promise<boolean> {
        if (!pushSupported() || notificationPermission() !== "granted") {
            return false;
        }

        const current = await currentPushSubscription();
        const key = current ? await this.publicKey() : null;

        if (!current || !key) {
            return false;
        }

        const subscription = await ensurePushSubscription(key);

        await this.register(subscription);

        return true;
    }

    /** Desativa o push neste aparelho: remove o endpoint do servidor e cancela a inscrição do navegador. */
    public async disable(): Promise<void> {
        const subscription = await currentPushSubscription();

        if (!subscription) {
            return;
        }

        await this.unregister(subscription.endpoint);
        await subscription.unsubscribe();
    }

    /** Logout: tira o endpoint deste aparelho do usuário que está saindo (a inscrição do navegador fica). */
    public async detach(): Promise<void> {
        const subscription = await currentPushSubscription();

        if (subscription) {
            await this.unregister(subscription.endpoint);
        }
    }

    public async sendTest(): Promise<void> {
        const operation = this.model.bindContext("/SendPushTest(...)");

        await operation.invoke();
    }

    private async register(subscription: PushSubscription): Promise<void> {
        const operation = this.model.bindContext("/SubscribePush(...)");

        operation.setParameter("Endpoint", subscription.endpoint);
        operation.setParameter("P256dh", arrayBufferToBase64Url(subscription.getKey("p256dh")));
        operation.setParameter("Auth", arrayBufferToBase64Url(subscription.getKey("auth")));
        operation.setParameter("UserAgent", browserUserAgent());

        await operation.invoke();
    }

    private async unregister(endpoint: string): Promise<void> {
        const operation = this.model.bindContext("/UnsubscribePush(...)");

        operation.setParameter("Endpoint", endpoint);

        await operation.invoke();
    }

}
