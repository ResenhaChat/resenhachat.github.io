/** Espelha resenhachat/srv/realtime/events.ts (contrato com o CAP). */

export interface PresenceSnapshotPayload {
    OnlineUserIds: string[];
}

export interface PresenceChangedPayload {
    UserId: string;
    IsOnline: boolean;
    LastSeenAt: string | null;
}

export interface MessageCreatedPayload {
    ConversationId: string;
    MessageId: string;
    /** Null em mensagem do sistema (Kind = System). */
    SenderId: string | null;
}

export interface ConversationReadPayload {
    ConversationId: string;
    UserId: string;
    LastReadAt: string;
}

export interface ConversationChangedPayload {
    ConversationId: string;
}

export interface TypingPayload {
    ConversationId: string;
    UserId: string;
}

/** Perfil ou foto de alguém mudou: quem mostra pessoas relê só o que exibe. */
export interface UserUpdatedPayload {
    UserId: string;
}

export type EmptyPayload = Record<string, never>;

/** servidor -> cliente */
export interface ServerEventMap {
    "presence.snapshot": PresenceSnapshotPayload;
    "presence.changed": PresenceChangedPayload;
    "message.created": MessageCreatedPayload;
    "conversation.read": ConversationReadPayload;
    "conversation.created": ConversationChangedPayload;
    "conversation.updated": ConversationChangedPayload;
    "members.changed": ConversationChangedPayload;
    "typing": TypingPayload;
    "user.updated": UserUpdatedPayload;
    "ping": EmptyPayload;
    "pong": EmptyPayload;
}

/** Eventos locais emitidos pelo próprio RealtimeService. */
export interface LocalEventMap {
    "reconnected": EmptyPayload;
}

export type RealtimeEventMap = ServerEventMap & LocalEventMap;

export type RealtimeEventType = keyof RealtimeEventMap;

/** cliente -> servidor */
export interface ClientEventMap {
    "typing": { ConversationId: string };
    "ping": EmptyPayload;
    "pong": EmptyPayload;
}

export interface Envelope<Type extends string, Payload> {
    type: Type;
    payload: Payload;
}

export const SERVER_EVENT_TYPES: ReadonlyArray<keyof ServerEventMap> = [
    "presence.snapshot",
    "presence.changed",
    "message.created",
    "conversation.read",
    "conversation.created",
    "conversation.updated",
    "members.changed",
    "typing",
    "user.updated",
    "ping",
    "pong"
];

export function isServerEventType(value: unknown): value is keyof ServerEventMap {
    return typeof value === "string" && (SERVER_EVENT_TYPES as readonly string[]).includes(value);
}
