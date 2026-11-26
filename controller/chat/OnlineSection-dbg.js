sap.ui.define(["sap/ui/model/Filter", "sap/ui/model/FilterOperator"], function (Filter, FilterOperator) {
  "use strict";

  /** Faixa "Online agora": /People filtrado pelos ids online do modelo presence (sem eu mesmo). */
  class OnlineSection {
    appliedKey = "";
    onPresenceChange = () => this.applyFilter();
    constructor(controller) {
      this.controller = controller;
    }
    init() {
      this.unsubscribe = this.controller.getPresence().onPresenceChange(this.onPresenceChange);
      this.applyFilter();
    }
    destroy() {
      this.unsubscribe?.();
    }

    /** Sem online ninguém a filtrar: mantém o filtro atual (a faixa fica escondida pela view). */
    applyFilter() {
      const myId = this.controller.getSessionModel().getProperty("/user/ID");
      const online = this.controller.getPresence().getProperty("/online");
      const userIds = Object.keys(online ?? {}).filter(userId => userId !== myId);
      const key = userIds.join(",");
      if (!userIds.length || key === this.appliedKey) {
        return;
      }
      this.appliedKey = key;
      this.getBinding()?.filter(new Filter({
        filters: userIds.map(userId => new Filter({
          path: "ID",
          operator: FilterOperator.EQ,
          value1: userId
        })),
        and: false
      }));
    }
    getBinding() {
      return this.controller.byId("onlineList").getBinding("items");
    }
  }
  return OnlineSection;
});
//# sourceMappingURL=OnlineSection-dbg.js.map
