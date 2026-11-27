sap.ui.define([], function () {
  "use strict";

  /** Espelha resenhachat/srv/realtime/events.ts (contrato com o CAP). */

  /** servidor -> cliente */

  /** Eventos locais emitidos pelo próprio RealtimeService. */

  /** cliente -> servidor */

  const SERVER_EVENT_TYPES = ["presence.snapshot", "presence.changed", "message.created", "conversation.read", "conversation.created", "conversation.updated", "members.changed", "typing", "ping", "pong"];
  function isServerEventType(value) {
    return typeof value === "string" && SERVER_EVENT_TYPES.includes(value);
  }
  var __exports = {
    __esModule: true
  };
  __exports.SERVER_EVENT_TYPES = SERVER_EVENT_TYPES;
  __exports.isServerEventType = isServerEventType;
  return __exports;
});
//# sourceMappingURL=RealtimeEvents-dbg.js.map
