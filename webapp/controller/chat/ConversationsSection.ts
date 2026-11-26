import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import type Event from "sap/ui/base/Event";
import type Control from "sap/ui/core/Control";
import type List from "sap/m/List";
import type { ListBase$SelectionChangeEvent } from "sap/m/ListBase";
import type Menu from "sap/m/Menu";
import type SearchField from "sap/m/SearchField";
import type { MenuItem$PressEvent } from "sap/m/MenuItem";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type Chat from "../Chat.controller";
import ThemeManager from "../../util/ThemeManager";
import type { ThemeMode } from "../../util/ThemeManager";
import type { ConversationReadPayload } from "../../service/RealtimeEvents";

const SEARCH_DEBOUNCE_MS = 250;
const REFRESH_DEBOUNCE_MS = 300;

/** Lista de conversas (/Conversations), busca por nome, menu do usuário e tema. */
export default class ConversationsSection {

    private searchTimer?: number;

    private refreshTimer?: number;

    private readonly onRealtimeChange = (): void => this.refresh();

    /** Só a leitura feita por mim muda meu contador de não lidas. */
    private readonly onConversationRead = (payload: ConversationReadPayload): void => {
        if (payload.UserId === (this.controller.getSessionModel().getProperty("/user/ID") as string)) {
            this.refresh();
        }
    };

    public constructor(private readonly controller: Chat) { }

    public init(): void {
        const realtime = this.controller.getRealtime();

        realtime.on("message.created", this.onRealtimeChange);
        realtime.on("conversation.read", this.onConversationRead);
        realtime.on("reconnected", this.onRealtimeChange);
    }

    public destroy(): void {
        const realtime = this.controller.getRealtime();

        realtime.off("message.created", this.onRealtimeChange);
        realtime.off("conversation.read", this.onConversationRead);
        realtime.off("reconnected", this.onRealtimeChange);
        window.clearTimeout(this.searchTimer);
        window.clearTimeout(this.refreshTimer);
    }

    /** Agrupa rajadas de eventos em um único reload da lista. */
    public refresh(): void {
        window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => this.getBinding()?.refresh(), REFRESH_DEBOUNCE_MS);
    }

    /** Destaca na lista a conversa aberta (ou limpa a seleção quando não há). */
    public syncSelection(): void {
        const list = this.getList();
        const openId = this.controller.getUiModel().getProperty("/conversationId") as string;
        const item = list.getItems().find((candidate) => candidate.getBindingContext()?.getProperty("ID") === openId);

        if (item) {
            list.setSelectedItem(item, true);
        } else {
            list.removeSelections(true);
        }
    }

    public onUpdateFinished = (): void => this.syncSelection();

    public onSelect = (event: ListBase$SelectionChangeEvent): void => {
        const id = event.getParameter("listItem")?.getBindingContext()?.getProperty("ID") as string | undefined;

        if (id) {
            this.controller.navTo("conversation", { id });
        }
    };

    public onSearch = (event: Event): void => {
        const query = event.getSource<SearchField>().getValue().trim();

        window.clearTimeout(this.searchTimer);
        this.searchTimer = window.setTimeout(() => this.applyFilter(query), SEARCH_DEBOUNCE_MS);
    };

    public onOpenMenu = (event: Event): void => {
        (this.controller.byId("userMenu") as Menu).openBy(event.getSource<Control>());
    };

    public onTheme = (event: MenuItem$PressEvent): void => {
        ThemeManager.setMode(event.getSource().data("mode") as ThemeMode);
    };

    public onLogout = async (): Promise<void> => {
        await this.controller.getAuth().logout();
    };

    private applyFilter(query: string): void {
        const filters = query
            ? [new Filter({ path: "Name", operator: FilterOperator.Contains, value1: query, caseSensitive: false })]
            : [];

        this.getBinding()?.filter(filters);
    }

    private getList(): List {
        return this.controller.byId("conversationList") as List;
    }

    private getBinding(): ODataListBinding | undefined {
        return this.getList().getBinding("items") as ODataListBinding | undefined;
    }

}
