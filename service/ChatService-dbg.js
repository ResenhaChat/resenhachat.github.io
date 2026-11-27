sap.ui.define(["sap/ui/model/Filter", "sap/ui/model/FilterOperator"], function (Filter, FilterOperator) {
  "use strict";

  /** Campos de uma mensagem usados no aviso local (com o app aberto em segundo plano). */

  /** Update group das linhas de Members (fixar, silenciar, arquivar). */
  const MEMBERSHIP_GROUP = "membership";

  /** Actions OData do serviço Chat. O controller nunca monta request. */
  class ChatService {
    constructor(model) {
      this.model = model;
    }

    /** Com UploadId, Text é a legenda opcional: sem legenda o parâmetro é omitido. */
    async sendMessage(ConversationId, Text, ReplyToId, UploadId) {
      const operation = this.model.bindContext("/SendMessage(...)");
      operation.setParameter("Conversation_ID", ConversationId);
      if (Text) {
        operation.setParameter("Text", Text);
      }
      if (ReplyToId) {
        operation.setParameter("ReplyTo_ID", ReplyToId);
      }
      if (UploadId) {
        operation.setParameter("Upload_ID", UploadId);
      }
      await operation.invoke();
    }

    /** Reserva um upload e devolve o ID para enviar o binário (Uploads(<id>)/Content) e a miniatura do vídeo. */
    async createUpload(input) {
      const parameters = {
        Conversation_ID: input.ConversationId,
        Kind: input.Kind,
        MimeType: input.MimeType,
        FileName: input.FileName,
        Size: input.Size,
        Width: input.Width,
        Height: input.Height,
        DurationSeconds: input.DurationSeconds
      };
      const definedParameters = Object.fromEntries(Object.entries(parameters).filter(([, value]) => value !== undefined));
      const upload = await this.invokeWithResult("CreateUpload", definedParameters);
      return upload.ID;
    }
    async markAsRead(ConversationId) {
      await this.invoke("MarkAsRead", {
        Conversation_ID: ConversationId
      });
    }

    /** ID da conversa direta criada ou reaproveitada. */
    async startDirect(UserId) {
      const conversation = await this.invokeWithResult("StartDirect", {
        User_ID: UserId
      });
      return conversation.ID;
    }

    /** ID do grupo ou canal criado. */
    async createConversation(input) {
      const conversation = await this.invokeWithResult("CreateConversation", {
        ...input
      });
      return conversation.ID;
    }
    async addMembers(ConversationId, UserIds) {
      await this.invoke("AddMembers", {
        Conversation_ID: ConversationId,
        UserIds
      });
    }
    async removeMember(ConversationId, UserId) {
      await this.invoke("RemoveMember", {
        Conversation_ID: ConversationId,
        User_ID: UserId
      });
    }
    async setMemberRole(ConversationId, UserId, Role) {
      await this.invoke("SetMemberRole", {
        Conversation_ID: ConversationId,
        User_ID: UserId,
        Role
      });
    }
    async leaveConversation(ConversationId) {
      await this.invoke("LeaveConversation", {
        Conversation_ID: ConversationId
      });
    }
    async joinChannel(ConversationId) {
      await this.invoke("JoinChannel", {
        Conversation_ID: ConversationId
      });
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

    /**
     * Minha linha em Members da conversa, editável no update group "membership".
     * O chamador destrói o binding (context.getBinding().destroy()) ao terminar.
     */
    async findMyMembership(conversationId, userId) {
      const binding = this.model.bindList("/Members", undefined, undefined, [new Filter({
        path: "Conversation_ID",
        operator: FilterOperator.EQ,
        value1: conversationId
      }), new Filter({
        path: "User_ID",
        operator: FilterOperator.EQ,
        value1: userId
      })], {
        $$updateGroupId: MEMBERSHIP_GROUP
      });
      try {
        const [context] = await binding.requestContexts(0, 1);
        if (!context) {
          binding.destroy();
        }
        return context;
      } catch (error) {
        binding.destroy();
        throw error;
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
    async invoke(action, parameters) {
      const operation = this.model.bindContext(`/${action}(...)`);
      Object.entries(parameters).forEach(([name, value]) => operation.setParameter(name, value));
      try {
        await operation.invoke();
      } finally {
        operation.destroy();
      }
    }

    /** Action que devolve uma entidade: lê o resultado pelo contexto de retorno (getBoundContext) após o invoke. */
    async invokeWithResult(action, parameters) {
      const operation = this.model.bindContext(`/${action}(...)`);
      Object.entries(parameters).forEach(([name, value]) => operation.setParameter(name, value));
      try {
        await operation.invoke();
        return await operation.getBoundContext().requestObject();
      } finally {
        operation.destroy();
      }
    }
  }
  ChatService.MEMBERSHIP_GROUP = MEMBERSHIP_GROUP;
  return ChatService;
});
//# sourceMappingURL=ChatService-dbg.js.map
