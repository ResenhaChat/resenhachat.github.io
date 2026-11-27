sap.ui.define(["sap/ui/model/Filter", "sap/ui/model/FilterOperator", "../../util/ThemeManager", "../../util/pwa"], function (Filter, FilterOperator, __ThemeManager, ____util_pwa) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const ThemeManager = _interopRequireDefault(__ThemeManager);
  const showUnreadCount = ____util_pwa["showUnreadCount"];
  const SEARCH_DEBOUNCE_MS = 250;
  const REFRESH_DEBOUNCE_MS = 300;

  /**
   * Lista das minhas participações (/Members com IsArchived eq false, ou true na visão "Arquivadas"),
   * busca pelo nome da conversa, menu do usuário e tema.
   * Limitação: conversas Direct não têm Name, então a busca não encontra pelo nome da outra pessoa.
   */
  class ConversationsSection {
    searchTerm = "";
    onRealtimeChange = () => this.refresh();

    /** Só a leitura feita por mim muda meu contador de não lidas. */
    onConversationRead = payload => {
      if (payload.UserId === this.controller.getMyId()) {
        this.refresh();
      }
    };
    constructor(controller) {
      this.controller = controller;
    }
    init() {
      const realtime = this.controller.getRealtime();
      realtime.on("message.created", this.onRealtimeChange);
      realtime.on("conversation.read", this.onConversationRead);
      realtime.on("conversation.created", this.onRealtimeChange);
      realtime.on("conversation.updated", this.onRealtimeChange);
      realtime.on("members.changed", this.onRealtimeChange);
      realtime.on("reconnected", this.onRealtimeChange);
      this.applyFilter();
    }
    destroy() {
      const realtime = this.controller.getRealtime();
      realtime.off("message.created", this.onRealtimeChange);
      realtime.off("conversation.read", this.onConversationRead);
      realtime.off("conversation.created", this.onRealtimeChange);
      realtime.off("conversation.updated", this.onRealtimeChange);
      realtime.off("members.changed", this.onRealtimeChange);
      realtime.off("reconnected", this.onRealtimeChange);
      window.clearTimeout(this.searchTimer);
      window.clearTimeout(this.refreshTimer);
    }

    /** Agrupa rajadas de eventos em um único reload da lista. */
    refresh() {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => this.getBinding()?.refresh(), REFRESH_DEBOUNCE_MS);
    }

    /** Soma as não lidas das linhas já carregadas (sem request extra) para o título da aba e o selo. */
    updateUnread() {
      const contexts = this.getBinding()?.getAllCurrentContexts() ?? [];
      const total = contexts.reduce((sum, context) => sum + (context.getProperty("UnreadCount") ?? 0), 0);
      showUnreadCount(total, this.controller.getText("appName"));
    }

    /** Destaca na lista a conversa aberta (ou limpa a seleção quando não há). */
    syncSelection() {
      const list = this.getList();
      const openId = this.controller.getOpenConversationId();
      const item = list.getItems().find(candidate => candidate.getBindingContext()?.getProperty("Conversation_ID") === openId);
      if (item) {
        list.setSelectedItem(item, true);
      } else {
        list.removeSelections(true);
      }
    }

    /** Aplica filtro de usuário, arquivadas e busca; a binding nasce suspensa para não trazer memberships alheias. */
    applyFilter() {
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
    onUpdateFinished = () => this.syncSelection();
    onSelect = event => {
      const id = event.getParameter("listItem")?.getBindingContext()?.getProperty("Conversation_ID");
      if (id) {
        this.controller.navTo("conversation", {
          id
        });
      }
    };
    onSearch = event => {
      const query = event.getSource().getValue().trim();
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        this.searchTerm = query;
        this.applyFilter();
      }, SEARCH_DEBOUNCE_MS);
    };

    /** Alterna entre as ativas e as arquivadas (flag só de UI; a lista é refiltrada pela binding). */
    onToggleArchived = () => {
      const ui = this.controller.getUiModel();
      ui.setProperty("/showArchived", !ui.getProperty("/showArchived"));
      this.applyFilter();
    };
    onOpenMenu = event => {
      this.controller.byId("userMenu").openBy(event.getSource());
    };
    onToggleTheme = () => {
      ThemeManager.setMode(ThemeManager.isDark() ? "light" : "dark");
    };
    onTheme = event => {
      ThemeManager.setMode(event.getSource().data("mode"));
    };

    /** Antes de sair, o aparelho deixa de receber push deste usuário (o servidor ainda aceita o token). */
    onLogout = async () => {
      await this.controller.getAppComponent().getPushService().detach().catch(() => undefined);
      await this.controller.getAuth().logout();
    };
    buildFilters() {
      const filters = [new Filter({
        path: "User_ID",
        operator: FilterOperator.EQ,
        value1: this.controller.getMyId()
      }), new Filter({
        path: "IsArchived",
        operator: FilterOperator.EQ,
        value1: this.isShowingArchived()
      })];
      if (this.searchTerm) {
        filters.push(new Filter({
          path: "Conversation/Name",
          operator: FilterOperator.Contains,
          value1: this.searchTerm,
          caseSensitive: false
        }));
      }
      return filters;
    }
    isShowingArchived() {
      return this.controller.getUiModel().getProperty("/showArchived") === true;
    }
    getList() {
      return this.controller.byId("conversationList");
    }
    getBinding() {
      return this.getList().getBinding("items");
    }
  }
  return ConversationsSection;
});
//# sourceMappingURL=ConversationsSection-dbg.js.map
