/*
 * Service worker do Resenha: recebe as notificações push das resenhas
 * mesmo com o app fechado. Precisa ficar na raiz do webapp para ter escopo do site todo.
 * Não faz cache nem intercepta requisições: só cuida de push e de clique na notificação.
 */

self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

function readPayload(event) {
    if (!event.data) {
        return {};
    }

    try {
        return event.data.json() ?? {};
    } catch {
        return { body: event.data.text() };
    }
}

function assetUrl(path) {
    return new URL(path, self.registration.scope).href;
}

function conversationUrl(conversationId) {
    return new URL(`index.html#/c/${conversationId}`, self.registration.scope).href;
}

function showPushNotification(event) {
    const payload = readPayload(event);
    const conversationId = payload.tag;
    const url = payload.url || (conversationId ? conversationUrl(conversationId) : assetUrl("index.html"));

    return self.registration.showNotification(payload.title || "Resenha", {
        body: payload.body,
        tag: conversationId,
        renotify: !!conversationId,
        icon: assetUrl("img/icon-192.png"),
        badge: assetUrl("img/favicon.png"),
        data: { url, conversationId }
    });
}

function isAppWindow(windowClient) {
    return windowClient.url.startsWith(self.registration.scope);
}

async function openNotificationTarget({ url, conversationId }) {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = windows.find(isAppWindow);

    if (!client) {
        return self.clients.openWindow(url);
    }

    await client.focus();

    if (conversationId) {
        client.postMessage({ type: "rs-open-conversation", conversationId });
    }
}

self.addEventListener("push", (event) => {
    event.waitUntil(showPushNotification(event));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(openNotificationTarget(event.notification.data ?? { url: self.registration.scope }));
});
