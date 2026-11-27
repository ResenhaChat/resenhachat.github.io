import type VBox from "sap/m/VBox";
import type HBox from "sap/m/HBox";
import type List from "sap/m/List";
import type Menu from "sap/m/Menu";
import type MenuItem from "sap/m/MenuItem";
import type Control from "sap/ui/core/Control";
import type { Avatar$PressEvent } from "sap/m/Avatar";
import type { UserUpdatedPayload } from "../../service/RealtimeEvents";
import type Context from "sap/ui/model/odata/v4/Context";
import type Chat from "../Chat.controller";
import formatter from "../../model/formatter";
import { isUnauthorized } from "../../util/errors";
import { pickAvatar } from "../../util/mediaTools";

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

    /** ID da pessoa do par que o painel mostra agora (Direct); null fora de Direct. */
    private boundPeerId: string | null = null;

    public constructor(private readonly controller: Chat) { }

    public init(): void {
        this.controller.getRealtime().on("user.updated", this.onUserUpdated);
    }

    public destroy(): void {
        this.controller.getRealtime().off("user.updated", this.onUserUpdated);
        this.close();
    }

    public onOpen = (): void => {
        void this.open();
    };

    /** Foto do grupo: o menu só abre para dono e admin; "Remover" só aparece quando há foto. */
    public onAvatarPress = (event: Avatar$PressEvent): void => {
        const context = this.getPanel().getBindingContext() as Context | null;
        const role = context?.getProperty("MyRole") as string | null | undefined;
        const kind = context?.getProperty("Kind") as string | null | undefined;

        if (!formatter.canEditGroupPhoto(role, kind)) {
            return;
        }

        (this.controller.byId("groupPhotoRemove") as MenuItem).setVisible(!!context?.getProperty("AvatarMimeType"));
        (this.controller.byId("groupAvatarMenu") as Menu).openBy(event.getSource());
    };

    public onChangeGroupPhoto = async (): Promise<void> => {
        const photo = await pickAvatar();

        if (photo) {
            await this.saveGroupPhoto(() => this.controller.getAppComponent().getMediaService().putAvatar(this.ownerPath(), photo));
        }
    };

    public onRemoveGroupPhoto = async (): Promise<void> => {
        if (await this.controller.confirm("confirmRemovePhoto")) {
            await this.saveGroupPhoto(() => this.controller.getAppComponent().getMediaService().deleteAvatar(this.ownerPath()));
        }
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

    /** Pessoa mudou de perfil ou foto: relê o par só se for o par aberto e a lista de membros só se ela estiver nela. */
    private readonly onUserUpdated = (payload: UserUpdatedPayload): void => {
        if (!this.isOpen()) {
            return;
        }

        if (payload.UserId === this.boundPeerId) {
            this.controller.refreshElementBinding(this.controller.byId("detailsPeer") as Control | undefined);
        }

        if (this.controller.messages.hasMember(payload.UserId)) {
            (this.controller.byId("membersList") as List).getBinding("items")?.refresh();
        }
    };

    private ownerPath(): string {
        return `Conversations(${this.controller.getOpenConversationId()})`;
    }

    private async saveGroupPhoto(action: () => Promise<void>): Promise<void> {
        try {
            await action();
            this.controller.showToast("photoSaved");
            await this.controller.messages.refreshConversation();
        } catch (error) {
            await this.controller.handleError(error, "photoError");
        }
    }

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

        this.boundPeerId = peerId;

        if (peerId) {
            peerBox.bindElement({ path: `/People(${peerId})`, parameters: { $select: "ID,DisplayName,Username,About,LastSeenAt,AvatarMimeType,AvatarVersion" } });
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
