import Device from "sap/ui/Device";
import type TextArea from "sap/m/TextArea";
import type Chat from "../Chat.controller";

/** Campo de mensagem: Enter envia, Shift+Enter quebra linha, "digitando…" e rascunho por conversa. */
export default class ComposerSection {

    private currentConversationId = "";

    public constructor(private readonly controller: Chat) { }

    public init(): void {
        this.getInput().addEventDelegate({
            onsapenter: (event: JQuery.Event & { originalEvent?: Event }) => {
                if (!Device.system.phone && !this.isComposing(event)) {
                    event.preventDefault();
                    void this.onSend();
                }
            }
        });
    }

    /** Guarda o rascunho da conversa atual e carrega o da nova. */
    public switchTo(conversationId: string): void {
        const ui = this.controller.getUiModel();

        if (this.currentConversationId) {
            ui.setProperty(`/drafts/${this.currentConversationId}`, ui.getProperty("/draft") as string);
        }

        this.currentConversationId = conversationId;
        ui.setProperty("/draft", (ui.getProperty(`/drafts/${conversationId}`) as string | undefined) ?? "");
    }

    public onLiveChange = (): void => {
        const draft = this.controller.getUiModel().getProperty("/draft") as string;

        if (draft.trim() && this.currentConversationId) {
            this.controller.getRealtime().sendTyping(this.currentConversationId);
        }
    };

    public onSend = async (): Promise<void> => {
        const ui = this.controller.getUiModel();
        const text = (ui.getProperty("/draft") as string).trim();
        const conversationId = this.currentConversationId;

        if (!text || !conversationId || ui.getProperty("/sending") === true) {
            return;
        }

        ui.setProperty("/sending", true);

        try {
            await this.controller.getChatService().sendMessage(conversationId, text);

            ui.setProperty("/draft", "");
            this.controller.messages.refreshMessages();
            this.controller.conversations.refresh();
        } catch (error) {
            await this.controller.handleError(error, "sendError");
        } finally {
            ui.setProperty("/sending", false);
            this.getInput().focus();
        }
    };

    /** Enter durante a composição de IME (acentos, CJK) confirma a escolha e não envia. */
    private isComposing(event: JQuery.Event & { originalEvent?: Event }): boolean {
        return (event.originalEvent as KeyboardEvent | undefined)?.isComposing === true;
    }

    private getInput(): TextArea {
        return this.controller.byId("composerInput") as TextArea;
    }

}
