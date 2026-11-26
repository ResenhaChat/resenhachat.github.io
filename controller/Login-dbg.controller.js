sap.ui.define(["./BaseController", "sap/ui/core/library", "../auth/AuthService"], function (__BaseController, sap_ui_core_library, ___auth_AuthService) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const BaseController = _interopRequireDefault(__BaseController);
  const ValueState = sap_ui_core_library["ValueState"];
  const AuthError = ___auth_AuthService["AuthError"];
  const USERNAME_PATTERN = /^[A-Za-z0-9_.]{3,30}$/;
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MIN_PASSWORD_LENGTH = 6;
  const LOGIN_FIELDS = ["loginInput", "passwordInput"];
  const REGISTER_FIELDS = ["displayNameInput", "usernameInput", "emailInput", "passwordInput"];

  /**
   * @namespace apps.dflc.resenha.controller
   */
  const Login = BaseController.extend("apps.dflc.resenha.controller.Login", {
    constructor: function constructor() {
      BaseController.prototype.constructor.apply(this, arguments);
      this.onRouteMatched = () => {
        if (this.getAuth().hasSession() && this.getAppComponent().isSessionStarted()) {
          this.navTo("chat", {}, true);
          return;
        }
        this.getUiModel().setProperty("/login/error", "");
      };
      this.onSubmit = async () => {
        if (!this.validate()) {
          return;
        }
        const ui = this.getUiModel();
        const form = ui.getProperty("/login");
        const auth = this.getAuth();
        try {
          await this.runBusy(async () => {
            if (form.mode === "register") {
              await auth.register({
                Email: form.email.trim(),
                Password: form.password,
                DisplayName: form.displayName.trim(),
                Username: form.username.trim()
              });
            } else {
              await auth.login({
                Login: form.login.trim(),
                Password: form.password
              });
            }
          });
          ui.setProperty("/login/password", "");
          this.navTo("chat", {}, true);
        } catch (error) {
          ui.setProperty("/login/password", "");
          ui.setProperty("/login/error", this.errorText(error));
        }
      };
    },
    onInit: function _onInit() {
      this.getRouter().getRoute("login")?.attachPatternMatched(this.onRouteMatched);
    },
    onExit: function _onExit() {
      this.getRouter().getRoute("login")?.detachPatternMatched(this.onRouteMatched);
    },
    onModeChange: function _onModeChange(event) {
      this.getUiModel().setProperty("/login/mode", event.getSource().data("mode"));
      this.getUiModel().setProperty("/login/error", "");
      this.clearValueStates();
    },
    onFieldChange: function _onFieldChange(event) {
      event.getSource().setValueState(ValueState.None);
      this.getUiModel().setProperty("/login/error", "");
    },
    errorText: function _errorText(error) {
      if (error instanceof AuthError) {
        if (error.isNetworkFailure) {
          return this.getText("errorNetwork");
        }
        return error.message || this.getText("errorAuthFailed");
      }
      return this.getText("errorAuthFailed");
    },
    validate: function _validate() {
      const form = this.getUiModel().getProperty("/login");
      const isRegister = form.mode === "register";
      const checks = {
        loginInput: !form.login.trim(),
        passwordInput: isRegister ? form.password.length < MIN_PASSWORD_LENGTH : !form.password,
        displayNameInput: !form.displayName.trim(),
        usernameInput: !USERNAME_PATTERN.test(form.username.trim()),
        emailInput: !EMAIL_PATTERN.test(form.email.trim())
      };
      const messages = {
        loginInput: "errorLoginRequired",
        passwordInput: isRegister ? "errorPasswordShort" : "errorPasswordRequired",
        displayNameInput: "errorDisplayNameRequired",
        usernameInput: "errorUsernameInvalid",
        emailInput: "errorEmailInvalid"
      };
      this.clearValueStates();
      const invalid = (isRegister ? REGISTER_FIELDS : LOGIN_FIELDS).filter(id => checks[id]);
      invalid.forEach(id => {
        const input = this.byId(id);
        input.setValueState(ValueState.Error);
        input.setValueStateText(this.getText(messages[id]));
      });
      this.byId(invalid[0])?.focus();
      return invalid.length === 0;
    },
    clearValueStates: function _clearValueStates() {
      [...REGISTER_FIELDS, "loginInput"].forEach(id => this.byId(id)?.setValueState(ValueState.None));
    }
  });
  return Login;
});
//# sourceMappingURL=Login-dbg.controller.js.map
