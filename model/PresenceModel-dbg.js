sap.ui.define(["sap/ui/model/json/JSONModel"], function (JSONModel) {
  "use strict";

  const TYPING_EXPIRY_MS = 5_000;

  /** Estado efêmero vindo do WebSocket: quem está online e quem está digitando em cada conversa. */
  class PresenceModel extends JSONModel {
    selfId = "";
    typingTimers = new Map();
    changeListeners = new Set();
    lastSeen = new Map();
    constructor() {
      super({
        online: {},
        typing: {}
      });
      this.setDefaultBindingMode("OneWay");
    }
    setSelf(userId) {
      this.selfId = userId;
    }
    onPresenceChange(listener) {
      this.changeListeners.add(listener);
      return () => this.changeListeners.delete(listener);
    }
    isOnline(userId) {
      return !!this.getOnline()[userId];
    }
    getTypingUserIds(conversationId) {
      const typing = this.getProperty("/typing");
      return typing?.[conversationId] ?? [];
    }
    setSnapshot(onlineUserIds) {
      this.setProperty("/online", Object.fromEntries(onlineUserIds.map(id => [id, true])));
      this.emitChange();
    }

    /** Último "visto por último" conhecido (do evento ou de uma leitura de /People). */
    getLastSeen(userId) {
      return this.lastSeen.get(userId);
    }
    rememberLastSeen(userId, lastSeenAt) {
      if (lastSeenAt) {
        this.lastSeen.set(userId, lastSeenAt);
      }
    }
    setUserOnline(userId, isOnline, lastSeenAt = null) {
      const online = {
        ...this.getOnline()
      };
      this.rememberLastSeen(userId, lastSeenAt);
      if (isOnline) {
        online[userId] = true;
      } else {
        delete online[userId];
      }
      this.setProperty("/online", online);
      this.emitChange();
    }
    markTyping(conversationId, userId) {
      if (userId === this.selfId) {
        return;
      }
      const key = `${conversationId}:${userId}`;
      const current = this.getTypingUserIds(conversationId);
      window.clearTimeout(this.typingTimers.get(key));
      this.typingTimers.set(key, window.setTimeout(() => this.clearTyping(conversationId, userId), TYPING_EXPIRY_MS));
      if (!current.includes(userId)) {
        this.setTyping(conversationId, [...current, userId]);
      }
    }
    clearTyping(conversationId, userId) {
      window.clearTimeout(this.typingTimers.get(`${conversationId}:${userId}`));
      this.typingTimers.delete(`${conversationId}:${userId}`);
      this.setTyping(conversationId, this.getTypingUserIds(conversationId).filter(id => id !== userId));
    }
    destroy() {
      this.typingTimers.forEach(timer => window.clearTimeout(timer));
      this.typingTimers.clear();
      super.destroy();
    }
    getOnline() {
      return this.getProperty("/online") ?? {};
    }
    setTyping(conversationId, userIds) {
      const typing = {
        ...(this.getProperty("/typing") ?? {})
      };
      if (userIds.length) {
        typing[conversationId] = userIds;
      } else {
        delete typing[conversationId];
      }
      this.setProperty("/typing", typing);
      this.emitChange();
    }
    emitChange() {
      this.changeListeners.forEach(listener => listener());
    }
  }
  return PresenceModel;
});
//# sourceMappingURL=PresenceModel-dbg.js.map
