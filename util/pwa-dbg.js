sap.ui.define(["sap/ui/model/json/JSONModel"], function (JSONModel) {
  "use strict";

  /**
   * Instalação do app (PWA) e contadores do sistema. O manifest só é incluído fora do iOS
   * (index.html). O evento beforeinstallprompt (Chrome/Edge no Android e no PC) é capturado
   * cedo no index.html e guardado em window.__rsInstallPrompt.
   */

  function isStandalone() {
    return typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }
  function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  }
  function canInstallNow() {
    return !isStandalone() && (isIos() || !!window.__rsInstallPrompt);
  }

  /**
   * Model "pwa": /canInstall diz se o item "Instalar app" aparece. Já instalado (tela cheia)
   * ou logo após instalar, some.
   */
  function createPwaModel() {
    const model = new JSONModel({
      canInstall: canInstallNow()
    });
    const refresh = () => {
      model.setProperty("/canInstall", canInstallNow());
    };
    window.addEventListener("rs-installable", refresh);
    window.addEventListener("appinstalled", () => {
      window.__rsInstallPrompt = null;
      refresh();
    });
    window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", refresh);
    return model;
  }

  /**
   * Abre o prompt nativo de instalação. No iPhone não há prompt: devolve "ios" para a tela
   * mostrar o passo a passo do "Adicionar à Tela de Início". O prompt é chamado antes de
   * qualquer await, dentro do gesto do usuário.
   */
  async function promptInstall(model) {
    const pwaWindow = window;
    const installPrompt = pwaWindow.__rsInstallPrompt;
    if (!installPrompt) {
      return isIos() ? "ios" : "unavailable";
    }
    await installPrompt.prompt();
    const {
      outcome
    } = await installPrompt.userChoice;

    // O evento só pode ser usado uma vez; o navegador dispara outro se ainda puder instalar.
    pwaWindow.__rsInstallPrompt = null;
    model.setProperty("/canInstall", canInstallNow());
    return outcome;
  }

  /** Título da aba "(N) Resenha" e selo do ícone (app instalado). N = 0 limpa os dois. */
  function showUnreadCount(count, appName) {
    document.title = count > 0 ? `(${count}) ${appName}` : appName;
    if (!("setAppBadge" in navigator)) {
      return;
    }
    const request = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
    request.catch(() => undefined);
  }
  var __exports = {
    __esModule: true
  };
  __exports.isStandalone = isStandalone;
  __exports.isIos = isIos;
  __exports.createPwaModel = createPwaModel;
  __exports.promptInstall = promptInstall;
  __exports.showUnreadCount = showUnreadCount;
  return __exports;
});
//# sourceMappingURL=pwa-dbg.js.map
