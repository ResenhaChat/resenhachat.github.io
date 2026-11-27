sap.ui.define(["sap/ui/core/format/DateFormat", "../auth/RuntimeConfig"], function (DateFormat, ___auth_RuntimeConfig) {
  "use strict";

  const getRuntimeConfig = ___auth_RuntimeConfig["getRuntimeConfig"];
  const ACCENT_COUNT = 10;
  const GENERAL_KINDS = ["General", "Group", "Channel"];
  const MAX_BADGE = 99;
  const KB = 1024;
  const MB = KB * KB;
  const SECONDS_PER_MINUTE = 60;
  const MEDIA_MAX_WIDTH = 280;
  const MEDIA_MAX_HEIGHT = 360;
  const MEDIA_FALLBACK = {
    width: 240,
    height: 180
  };
  const FILE_ICON_RULES = [[/^video\//, "sap-icon://video"], [/^image\//, "sap-icon://attachment-photo"], [/pdf/, "sap-icon://pdf-attachment"], [/zip|rar|7z|tar|gzip/, "sap-icon://attachment-zip-file"], [/sheet|excel|csv/, "sap-icon://excel-attachment"], [/presentation|powerpoint/, "sap-icon://ppt-attachment"], [/word|opendocument\.text/, "sap-icon://doc-attachment"], [/^text\//, "sap-icon://document-text"]];
  const DEFAULT_FILE_ICON = "sap-icon://document";
  let getText = key => key;

  /** O Component informa de onde vêm os textos i18n usados pelos formatters. */
  function setFormatterTextProvider(provider) {
    getText = provider;
  }
  function toDate(value) {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }
  function daysAgo(date) {
    return Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  }
  function accentNumber(id) {
    let hash = 2166136261;
    for (const char of id ?? "") {
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    }
    return (hash >>> 8) % ACCENT_COUNT + 1;
  }

  /** URL de leitura de mídia com o token na query `mt`; sem token não há URL (o avatar cai nas iniciais). */
  function mediaUrl(resource, mediaToken, version) {
    if (!mediaToken) {
      return undefined;
    }
    const versionQuery = version === undefined ? "" : `v=1.0.0&`;
    return `${getRuntimeConfig().chatService}${resource}?${versionQuery}mt=${encodeURIComponent(mediaToken)}`;
  }

  /** photo: AvatarMimeType (ou DirectPeerHasAvatar) — null/vazio = sem foto. */
  function avatarUrl(set, id, photo, version, mediaToken) {
    if (!id || !photo) {
      return undefined;
    }
    return mediaUrl(`${set}(${id})/Avatar`, mediaToken, version ?? 0);
  }
  function attachmentUrl(id, part, mediaToken) {
    return id ? mediaUrl(`Attachments(${id})/${part}`, mediaToken) : undefined;
  }

  /** Caixa da mídia no balão: proporção original limitada a 280 x 360 px, sem ampliar. */
  function mediaBox(width, height) {
    if (!width || !height) {
      return MEDIA_FALLBACK;
    }
    const scale = Math.min(1, MEDIA_MAX_WIDTH / width, MEDIA_MAX_HEIGHT / height);
    return {
      width: Math.round(width * scale),
      height: Math.round(height * scale)
    };
  }
  function pad(value) {
    return String(value).padStart(2, "0");
  }
  const timeFormat = DateFormat.getTimeInstance({
    pattern: "HH:mm"
  });
  const dateFormat = DateFormat.getDateInstance({
    style: "medium"
  });
  const shortDateFormat = DateFormat.getDateInstance({
    style: "short"
  });
  const dayMonthFormat = DateFormat.getDateInstance({
    pattern: "dd/MM"
  });
  const formatter = {
    initials(name) {
      const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
      if (!parts.length) {
        return "?";
      }
      const first = parts[0].charAt(0);
      const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : parts[0].charAt(1);
      return `${first}${last}`.toUpperCase();
    },
    /** Cor estável de avatar (Accent1..Accent10) por usuário/conversa. */
    accent(id) {
      return `Accent${accentNumber(id)}`;
    },
    /** Índice da cor do nome do autor; o CSS usa data-rs-accent. */
    accentIndex(id) {
      return String(accentNumber(id));
    },
    time(value) {
      const date = toDate(value);
      return date ? timeFormat.format(date) : "";
    },
    conversationTime(value) {
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
    dayLabel(value) {
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
    sameDay(first, second) {
      const firstDate = toDate(first);
      const secondDate = toDate(second);
      return !!firstDate && !!secondDate && startOfDay(firstDate) === startOfDay(secondDate);
    },
    isOnline(userId, online) {
      return !!userId && !!online?.[userId];
    },
    isMine(senderId, myId) {
      return String(!!senderId && senderId === myId);
    },
    isTypingIn(conversationId, typing) {
      return !!conversationId && !!typing?.[conversationId]?.length;
    },
    isNotTypingIn(conversationId, typing) {
      return !formatter.isTypingIn(conversationId, typing);
    },
    canSend(draft, sending) {
      return !sending && !!draft?.trim();
    },
    conversationIcon(kind) {
      if (kind === "Channel") {
        return "sap-icon://marketing-campaign";
      }
      return GENERAL_KINDS.includes(kind ?? "") ? "sap-icon://group" : "";
    },
    unreadBadge(count) {
      return (count ?? 0) > MAX_BADGE ? `${MAX_BADGE}+` : String(count ?? 0);
    },
    hasUnread(count) {
      return (count ?? 0) > 0;
    },
    messageText(text, deletedAt) {
      return toDate(deletedAt) ? getText("messageDeleted") : text ?? "";
    },
    /** Prévia da última mensagem (texto de até 200 caracteres): uma linha só. */
    messagePreview(text) {
      return (text ?? "").replace(/\s+/g, " ").trim();
    },
    unreadTooltip(count) {
      return getText("unreadCount", [count ?? 0]);
    },
    isEdited(editedAt, deletedAt) {
      return !!toDate(editedAt) && !toDate(deletedAt);
    },
    firstName(name) {
      return (name ?? "").trim().split(/\s+/)[0] ?? "";
    },
    /** A faixa "Online agora" só aparece quando há alguém online além de mim. */
    hasOthersOnline(online, myId) {
      return Object.keys(online ?? {}).some(userId => userId !== myId);
    },
    /** Ícone do botão de tema: mostra o sol no escuro (vai para o claro) e a lua no claro. */
    themeIcon(dark) {
      return dark ? "sap-icon://light-mode" : "sap-icon://dark-mode";
    },
    isMode(current, target) {
      return String(current === target);
    },
    isDirect(kind) {
      return kind === "Direct";
    },
    isNotDirect(kind) {
      return kind !== "Direct";
    },
    isSystem(kind) {
      return kind === "System";
    },
    isNotSystem(kind) {
      return kind !== "System";
    },
    /** Dono ou admin: pode editar a conversa e gerenciar membros. */
    isManager(role) {
      return role === "Owner" || role === "Admin";
    },
    /** Em canal "só admins publicam", membros comuns veem o aviso no lugar do composer. */
    canPostHere(onlyAdminsCanPost, role) {
      return !onlyAdminsCanPost || formatter.isManager(role);
    },
    cannotPostHere(onlyAdminsCanPost, role) {
      return !formatter.canPostHere(onlyAdminsCanPost, role);
    },
    roleLabel(role) {
      if (role === "Owner") {
        return getText("roleOwner");
      }
      return role === "Admin" ? getText("roleAdmin") : "";
    },
    hasRoleLabel(role) {
      return formatter.isManager(role);
    },
    /** Membro pode ser removido por quem gerencia: ninguém remove o dono, admin remove só membros comuns. */
    canRemoveMember(myRole, memberRole, isMe) {
      if (isMe || memberRole === "Owner") {
        return false;
      }
      return myRole === "Owner" || myRole === "Admin" && memberRole === "Member";
    },
    /** Só o dono promove e rebaixa admins. */
    canToggleAdmin(myRole, memberRole, isMe) {
      return !isMe && myRole === "Owner" && memberRole !== "Owner";
    },
    /** Nome: dono ou admin de grupo e canal (o Geral mostra só o título). */
    canEditName(role, kind) {
      return formatter.isManager(role) && formatter.isGroupLike(kind);
    },
    /** Descrição: dono ou admin em qualquer conversa que não seja Direct. */
    canEditDescription(role, kind) {
      return formatter.isManager(role) && kind !== "Direct";
    },
    /** Público e só admins publicam: dono ou admin de grupo e canal. */
    canEditSettings(role, kind) {
      return formatter.isManager(role) && formatter.isGroupLike(kind);
    },
    isChannel(kind) {
      return kind === "Channel";
    },
    /** Grupo e canal têm membros; o Geral não tem lista de membros nem a ação de sair. */
    isGroupLike(kind) {
      return kind === "Group" || kind === "Channel";
    },
    /** Pessoa da lista de seleção: mostra o check quando já está escolhida. */
    isPicked(userId, selected) {
      return !!userId && !!selected?.some(person => person.ID === userId);
    },
    isDirectOnline(kind, peerId, online) {
      return formatter.isDirect(kind) && formatter.isOnline(peerId, online);
    },
    /** Status de uma pessoa (perfil do Direct): online agora ou visto por último. */
    peerStatus(userId, online, lastSeenAt) {
      return formatter.directStatus(formatter.isOnline(userId, online), lastSeenAt);
    },
    /** Mostra o "⋯" do membro só se há alguma ação para mim nessa linha. */
    canManageMember(myRole, memberRole, memberId, myId) {
      const isMe = !!memberId && memberId === myId;
      return formatter.canRemoveMember(myRole, memberRole, isMe) || formatter.canToggleAdmin(myRole, memberRole, isMe);
    },
    memberCountText(count) {
      return count === 1 ? getText("memberCountOne") : getText("memberCount", [count ?? 0]);
    },
    joinLabel(isMember) {
      return getText(isMember ? "openConversation" : "joinChannel");
    },
    archivedToggleLabel(showingArchived) {
      return getText(showingArchived ? "backToChats" : "archivedChats");
    },
    emptyListText(showingArchived) {
      return getText(showingArchived ? "noArchivedConversations" : "noConversations");
    },
    newConversationTitle(kind) {
      return getText(kind === "Channel" ? "newChannelTitle" : "newGroupTitle");
    },
    pinLabel(isPinned) {
      return getText(isPinned ? "unpinConversation" : "pinConversation");
    },
    archiveLabel(isArchived) {
      return getText(isArchived ? "unarchiveConversation" : "archiveConversation");
    },
    isMuted(mutedUntil) {
      const date = toDate(mutedUntil);
      return !!date && date.getTime() > Date.now();
    },
    notMuted(mutedUntil) {
      return !formatter.isMuted(mutedUntil);
    },
    muteLabel(mutedUntil) {
      return getText(formatter.isMuted(mutedUntil) ? "unmuteConversation" : "muteConversation");
    },
    /** Hoje: "às HH:mm"; ontem: "ontem às HH:mm"; antes: "em dd/MM". */
    lastSeenLabel(lastSeenAt) {
      const date = toDate(lastSeenAt);
      if (!date) {
        return "";
      }
      const days = daysAgo(date);
      if (days <= 0) {
        return getText("lastSeenToday", [timeFormat.format(date)]);
      }
      return days === 1 ? getText("lastSeenYesterday", [timeFormat.format(date)]) : getText("lastSeenDate", [dayMonthFormat.format(date)]);
    },
    memberSummary(count, online) {
      return getText("memberSummary", [formatter.memberCountText(count), online ?? 0]);
    },
    promoteLabel(role) {
      return getText(role === "Admin" ? "demoteAdmin" : "promoteAdmin");
    },
    /** Linha de cabeçalho de Direct: online agora ou visto por último (vazio se não há o que mostrar). */
    directStatus(isOnline, lastSeenAt) {
      if (isOnline) {
        return getText("statusOnline");
      }
      return formatter.lastSeenLabel(lastSeenAt);
    },
    /** Foto do canal público (Conversations/Avatar); sem foto, o ícone de canal. */
    channelAvatarSrc(conversationId, photo, version, mediaToken) {
      // Quem explora ainda não é membro: a foto do canal público vem por PublicChannels.
      return avatarUrl("PublicChannels", conversationId, photo, version, mediaToken) ?? formatter.conversationIcon("Channel");
    },
    /** Foto de pessoa (People) ou minha (Me); undefined = iniciais. */
    personAvatarSrc(userId, photo, version, mediaToken) {
      return avatarUrl("People", userId, photo, version, mediaToken);
    },
    meAvatarSrc(userId, photo, version, mediaToken) {
      return avatarUrl("Me", userId, photo, version, mediaToken);
    },
    /** Direct: foto do par; grupo e canal: foto da conversa; sem foto, ícone do tipo (Direct cai nas iniciais). */
    conversationAvatarSrc(kind, conversationId, groupPhoto, groupVersion, peerId, peerHasPhoto, peerVersion, mediaToken) {
      const photo = formatter.isDirect(kind) ? avatarUrl("People", peerId, peerHasPhoto, peerVersion, mediaToken) : avatarUrl("Conversations", conversationId, groupPhoto, groupVersion, mediaToken);
      return photo ?? (formatter.conversationIcon(kind) || undefined);
    },
    /** Miniatura da foto ou do vídeo; foto sem miniatura usa o original; vídeo sem miniatura fica sem imagem. */
    attachmentThumbSrc(attachmentId, thumbnailMimeType, kind, mediaToken) {
      if (!thumbnailMimeType && kind !== "Image") {
        return undefined;
      }
      return attachmentUrl(attachmentId, thumbnailMimeType ? "Thumbnail" : "Content", mediaToken);
    },
    attachmentUrl(attachmentId, part, mediaToken) {
      return attachmentUrl(attachmentId, part, mediaToken);
    },
    /** Só a largura: a altura segue a proporção da imagem (height auto no CSS), sem distorcer em 375 px. */
    mediaWidth(width, height) {
      return `${mediaBox(width, height).width}px`;
    },
    /** Download forçado (Content-Disposition: attachment), serve também para cross-origin. */
    attachmentDownloadUrl(attachmentId, mediaToken) {
      const url = attachmentUrl(attachmentId, "Content", mediaToken);
      return url ? `${url}&download=1` : undefined;
    },
    /** Dica da foto do grupo só para quem pode trocá-la; sem permissão o avatar não anuncia ação. */
    groupPhotoTooltip(role, kind) {
      return formatter.canEditGroupPhoto(role, kind) ? getText("changePhoto") : undefined;
    },
    groupPhotoBadge(role, kind) {
      return formatter.canEditGroupPhoto(role, kind) ? "sap-icon://camera" : "";
    },
    fileSize(bytes) {
      const size = bytes ?? 0;
      const format = (value, unit, digits) => `${value.toLocaleString(undefined, {
        maximumFractionDigits: digits
      })} ${unit}`;
      if (size < KB) {
        return format(size, "B", 0);
      }
      return size < MB ? format(size / KB, "KB", 0) : format(size / MB, "MB", 1);
    },
    fileIcon(mimeType) {
      const rule = FILE_ICON_RULES.find(([pattern]) => pattern.test(mimeType ?? ""));
      return rule?.[1] ?? DEFAULT_FILE_ICON;
    },
    durationLabel(seconds) {
      const total = Math.round(seconds ?? 0);
      return `${Math.floor(total / SECONDS_PER_MINUTE)}:${pad(total % SECONDS_PER_MINUTE)}`;
    },
    isImageMessage(kind, deletedAt) {
      return kind === "Image" && !toDate(deletedAt);
    },
    isVideoMessage(kind, deletedAt) {
      return kind === "Video" && !toDate(deletedAt);
    },
    isFileMessage(kind, deletedAt) {
      return kind === "File" && !toDate(deletedAt);
    },
    /** Foto ou vídeo: o balão mostra a miniatura. */
    isPictureMessage(kind, deletedAt) {
      return formatter.isImageMessage(kind, deletedAt) || formatter.isVideoMessage(kind, deletedAt);
    },
    isMediaMessage(kind, deletedAt) {
      return formatter.isImageMessage(kind, deletedAt) || formatter.isVideoMessage(kind, deletedAt) || formatter.isFileMessage(kind, deletedAt);
    },
    /** Foto do grupo ou canal: só dono e admin, em conversa que não é Direct. */
    canEditGroupPhoto(role, kind) {
      return formatter.isManager(role) && formatter.isGroupLike(kind);
    }
  };
  formatter.setFormatterTextProvider = setFormatterTextProvider;
  return formatter;
});
//# sourceMappingURL=formatter-dbg.js.map
