sap.ui.define([], function () {
  "use strict";

  /**
   * No celular o sap.m.Menu renderiza itens com visible=false. Em vez de esconder, os itens que não valem
   * para o contexto atual saem do menu antes de abrir e voltam na ordem original quando passam a valer.
   */
  class MenuItemSync {
    constructor(menu) {
      this.menu = menu;
      this.items = menu.getItems();
    }
    sync(isVisible) {
      this.menu.removeAllItems();
      this.items.filter(isVisible).forEach(item => this.menu.addItem(item));
    }

    /** Itens fora do menu não são destruídos junto com ele. */
    destroy() {
      this.items.filter(item => item.getParent() !== this.menu).forEach(item => item.destroy());
    }
  }
  return MenuItemSync;
});
//# sourceMappingURL=MenuItemSync-dbg.js.map
