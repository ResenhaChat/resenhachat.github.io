import DateFormat from "sap/ui/core/format/DateFormat";
import { getRuntimeConfig } from "../auth/RuntimeConfig";

type DateLike = string | Date | null | undefined;
type TextProvider = (key: string, parameters?: unknown[]) => string;
type AvatarSet = "People" | "Me" | "Conversations" | "PublicChannels";
type AttachmentPart = "Thumbnail" | "Content";

const ACCENT_COUNT = 10;
const GENERAL_KINDS = ["General", "Group", "Channel"];
const MAX_BADGE = 99;
const KB = 1024;
const MB = KB * KB;
const SECONDS_PER_MINUTE = 60;
const MEDIA_MAX_WIDTH = 280;
const MEDIA_MAX_HEIGHT = 360;
const MEDIA_FALLBACK = { width: 280, height: 210 };
const FILE_ICON_RULES: [RegExp, string][] = [
    [/^video\//, "sap-icon://video"],
    [/^image\//, "sap-icon://attachment-photo"],
    [/pdf/, "sap-icon://pdf-attachment"],
    [/zip|rar|7z|tar|gzip/, "sap-icon://attachment-zip-file"],
    [/sheet|excel|csv/, "sap-icon://excel-attachment"],
    [/presentation|powerpoint/, "sap-icon://ppt-attachment"],
    [/word|opendocument\.text/, "sap-icon://doc-attachment"],
    [/^text\//, "sap-icon://document-text"]
];
const DEFAULT_FILE_ICON = "sap-icon://document";

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

/** URL de leitura de mídia com o token na query `mt`; sem token não há URL (o avatar cai nas iniciais). */
function mediaUrl(resource: string, mediaToken: string | null | undefined, version?: number): string | undefined {
    if (!mediaToken) {
        return undefined;
    }

    const versionQuery = version === undefined ? "" : `v=${version}&`;

    return `${getRuntimeConfig().chatService}${resource}?${versionQuery}mt=${encodeURIComponent(mediaToken)}`;
}

/** photo: AvatarMimeType (ou DirectPeerHasAvatar) — null/vazio = sem foto. */
function avatarUrl(
    set: AvatarSet,
    id: string | null | undefined,
    photo: string | boolean | null | undefined,
    version: number | null | undefined,
    mediaToken: string | null | undefined
): string | undefined {
    if (!id || !photo) {
        return undefined;
    }

    return mediaUrl(`${set}(${id})/Avatar`, mediaToken, version ?? 0);
}

function attachmentUrl(id: string | null | undefined, part: AttachmentPart, mediaToken: string | null | undefined): string | undefined {
    return id ? mediaUrl(`Attachments(${id})/${part}`, mediaToken) : undefined;
}

/** Caixa da mídia no balão: proporção original limitada a 280 x 360 px, sem ampliar. */
function mediaBox(width: number | null | undefined, height: number | null | undefined): { width: number; height: number } {
    if (!width || !height) {
        return MEDIA_FALLBACK;
    }

    const scale = Math.min(1, MEDIA_MAX_WIDTH / width, MEDIA_MAX_HEIGHT / height);

    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function pad(value: number): string {
    return String(value).padStart(2, "0");
}

const timeFormat = DateFormat.getTimeInstance({ pattern: "HH:mm" });
const dateFormat = DateFormat.getDateInstance({ style: "medium" });
const shortDateFormat = DateFormat.getDateInstance({ style: "short" });
const dayMonthFormat = DateFormat.getDateInstance({ pattern: "dd/MM" });

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
        if (kind === "Channel") {
            return "sap-icon://marketing-campaign";
        }

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
    },

    isDirect(kind: string | null | undefined): boolean {
        return kind === "Direct";
    },

    isNotDirect(kind: string | null | undefined): boolean {
        return kind !== "Direct";
    },

    isSystem(kind: string | null | undefined): boolean {
        return kind === "System";
    },

    isNotSystem(kind: string | null | undefined): boolean {
        return kind !== "System";
    },

    /** Dono ou admin: pode editar a conversa e gerenciar membros. */
    isManager(role: string | null | undefined): boolean {
        return role === "Owner" || role === "Admin";
    },

    /** Em canal "só admins publicam", membros comuns veem o aviso no lugar do composer. */
    canPostHere(onlyAdminsCanPost: boolean | null | undefined, role: string | null | undefined): boolean {
        return !onlyAdminsCanPost || formatter.isManager(role);
    },

    cannotPostHere(onlyAdminsCanPost: boolean | null | undefined, role: string | null | undefined): boolean {
        return !formatter.canPostHere(onlyAdminsCanPost, role);
    },

    roleLabel(role: string | null | undefined): string {
        if (role === "Owner") {
            return getText("roleOwner");
        }

        return role === "Admin" ? getText("roleAdmin") : "";
    },

    hasRoleLabel(role: string | null | undefined): boolean {
        return formatter.isManager(role);
    },

    /** Membro pode ser removido por quem gerencia: ninguém remove o dono, admin remove só membros comuns. */
    canRemoveMember(myRole: string | null | undefined, memberRole: string | null | undefined, isMe: boolean): boolean {
        if (isMe || memberRole === "Owner") {
            return false;
        }

        return myRole === "Owner" || (myRole === "Admin" && memberRole === "Member");
    },

    /** Só o dono promove e rebaixa admins. */
    canToggleAdmin(myRole: string | null | undefined, memberRole: string | null | undefined, isMe: boolean): boolean {
        return !isMe && myRole === "Owner" && memberRole !== "Owner";
    },

    /** Nome: dono ou admin de grupo e canal (o Geral mostra só o título). */
    canEditName(role: string | null | undefined, kind: string | null | undefined): boolean {
        return formatter.isManager(role) && formatter.isGroupLike(kind);
    },

    /** Descrição: dono ou admin em qualquer conversa que não seja Direct. */
    canEditDescription(role: string | null | undefined, kind: string | null | undefined): boolean {
        return formatter.isManager(role) && kind !== "Direct";
    },

    /** Público e só admins publicam: dono ou admin de grupo e canal. */
    canEditSettings(role: string | null | undefined, kind: string | null | undefined): boolean {
        return formatter.isManager(role) && formatter.isGroupLike(kind);
    },

    isChannel(kind: string | null | undefined): boolean {
        return kind === "Channel";
    },

    /** Grupo e canal têm membros; o Geral não tem lista de membros nem a ação de sair. */
    isGroupLike(kind: string | null | undefined): boolean {
        return kind === "Group" || kind === "Channel";
    },

    /** Pessoa da lista de seleção: mostra o check quando já está escolhida. */
    isPicked(userId: string | null | undefined, selected: { ID: string }[] | undefined): boolean {
        return !!userId && !!selected?.some((person) => person.ID === userId);
    },

    isDirectOnline(kind: string | null | undefined, peerId: string | null | undefined, online: Record<string, boolean> | undefined): boolean {
        return formatter.isDirect(kind) && formatter.isOnline(peerId, online);
    },

    /** Status de uma pessoa (perfil do Direct): online agora ou visto por último. */
    peerStatus(userId: string | null | undefined, online: Record<string, boolean> | undefined, lastSeenAt: DateLike): string {
        return formatter.directStatus(formatter.isOnline(userId, online), lastSeenAt);
    },

    /** Mostra o "⋯" do membro só se há alguma ação para mim nessa linha. */
    canManageMember(myRole: string | null | undefined, memberRole: string | null | undefined, memberId: string | null | undefined, myId: string | null | undefined): boolean {
        const isMe = !!memberId && memberId === myId;

        return formatter.canRemoveMember(myRole, memberRole, isMe) || formatter.canToggleAdmin(myRole, memberRole, isMe);
    },

    memberCountText(count: number | null | undefined): string {
        return count === 1 ? getText("memberCountOne") : getText("memberCount", [count ?? 0]);
    },

    joinLabel(isMember: boolean | null | undefined): string {
        return getText(isMember ? "openConversation" : "joinChannel");
    },

    archivedToggleLabel(showingArchived: boolean | null | undefined): string {
        return getText(showingArchived ? "backToChats" : "archivedChats");
    },

    emptyListText(showingArchived: boolean | null | undefined): string {
        return getText(showingArchived ? "noArchivedConversations" : "noConversations");
    },

    newConversationTitle(kind: string | null | undefined): string {
        return getText(kind === "Channel" ? "newChannelTitle" : "newGroupTitle");
    },

    pinLabel(isPinned: boolean | null | undefined): string {
        return getText(isPinned ? "unpinConversation" : "pinConversation");
    },

    archiveLabel(isArchived: boolean | null | undefined): string {
        return getText(isArchived ? "unarchiveConversation" : "archiveConversation");
    },

    isMuted(mutedUntil: DateLike): boolean {
        const date = toDate(mutedUntil);

        return !!date && date.getTime() > Date.now();
    },

    notMuted(mutedUntil: DateLike): boolean {
        return !formatter.isMuted(mutedUntil);
    },

    muteLabel(mutedUntil: DateLike): string {
        return getText(formatter.isMuted(mutedUntil) ? "unmuteConversation" : "muteConversation");
    },

    /** Hoje: "às HH:mm"; ontem: "ontem às HH:mm"; antes: "em dd/MM". */
    lastSeenLabel(lastSeenAt: DateLike): string {
        const date = toDate(lastSeenAt);

        if (!date) {
            return "";
        }

        const days = daysAgo(date);

        if (days <= 0) {
            return getText("lastSeenToday", [timeFormat.format(date)]);
        }

        return days === 1
            ? getText("lastSeenYesterday", [timeFormat.format(date)])
            : getText("lastSeenDate", [dayMonthFormat.format(date)]);
    },

    memberSummary(count: number | null | undefined, online: number | null | undefined): string {
        return getText("memberSummary", [formatter.memberCountText(count), online ?? 0]);
    },

    promoteLabel(role: string | null | undefined): string {
        return getText(role === "Admin" ? "demoteAdmin" : "promoteAdmin");
    },

    /** Linha de cabeçalho de Direct: online agora ou visto por último (vazio se não há o que mostrar). */
    directStatus(isOnline: boolean, lastSeenAt: DateLike): string {
        if (isOnline) {
            return getText("statusOnline");
        }

        return formatter.lastSeenLabel(lastSeenAt);
    },

    /** Foto do canal público (Conversations/Avatar); sem foto, o ícone de canal. */
    channelAvatarSrc(conversationId: string | null | undefined, photo: string | null | undefined, version: number | null | undefined, mediaToken: string | null | undefined): string | undefined {
        // Quem explora ainda não é membro: a foto do canal público vem por PublicChannels.
        return avatarUrl("PublicChannels", conversationId, photo, version, mediaToken) ?? formatter.conversationIcon("Channel");
    },

    /** Foto de pessoa (People) ou minha (Me); undefined = iniciais. */
    personAvatarSrc(userId: string | null | undefined, photo: string | null | undefined, version: number | null | undefined, mediaToken: string | null | undefined): string | undefined {
        return avatarUrl("People", userId, photo, version, mediaToken);
    },

    meAvatarSrc(userId: string | null | undefined, photo: string | null | undefined, version: number | null | undefined, mediaToken: string | null | undefined): string | undefined {
        return avatarUrl("Me", userId, photo, version, mediaToken);
    },

    /** Direct: foto do par; grupo e canal: foto da conversa; sem foto, ícone do tipo (Direct cai nas iniciais). */
    conversationAvatarSrc(kind: string | null | undefined, conversationId: string | null | undefined, groupPhoto: string | null | undefined, groupVersion: number | null | undefined,
        peerId: string | null | undefined, peerHasPhoto: boolean | null | undefined, peerVersion: number | null | undefined, mediaToken: string | null | undefined): string | undefined {
        const photo = formatter.isDirect(kind)
            ? avatarUrl("People", peerId, peerHasPhoto, peerVersion, mediaToken)
            : avatarUrl("Conversations", conversationId, groupPhoto, groupVersion, mediaToken);

        return photo ?? (formatter.conversationIcon(kind) || undefined);
    },

    /** Miniatura da foto ou do vídeo; foto sem miniatura usa o original; vídeo sem miniatura fica sem imagem. */
    attachmentThumbSrc(
        attachmentId: string | null | undefined,
        thumbnailMimeType: string | null | undefined,
        kind: string | null | undefined,
        mediaToken: string | null | undefined
    ): string | undefined {
        if (!thumbnailMimeType && kind !== "Image") {
            return undefined;
        }

        return attachmentUrl(attachmentId, thumbnailMimeType ? "Thumbnail" : "Content", mediaToken);
    },

    attachmentUrl(attachmentId: string | null | undefined, part: AttachmentPart, mediaToken: string | null | undefined): string | undefined {
        return attachmentUrl(attachmentId, part, mediaToken);
    },

    /** Só a largura: a altura segue a proporção da imagem (height auto no CSS), sem distorcer em 375 px. */
    mediaWidth(width: number | null | undefined, height: number | null | undefined): string {
        return `${mediaBox(width, height).width}px`;
    },

    /** Arquivo com miniatura (PDF da 1ª página): mostra a imagem no cartão. */
    hasThumbnail(thumbnailMimeType: string | null | undefined): boolean {
        return !!thumbnailMimeType;
    },

    /** Download forçado (Content-Disposition: attachment), serve também para cross-origin. */
    attachmentDownloadUrl(attachmentId: string | null | undefined, mediaToken: string | null | undefined): string | undefined {
        const url = attachmentUrl(attachmentId, "Content", mediaToken);

        return url ? `${url}&download=1` : undefined;
    },

    /** Dica da foto do grupo só para quem pode trocá-la; sem permissão o avatar não anuncia ação. */
    groupPhotoTooltip(role: string | null | undefined, kind: string | null | undefined): string | undefined {
        return formatter.canEditGroupPhoto(role, kind) ? getText("changePhoto") : undefined;
    },

    groupPhotoBadge(role: string | null | undefined, kind: string | null | undefined): string {
        return formatter.canEditGroupPhoto(role, kind) ? "sap-icon://camera" : "";
    },

    fileSize(bytes: number | null | undefined): string {
        const size = bytes ?? 0;
        const format = (value: number, unit: string, digits: number): string => `${value.toLocaleString(undefined, { maximumFractionDigits: digits })} ${unit}`;

        if (size < KB) {
            return format(size, "B", 0);
        }

        return size < MB ? format(size / KB, "KB", 0) : format(size / MB, "MB", 1);
    },

    fileIcon(mimeType: string | null | undefined): string {
        const rule = FILE_ICON_RULES.find(([pattern]) => pattern.test(mimeType ?? ""));

        return rule?.[1] ?? DEFAULT_FILE_ICON;
    },

    durationLabel(seconds: number | null | undefined): string {
        const total = Math.round(seconds ?? 0);

        return `${Math.floor(total / SECONDS_PER_MINUTE)}:${pad(total % SECONDS_PER_MINUTE)}`;
    },

    isImageMessage(kind: string | null | undefined, deletedAt: DateLike): boolean {
        return kind === "Image" && !toDate(deletedAt);
    },

    isVideoMessage(kind: string | null | undefined, deletedAt: DateLike): boolean {
        return kind === "Video" && !toDate(deletedAt);
    },

    isFileMessage(kind: string | null | undefined, deletedAt: DateLike): boolean {
        return kind === "File" && !toDate(deletedAt);
    },

    /** Foto ou vídeo: o balão mostra a miniatura. */
    isPictureMessage(kind: string | null | undefined, deletedAt: DateLike): boolean {
        return formatter.isImageMessage(kind, deletedAt) || formatter.isVideoMessage(kind, deletedAt);
    },

    isMediaMessage(kind: string | null | undefined, deletedAt: DateLike): boolean {
        return formatter.isImageMessage(kind, deletedAt) || formatter.isVideoMessage(kind, deletedAt) || formatter.isFileMessage(kind, deletedAt);
    },

    /** Foto do grupo ou canal: só dono e admin, em conversa que não é Direct. */
    canEditGroupPhoto(role: string | null | undefined, kind: string | null | undefined): boolean {
        return formatter.isManager(role) && formatter.isGroupLike(kind);
    }

};

export default formatter;
