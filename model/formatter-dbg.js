sap.ui.define(["sap/ui/core/format/DateFormat"], function (DateFormat) {
  "use strict";

  const ACCENT_COUNT = 10;
  const GENERAL_KINDS = ["General", "Group", "Channel"];
  const MAX_BADGE = 99;
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
  const timeFormat = DateFormat.getTimeInstance({
    pattern: "HH:mm"
  });
  const dateFormat = DateFormat.getDateInstance({
    style: "medium"
  });
  const shortDateFormat = DateFormat.getDateInstance({
    style: "short"
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
    }
  };
  formatter.setFormatterTextProvider = setFormatterTextProvider;
  return formatter;
});
//# sourceMappingURL=formatter-dbg.js.map
