/* eslint-disable fiori-custom/sap-no-localstorage -- preferencia de tema salva no navegador (requisito desta fase) */
import Theming from "sap/ui/core/Theming";

export type ThemeMode = "auto" | "light" | "dark";

type DarkListener = (dark: boolean) => void;

const STORAGE_KEY = "resenha.theme";
const LIGHT_THEME = "sap_horizon";
const DARK_THEME = "sap_horizon_dark";
const DARK_CLASS = "rsDark";
const MODES: readonly ThemeMode[] = ["auto", "light", "dark"];

function isThemeMode(value: unknown): value is ThemeMode {
    return MODES.includes(value as ThemeMode);
}

/** Claro/Escuro/Automático (segue prefers-color-scheme). Aplica sap_horizon(_dark) e a classe rsDark no <html>. */
export default class ThemeManager {

    private static mode: ThemeMode = "auto";

    private static media?: MediaQueryList;

    private static dark = false;

    private static readonly listeners: DarkListener[] = [];

    public static init(): void {
        ThemeManager.mode = ThemeManager.readMode();
        ThemeManager.media = window.matchMedia("(prefers-color-scheme: dark)");
        ThemeManager.media.addEventListener("change", () => ThemeManager.apply());
        ThemeManager.apply();
    }

    public static getMode(): ThemeMode {
        return ThemeManager.mode;
    }

    public static isDark(): boolean {
        return ThemeManager.dark;
    }

    /** Avisa quando o tema efetivo muda (inclusive no modo automático). */
    public static onChange(listener: DarkListener): void {
        ThemeManager.listeners.push(listener);
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

        document.documentElement.classList.toggle(DARK_CLASS, dark);

        if (Theming.getTheme() !== theme) {
            Theming.setTheme(theme);
        }

        if (dark !== ThemeManager.dark) {
            ThemeManager.dark = dark;
            ThemeManager.listeners.forEach((listener) => listener(dark));
        }
    }

}
