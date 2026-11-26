sap.ui.define(["../util/Environment"], function (__Environment) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const Environment = _interopRequireDefault(__Environment);
  const LOCAL_CONFIG = {
    chatService: "/service/Chat/",
    authBase: "/auth",
    wsUrl: "ws://localhost:4004/ws"
  };
  let runtimeConfig = {
    ...LOCAL_CONFIG
  };
  function deriveWsUrl(chatService) {
    const url = new URL(chatService, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws";
    url.search = "";
    url.hash = "";
    return url.toString();
  }
  function normalize(payload) {
    const chatService = payload.chatService || LOCAL_CONFIG.chatService;
    return {
      chatService,
      authBase: (payload.authBase || LOCAL_CONFIG.authBase).replace(/\/+$/, ""),
      wsUrl: payload.wsUrl || deriveWsUrl(chatService)
    };
  }
  function getRuntimeConfig() {
    return runtimeConfig;
  }

  /**
   * Carrega config/runtime-config.json. Em localhost usa sempre o proxy local do ui5-local.yaml
   * (e o WebSocket direto no CAP); no GitHub Pages vale o que estiver no arquivo publicado.
   */
  async function loadRuntimeConfig() {
    if (Environment.isLocal()) {
      runtimeConfig = {
        ...LOCAL_CONFIG
      };
      return runtimeConfig;
    }
    try {
      const response = await fetch(sap.ui.require.toUrl("apps/dflc/resenha/config/runtime-config.json"));
      runtimeConfig = normalize(response.ok ? await response.json() : {});
    } catch {
      runtimeConfig = {
        ...LOCAL_CONFIG
      };
    }
    return runtimeConfig;
  }
  var __exports = {
    __esModule: true
  };
  __exports.getRuntimeConfig = getRuntimeConfig;
  __exports.loadRuntimeConfig = loadRuntimeConfig;
  return __exports;
});
//# sourceMappingURL=RuntimeConfig-dbg.js.map
