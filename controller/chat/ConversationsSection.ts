import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import type Event from "sap/ui/base/Event";
import type Control from "sap/ui/core/Control";
import type List from "sap/m/List";
import type { ListBase$SelectionChangeEvent } from "sap/m/ListBase";
import type Menu from "sap/m/Menu";
import type Input from "sap/m/Input";
import type { MenuItem$PressEvent } from "sap/m/MenuItem";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type Chat from "../Chat.controller";
import ThemeManager from "../../util/ThemeManager";
import { showUnreadCount } from "../../util/pwa";
import type { ThemeMode } from "../../util/ThemeManager";
import type { ConversationReadPayload, UserUpdatedPayload } from "../../service/RealtimeEvents";

const SEARCH_DEBOUNCE_MS = 250;
const REFRESH_DEBOUNCE_MS = 300;

/**
 * Lista das minhas participações (/Members com IsArchived eq false, ou true na visão "Arquivadas"),
 * busca pelo nome da conversa, menu do usuário e tema.
 * Limitação: conversas Direct não têm Name, então a busca não encontra pelo nome da outra pessoa.
 */
export default class ConversationsSection {

    private searchTimer?: number;

    private refreshTimer?: number;

    private searchTerm = "";

    private readonly onRealtimeChange = (): void => this.refresh();

    /** Só a leitura feita por mim muda meu contador de não lidas. */
    private readonly onConversationRead = (payload: ConversationReadPayload): void => {
        if (payload.UserId === this.controller.getMyId()) {
            this.refresh();
        }
    };

    /** Foto ou perfil de alguém: a lista relê (fotos do par em Direct); se fui eu, relê também meu avatar do topo. */
    private readonly onUserUpdated = (payload: UserUpdatedPayload): void => {
        if (payload.UserId === this.controller.getMyId()) {
            this.controller.refreshElementBinding(this.controller.byId("meAvatar") as Control | undefined);
        }

        this.refresh();
    };

    public constructor(private readonly controller: Chat) { }

    public init(): void {
        const realtime = this.controller.getRealtime();

        realtime.on("message.created", this.onRealtimeChange);
        realtime.on("conversation.read", this.onConversationRead);
        realtime.on("conversation.created", this.onRealtimeChange);
        realtime.on("conversation.updated", this.onRealtimeChange);
        realtime.on("members.changed", this.onRealtimeChange);
        realtime.on("user.updated", this.onUserUpdated);
        realtime.on("reconnected", this.onRealtimeChange);
        this.applyFilter();
    }

    public destroy(): void {
        const realtime = this.controller.getRealtime();

        realtime.off("message.created", this.onRealtimeChange);
        realtime.off("conversation.read", this.onConversationRead);
        realtime.off("conversation.created", this.onRealtimeChange);
        realtime.off("conversation.updated", this.onRealtimeChange);
        realtime.off("members.changed", this.onRealtimeChange);
        realtime.off("user.updated", this.onUserUpdated);
        realtime.off("reconnected", this.onRealtimeChange);
        window.clearTimeout(this.searchTimer);
        window.clearTimeout(this.refreshTimer);
    }

    /** Agrupa rajadas de eventos em um único reload da lista. */
    public refresh(): void {
        window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => this.getBinding()?.refresh(), REFRESH_DEBOUNCE_MS);
    }

    /** Soma as não lidas das linhas já carregadas (sem request extra) para o título da aba e o selo. */
    public updateUnread(): void {
        const contexts = this.getBinding()?.getAllCurrentContexts() ?? [];
        const total = contexts.reduce((sum, context) => sum + ((context.getProperty("UnreadCount") as number | null) ?? 0), 0);

        showUnreadCount(total, this.controller.getText("appName"));
    }

    /** Destaca na lista a conversa aberta (ou limpa a seleção quando não há). */
    public syncSelection(): void {
        const list = this.getList();
        const openId = this.controller.getOpenConversationId();
        const item = list.getItems().find((candidate) => candidate.getBindingContext()?.getProperty("Conversation_ID") === openId);

        if (item) {
            list.setSelectedItem(item, true);
        } else {
            list.removeSelections(true);
        }
    }

    /** Aplica filtro de usuário, arquivadas e busca; a binding nasce suspensa para não trazer memberships alheias. */
    public applyFilter(): void {
        const binding = this.getBinding();

        if (!binding) {
            this.getList().attachEventOnce("modelContextChange", () => this.applyFilter());
            return;
        }

        binding.filter(this.buildFilters());

        if (binding.isSuspended()) {
            binding.resume();
        }
    }

    public onUpdateFinished = (): void => this.syncSelection();

    public onSelect = (event: ListBase$SelectionChangeEvent): void => {
        const id = event.getParameter("listItem")?.getBindingContext()?.getProperty("Conversation_ID") as string | undefined;

        if (id) {
            this.controller.navTo("conversation", { id });
        }
    };

    public onSearch = (event: Event): void => {
        const query = event.getSource<Input>().getValue().trim();

        window.clearTimeout(this.searchTimer);
        this.searchTimer = window.setTimeout(() => {
            this.searchTerm = query;
            this.applyFilter();
        }, SEARCH_DEBOUNCE_MS);
    };

    /** Alterna entre as ativas e as arquivadas (flag só de UI; a lista é refiltrada pela binding). */
    public onToggleArchived = (): void => {
        const ui = this.controller.getUiModel();

        ui.setProperty("/showArchived", !ui.getProperty("/showArchived"));
        this.applyFilter();
    };

    public onOpenMenu = (event: Event): void => {
        (this.controller.byId("userMenu") as Menu).openBy(event.getSource<Control>());
    };

    public onToggleTheme = (): void => {
        ThemeManager.setMode(ThemeManager.isDark() ? "light" : "dark");
    };

    public onTheme = (event: MenuItem$PressEvent): void => {
        ThemeManager.setMode(event.getSource().data("mode") as ThemeMode);
    };

    /** Antes de sair, o aparelho deixa de receber push deste usuário (o servidor ainda aceita o token). */
    public onLogout = async (): Promise<void> => {
        await this.controller.getAppComponent().getPushService().detach().catch(() => undefined);
        await this.controller.getAuth().logout();
    };

    private buildFilters(): Filter[] {
        const filters = [
            new Filter({ path: "User_ID", operator: FilterOperator.EQ, value1: this.controller.getMyId() }),
            new Filter({ path: "IsArchived", operator: FilterOperator.EQ, value1: this.isShowingArchived() })
        ];

        if (this.searchTerm) {
            filters.push(new Filter({ path: "Conversation/Name", operator: FilterOperator.Contains, value1: this.searchTerm, caseSensitive: false }));
        }

        return filters;
    }

    private isShowingArchived(): boolean {
        return this.controller.getUiModel().getProperty("/showArchived") === true;
    }

    private getList(): List {
        return this.controller.byId("conversationList") as List;
    }

    private getBinding(): ODataListBinding | undefined {
        return this.getList().getBinding("items") as ODataListBinding | undefined;
    }

}
