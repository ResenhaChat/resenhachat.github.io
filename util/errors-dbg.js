sap.ui.define([], function () {
  "use strict";

  function isUnauthorized(error) {
    return error?.status === 401;
  }
  function isNotFound(error) {
    return error?.status === 404;
  }

  /** Cancelamento de envio (AbortController): não é erro para o usuário. */
  function isAbortError(error) {
    return error?.name === "AbortError";
  }
  function errorDetail(error) {
    return error?.message ?? "";
  }
  var __exports = {
    __esModule: true
  };
  __exports.isUnauthorized = isUnauthorized;
  __exports.isNotFound = isNotFound;
  __exports.isAbortError = isAbortError;
  __exports.errorDetail = errorDetail;
  return __exports;
});
//# sourceMappingURL=errors-dbg.js.map
