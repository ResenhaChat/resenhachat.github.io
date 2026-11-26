import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import type HBox from "sap/m/HBox";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type Chat from "../Chat.controller";

/** Faixa "Online agora": /People filtrado pelos ids online do modelo presence (sem eu mesmo). */
export default class OnlineSection {

    private appliedKey = "";

    private unsubscribe?: () => void;

    private readonly onPresenceChange = (): void => this.applyFilter();

    public constructor(private readonly controller: Chat) { }

    public init(): void {
        this.unsubscribe = this.controller.getPresence().onPresenceChange(this.onPresenceChange);
        this.applyFilter();
    }

    public destroy(): void {
        this.unsubscribe?.();
    }

    /** Sem online ninguém a filtrar: mantém o filtro atual (a faixa fica escondida pela view). */
    private applyFilter(): void {
        const myId = this.controller.getSessionModel().getProperty("/user/ID") as string;
        const online = this.controller.getPresence().getProperty("/online") as Record<string, boolean> | undefined;
        const userIds = Object.keys(online ?? {}).filter((userId) => userId !== myId);
        const key = userIds.join(",");

        if (!userIds.length || key === this.appliedKey) {
            return;
        }

        this.appliedKey = key;
        this.getBinding()?.filter(new Filter({
            filters: userIds.map((userId) => new Filter({ path: "ID", operator: FilterOperator.EQ, value1: userId })),
            and: false
        }));
    }

    private getBinding(): ODataListBinding | undefined {
        return (this.controller.byId("onlineList") as HBox).getBinding("items") as ODataListBinding | undefined;
    }

}
