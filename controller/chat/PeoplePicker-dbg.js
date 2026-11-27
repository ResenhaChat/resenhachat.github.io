sap.ui.define(["../../util/peopleFilter"], function (____util_peopleFilter) {
  "use strict";

  const peopleFilter = ____util_peopleFilter["peopleFilter"];
  const SEARCH_DEBOUNCE_MS = 250;
  /**
   * Busca e seleção de pessoas (/People) usadas pelos diálogos.
   * O estado (termo e pessoas escolhidas) fica no JSONModel "compose" do próprio diálogo, em /term e /selected.
   */
  class PeoplePicker {
    constructor(controller, list, state, excludedIds = () => []) {
      this.controller = controller;
      this.list = list;
      this.state = state;
      this.excludedIds = excludedIds;
    }
    destroy() {
      window.clearTimeout(this.searchTimer);
    }

    /** Limpa busca e seleção e recarrega a lista. */
    reset() {
      this.state.setProperty("/term", "");
      this.state.setProperty("/selected", []);
      this.apply();
    }

    /** Refiltra /People pelo termo atual; a binding nasce suspensa e é liberada aqui. */
    apply() {
      const binding = this.list.getBinding("items");
      if (!binding) {
        return;
      }
      binding.filter(peopleFilter(this.term(), this.controller.getMyId(), this.excludedIds()));
      if (binding.isSuspended()) {
        binding.resume();
      }
    }
    onSearch = event => {
      const value = event.getSource().getValue();
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        this.state.setProperty("/term", value);
        this.apply();
      }, SEARCH_DEBOUNCE_MS);
    };

    /** Seleção múltipla da lista: o item marcado ou desmarcado entra ou sai de /selected. */
    toggleItem(item) {
      const person = item.getBindingContext()?.getObject();
      if (person) {
        this.toggle(person);
      }
    }

    /** Adiciona ou remove a pessoa da seleção (também usado pelos chips do Tokenizer). */
    toggle(person) {
      const selected = this.selected();
      const isPicked = selected.some(picked => picked.ID === person.ID);
      this.state.setProperty("/selected", isPicked ? selected.filter(picked => picked.ID !== person.ID) : [...selected, person]);
    }
    selected() {
      return this.state.getProperty("/selected") ?? [];
    }
    selectedIds() {
      return this.selected().map(person => person.ID);
    }
    term() {
      return this.state.getProperty("/term") ?? "";
    }
  }
  return PeoplePicker;
});
//# sourceMappingURL=PeoplePicker-dbg.js.map
