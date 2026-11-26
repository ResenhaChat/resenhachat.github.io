sap.ui.define(["sap/ui/model/json/JSONModel", "./push"], function (JSONModel, ___push) {
  "use strict";

  const pushSupported = ___push["pushSupported"];
  const serviceWorkerReady = ___push["serviceWorkerReady"];
  /**
   * Notificações do navegador. A permissão é pedida pelo gesto do usuário (switch, banner).
   * Com o app aberto em segundo plano, a notificação local usa o service worker e segue o
   * mesmo formato do push: tag = conversa, url = rota da conversa.
   */
  const BANNER_KEY = "resenha.pushBanner";
  const BODY_LIMIT = 120;
  const ICON = "img/icon-192.png";
  const BADGE = "img/favicon.png";
  function notificationPermission() {
    return "Notification" in window ? Notification.permission : "unsupported";
  }

  /** Model "notifications": estado de UI do push (suporte, chave do servidor, permissão, banner). */
  function createNotificationsModel() {
    return new JSONModel({
      supported: pushSupported(),
      configured: false,
      permission: notificationPermission(),
      bannerVisible: false
    });
  }

  /** Pede a permissão ao navegador; devolve o estado final. */
  async function requestNotificationPermission() {
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
  function bannerDismissed(userId) {
    try {
      return window.localStorage.getItem(`${BANNER_KEY}.${userId}`) === "dismissed";
    } catch {
      return false;
    }
  }
  function dismissBanner(userId) {
    try {
      window.localStorage.setItem(`${BANNER_KEY}.${userId}`, "dismissed");
    } catch {
      // sem armazenamento o banner volta na próxima sessão
    }
  }

  /** Corpo da notificação: uma linha, no máximo 120 caracteres. */
  function notificationBody(text) {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > BODY_LIMIT ? `${flat.slice(0, BODY_LIMIT - 1)}…` : flat;
  }

  /** Mostra a notificação pelo service worker (o mesmo canal do push). Sem permissão, não faz nada. */
  async function showLocalNotification(content) {
    if (notificationPermission() !== "granted") {
      return;
    }
    const registration = await serviceWorkerReady();
    await registration.showNotification(content.title, {
      body: notificationBody(content.body),
      tag: content.conversationId,
      icon: new URL(ICON, registration.scope).href,
      badge: new URL(BADGE, registration.scope).href,
      data: {
        url: new URL(`index.html#/c/${content.conversationId}`, registration.scope).href,
        conversationId: content.conversationId
      }
    });
  }
  var __exports = {
    __esModule: true
  };
  __exports.notificationPermission = notificationPermission;
  __exports.createNotificationsModel = createNotificationsModel;
  __exports.requestNotificationPermission = requestNotificationPermission;
  __exports.bannerDismissed = bannerDismissed;
  __exports.dismissBanner = dismissBanner;
  __exports.notificationBody = notificationBody;
  __exports.showLocalNotification = showLocalNotification;
  return __exports;
});
//# sourceMappingURL=notifications-dbg.js.map
