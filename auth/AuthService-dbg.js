sap.ui.define(["./RuntimeConfig"], function (___RuntimeConfig) {
  "use strict";

  /* eslint-disable fiori-custom/sap-no-localstorage -- a sessao precisa sobreviver a recarga da pagina (requisito desta fase) */
  const getRuntimeConfig = ___RuntimeConfig["getRuntimeConfig"];
  const STORAGE_KEY = "resenha.session";
  const REFRESH_LOCK = "resenha.refresh";
  const REFRESH_MARGIN_MS = 60_000;
  const MIN_REFRESH_DELAY_MS = 5_000;
  const RETRY_DELAY_MS = 15_000;
  const NETWORK_FAILURE_STATUS = 0;
  class AuthError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
      this.name = "AuthError";
    }
    get isNetworkFailure() {
      return this.status === NETWORK_FAILURE_STATUS;
    }
  }
  function isSession(value) {
    const candidate = value;
    return !!candidate && typeof candidate.AccessToken === "string" && typeof candidate.RefreshToken === "string" && typeof candidate.ExpiresAt === "number" && typeof candidate.User?.ID === "string";
  }
  function readStoredSession() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
      return isSession(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  function toSession(response) {
    return {
      AccessToken: response.AccessToken,
      RefreshToken: response.RefreshToken,
      ExpiresAt: Date.now() + response.ExpiresIn * 1000,
      User: response.User
    };
  }

  /** Único ponto do app com fetch: cadastro, login, renovação e logout em {authBase}/*. */
  class AuthService {
    session = readStoredSession();
    refreshing = null;
    listeners = new Set();
    onStorage = event => {
      if (event.key === STORAGE_KEY) {
        this.syncFromStorage();
      }
    };
    constructor() {
      window.addEventListener("storage", this.onStorage);
    }
    static getInstance() {
      AuthService.instance ??= new AuthService();
      return AuthService.instance;
    }
    getSession() {
      return this.session;
    }
    getUser() {
      return this.session?.User ?? null;
    }
    getAccessToken() {
      return this.session?.AccessToken ?? null;
    }
    hasSession() {
      return this.session !== null;
    }

    /** Notifica login, renovação (nova sessão) e fim da sessão (null). Retorna a função que cancela. */
    onChange(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    register(input) {
      return this.authenticate("/register", input);
    }
    login(input) {
      return this.authenticate("/login", input);
    }
    async logout() {
      const refreshToken = this.session?.RefreshToken;
      if (refreshToken) {
        await this.post("/logout", {
          RefreshToken: refreshToken
        }).catch(() => undefined);
      }
      this.endSession();
    }

    /** Renova o token se estiver perto de expirar. false = sem sessão válida. */
    async ensureFreshSession() {
      if (!this.session) {
        return false;
      }
      if (this.session.ExpiresAt - Date.now() > REFRESH_MARGIN_MS) {
        this.scheduleRefresh(this.session.ExpiresAt - Date.now() - REFRESH_MARGIN_MS);
        return true;
      }
      return this.refresh();
    }

    /** Chamado após um 401: tenta renovar uma vez; sem sucesso a sessão termina. */
    handleUnauthorized() {
      return this.refresh();
    }
    async authenticate(path, body) {
      const response = await this.post(path, body);
      this.applyResponse(response);
      return response.User;
    }

    /** Uma renovação por vez, em todas as abas (Web Locks), porque o servidor revoga tudo se um refresh usado voltar. */
    refresh() {
      this.refreshing ??= this.exclusive(() => this.doRefresh()).finally(() => {
        this.refreshing = null;
      });
      return this.refreshing;
    }
    async exclusive(task) {
      const locks = navigator.locks;
      return locks ? await locks.request(REFRESH_LOCK, task) : await task();
    }
    async doRefresh() {
      const stored = readStoredSession();
      if (this.session && stored && stored.RefreshToken !== this.session.RefreshToken && stored.ExpiresAt > this.session.ExpiresAt) {
        this.adoptSession(stored);
        return true;
      }
      const failedToken = this.session?.RefreshToken;
      if (!failedToken) {
        return false;
      }
      try {
        this.applyResponse(await this.post("/refresh", {
          RefreshToken: failedToken
        }));
        return true;
      } catch (error) {
        if (error instanceof AuthError && error.isNetworkFailure) {
          this.scheduleRefresh(RETRY_DELAY_MS);
          return this.session !== null && this.session.ExpiresAt > Date.now();
        }
        return this.recoverFrom(failedToken);
      }
    }

    /** Refresh recusado: se outra aba já gravou uma sessão nova, adota-a; senão a sessão termina. */
    recoverFrom(failedToken) {
      const stored = readStoredSession();
      if (stored && stored.RefreshToken !== failedToken) {
        this.adoptSession(stored);
        return true;
      }
      this.endSession();
      return false;
    }

    /** Outra aba mudou a sessão gravada: adota a nova, ou encerra localmente se ela foi removida (sem gravar de novo). */
    syncFromStorage() {
      const stored = readStoredSession();
      if (!stored) {
        if (this.session) {
          this.endLocalSession();
        }
        return;
      }
      if (stored.RefreshToken !== this.session?.RefreshToken) {
        this.adoptSession(stored);
      }
    }
    async post(path, body) {
      let response;
      try {
        response = await fetch(`${getRuntimeConfig().authBase}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });
      } catch {
        throw new AuthError("", NETWORK_FAILURE_STATUS);
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new AuthError(payload.error?.message ?? "", response.status);
      }
      return payload;
    }
    applyResponse(response) {
      const session = toSession(response);
      this.session = session;
      this.persist();
      this.scheduleFromExpiry(session);
      this.notify();
    }

    /** Sessão vinda de outra aba: já está gravada, por isso não persiste de novo. */
    adoptSession(session) {
      this.session = session;
      this.scheduleFromExpiry(session);
      this.notify();
    }
    endSession() {
      this.stopSession();
      this.persist();
      this.notify();
    }
    endLocalSession() {
      this.stopSession();
      this.notify();
    }
    stopSession() {
      window.clearTimeout(this.refreshTimer);
      this.session = null;
    }
    scheduleFromExpiry(session) {
      this.scheduleRefresh(session.ExpiresAt - Date.now() - REFRESH_MARGIN_MS);
    }
    scheduleRefresh(delay) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => void this.refresh(), Math.max(delay, MIN_REFRESH_DELAY_MS));
    }
    persist() {
      try {
        if (this.session) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.session));
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // armazenamento indisponível: a sessão vale só nesta aba
      }
    }
    notify() {
      this.listeners.forEach(listener => listener(this.session));
    }
  }
  AuthService.AuthError = AuthError;
  return AuthService;
});
//# sourceMappingURL=AuthService-dbg.js.map
