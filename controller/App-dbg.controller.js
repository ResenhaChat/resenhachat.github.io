sap.ui.define(["./BaseController"], function (__BaseController) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const BaseController = _interopRequireDefault(__BaseController);
  /**
   * @namespace apps.dflc.resenha.controller
   */
  const App = BaseController.extend("apps.dflc.resenha.controller.App", {
    onInit: function _onInit() {
      this.getView()?.addStyleClass("rsApp");
    }
  });
  return App;
});
//# sourceMappingURL=App-dbg.controller.js.map
