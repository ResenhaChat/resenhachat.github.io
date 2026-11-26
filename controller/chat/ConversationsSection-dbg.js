sap.ui.define(["sap/ui/model/Filter", "sap/ui/model/FilterOperator", "../../util/ThemeManager", "../../util/pwa"], function (Filter, FilterOperator, __ThemeManager, ____util_pwa) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const ThemeManager = _interopRequireDefault(__ThemeManager);
  const showUnreadCount = ____util_pwa["showUnreadCount"];
  const SEARCH_DEBOUNCE_MS = 250;
  const REFRESH_DEBOUNCE_MS = 300;

  /** Lista de conversas (/Conversations), busca por nome, menu do usuário e tema. */
  class ConversationsSection {
    onRealtimeChange = () => this.refresh();

    /** Só a leitura feita por mim muda meu contador de não lidas. */
    onConversationRead = payload => {
      if (payload.UserId === this.controller.getSessionModel().getProperty("/user/ID")) {
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
      realtime.on("reconnected", this.onRealtimeChange);
    }
    destroy() {
      const realtime = this.controller.getRealtime();
      realtime.off("message.created", this.onRealtimeChange);
      realtime.off("conversation.read", this.onConversationRead);
      realtime.off("reconnected", this.onRealtimeChange);
      window.clearTimeout(this.searchTimer);
      window.clearTimeout(this.refreshTimer);
    }

    /** Agrupa rajadas de eventos em um único reload da lista. */
    refresh() {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => this.getBinding()?.refresh(), REFRESH_DEBOUNCE_MS);
    }

    /** Soma as não lidas das conversas já carregadas (sem request extra) para o título da aba e o selo. */
    updateUnread() {
      const contexts = this.getBinding()?.getAllCurrentContexts() ?? [];
      const total = contexts.reduce((sum, context) => sum + (context.getProperty("UnreadCount") ?? 0), 0);
      showUnreadCount(total, this.controller.getText("appName"));
    }

    /** Destaca na lista a conversa aberta (ou limpa a seleção quando não há). */
    syncSelection() {
      const list = this.getList();
      const openId = this.controller.getUiModel().getProperty("/conversationId");
      const item = list.getItems().find(candidate => candidate.getBindingContext()?.getProperty("ID") === openId);
      if (item) {
        list.setSelectedItem(item, true);
      } else {
        list.removeSelections(true);
      }
    }
    onUpdateFinished = () => this.syncSelection();
    onSelect = event => {
      const id = event.getParameter("listItem")?.getBindingContext()?.getProperty("ID");
      if (id) {
        this.controller.navTo("conversation", {
          id
        });
      }
    };
    onSearch = event => {
      const query = event.getSource().getValue().trim();
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => this.applyFilter(query), SEARCH_DEBOUNCE_MS);
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
    applyFilter(query) {
      const filters = query ? [new Filter({
        path: "Name",
        operator: FilterOperator.Contains,
        value1: query,
        caseSensitive: false
      })] : [];
      this.getBinding()?.filter(filters);
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
