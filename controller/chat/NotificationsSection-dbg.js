sap.ui.define(["sap/ui/core/Fragment", "sap/m/MessageBox", "../../util/sound", "../../util/notifications"], function (Fragment, MessageBox, ____util_sound, ____util_notifications) {
  "use strict";

  const playMessageChime = ____util_sound["playMessageChime"];
  const bannerDismissed = ____util_notifications["bannerDismissed"];
  const dismissBanner = ____util_notifications["dismissBanner"];
  const notificationPermission = ____util_notifications["notificationPermission"];
  const showLocalNotification = ____util_notifications["showLocalNotification"];
  const UPDATE_GROUP = "settings";
  const ENABLE_MESSAGES = {
    denied: "notifyDenied",
    dismissed: "notifyNotGranted",
    unsupported: "notifyUnsupported",
    notConfigured: "notifyUnsupported"
  };
  function isMuted(mutedUntil) {
    return !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();
  }

  /**
   * Notificações: banner de ativação, diálogo de configurações (MySettings two-way no update group
   * "settings") e aviso local com o app aberto em segundo plano (som + notificação do navegador).
   */
  class NotificationsSection {
    onMessageCreated = payload => {
      void this.alertIfNeeded(payload);
    };
    constructor(controller) {
      this.controller = controller;
    }
    init() {
      this.controller.getRealtime().on("message.created", this.onMessageCreated);
      void this.loadState();
    }
    destroy() {
      this.controller.getRealtime().off("message.created", this.onMessageCreated);
      this.dialog?.destroy();
    }
    onBannerEnable = async () => {
      this.hideBanner();
      await this.saveSettings(() => this.activateDevice());
    };
    onBannerLater = () => {
      this.hideBanner();
    };
    onOpen = async () => {
      try {
        const dialog = await this.getDialog();
        dialog.bindElement({
          path: `/MySettings(User_ID=${this.myId()})`,
          parameters: {
            $$updateGroupId: UPDATE_GROUP
          }
        });
        this.refreshPermission();
        dialog.open();
      } catch (error) {
        await this.controller.handleError(error, "notificationsError");
      }
    };
    onClose = () => {
      this.dialog?.close();
    };
    onAfterClose = () => {
      const model = this.controller.getODataModel();
      if (model.hasPendingChanges(UPDATE_GROUP)) {
        model.resetChanges(UPDATE_GROUP);
      }
    };

    /** Interruptor principal: ativa o push neste aparelho (com permissão) ou desativa; depois salva o flag. */
    onToggle = async event => {
      const enabling = event.getParameter("state") === true;
      await this.saveSettings(() => enabling ? this.activateDevice() : this.deactivateDevice());
    };
    onSoundChange = async () => {
      await this.saveSettings();
    };
    onSendTest = async () => {
      try {
        await this.push().sendTest();
        this.controller.showToast("notifyTestSent");
      } catch (error) {
        await this.controller.handleError(error, "notificationsError");
      }
    };

    /** Carrega a chave VAPID e a permissão; sem chave o push some e o banner não aparece. */
    async loadState() {
      const key = await this.push().publicKey().catch(() => null);
      const permission = notificationPermission();
      const model = this.getModel();
      model.setProperty("/configured", key !== null);
      model.setProperty("/permission", permission);
      model.setProperty("/bannerVisible", key !== null && permission === "default" && !bannerDismissed(this.myId()));
    }

    /** Salva as alterações do update group; antes, `beforeSave` faz a parte do aparelho (false = cancelar). */
    async saveSettings(beforeSave = () => Promise.resolve(true)) {
      const model = this.controller.getODataModel();
      try {
        if (!(await beforeSave())) {
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
    async activateDevice() {
      const result = await this.push().enable();
      if (result === "enabled") {
        this.controller.showToast("notifyEnabledOk");
        return true;
      }
      MessageBox.warning(this.controller.getText(ENABLE_MESSAGES[result] ?? "notificationsError"));
      return false;
    }
    async deactivateDevice() {
      await this.push().disable();
      this.controller.showToast("notifyDisabled");
      return true;
    }
    hideBanner() {
      dismissBanner(this.myId());
      this.getModel().setProperty("/bannerVisible", false);
    }

    /**
     * Aviso local: outra pessoa escreveu e a aba está oculta ou a conversa não está aberta.
     * Conversa silenciada não avisa. Falhas aqui são silenciosas (o aviso é um extra).
     */
    async alertIfNeeded(payload) {
      const myId = this.myId();
      const openId = this.controller.getUiModel().getProperty("/conversationId");
      if (payload.SenderId === myId || document.visibilityState === "visible" && payload.ConversationId === openId) {
        return;
      }
      try {
        const chat = this.controller.getChatService();
        const [settings, message, mutedUntil] = await Promise.all([chat.findMySettings(myId), chat.findMessageForNotification(payload.MessageId), chat.findMyMutedUntil(payload.ConversationId, myId)]);
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
    alertTitle(message) {
      const sender = message.Sender?.DisplayName || this.controller.getText("someone");
      const conversation = message.Conversation;
      if (!conversation?.Name || conversation.Kind === "Direct") {
        return sender;
      }
      return `${sender} · ${conversation.Name}`;
    }
    refreshPermission() {
      this.getModel().setProperty("/permission", notificationPermission());
    }
    push() {
      return this.controller.getAppComponent().getPushService();
    }
    getModel() {
      return this.controller.getAppComponent().getModel("notifications");
    }
    myId() {
      return this.controller.getSessionModel().getProperty("/user/ID");
    }
    async getDialog() {
      if (!this.dialog) {
        const view = this.controller.getView();
        this.dialog = await Fragment.load({
          id: view?.getId(),
          name: "apps.dflc.resenha.view.fragments.NotificationsDialog",
          controller: this
        });
        view?.addDependent(this.dialog);
      }
      return this.dialog;
    }
  }
  return NotificationsSection;
});
//# sourceMappingURL=NotificationsSection-dbg.js.map
