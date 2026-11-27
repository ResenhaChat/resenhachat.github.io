sap.ui.define([], function () {
  "use strict";

  /** Rejeita se a promise não resolver em `ms`; a espera pendente é limpa em qualquer desfecho. */
  function withTimeout(pending, ms) {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error("timeout")), ms);
    });
    return Promise.race([pending, timeout]).finally(() => window.clearTimeout(timer));
  }
  var __exports = {
    __esModule: true
  };
  __exports.withTimeout = withTimeout;
  return __exports;
});
//# sourceMappingURL=timeout-dbg.js.map
