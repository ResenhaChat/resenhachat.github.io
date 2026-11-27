import type Event from "sap/ui/base/Event";
import type List from "sap/m/List";
import type ListItemBase from "sap/m/ListItemBase";
import type SearchField from "sap/m/SearchField";
import type JSONModel from "sap/ui/model/json/JSONModel";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type Chat from "../Chat.controller";
import { peopleFilter } from "../../util/peopleFilter";

const SEARCH_DEBOUNCE_MS = 250;

export interface PickedPerson {
    ID: string;
    DisplayName: string;
    Username: string;
}

/**
 * Busca e seleção de pessoas (/People) usadas pelos diálogos.
 * O estado (termo e pessoas escolhidas) fica no JSONModel "compose" do próprio diálogo, em /term e /selected.
 */
export default class PeoplePicker {

    private searchTimer?: number;

    public constructor(
        private readonly controller: Chat,
        private readonly list: List,
        private readonly state: JSONModel,
        private readonly excludedIds: () => string[] = () => []
    ) { }

    public destroy(): void {
        window.clearTimeout(this.searchTimer);
    }

    /** Limpa busca e seleção e recarrega a lista. */
    public reset(): void {
        this.state.setProperty("/term", "");
        this.state.setProperty("/selected", []);
        this.apply();
    }

    /** Refiltra /People pelo termo atual; a binding nasce suspensa e é liberada aqui. */
    public apply(): void {
        const binding = this.list.getBinding("items") as ODataListBinding | undefined;

        if (!binding) {
            return;
        }

        binding.filter(peopleFilter(this.term(), this.controller.getMyId(), this.excludedIds()));

        if (binding.isSuspended()) {
            binding.resume();
        }
    }

    public onSearch = (event: Event): void => {
        const value = event.getSource<SearchField>().getValue();

        window.clearTimeout(this.searchTimer);
        this.searchTimer = window.setTimeout(() => {
            this.state.setProperty("/term", value);
            this.apply();
        }, SEARCH_DEBOUNCE_MS);
    };

    /** Seleção múltipla da lista: o item marcado ou desmarcado entra ou sai de /selected. */
    public toggleItem(item: ListItemBase): void {
        const person = item.getBindingContext()?.getObject() as PickedPerson | undefined;

        if (person) {
            this.toggle(person);
        }
    }

    /** Adiciona ou remove a pessoa da seleção (também usado pelos chips do Tokenizer). */
    public toggle(person: PickedPerson): void {
        const selected = this.selected();
        const isPicked = selected.some((picked) => picked.ID === person.ID);

        this.state.setProperty("/selected", isPicked
            ? selected.filter((picked) => picked.ID !== person.ID)
            : [...selected, person]);
    }

    public selected(): PickedPerson[] {
        return (this.state.getProperty("/selected") as PickedPerson[] | undefined) ?? [];
    }

    public selectedIds(): string[] {
        return this.selected().map((person) => person.ID);
    }

    private term(): string {
        return (this.state.getProperty("/term") as string | undefined) ?? "";
    }

}
