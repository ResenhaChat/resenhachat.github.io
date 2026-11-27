import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import type Context from "sap/ui/model/odata/v4/Context";

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

export interface NewConversationInput {
    Kind: "Group" | "Channel";
    Name: string;
    Description: string;
    MemberIds: string[];
    IsPublic: boolean;
    OnlyAdminsCanPost: boolean;
}

/** Update group das linhas de Members (fixar, silenciar, arquivar). */
export const MEMBERSHIP_GROUP = "membership";

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
        await this.invoke("MarkAsRead", { Conversation_ID: ConversationId });
    }

    /** ID da conversa direta criada ou reaproveitada. */
    public async startDirect(UserId: string): Promise<string> {
        const conversation = await this.invokeWithResult<{ ID: string }>("StartDirect", { User_ID: UserId });

        return conversation.ID;
    }

    /** ID do grupo ou canal criado. */
    public async createConversation(input: NewConversationInput): Promise<string> {
        const conversation = await this.invokeWithResult<{ ID: string }>("CreateConversation", { ...input });

        return conversation.ID;
    }

    public async addMembers(ConversationId: string, UserIds: string[]): Promise<void> {
        await this.invoke("AddMembers", { Conversation_ID: ConversationId, UserIds });
    }

    public async removeMember(ConversationId: string, UserId: string): Promise<void> {
        await this.invoke("RemoveMember", { Conversation_ID: ConversationId, User_ID: UserId });
    }

    public async setMemberRole(ConversationId: string, UserId: string, Role: "Admin" | "Member"): Promise<void> {
        await this.invoke("SetMemberRole", { Conversation_ID: ConversationId, User_ID: UserId, Role });
    }

    public async leaveConversation(ConversationId: string): Promise<void> {
        await this.invoke("LeaveConversation", { Conversation_ID: ConversationId });
    }

    public async joinChannel(ConversationId: string): Promise<void> {
        await this.invoke("JoinChannel", { Conversation_ID: ConversationId });
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

    /**
     * Minha linha em Members da conversa, editável no update group "membership".
     * O chamador destrói o binding (context.getBinding().destroy()) ao terminar.
     */
    public async findMyMembership(conversationId: string, userId: string): Promise<Context | undefined> {
        const binding = this.model.bindList(
            "/Members",
            undefined,
            undefined,
            [
                new Filter({ path: "Conversation_ID", operator: FilterOperator.EQ, value1: conversationId }),
                new Filter({ path: "User_ID", operator: FilterOperator.EQ, value1: userId })
            ],
            { $$updateGroupId: MEMBERSHIP_GROUP }
        );

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

    private async invoke(action: string, parameters: Record<string, unknown>): Promise<void> {
        const operation = this.model.bindContext(`/${action}(...)`);

        Object.entries(parameters).forEach(([name, value]) => operation.setParameter(name, value));

        try {
            await operation.invoke();
        } finally {
            operation.destroy();
        }
    }

    /** Action que devolve uma entidade: lê o resultado pelo contexto de retorno (getBoundContext) após o invoke. */
    private async invokeWithResult<Result>(action: string, parameters: Record<string, unknown>): Promise<Result> {
        const operation = this.model.bindContext(`/${action}(...)`);

        Object.entries(parameters).forEach(([name, value]) => operation.setParameter(name, value));

        try {
            await operation.invoke();

            return await operation.getBoundContext().requestObject() as Result;
        } finally {
            operation.destroy();
        }
    }

}
