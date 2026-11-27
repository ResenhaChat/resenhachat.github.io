sap.ui.define(["sap/ui/core/mvc/Controller", "sap/ui/core/UIComponent", "sap/m/MessageBox", "sap/m/MessageToast", "sap/ui/core/Fragment", "sap/ui/model/json/JSONModel", "../model/formatter", "../util/errors"], function (Controller, UIComponent, MessageBox, MessageToast, Fragment, JSONModel, __formatter, ___util_errors) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const formatter = _interopRequireDefault(__formatter);
  const errorDetail = ___util_errors["errorDetail"];
  const isUnauthorized = ___util_errors["isUnauthorized"];
  /**
   * @namespace apps.dflc.resenha.controller
   */
  const BaseController = Controller.extend("apps.dflc.resenha.controller.BaseController", {
    constructor: function constructor() {
      Controller.prototype.constructor.apply(this, arguments);
      this.formatter = formatter;
    },
    getRouter: function _getRouter() {
      return UIComponent.getRouterFor(this);
    },
    getAppComponent: function _getAppComponent() {
      return this.getOwnerComponent();
    },
    getAuth: function _getAuth() {
      return this.getAppComponent().getAuth();
    },
    getChatService: function _getChatService() {
      return this.getAppComponent().getChatService();
    },
    getRealtime: function _getRealtime() {
      return this.getAppComponent().getRealtime();
    },
    getPresence: function _getPresence() {
      return this.getAppComponent().getPresence();
    },
    getODataModel: function _getODataModel() {
      return this.getAppComponent().getModel();
    },
    getUiModel: function _getUiModel() {
      return this.getAppComponent().getModel("ui");
    },
    getSessionModel: function _getSessionModel() {
      return this.getAppComponent().getModel("session");
    },
    navTo: function _navTo(route, parameters, replace) {
      this.getRouter().navTo(route, parameters, replace);
    },
    getText: function _getText(key, parameters) {
      const bundle = this.getAppComponent().getModel("i18n").getResourceBundle();
      return bundle.getText(key, parameters) ?? key;
    },
    /** Controle de um fragmento carregado com id = id da view (dialogs e painéis). */getFragmentControl: function _getFragmentControl(id) {
      return Fragment.byId(this.getView()?.getId() ?? "", id);
    },
    /** Carrega um diálogo de fragmento; o estado de UI do diálogo fica no JSONModel "compose". */loadDialog: async function _loadDialog(fragmentName, controller, state) {
      const view = this.getView();
      const dialog = await Fragment.load({
        id: view?.getId(),
        name: `apps.dflc.resenha.view.fragments.${fragmentName}`,
        controller
      });
      dialog.setModel(new JSONModel(state), "compose");
      view?.addDependent(dialog);
      return dialog;
    },
    getMyId: function _getMyId() {
      return this.getSessionModel().getProperty("/user/ID");
    },
    getOpenConversationId: function _getOpenConversationId() {
      return this.getUiModel().getProperty("/conversationId");
    },
    showToast: function _showToast(key, parameters) {
      MessageToast.show(this.getText(key, parameters));
    },
    confirm: function _confirm(key, parameters) {
      return new Promise(resolve => {
        MessageBox.confirm(this.getText(key, parameters), {
          onClose: action => resolve(action === MessageBox.Action.OK)
        });
      });
    },
    /** 401 renova o token uma vez (se renovar, avisa para repetir); os demais erros viram MessageBox. */handleError: async function _handleError(error, key) {
      if (isUnauthorized(error)) {
        if (await this.getAuth().handleUnauthorized()) {
          this.showToast("sessionRenewed");
        }
        return;
      }
      const detail = errorDetail(error);
      const message = this.getText(key);
      MessageBox.error(detail ? `${message}\n\n${detail}` : message);
    },
    runBusy: async function _runBusy(action) {
      const view = this.getView();
      view?.setBusy(true);
      try {
        return await action();
      } finally {
        view?.setBusy(false);
      }
    }
  });
  return BaseController;
});
//# sourceMappingURL=BaseController-dbg.js.map
