sap.ui.define([], function () {
  "use strict";

  function isUnauthorized(error) {
    return error?.status === 401;
  }
  function errorDetail(error) {
    return error?.message ?? "";
  }
  var __exports = {
    __esModule: true
  };
  __exports.isUnauthorized = isUnauthorized;
  __exports.errorDetail = errorDetail;
  return __exports;
});
//# sourceMappingURL=errors-dbg.js.map
