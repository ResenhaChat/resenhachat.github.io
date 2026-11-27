sap.ui.define(["./timeout"], function (___timeout) {
  "use strict";

  const withTimeout = ___timeout["withTimeout"];
  /** Subconjunto da API do pdf.js (v4) usado pelo app; o módulo vem do CDN, não entra no bundle. */
  // eslint-disable-next-line fiori-custom/sap-no-hardcoded-url -- CDN fixo pedido para o pdf.js (versão travada)
  const PDFJS_MODULE_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
  // eslint-disable-next-line fiori-custom/sap-no-hardcoded-url -- worker do mesmo CDN e versão
  const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
  const READY_EVENT = "rs-pdfjs-ready";
  const LOAD_TIMEOUT_MS = 15_000;
  let loading;

  /** Carrega o pdf.js uma única vez: um module script importa o módulo e publica a API num evento. */
  function loadPdfJs() {
    loading ??= injectModule().catch(error => {
      loading = undefined;
      throw error;
    });
    return loading;
  }
  function injectModule() {
    const ready = new Promise(resolve => {
      window.addEventListener(READY_EVENT, event => resolve(event.detail), {
        once: true
      });
      // eslint-disable-next-line fiori-custom/sap-no-element-creation -- script de módulo para importar o pdf.js do CDN
      const script = document.createElement("script");
      script.type = "module";
      script.textContent = `import * as pdfjs from "${PDFJS_MODULE_URL}"; window.dispatchEvent(new CustomEvent("${READY_EVENT}", { detail: pdfjs }));`;
      document.head.appendChild(script);
    });
    return withTimeout(ready, LOAD_TIMEOUT_MS).then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    });
  }
  var __exports = {
    __esModule: true
  };
  __exports.loadPdfJs = loadPdfJs;
  return __exports;
});
//# sourceMappingURL=pdfjs-dbg.js.map
