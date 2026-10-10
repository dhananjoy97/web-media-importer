/* Minimal CSInterface shim for CEP panels. */
(function () {
  "use strict";

  window.SystemPath = {
    EXTENSION: "extension",
    USER_DATA: "userData",
  };

  function CSInterface() {}

  CSInterface.prototype.evalScript = function (script, callback) {
    if (!window.__adobe_cep__) {
      if (callback) callback("EvalScript error. This panel must run inside Adobe Premiere Pro.");
      return;
    }
    window.__adobe_cep__.evalScript(script, callback || function () {});
  };

  CSInterface.prototype.getSystemPath = function (pathType) {
    if (!window.__adobe_cep__) return "";
    return window.__adobe_cep__.getSystemPath(pathType);
  };

  window.CSInterface = CSInterface;
})();
