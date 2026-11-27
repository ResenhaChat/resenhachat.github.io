/* eslint-disable fiori-custom/sap-no-localstorage -- a sessao precisa sobreviver a recarga da pagina (requisito desta fase) */
import { getRuntimeConfig } from "./RuntimeConfig";

export interface AuthUser {
    ID: string;
    DisplayName: string;
    Username: string;
    Email: string;
}

export interface AuthSession {
    AccessToken: string;
    RefreshToken: string;
    ExpiresAt: number;
    User: AuthUser;
    /** Token de leitura de mídia (query `mt`). Ausente em sessões gravadas antes da Fase 3a. */
    MediaToken?: string;
    /** Epoch em milissegundos (contrato do backend). */
    MediaTokenExpiresAt?: number;
}

export interface RegisterInput {
    Email: string;
    Password: string;
    DisplayName: string;
    Username: string;
}

export interface LoginInput {
    Login: string;
    Password: string;
}

interface AuthResponse {
    AccessToken: string;
    RefreshToken: string;
    ExpiresIn: number;
    User: AuthUser;
    MediaToken?: string;
    MediaTokenExpiresAt?: number;
}

interface ErrorBody {
    error?: { message?: string };
}

type SessionListener = (session: AuthSession | null) => void;

const STORAGE_KEY = "resenha.session";
const REFRESH_LOCK = "resenha.refresh";
const REFRESH_MARGIN_MS = 60_000;
const MIN_REFRESH_DELAY_MS = 5_000;
const RETRY_DELAY_MS = 15_000;
const NETWORK_FAILURE_STATUS = 0;
const MEDIA_TOKEN_RENEW_MARGIN_MS = 60 * 60 * 1000;

export class AuthError extends Error {

    public constructor(message: string, public readonly status: number) {
        super(message);
        this.name = "AuthError";
    }

    public get isNetworkFailure(): boolean {
        return this.status === NETWORK_FAILURE_STATUS;
    }

}

function isSession(value: unknown): value is AuthSession {
    const candidate = value as Partial<AuthSession> | null;

    return !!candidate
        && typeof candidate.AccessToken === "string"
        && typeof candidate.RefreshToken === "string"
        && typeof candidate.ExpiresAt === "number"
        && typeof candidate.User?.ID === "string";
}

