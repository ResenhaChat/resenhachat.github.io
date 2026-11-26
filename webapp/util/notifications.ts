/* eslint-disable fiori-custom/sap-no-localstorage -- o banner de ativação é lembrado no navegador (requisito desta fase) */
import JSONModel from "sap/ui/model/json/JSONModel";
import { pushSupported, serviceWorkerReady } from "./push";

/**
 * Notificações do navegador. A permissão é pedida pelo gesto do usuário (switch, banner).
 * Com o app aberto em segundo plano, a notificação local usa o service worker e segue o
 * mesmo formato do push: tag = conversa, url = rota da conversa.
 */

export type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported";

export interface AlertContent {
    conversationId: string;
    title: string;
    body: string;
}

const BANNER_KEY = "resenha.pushBanner";
const BODY_LIMIT = 120;
const ICON = "img/icon-192.png";
const BADGE = "img/favicon.png";

export function notificationPermission(): NotificationPermissionState {
    return "Notification" in window ? Notification.permission : "unsupported";
}

/** Model "notifications": estado de UI do push (suporte, chave do servidor, permissão, banner). */
export function createNotificationsModel(): JSONModel {
    return new JSONModel({
        supported: pushSupported(),
        configured: false,
        permission: notificationPermission(),
        bannerVisible: false
    });
}

/** Pede a permissão ao navegador; devolve o estado final. */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
    if (!("Notification" in window)) {
        return "unsupported";
    }

    try {
        return await Notification.requestPermission();
    } catch {
        return notificationPermission();
    }
}

/** O banner aparece uma vez por usuário: ativar ou "Agora não" grava a escolha. */
export function bannerDismissed(userId: string): boolean {
    try {
        return window.localStorage.getItem(`${BANNER_KEY}.${userId}`) === "dismissed";
    } catch {
        return false;
    }
}

export function dismissBanner(userId: string): void {
    try {
        window.localStorage.setItem(`${BANNER_KEY}.${userId}`, "dismissed");
    } catch {
        // sem armazenamento o banner volta na próxima sessão
    }
}

/** Corpo da notificação: uma linha, no máximo 120 caracteres. */
export function notificationBody(text: string): string {
    const flat = text.replace(/\s+/g, " ").trim();

    return flat.length > BODY_LIMIT ? `${flat.slice(0, BODY_LIMIT - 1)}…` : flat;
}

/** Mostra a notificação pelo service worker (o mesmo canal do push). Sem permissão, não faz nada. */
export async function showLocalNotification(content: AlertContent): Promise<void> {
    if (notificationPermission() !== "granted") {
        return;
    }

    const registration = await serviceWorkerReady();

    await registration.showNotification(content.title, {
        body: notificationBody(content.body),
        tag: content.conversationId,
        icon: new URL(ICON, registration.scope).href,
        badge: new URL(BADGE, registration.scope).href,
        data: { url: new URL(`#/c/${content.conversationId}`, registration.scope).href }
    });
}
