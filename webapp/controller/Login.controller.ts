import BaseController from "./BaseController";
import { ValueState } from "sap/ui/core/library";
import type Input from "sap/m/Input";
import type { Input$LiveChangeEvent } from "sap/m/Input";
import { AuthError } from "../auth/AuthService";

const USERNAME_PATTERN = /^[A-Za-z0-9_.]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;
const LOGIN_FIELDS = ["loginInput", "passwordInput"];
const REGISTER_FIELDS = ["displayNameInput", "usernameInput", "emailInput", "passwordInput"];

/**
 * @namespace apps.dflc.resenha.controller
 */
export default class Login extends BaseController {

    public onInit(): void {
        this.getRouter().getRoute("login")?.attachPatternMatched(this.onRouteMatched);
    }

    public onExit(): void {
        this.getRouter().getRoute("login")?.detachPatternMatched(this.onRouteMatched);
    }

    private onRouteMatched = (): void => {
        if (this.getAuth().hasSession() && this.getAppComponent().isSessionStarted()) {
            this.navTo("chat", {}, true);
            return;
        }

        this.getUiModel().setProperty("/login/error", "");
    };

    public onModeChange(): void {
        this.getUiModel().setProperty("/login/error", "");
        this.clearValueStates();
    }

    public onFieldChange(event: Input$LiveChangeEvent): void {
        event.getSource().setValueState(ValueState.None);
        this.getUiModel().setProperty("/login/error", "");
    }

    public onSubmit = async (): Promise<void> => {
        if (!this.validate()) {
            return;
        }

        const ui = this.getUiModel();
        const form = ui.getProperty("/login") as Record<string, string>;
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
                    await auth.login({ Login: form.login.trim(), Password: form.password });
                }
            });

            ui.setProperty("/login/password", "");
            this.navTo("chat", {}, true);
        } catch (error) {
            ui.setProperty("/login/password", "");
            ui.setProperty("/login/error", this.errorText(error));
        }
    };

    private errorText(error: unknown): string {
        if (error instanceof AuthError) {
            if (error.isNetworkFailure) {
                return this.getText("errorNetwork");
            }

            return error.message || this.getText("errorAuthFailed");
        }

        return this.getText("errorAuthFailed");
    }

    private validate(): boolean {
        const form = this.getUiModel().getProperty("/login") as Record<string, string>;
        const isRegister = form.mode === "register";
        const checks: Record<string, boolean> = {
            loginInput: !form.login.trim(),
            passwordInput: isRegister ? form.password.length < MIN_PASSWORD_LENGTH : !form.password,
            displayNameInput: !form.displayName.trim(),
            usernameInput: !USERNAME_PATTERN.test(form.username.trim()),
            emailInput: !EMAIL_PATTERN.test(form.email.trim())
        };
        const messages: Record<string, string> = {
            loginInput: "errorLoginRequired",
            passwordInput: isRegister ? "errorPasswordShort" : "errorPasswordRequired",
            displayNameInput: "errorDisplayNameRequired",
            usernameInput: "errorUsernameInvalid",
            emailInput: "errorEmailInvalid"
        };

        this.clearValueStates();

        const invalid = (isRegister ? REGISTER_FIELDS : LOGIN_FIELDS).filter((id) => checks[id]);

        invalid.forEach((id) => {
            const input = this.byId(id) as Input;

            input.setValueState(ValueState.Error);
            input.setValueStateText(this.getText(messages[id]));
        });

        (this.byId(invalid[0]) as Input | undefined)?.focus();

        return invalid.length === 0;
    }

    private clearValueStates(): void {
        [...REGISTER_FIELDS, "loginInput"].forEach((id) => (this.byId(id) as Input | undefined)?.setValueState(ValueState.None));
    }

}
