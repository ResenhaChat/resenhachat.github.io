/* eslint-disable fiori-custom/sap-no-localstorage -- preferencia de tema salva no navegador (requisito desta fase) */
import Theming from "sap/ui/core/Theming";

export type ThemeMode = "auto" | "light" | "dark";

const STORAGE_KEY = "resenha.theme";
const LIGHT_THEME = "sap_horizon";
const DARK_THEME = "sap_horizon_dark";
const MODES: readonly ThemeMode[] = ["auto", "light", "dark"];

function isThemeMode(value: unknown): value is ThemeMode {
    return MODES.includes(value as ThemeMode);
}

/** Claro/Escuro/Automático (segue prefers-color-scheme). Preferência em localStorage. */
export default class ThemeManager {

    private static mode: ThemeMode = "auto";

    private static media?: MediaQueryList;

    public static init(): void {
        ThemeManager.mode = ThemeManager.readMode();
        ThemeManager.media = window.matchMedia("(prefers-color-scheme: dark)");
        ThemeManager.media.addEventListener("change", () => ThemeManager.apply());
        ThemeManager.apply();
    }

    public static getMode(): ThemeMode {
        return ThemeManager.mode;
    }

    public static setMode(mode: ThemeMode): void {
        ThemeManager.mode = mode;

        try {
            window.localStorage.setItem(STORAGE_KEY, mode);
        } catch {
            // sem armazenamento: vale só nesta sessão
        }

        ThemeManager.apply();
    }

    private static readMode(): ThemeMode {
        try {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            return isThemeMode(stored) ? stored : "auto";
        } catch {
            return "auto";
        }
    }

    private static apply(): void {
        const dark = ThemeManager.mode === "dark" || (ThemeManager.mode === "auto" && !!ThemeManager.media?.matches);
        const theme = dark ? DARK_THEME : LIGHT_THEME;

        if (Theming.getTheme() !== theme) {
            Theming.setTheme(theme);
        }
    }

}
