sap.ui.define(["sap/ui/model/Filter", "sap/ui/model/FilterOperator"], function (Filter, FilterOperator) {
  "use strict";

  /** Campos de uma mensagem usados no aviso local (com o app aberto em segundo plano). */

  /** Actions OData do serviço Chat. O controller nunca monta request. */
  class ChatService {
    constructor(model) {
      this.model = model;
    }
    async sendMessage(ConversationId, Text, ReplyToId) {
      const operation = this.model.bindContext("/SendMessage(...)");
      operation.setParameter("Conversation_ID", ConversationId);
      operation.setParameter("Text", Text);
      if (ReplyToId) {
        operation.setParameter("ReplyTo_ID", ReplyToId);
      }
      await operation.invoke();
    }
    async markAsRead(ConversationId) {
      const operation = this.model.bindContext("/MarkAsRead(...)");
      operation.setParameter("Conversation_ID", ConversationId);
      await operation.invoke();
    }

    /** Mensagem com remetente e conversa para montar o aviso local; undefined se não puder ser lida. */
    async findMessageForNotification(messageId) {
      const binding = this.model.bindContext(`/Messages(${messageId})`, undefined, {
        $select: "Text,DeletedAt",
        $expand: "Sender($select=DisplayName),Conversation($select=Name,Kind)"
      });
      try {
        return await binding.requestObject();
      } finally {
        binding.destroy();
      }
    }

    /** MutedUntil do meu membro na conversa (null se não silenciada). */
    async findMyMutedUntil(conversationId, userId) {
      const binding = this.model.bindList(`/Conversations(${conversationId})/Members`, undefined, undefined, [new Filter({
        path: "User_ID",
        operator: FilterOperator.EQ,
        value1: userId
      })], {
        $select: "MutedUntil"
      });
      try {
        const [context] = await binding.requestContexts(0, 1);
        return context?.getProperty("MutedUntil") ?? null;
      } finally {
        binding.destroy();
      }
    }

    /** Preferências de notificação do usuário (MySettings) para decidir o aviso local. */
    async findMySettings(userId) {
      const binding = this.model.bindContext(`/MySettings(User_ID=${userId})`, undefined, {
        $select: "NotificationsEnabled,NotificationSound"
      });
      try {
        return await binding.requestObject();
      } finally {
        binding.destroy();
      }
    }

    /** Conversa geral (Kind = General) visível para o usuário logado; undefined se não existir. */
    async findGeneralConversationId() {
      const binding = this.model.bindList("/Conversations", undefined, undefined, [new Filter({
        path: "Kind",
        operator: FilterOperator.EQ,
        value1: "General"
      })], {
        $select: "ID"
      });
      try {
        const contexts = await binding.requestContexts(0, 1);
        return contexts[0]?.getProperty("ID");
      } finally {
        binding.destroy();
      }
    }
  }
  return ChatService;
});
//# sourceMappingURL=ChatService-dbg.js.map
