sap.ui.define(["sap/ui/model/Filter", "sap/ui/model/FilterOperator"], function (Filter, FilterOperator) {
  "use strict";

  /**
   * Faixa "Online agora": /People filtrado pelos ids online do modelo presence (sem eu mesmo).
   * A binding nasce suspensa; sem ninguém online ela fica suspensa e não consulta o servidor.
   */
  class OnlineSection {
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
    applyFilter() {
      const binding = this.getBinding();
      const userIds = this.otherOnlineIds();
      const key = userIds.join(",");
      if (!binding) {
        // A binding só existe depois que a lista recebe o modelo OData; reaplica nesse momento.
        this.controller.byId("onlineList").attachEventOnce("modelContextChange", this.onPresenceChange);
        return;
      }
      if (key === this.appliedKey) {
        return;
      }
      this.appliedKey = key;
      if (!userIds.length) {
        binding.suspend();
        return;
      }
      binding.filter(new Filter({
        filters: userIds.map(userId => new Filter({
          path: "ID",
          operator: FilterOperator.EQ,
          value1: userId
        })),
        and: false
      }));
      if (binding.isSuspended()) {
        binding.resume();
      }
    }
    otherOnlineIds() {
      const myId = this.controller.getSessionModel().getProperty("/user/ID");
      const online = this.controller.getPresence().getProperty("/online");
      return Object.keys(online ?? {}).filter(userId => userId !== myId);
    }
    getBinding() {
      return this.controller.byId("onlineList").getBinding("items");
    }
  }
  return OnlineSection;
});
//# sourceMappingURL=OnlineSection-dbg.js.map
