sap.ui.define(["sap/ui/model/Filter", "sap/ui/model/FilterOperator"], function (Filter, FilterOperator) {
  "use strict";

  /** Busca em /People por nome ou @usuário, sem eu mesmo e sem os ids excluídos (ex.: membros atuais). */
  function peopleFilter(term, myId, excludedIds = []) {
    const filters = [new Filter({
      path: "ID",
      operator: FilterOperator.NE,
      value1: myId
    }), ...excludedIds.map(id => new Filter({
      path: "ID",
      operator: FilterOperator.NE,
      value1: id
    }))];
    const query = term.trim();
    if (query) {
      filters.push(new Filter({
        filters: [new Filter({
          path: "DisplayName",
          operator: FilterOperator.Contains,
          value1: query,
          caseSensitive: false
        }), new Filter({
          path: "Username",
          operator: FilterOperator.Contains,
          value1: query,
          caseSensitive: false
        })],
        and: false
      }));
    }
    return new Filter({
      filters,
      and: true
    });
  }
  var __exports = {
    __esModule: true
  };
  __exports.peopleFilter = peopleFilter;
  return __exports;
});
//# sourceMappingURL=peopleFilter-dbg.js.map
