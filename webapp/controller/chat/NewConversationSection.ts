import { ValueState } from "sap/ui/core/library";
import type Event from "sap/ui/base/Event";
import type Dialog from "sap/m/Dialog";
import type Input from "sap/m/Input";
import type List from "sap/m/List";
import type { ListBase$SelectionChangeEvent } from "sap/m/ListBase";
import type ListItemBase from "sap/m/ListItemBase";
import type Token from "sap/m/Token";
import type JSONModel from "sap/ui/model/json/JSONModel";
import type Chat from "../Chat.controller";
import formatter from "../../model/formatter";
import PeoplePicker from "./PeoplePicker";
import type { PickedPerson } from "./PeoplePicker";
import type { NewConversationInput } from "../../service/ChatService";

type ConversationKind = NewConversationInput["Kind"];

const EMPTY_STATE = { kind: "Group", name: "", description: "", isPublic: true, onlyAdminsCanPost: false, term: "", selected: [] };

/** Diálogo de novo grupo ou novo canal (mesmo layout, o Kind muda os campos). */
export default class NewConversationSection {

    public readonly formatter = formatter;

    private dialog?: Dialog;

    private picker?: PeoplePicker;

    public constructor(private readonly controller: Chat) { }

    public destroy(): void {
        this.picker?.destroy();
        this.dialog?.destroy();
    }

    public open = async (kind: ConversationKind): Promise<void> => {
        try {
            const dialog = await this.getDialog();

            this.getState().setData({ ...EMPTY_STATE, selected: [], kind });
            this.getNameInput().setValueState(ValueState.None);
            this.picker?.apply();
            dialog.open();
        } catch (error) {
            await this.controller.handleError(error, "peopleError");
        }
    };

    public onSearch = (event: Event): void => {
        this.picker?.onSearch(event);
    };

    /** Marcar ou desmarcar um item da lista (seleção múltipla) atualiza os chips. */
    public onSelectionChange = (event: ListBase$SelectionChangeEvent): void => {
        this.picker?.toggleItem(event.getParameter("listItem") as ListItemBase);
    };

    /** Remove a pessoa pelo chip do Tokenizer. */
    public onRemoveChip = (event: Event): void => {
        const person = event.getSource<Token>().getBindingContext("compose")?.getObject() as PickedPerson | undefined;

        if (person) {
            this.picker?.toggle(person);
        }
    };

    public onNameChange = (): void => {
        this.getNameInput().setValueState(ValueState.None);
    };

    public onSave = async (): Promise<void> => {
        const name = this.readField("name");

        if (!name) {
            this.getNameInput().setValueState(ValueState.Error);
            this.getNameInput().setValueStateText(this.controller.getText("errorConversationName"));
            return;
        }

        const dialog = this.dialog;

        try {
            dialog?.setBusy(true);
            const id = await this.controller.getChatService().createConversation(this.buildInput(name));
            dialog?.close();
            this.controller.conversations.refresh();
            this.controller.navTo("conversation", { id });
            this.controller.showToast("conversationCreated");
        } catch (error) {
            await this.controller.handleError(error, "conversationCreateError");
        } finally {
            dialog?.setBusy(false);
        }
    };

    public onCancel = (): void => {
        this.dialog?.close();
    };

    private buildInput(name: string): NewConversationInput {
        const isChannel = this.getKind() === "Channel";

        return {
            Kind: this.getKind(),
            Name: name,
            Description: this.readField("description"),
            MemberIds: this.picker?.selectedIds() ?? [],
            IsPublic: isChannel && this.getFlag("isPublic"),
            OnlyAdminsCanPost: isChannel && this.getFlag("onlyAdminsCanPost")
        };
    }

    private getKind(): ConversationKind {
        return this.getState().getProperty("/kind") === "Channel" ? "Channel" : "Group";
    }

    private getFlag(path: "isPublic" | "onlyAdminsCanPost"): boolean {
        return this.getState().getProperty(`/${path}`) === true;
    }

    private readField(path: "name" | "description"): string {
        return ((this.getState().getProperty(`/${path}`) as string | undefined) ?? "").trim();
    }

    private getState(): JSONModel {
        return this.dialog?.getModel("compose") as JSONModel;
    }

    private getNameInput(): Input {
        return this.controller.getFragmentControl<Input>("conversationNameInput");
    }

    private async getDialog(): Promise<Dialog> {
        this.dialog ??= await this.controller.loadDialog("NewConversationDialog", this, { ...EMPTY_STATE, selected: [] });
        this.picker ??= new PeoplePicker(
            this.controller,
            this.controller.getFragmentControl<List>("conversationPeopleList"),
            this.getState()
        );

        return this.dialog;
    }

}
