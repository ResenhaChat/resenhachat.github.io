import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";

/** Busca em /People por nome ou @usuário, sem eu mesmo e sem os ids excluídos (ex.: membros atuais). */
export function peopleFilter(term: string, myId: string, excludedIds: string[] = []): Filter {
    const filters = [
        new Filter({ path: "ID", operator: FilterOperator.NE, value1: myId }),
        ...excludedIds.map((id) => new Filter({ path: "ID", operator: FilterOperator.NE, value1: id }))
    ];
    const query = term.trim();

    if (query) {
        filters.push(new Filter({
            filters: [
                new Filter({ path: "DisplayName", operator: FilterOperator.Contains, value1: query, caseSensitive: false }),
                new Filter({ path: "Username", operator: FilterOperator.Contains, value1: query, caseSensitive: false })
            ],
            and: false
        }));
    }

    return new Filter({ filters, and: true });
}
