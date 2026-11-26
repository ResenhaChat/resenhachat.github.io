import { isServerEventType } from "./RealtimeEvents";
import type { ClientEventMap, Envelope, RealtimeEventMap, RealtimeEventType } from "./RealtimeEvents";

export type RealtimeHandler<Type extends RealtimeEventType> = (payload: RealtimeEventMap[Type]) => void;

/** Devolve a URL completa do WebSocket (com token) ou null se não houver sessão. forceRefresh renova o token antes. */
export type WsUrlProvider = (forceRefresh: boolean) => Promise<string | null>;

type AnyHandler = (payload: never) => void;

const PING_INTERVAL_MS = 25_000;
const MISSED_PONG_LIMIT = 2;
const TYPING_THROTTLE_MS = 3_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const CLOSES_BEFORE_FORCED_AUTH = 2;
const UNAUTHORIZED_CLOSE_CODE = 4001;

/** Único dono do WebSocket: conexão, reconexão com backoff e jitter, ping e despacho de eventos tipados. */
export default class RealtimeService {

    private socket?: WebSocket;

    /** Socket anterior, mantido aberto até o novo confirmar a conexão (renew). */
    private replaced?: WebSocket;

    private running = false;

    private connecting = false;

    private hasConnectedBefore = false;

    private attempts = 0;

    private closesSinceOpen = 0;

    private forceAuth = false;

    private lastPongAt = 0;

    private reconnectTimer?: number;

    private pingTimer?: number;

    private readonly handlers = new Map<RealtimeEventType, Set<AnyHandler>>();

    private readonly typingSentAt = new Map<string, number>();

    private readonly reconnectNow = (): void => {
        if (this.running && !this.isOpenOrConnecting()) {
            window.clearTimeout(this.reconnectTimer);
            void this.connect();
        }
    };

    private readonly onVisibilityChange = (): void => {
        if (document.visibilityState === "visible") {
            this.reconnectNow();
        }
    };

    public constructor(private readonly urlProvider: WsUrlProvider) { }

    public start(): void {
        if (this.running) {
            return;
        }

        this.running = true;
        document.addEventListener("visibilitychange", this.onVisibilityChange);
        window.addEventListener("online", this.reconnectNow);
        void this.connect();
    }

    public stop(): void {
        this.running = false;
        document.removeEventListener("visibilitychange", this.onVisibilityChange);
        window.removeEventListener("online", this.reconnectNow);
        window.clearTimeout(this.reconnectTimer);
        this.stopPing();
        this.socket?.close();
        this.socket = undefined;
        this.replaced = undefined;
    }

    /** Token novo: abre um socket com ele; o atual só é fechado quando o novo abrir. */
    public renew(): void {
        if (!this.running) {
            return;
        }

        window.clearTimeout(this.reconnectTimer);
        void this.connect(true);
    }

    public on<Type extends RealtimeEventType>(type: Type, handler: RealtimeHandler<Type>): void {
        const set = this.handlers.get(type) ?? new Set<AnyHandler>();

        set.add(handler);
        this.handlers.set(type, set);
    }

    public off<Type extends RealtimeEventType>(type: Type, handler: RealtimeHandler<Type>): void {
        this.handlers.get(type)?.delete(handler);
    }

    /** No máximo 1 aviso a cada 3 s por conversa. */
    public sendTyping(ConversationId: string): void {
        const now = Date.now();

        if (now - (this.typingSentAt.get(ConversationId) ?? 0) < TYPING_THROTTLE_MS) {
            return;
        }

        this.typingSentAt.set(ConversationId, now);
        this.send("typing", { ConversationId });
    }

    private isOpenOrConnecting(): boolean {
        return this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING;
    }

    private async connect(renewing = false): Promise<void> {
        if (!this.running || this.connecting || (!renewing && this.isOpenOrConnecting())) {
            return;
        }

        this.connecting = true;

        try {
            const url = await this.urlProvider(this.forceAuth);

            if (!this.running) {
                return;
            }

            if (!url) {
                this.scheduleReconnect();
                return;
            }

            this.forceAuth = false;
            this.openSocket(url, renewing ? this.socket : undefined);
        } catch {
            this.scheduleReconnect();
        } finally {
            this.connecting = false;
        }
    }

