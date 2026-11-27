import type VBox from "sap/m/VBox";
import type HBox from "sap/m/HBox";
import type Context from "sap/ui/model/odata/v4/Context";
import type Chat from "../Chat.controller";
import { isUnauthorized } from "../../util/errors";

const CONVERSATION_GROUP = "conversation";

/** UI5 aceita null para limpar o contexto de binding, mas a tipagem de setBindingContext não o declara. */
const NO_CONTEXT = null as unknown as Context;

/**
 * Painel de detalhes da conversa aberta (coluna à direita no desktop, tela cheia no celular).
 * Compartilha o contexto de /Conversations(<id>) do cabeçalho (MessagesSection), que é quem recarrega
 * a conversa em conversation.updated e members.changed. Edição no update group "conversation".
 * O rodapé usa a minha linha de Members (update group "membership") via contexto próprio.
 */
export default class DetailsSection {

    private membership?: Context;

    public constructor(private readonly controller: Chat) { }

    public destroy(): void {
        this.close();
    }

    public onOpen = (): void => {
        void this.open();
    };

    public onClose = (): void => {
        this.close();
    };

    /** Troca de conversa com o painel aberto: o painel acompanha a nova conversa. */
    public onConversationOpened(): void {
        if (this.isOpen()) {
            void this.open();
        }
    }

    public onFieldChange = (): void => {
        this.controller.getUiModel().setProperty("/detailsDirty", this.controller.getODataModel().hasPendingChanges(CONVERSATION_GROUP));
    };

    public onSave = async (): Promise<void> => {
        const model = this.controller.getODataModel();

        try {
            await model.submitBatch(CONVERSATION_GROUP);

            if (model.hasPendingChanges(CONVERSATION_GROUP)) {
                throw new Error(this.controller.getText("conversationSaveError"));
            }

            this.onFieldChange();
            this.controller.showToast("conversationSaved");
            this.controller.conversations.refresh();
        } catch (error) {
            await this.controller.handleError(error, "conversationSaveError");
        }
    };

    public onCancel = (): void => {
        this.controller.getODataModel().resetChanges(CONVERSATION_GROUP);
        this.onFieldChange();
    };

    public onToggleArchive = (): void => {
        if (this.membership) {
            void this.controller.actions.toggleArchive(this.membership);
        }
    };

    /** Sair do grupo ou canal (o Geral e o Direct não têm essa ação). */
    public onLeave = async (): Promise<void> => {
        const conversationId = this.controller.getOpenConversationId();

        if (!conversationId || !await this.controller.confirm("confirmLeave")) {
            return;
        }

        try {
            await this.controller.getChatService().leaveConversation(conversationId);
            this.close();
            this.controller.showToast("leftConversation");
            this.controller.conversations.refresh();
            this.controller.navTo("chat", {}, true);
        } catch (error) {
            await this.controller.handleError(error, "leaveError");
        }
    };

    private async open(): Promise<void> {
        const conversationId = this.controller.getOpenConversationId();
        const context = (this.controller.byId("messagesPage") as VBox).getBindingContext() as Context | null;

        if (!conversationId || !context) {
            return;
        }

        this.resetPendingChanges();
        this.releaseMembership();
        this.bindPeer(null);
        this.controller.getUiModel().setProperty("/detailsOpen", true);
        this.getPanel().setBindingContext(context);
        this.onFieldChange();

        try {
            const peerId = await context.requestProperty("DirectPeer_ID") as string | null;

            if (!this.isStillOpen(conversationId)) {
                return;
            }

            this.bindPeer(peerId);
            await this.loadMembership(conversationId);
        } catch (error) {
            if (isUnauthorized(error)) {
                await this.controller.handleError(error, "conversationsError");
            }
        }
    }

    /** Minha linha de Members; se a conversa mudou enquanto eu esperava, a linha é descartada. */
    private async loadMembership(conversationId: string): Promise<void> {
        const membership = await this.controller.getChatService().findMyMembership(conversationId, this.controller.getMyId());

        if (!this.isStillOpen(conversationId)) {
            membership?.getBinding().destroy();
            return;
        }

        this.membership = membership;
        (this.controller.byId("detailsFooter") as HBox).setBindingContext(membership ?? NO_CONTEXT);
    }

    private close(): void {
        this.resetPendingChanges();
        this.controller.getUiModel().setProperty("/detailsOpen", false);
        this.getPanel().setBindingContext(NO_CONTEXT);
        this.bindPeer(null);
        this.releaseMembership();
        this.onFieldChange();
    }

    private resetPendingChanges(): void {
        const model = this.controller.getODataModel();

        if (model.hasPendingChanges(CONVERSATION_GROUP)) {
            model.resetChanges(CONVERSATION_GROUP);
        }
    }

    /** Em Direct, o painel mostra o perfil da outra pessoa (People), não a lista de membros. */
    private bindPeer(peerId: string | null): void {
        const peerBox = this.controller.byId("detailsPeer") as VBox;

        if (peerId) {
            peerBox.bindElement({ path: `/People(${peerId})`, parameters: { $select: "ID,DisplayName,Username,About,LastSeenAt" } });
            return;
        }

        // Contexto null explícito: sem ele o bloco herdaria /Conversations e pediria DisplayName etc. lá,
        // o que derruba o batch (membros e rodapé não carregam).
        peerBox.unbindElement();
        peerBox.setBindingContext(NO_CONTEXT);
    }

    private releaseMembership(): void {
        (this.controller.byId("detailsFooter") as HBox).setBindingContext(NO_CONTEXT);
        this.membership?.getBinding().destroy();
        this.membership = undefined;
    }

    private isStillOpen(conversationId: string): boolean {
        return this.isOpen() && this.controller.getOpenConversationId() === conversationId;
    }

    private isOpen(): boolean {
        return this.controller.getUiModel().getProperty("/detailsOpen") === true;
    }

    private getPanel(): VBox {
        return this.controller.byId("detailsPanel") as VBox;
    }

}
