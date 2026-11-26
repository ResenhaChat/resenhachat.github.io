/* eslint-disable fiori-custom/sap-no-navigator */
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * Instalação do app (PWA) e contadores do sistema. O manifest só é incluído fora do iOS
 * (index.html). O evento beforeinstallprompt (Chrome/Edge no Android e no PC) é capturado
 * cedo no index.html e guardado em window.__rsInstallPrompt.
 */

export type InstallOutcome = "accepted" | "dismissed" | "ios" | "unavailable";

interface InstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type PwaWindow = Window & { __rsInstallPrompt?: InstallPromptEvent | null };

export function isStandalone(): boolean {
    return (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches)
        || (window.navigator as { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function canInstallNow(): boolean {
    return !isStandalone() && (isIos() || !!(window as PwaWindow).__rsInstallPrompt);
}

/**
 * Model "pwa": /canInstall diz se o item "Instalar app" aparece. Já instalado (tela cheia)
 * ou logo após instalar, some.
 */
export function createPwaModel(): JSONModel {
    const model = new JSONModel({ canInstall: canInstallNow() });

    const refresh = (): void => {
        model.setProperty("/canInstall", canInstallNow());
    };

    window.addEventListener("rs-installable", refresh);
    window.addEventListener("appinstalled", () => {
        (window as PwaWindow).__rsInstallPrompt = null;
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
export async function promptInstall(model: JSONModel): Promise<InstallOutcome> {
    const pwaWindow = window as PwaWindow;
    const installPrompt = pwaWindow.__rsInstallPrompt;

    if (!installPrompt) {
        return isIos() ? "ios" : "unavailable";
    }

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    // O evento só pode ser usado uma vez; o navegador dispara outro se ainda puder instalar.
    pwaWindow.__rsInstallPrompt = null;
    model.setProperty("/canInstall", canInstallNow());

    return outcome;
}

/** Título da aba "(N) Resenha" e selo do ícone (app instalado). N = 0 limpa os dois. */
export function showUnreadCount(count: number, appName: string): void {
    document.title = count > 0 ? `(${count}) ${appName}` : appName;

    if (!("setAppBadge" in navigator)) {
        return;
    }

    const request = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();

    request.catch(() => undefined);
}