    private openSocket(url: string, replaces?: WebSocket): void {
        const socket = new WebSocket(url);

        this.socket = socket;
        this.replaced = replaces;
        socket.onopen = () => this.guarded(() => this.handleOpen(socket));
        socket.onmessage = (event: MessageEvent<unknown>) => this.guarded(() => this.handleMessage(event.data));
        socket.onclose = (event: CloseEvent) => this.guarded(() => this.handleClose(socket, event.code));
    }

    private handleOpen(opened: WebSocket): void {
        if (this.socket !== opened) {
            opened.close();
            return;
        }

        const replaced = this.replaced;

        this.replaced = undefined;
        this.attempts = 0;
        this.closesSinceOpen = 0;
        this.forceAuth = false;
        this.lastPongAt = Date.now();
        this.startPing();
        replaced?.close();

        if (!replaced && this.hasConnectedBefore) {
            this.emit("reconnected", {});
        }

        this.hasConnectedBefore = true;
    }

    private handleClose(closed: WebSocket, code: number): void {
        if (this.socket !== closed) {
            return;
        }

        const fallback = this.replaced;

        this.replaced = undefined;

        if (fallback?.readyState === WebSocket.OPEN) {
            this.socket = fallback;
            return;
        }

        this.socket = undefined;
        this.stopPing();
        this.closesSinceOpen += 1;

        if (code === UNAUTHORIZED_CLOSE_CODE) {
            this.attempts = 0;
            this.forceAuth = true;
            this.scheduleReconnect(true);
            return;
        }

        if (this.closesSinceOpen >= CLOSES_BEFORE_FORCED_AUTH) {
            this.forceAuth = true;
        }

        this.scheduleReconnect();
    }

    private handleMessage(data: unknown): void {
        if (typeof data !== "string") {
            return;
        }

        try {
            const message = JSON.parse(data) as Partial<Envelope<string, unknown>>;

            if (isServerEventType(message.type)) {
                if (message.type === "pong") {
                    this.lastPongAt = Date.now();
                }

                this.emit(message.type, (message.payload ?? {}) as RealtimeEventMap[typeof message.type]);
            }
        } catch {
            // mensagem fora do contrato: ignorada
        }
    }

    /** Cada handler roda isolado: um erro em um não impede os outros. */
    private emit<Type extends RealtimeEventType>(type: Type, payload: RealtimeEventMap[Type]): void {
        this.handlers.get(type)?.forEach((handler) => this.guarded(() => (handler as unknown as RealtimeHandler<Type>)(payload)));
    }

    private guarded(action: () => void): void {
        try {
            action();
        } catch {
            // erro isolado: a conexão e os demais handlers continuam
        }
    }

    private scheduleReconnect(immediate = false): void {
        if (!this.running) {
            return;
        }

        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => void this.connect(), immediate ? 0 : this.nextDelay());
    }

    /** Backoff exponencial com jitter (50% a 100% do atraso) para evitar reconexões em bloco. */
    private nextDelay(): number {
        const base = Math.min(BACKOFF_BASE_MS * 2 ** this.attempts, BACKOFF_MAX_MS);

        this.attempts += 1;

        return base * (0.5 + Math.random() / 2);
    }

    private send<Type extends keyof ClientEventMap>(type: Type, payload: ClientEventMap[Type]): void {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type, payload } satisfies Envelope<Type, ClientEventMap[Type]>));
        }
    }

    private startPing(): void {
        this.stopPing();
        this.pingTimer = window.setInterval(() => this.pingOrDrop(), PING_INTERVAL_MS);
    }

    /** Sem pong nos últimos 2 intervalos, o socket está morto: fecha e a reconexão assume. */
    private pingOrDrop(): void {
        if (Date.now() - this.lastPongAt > PING_INTERVAL_MS * MISSED_PONG_LIMIT) {
            this.socket?.close();
            return;
        }

        this.send("ping", {});
    }

    private stopPing(): void {
        window.clearInterval(this.pingTimer);
    }

}
