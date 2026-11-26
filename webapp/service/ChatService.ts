import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";

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
