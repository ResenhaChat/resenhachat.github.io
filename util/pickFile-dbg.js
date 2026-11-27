sap.ui.define([], function () {
  "use strict";

  const FOCUS_GRACE_MS = 1500;

  /**
   * Abre o seletor nativo de arquivos (chamar dentro de um gesto do usuário). Resolve null se cancelado.
   * O input fica no body só durante a escolha; o foco de volta à janela cobre o cancelamento no Safari.
   */
  function pickFile(accept) {
    return new Promise(resolve => {
      // eslint-disable-next-line fiori-custom/sap-no-element-creation -- input nativo de arquivo, não há controle UI5 equivalente
      const input = document.createElement("input");
      let focusTimer = 0;
      let onFocus = () => undefined;
      const finish = file => {
        window.removeEventListener("focus", onFocus);
        window.clearTimeout(focusTimer);
        input.remove();
        resolve(file);
      };
      onFocus = () => {
        focusTimer = window.setTimeout(() => finish(null), FOCUS_GRACE_MS);
      };
      input.type = "file";
      input.accept = accept;
      input.style.display = "none";
      input.addEventListener("change", () => finish(input.files?.[0] ?? null));
      input.addEventListener("cancel", () => finish(null));
      document.body.appendChild(input);
      window.addEventListener("focus", onFocus);
      input.click();
    });
  }
  var __exports = {
    __esModule: true
  };
  __exports.pickFile = pickFile;
  return __exports;
});
//# sourceMappingURL=pickFile-dbg.js.map
