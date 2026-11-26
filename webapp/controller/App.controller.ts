import BaseController from "./BaseController";

/**
 * @namespace apps.dflc.resenha.controller
 */
export default class App extends BaseController {

    public onInit(): void {
        this.getView()?.addStyleClass("rsApp");
    }

}
