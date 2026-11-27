import type Menu from "sap/m/Menu";
import type MenuItem from "sap/m/MenuItem";

/**
 * No celular o sap.m.Menu renderiza itens com visible=false. Em vez de esconder, os itens que não valem
 * para o contexto atual saem do menu antes de abrir e voltam na ordem original quando passam a valer.
 */
export default class MenuItemSync {

    private readonly items: MenuItem[];

    public constructor(private readonly menu: Menu) {
        this.items = menu.getItems() as MenuItem[];
    }

    public sync(isVisible: (item: MenuItem) => boolean): void {
        this.menu.removeAllItems();
        this.items.filter(isVisible).forEach((item) => this.menu.addItem(item));
    }

    /** Itens fora do menu não são destruídos junto com ele. */
    public destroy(): void {
        this.items.filter((item) => item.getParent() !== this.menu).forEach((item) => item.destroy());
    }

}
