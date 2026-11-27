sap.ui.define([], function () {
  "use strict";

  /** Baixa pela própria URL (Content com download=1 força attachment). rel noopener para links externos. */
  function downloadFile(url, fileName) {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    link.click();
  }
  var __exports = {
    __esModule: true
  };
  __exports.downloadFile = downloadFile;
  return __exports;
});
//# sourceMappingURL=download-dbg.js.map
