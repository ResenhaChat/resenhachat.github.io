sap.ui.define(["../util/notifications", "../util/push"], function (___util_notifications, ___util_push) {
  "use strict";

  const notificationPermission = ___util_notifications["notificationPermission"];
  const requestNotificationPermission = ___util_notifications["requestNotificationPermission"];
  const arrayBufferToBase64Url = ___util_push["arrayBufferToBase64Url"];
  const browserUserAgent = ___util_push["browserUserAgent"];
  const currentPushSubscription = ___util_push["currentPushSubscription"];
  const ensurePushSubscription = ___util_push["ensurePushSubscription"];
  const pushSupported = ___util_push["pushSupported"];
  /** Actions/functions do push no serviço Chat. O controller nunca monta request. */
  class PushService {
    constructor(model) {
      this.model = model;
    }

    /** Chave VAPID do servidor; null quando o push não está configurado (a opção some na tela). */
    async publicKey() {
      const operation = this.model.bindContext("/PushPublicKey(...)");
      await operation.invoke();
      const context = operation.getBoundContext();
      return context?.getObject()?.value ?? null;
    }

    /** Ativa o push neste aparelho: pede a permissão (gesto do usuário), inscreve e registra no servidor. */
    async enable() {
      if (!pushSupported()) {
        return "unsupported";
      }
      const key = await this.publicKey();
      if (!key) {
        return "notConfigured";
      }
      const permission = await requestNotificationPermission();
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
    async sync() {
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
    async disable() {
      const subscription = await currentPushSubscription();
      if (!subscription) {
        return;
      }
      await this.unregister(subscription.endpoint);
      await subscription.unsubscribe();
    }

    /** Logout: tira o endpoint deste aparelho do usuário que está saindo (a inscrição do navegador fica). */
    async detach() {
      const subscription = await currentPushSubscription();
      if (subscription) {
        await this.unregister(subscription.endpoint);
      }
    }
    async sendTest() {
      const operation = this.model.bindContext("/SendPushTest(...)");
      await operation.invoke();
    }
    async register(subscription) {
      const operation = this.model.bindContext("/SubscribePush(...)");
      operation.setParameter("Endpoint", subscription.endpoint);
      operation.setParameter("P256dh", arrayBufferToBase64Url(subscription.getKey("p256dh")));
      operation.setParameter("Auth", arrayBufferToBase64Url(subscription.getKey("auth")));
      operation.setParameter("UserAgent", browserUserAgent());
      await operation.invoke();
    }
    async unregister(endpoint) {
      const operation = this.model.bindContext("/UnsubscribePush(...)");
      operation.setParameter("Endpoint", endpoint);
      await operation.invoke();
    }
  }
  return PushService;
});
//# sourceMappingURL=PushService-dbg.js.map
