import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Fragment from "sap/ui/core/Fragment";
import JSONModel from "sap/ui/model/json/JSONModel";
import type Control from "sap/ui/core/Control";
import type Dialog from "sap/m/Dialog";
import type Router from "sap/ui/core/routing/Router";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import type ResourceModel from "sap/ui/model/resource/ResourceModel";
import type ResourceBundle from "sap/base/i18n/ResourceBundle";
import formatter from "../model/formatter";
import type Component from "../Component";
import type AuthService from "../auth/AuthService";
import type ChatService from "../service/ChatService";
import type RealtimeService from "../service/RealtimeService";
import type PresenceModel from "../model/PresenceModel";
import { errorDetail, isUnauthorized } from "../util/errors";

/**
 * @namespace apps.dflc.resenha.controller
 */
export default abstract class BaseController extends Controller {

    public readonly formatter = formatter;

    protected getRouter(): Router {
        return UIComponent.getRouterFor(this);
    }

    public getAppComponent(): Component {
        return this.getOwnerComponent() as unknown as Component;
    }

    public getAuth(): AuthService {
        return this.getAppComponent().getAuth();
    }

    public getChatService(): ChatService {
        return this.getAppComponent().getChatService();
    }

    public getRealtime(): RealtimeService {
        return this.getAppComponent().getRealtime();
    }

    public getPresence(): PresenceModel {
        return this.getAppComponent().getPresence();
    }

    public getODataModel(): ODataModel {
        return this.getAppComponent().getModel() as ODataModel;
    }

    public getUiModel(): JSONModel {
        return this.getAppComponent().getModel("ui") as JSONModel;
    }

    public getSessionModel(): JSONModel {
        return this.getAppComponent().getModel("session") as JSONModel;
    }

    public navTo(route: string, parameters?: object, replace?: boolean): void {
        this.getRouter().navTo(route, parameters, replace);
    }

    public getText(key: string, parameters?: unknown[]): string {
        const bundle = (this.getAppComponent().getModel("i18n") as ResourceModel).getResourceBundle() as ResourceBundle;

        return bundle.getText(key, parameters as string[]) ?? key;
    }

    /** Controle de um fragmento carregado com id = id da view (dialogs e painéis). */
    public getFragmentControl<Type extends Control>(id: string): Type {
        return Fragment.byId(this.getView()?.getId() ?? "", id) as Type;
    }

    /** Carrega um diálogo de fragmento; o estado de UI do diálogo fica no JSONModel "compose". */
    public async loadDialog(fragmentName: string, controller: object, state: object): Promise<Dialog> {
        const view = this.getView();
        const dialog = await Fragment.load({
            id: view?.getId(),
            name: `apps.dflc.resenha.view.fragments.${fragmentName}`,
            controller
        }) as Dialog;

        dialog.setModel(new JSONModel(state), "compose");
        view?.addDependent(dialog);

        return dialog;
    }

    public getMyId(): string {
        return this.getSessionModel().getProperty("/user/ID") as string;
    }

    public getOpenConversationId(): string {
        return this.getUiModel().getProperty("/conversationId") as string;
    }

    public showToast(key: string, parameters?: unknown[]): void {
        MessageToast.show(this.getText(key, parameters));
    }

    public confirm(key: string, parameters?: unknown[]): Promise<boolean> {
        return new Promise((resolve) => {
            MessageBox.confirm(this.getText(key, parameters), {
                onClose: (action: string | null) => resolve(action === MessageBox.Action.OK)
            });
        });
    }

    /** 401 renova o token uma vez (se renovar, avisa para repetir); os demais erros viram MessageBox. */
    public async handleError(error: unknown, key: string): Promise<void> {
        if (isUnauthorized(error)) {
            if (await this.getAuth().handleUnauthorized()) {
                this.showToast("sessionRenewed");
            }

            return;
        }

        const detail = errorDetail(error);
        const message = this.getText(key);

        MessageBox.error(detail ? `${message}\n\n${detail}` : message);
    }

    public async runBusy<Result>(action: () => Promise<Result>): Promise<Result> {
        const view = this.getView();

        view?.setBusy(true);

        try {
            return await action();
        } finally {
            view?.setBusy(false);
        }
    }

}