function readStoredSession(): AuthSession | null {
    try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
        return isSession(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function hasFreshMediaToken(session: AuthSession): boolean {
    return !!session.MediaToken && (session.MediaTokenExpiresAt ?? 0) - Date.now() > MEDIA_TOKEN_RENEW_MARGIN_MS;
}

/** Só exige renovação de sessão que já teve token de mídia; backend sem o campo segue sem foto, sem loop de refresh. */
function mediaTokenNeedsRenewal(session: AuthSession): boolean {
    return !!session.MediaToken && !hasFreshMediaToken(session);
}

/** Enquanto faltar mais de 1 h, o token de mídia atual é mantido: URLs estáveis e cache do navegador válido. */
function mediaTokenFor(response: AuthResponse, current: AuthSession | null): Pick<AuthSession, "MediaToken" | "MediaTokenExpiresAt"> {
    if (current && current.User.ID === response.User.ID && hasFreshMediaToken(current)) {
        return { MediaToken: current.MediaToken, MediaTokenExpiresAt: current.MediaTokenExpiresAt };
    }

    return { MediaToken: response.MediaToken, MediaTokenExpiresAt: response.MediaTokenExpiresAt };
}

function toSession(response: AuthResponse, current: AuthSession | null): AuthSession {
    return {
        AccessToken: response.AccessToken,
        RefreshToken: response.RefreshToken,
        ExpiresAt: Date.now() + response.ExpiresIn * 1000,
        User: response.User,
        ...mediaTokenFor(response, current)
    };
}

/** Único ponto do app com fetch: cadastro, login, renovação e logout em {authBase}/*. */
export default class AuthService {

    private static instance?: AuthService;

    private session: AuthSession | null = readStoredSession();

    private refreshing: Promise<boolean> | null = null;

    private refreshTimer?: number;

    private readonly listeners = new Set<SessionListener>();

    private readonly onStorage = (event: StorageEvent): void => {
        if (event.key === STORAGE_KEY) {
            this.syncFromStorage();
        }
    };

    private constructor() {
        window.addEventListener("storage", this.onStorage);
    }

    public static getInstance(): AuthService {
        AuthService.instance ??= new AuthService();
        return AuthService.instance;
    }

    public getSession(): AuthSession | null {
        return this.session;
    }

    public getUser(): AuthUser | null {
        return this.session?.User ?? null;
    }

    public getAccessToken(): string | null {
        return this.session?.AccessToken ?? null;
    }

    public getMediaToken(): string | null {
        return this.session?.MediaToken ?? null;
    }

    public hasSession(): boolean {
        return this.session !== null;
    }

    /** Notifica login, renovação (nova sessão) e fim da sessão (null). Retorna a função que cancela. */
    public onChange(listener: SessionListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    public register(input: RegisterInput): Promise<AuthUser> {
        return this.authenticate("/register", input);
    }

    public login(input: LoginInput): Promise<AuthUser> {
        return this.authenticate("/login", input);
    }

    public async logout(): Promise<void> {
        const refreshToken = this.session?.RefreshToken;

        if (refreshToken) {
            await this.post("/logout", { RefreshToken: refreshToken }).catch(() => undefined);
        }

        this.endSession();
    }

    /** Renova o token se estiver perto de expirar. false = sem sessão válida. */
    public async ensureFreshSession(): Promise<boolean> {
        if (!this.session) {
            return false;
        }

        if (this.session.ExpiresAt - Date.now() > REFRESH_MARGIN_MS && !mediaTokenNeedsRenewal(this.session)) {
            this.scheduleRefresh(this.session.ExpiresAt - Date.now() - REFRESH_MARGIN_MS);
            return true;
        }

        return this.refresh();
    }

    /** Chamado após um 401: tenta renovar uma vez; sem sucesso a sessão termina. */
    public handleUnauthorized(): Promise<boolean> {
        return this.refresh();
    }

    private async authenticate(path: string, body: object): Promise<AuthUser> {
        const response = await this.post(path, body);

        this.applyResponse(response);

        return response.User;
    }

    /** Uma renovação por vez, em todas as abas (Web Locks), porque o servidor revoga tudo se um refresh usado voltar. */
    private refresh(): Promise<boolean> {
        this.refreshing ??= this.exclusive(() => this.doRefresh()).finally(() => {
            this.refreshing = null;
        });

        return this.refreshing;
    }

    private async exclusive(task: () => Promise<boolean>): Promise<boolean> {
        const locks = (navigator as Partial<Navigator>).locks;

        return locks ? await locks.request(REFRESH_LOCK, task) : await task();
    }

    private async doRefresh(): Promise<boolean> {
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
            this.applyResponse(await this.post("/refresh", { RefreshToken: failedToken }));
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
    private recoverFrom(failedToken: string): boolean {
        const stored = readStoredSession();

        if (stored && stored.RefreshToken !== failedToken) {
            this.adoptSession(stored);
            return true;
        }

        this.endSession();
        return false;
    }

    /** Outra aba mudou a sessão gravada: adota a nova, ou encerra localmente se ela foi removida (sem gravar de novo). */
    private syncFromStorage(): void {
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

    private async post(path: string, body: object): Promise<AuthResponse> {
        let response: Response;

        try {
            response = await fetch(`${getRuntimeConfig().authBase}${path}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
        } catch {
            throw new AuthError("", NETWORK_FAILURE_STATUS);
        }

        const payload = await response.json().catch(() => ({})) as AuthResponse & ErrorBody;

        if (!response.ok) {
            throw new AuthError(payload.error?.message ?? "", response.status);
        }

        return payload;
    }

    private applyResponse(response: AuthResponse): void {
        const session = toSession(response, this.session);

        this.session = session;
        this.persist();
        this.scheduleFromExpiry(session);
        this.notify();
    }

    /** Sessão vinda de outra aba: já está gravada, por isso não persiste de novo. */
    private adoptSession(session: AuthSession): void {
        this.session = session;
        this.scheduleFromExpiry(session);
        this.notify();
    }

    private endSession(): void {
        this.stopSession();
        this.persist();
        this.notify();
    }

    private endLocalSession(): void {
        this.stopSession();
        this.notify();
    }

    private stopSession(): void {
        window.clearTimeout(this.refreshTimer);
        this.session = null;
    }

    private scheduleFromExpiry(session: AuthSession): void {
        this.scheduleRefresh(session.ExpiresAt - Date.now() - REFRESH_MARGIN_MS);
    }

    private scheduleRefresh(delay: number): void {
        window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => void this.refresh(), Math.max(delay, MIN_REFRESH_DELAY_MS));
    }

    private persist(): void {
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

    private notify(): void {
        this.listeners.forEach((listener) => listener(this.session));
    }

}
