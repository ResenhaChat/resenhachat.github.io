/** Espelha internschat/srv/realtime/events.ts (contrato com o CAP). */

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
    SenderId: string;
}

export interface ConversationReadPayload {
    ConversationId: string;
    UserId: string;
    LastReadAt: string;
}

export interface TypingPayload {
    ConversationId: string;
    UserId: string;
}

export type EmptyPayload = Record<string, never>;

/** servidor -> cliente */
export interface ServerEventMap {
    "presence.snapshot": PresenceSnapshotPayload;
    "presence.changed": PresenceChangedPayload;
    "message.created": MessageCreatedPayload;
    "conversation.read": ConversationReadPayload;
    "typing": TypingPayload;
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
    "typing",
    "ping",
    "pong"
];

export function isServerEventType(value: unknown): value is keyof ServerEventMap {
    return typeof value === "string" && (SERVER_EVENT_TYPES as readonly string[]).includes(value);
}
