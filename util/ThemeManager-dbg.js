sap.ui.define(["sap/ui/core/Theming"], function (Theming) {
  "use strict";

  const STORAGE_KEY = "resenha.theme";
  const LIGHT_THEME = "sap_horizon";
  const DARK_THEME = "sap_horizon_dark";
  const DARK_CLASS = "rsDark";
  const MODES = ["auto", "light", "dark"];
  function isThemeMode(value) {
    return MODES.includes(value);
  }

  /** Claro/Escuro/Automático (segue prefers-color-scheme). Aplica sap_horizon(_dark) e a classe rsDark no <html>. */
  class ThemeManager {
    static mode = "auto";
    static dark = false;
    static listeners = [];
    static init() {
      ThemeManager.mode = ThemeManager.readMode();
      ThemeManager.media = window.matchMedia("(prefers-color-scheme: dark)");
      ThemeManager.media.addEventListener("change", () => ThemeManager.apply());
      ThemeManager.apply();
    }
    static getMode() {
      return ThemeManager.mode;
    }
    static isDark() {
      return ThemeManager.dark;
    }

    /** Avisa quando o tema efetivo muda (inclusive no modo automático). */
    static onChange(listener) {
      ThemeManager.listeners.push(listener);
    }
    static setMode(mode) {
      ThemeManager.mode = mode;
      try {
        window.localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // sem armazenamento: vale só nesta sessão
      }
      ThemeManager.apply();
    }
    static readMode() {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        return isThemeMode(stored) ? stored : "auto";
      } catch {
        return "auto";
      }
    }
    static apply() {
      const dark = ThemeManager.mode === "dark" || ThemeManager.mode === "auto" && !!ThemeManager.media?.matches;
      const theme = dark ? DARK_THEME : LIGHT_THEME;
      document.documentElement.classList.toggle(DARK_CLASS, dark);
      if (Theming.getTheme() !== theme) {
        Theming.setTheme(theme);
      }
      if (dark !== ThemeManager.dark) {
        ThemeManager.dark = dark;
        ThemeManager.listeners.forEach(listener => listener(dark));
      }
    }
  }
  return ThemeManager;
});
//# sourceMappingURL=ThemeManager-dbg.js.map
