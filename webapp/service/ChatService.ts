import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";

/** Campos de uma mensagem usados no aviso local (com o app aberto em segundo plano). */
export interface NotifiableMessage {
    ID: string;
    Text: string | null;
    DeletedAt: string | null;
    Sender: { DisplayName: string | null } | null;
    Conversation: { Name: string | null; Kind: string | null } | null;
}

export interface MySettingsFlags {
    NotificationsEnabled: boolean | null;
    NotificationSound: boolean | null;
}

/** Actions OData do serviço Chat. O controller nunca monta request. */
export default class ChatService {

    public constructor(private readonly model: ODataModel) { }

    public async sendMessage(ConversationId: string, Text: string, ReplyToId?: string): Promise<void> {
        const operation = this.model.bindContext("/SendMessage(...)");

        operation.setParameter("Conversation_ID", ConversationId);
        operation.setParameter("Text", Text);

        if (ReplyToId) {
            operation.setParameter("ReplyTo_ID", ReplyToId);
        }

        await operation.invoke();
    }

    public async markAsRead(ConversationId: string): Promise<void> {
        const operation = this.model.bindContext("/MarkAsRead(...)");

        operation.setParameter("Conversation_ID", ConversationId);

        await operation.invoke();
    }

    /** Mensagem com remetente e conversa para montar o aviso local; undefined se não puder ser lida. */
    public async findMessageForNotification(messageId: string): Promise<NotifiableMessage | undefined> {
        const binding = this.model.bindContext(`/Messages(${messageId})`, undefined, {
            $select: "Text,DeletedAt",
            $expand: "Sender($select=DisplayName),Conversation($select=Name,Kind)"
        });

        try {
            return await binding.requestObject() as NotifiableMessage | undefined;
        } finally {
            binding.destroy();
        }
    }

    /** MutedUntil do meu membro na conversa (null se não silenciada). */
    public async findMyMutedUntil(conversationId: string, userId: string): Promise<string | null> {
        const binding = this.model.bindList(
            `/Conversations(${conversationId})/Members`,
            undefined,
            undefined,
            [new Filter({ path: "User_ID", operator: FilterOperator.EQ, value1: userId })],
            { $select: "MutedUntil" }
        );

        try {
            const [context] = await binding.requestContexts(0, 1);

            return (context?.getProperty("MutedUntil") as string | null | undefined) ?? null;
        } finally {
            binding.destroy();
        }
    }

    /** Preferências de notificação do usuário (MySettings) para decidir o aviso local. */
    public async findMySettings(userId: string): Promise<MySettingsFlags | undefined> {
        const binding = this.model.bindContext(`/MySettings(User_ID=${userId})`, undefined, {
            $select: "NotificationsEnabled,NotificationSound"
        });

        try {
            return await binding.requestObject() as MySettingsFlags | undefined;
        } finally {
            binding.destroy();
        }
    }

    /** Conversa geral (Kind = General) visível para o usuário logado; undefined se não existir. */
    public async findGeneralConversationId(): Promise<string | undefined> {
        const binding = this.model.bindList(
            "/Conversations",
            undefined,
            undefined,
            [new Filter({ path: "Kind", operator: FilterOperator.EQ, value1: "General" })],
            { $select: "ID" }
        );

        try {
            const contexts = await binding.requestContexts(0, 1);

            return contexts[0]?.getProperty("ID") as string | undefined;
        } finally {
            binding.destroy();
        }
    }

}
