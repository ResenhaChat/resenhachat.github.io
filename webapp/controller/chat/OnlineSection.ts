import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import type HBox from "sap/m/HBox";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type { UserUpdatedPayload } from "../../service/RealtimeEvents";
import type Chat from "../Chat.controller";

/**
 * Faixa "Online agora": /People filtrado pelos ids online do modelo presence (sem eu mesmo).
 * A binding nasce suspensa; sem ninguém online ela fica suspensa e não consulta o servidor.
 */
export default class OnlineSection {

    private appliedKey?: string;

    private unsubscribe?: () => void;

    private readonly onPresenceChange = (): void => this.applyFilter();

    /** Só quem está online aparece na faixa: relê a binding se a pessoa que mudou estiver nela (suspensa não consulta). */
    private readonly onUserUpdated = (payload: UserUpdatedPayload): void => {
        const online = this.controller.getPresence().getProperty("/online") as Record<string, boolean> | undefined;
        const binding = this.getBinding();

        if (online?.[payload.UserId] && binding && !binding.isSuspended()) {
            binding.refresh();
        }
    };

    public constructor(private readonly controller: Chat) { }

    public init(): void {
        this.unsubscribe = this.controller.getPresence().onPresenceChange(this.onPresenceChange);
        this.controller.getRealtime().on("user.updated", this.onUserUpdated);
        this.applyFilter();
    }

    public destroy(): void {
        this.unsubscribe?.();
        this.controller.getRealtime().off("user.updated", this.onUserUpdated);
    }

    private applyFilter(): void {
        const binding = this.getBinding();
        const userIds = this.otherOnlineIds();
        const key = userIds.join(",");

        if (!binding) {
            // A binding só existe depois que a lista recebe o modelo OData; reaplica nesse momento.
            (this.controller.byId("onlineList") as HBox).attachEventOnce("modelContextChange", this.onPresenceChange);
            return;
        }

        if (key === this.appliedKey) {
            return;
        }

        this.appliedKey = key;

        if (!userIds.length) {
            if (!binding.isSuspended()) {
                binding.suspend();
            }
            return;
        }

        binding.filter(new Filter({
            filters: userIds.map((userId) => new Filter({ path: "ID", operator: FilterOperator.EQ, value1: userId })),
            and: false
        }));

        if (binding.isSuspended()) {
            binding.resume();
        }
    }

    private otherOnlineIds(): string[] {
        const myId = this.controller.getSessionModel().getProperty("/user/ID") as string;
        const online = this.controller.getPresence().getProperty("/online") as Record<string, boolean> | undefined;

        return Object.keys(online ?? {}).filter((userId) => userId !== myId);
    }

    private getBinding(): ODataListBinding | undefined {
        return (this.controller.byId("onlineList") as HBox).getBinding("items") as ODataListBinding | undefined;
    }

}
