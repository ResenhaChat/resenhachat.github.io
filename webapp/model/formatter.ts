import DateFormat from "sap/ui/core/format/DateFormat";

type DateLike = string | Date | null | undefined;
type TextProvider = (key: string, parameters?: unknown[]) => string;

const ACCENT_COUNT = 10;
const GENERAL_KINDS = ["General", "Group", "Channel"];
const MAX_BADGE = 99;

let getText: TextProvider = (key) => key;

/** O Component informa de onde vêm os textos i18n usados pelos formatters. */
export function setFormatterTextProvider(provider: TextProvider): void {
    getText = provider;
}

function toDate(value: DateLike): Date | null {
    if (!value) {
        return null;
    }

    const date = value instanceof Date ? value : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function daysAgo(date: Date): number {
    return Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
}

function accentNumber(id: string | null | undefined): number {
    let hash = 2166136261;

    for (const char of id ?? "") {
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    }

    return ((hash >>> 8) % ACCENT_COUNT) + 1;
}

const timeFormat = DateFormat.getTimeInstance({ pattern: "HH:mm" });
const dateFormat = DateFormat.getDateInstance({ style: "medium" });
const shortDateFormat = DateFormat.getDateInstance({ style: "short" });

const formatter = {

    initials(name: string | null | undefined): string {
        const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);

        if (!parts.length) {
            return "?";
        }

        const first = parts[0].charAt(0);
        const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : parts[0].charAt(1);

        return `${first}${last}`.toUpperCase();
    },

    /** Cor estável de avatar (Accent1..Accent10) por usuário/conversa. */
    accent(id: string | null | undefined): string {
        return `Accent${accentNumber(id)}`;
    },

    /** Índice da cor do nome do autor; o CSS usa data-rs-accent. */
    accentIndex(id: string | null | undefined): string {
        return String(accentNumber(id));
    },

    time(value: DateLike): string {
        const date = toDate(value);

        return date ? timeFormat.format(date) : "";
    },

    conversationTime(value: DateLike): string {
        const date = toDate(value);

        if (!date) {
            return "";
        }

        const days = daysAgo(date);

        if (days <= 0) {
            return timeFormat.format(date);
        }

        return days === 1 ? getText("yesterday") : shortDateFormat.format(date);
    },

    dayLabel(value: DateLike): string {
        const date = toDate(value);

        if (!date) {
            return "";
        }

        const days = daysAgo(date);

        if (days <= 0) {
            return getText("today");
        }

        return days === 1 ? getText("yesterday") : dateFormat.format(date);
    },

    sameDay(first: DateLike, second: DateLike): boolean {
        const firstDate = toDate(first);
        const secondDate = toDate(second);

        return !!firstDate && !!secondDate && startOfDay(firstDate) === startOfDay(secondDate);
    },

    isOnline(userId: string | null | undefined, online: Record<string, boolean> | undefined): boolean {
        return !!userId && !!online?.[userId];
    },

    isMine(senderId: string | null | undefined, myId: string | null | undefined): string {
        return String(!!senderId && senderId === myId);
    },

    isTypingIn(conversationId: string | null | undefined, typing: Record<string, string[]> | undefined): boolean {
        return !!conversationId && !!typing?.[conversationId]?.length;
    },

    isNotTypingIn(conversationId: string | null | undefined, typing: Record<string, string[]> | undefined): boolean {
        return !formatter.isTypingIn(conversationId, typing);
    },

    canSend(draft: string | null | undefined, sending: boolean | undefined): boolean {
        return !sending && !!draft?.trim();
    },

    conversationIcon(kind: string | null | undefined): string {
        return GENERAL_KINDS.includes(kind ?? "") ? "sap-icon://group" : "";
    },

    unreadBadge(count: number | null | undefined): string {
        return (count ?? 0) > MAX_BADGE ? `${MAX_BADGE}+` : String(count ?? 0);
    },

    hasUnread(count: number | null | undefined): boolean {
        return (count ?? 0) > 0;
    },

    messageText(text: string | null | undefined, deletedAt: DateLike): string {
        return toDate(deletedAt) ? getText("messageDeleted") : text ?? "";
    },

    /** Prévia da última mensagem (texto de até 200 caracteres): uma linha só. */
    messagePreview(text: string | null | undefined): string {
        return (text ?? "").replace(/\s+/g, " ").trim();
    },

    unreadTooltip(count: number | null | undefined): string {
        return getText("unreadCount", [count ?? 0]);
    },

    isEdited(editedAt: DateLike, deletedAt: DateLike): boolean {
        return !!toDate(editedAt) && !toDate(deletedAt);
    },

    firstName(name: string | null | undefined): string {
        return (name ?? "").trim().split(/\s+/)[0] ?? "";
    },

    /** A faixa "Online agora" só aparece quando há alguém online além de mim. */
    hasOthersOnline(online: Record<string, boolean> | undefined, myId: string | null | undefined): boolean {
        return Object.keys(online ?? {}).some((userId) => userId !== myId);
    },

    /** Ícone do botão de tema: mostra o sol no escuro (vai para o claro) e a lua no claro. */
    themeIcon(dark: boolean | undefined): string {
        return dark ? "sap-icon://light-mode" : "sap-icon://dark-mode";
    },

    isMode(current: string | undefined, target: string): string {
        return String(current === target);
    }

};

export default formatter;
