(function (root) {
  "use strict";

  function payloadFromHash(hash) {
    if (!hash || hash[0] !== "#") return null;
    try {
      const payload = decodeURIComponent(hash.slice(1));
      return payload.startsWith("FX1|") ? payload : null;
    } catch (_) {
      return null;
    }
  }

  function payloadFromText(text) {
    if (typeof text !== "string") return null;
    const value = text.trim();
    if (value.startsWith("FX1|")) return value;
    try {
      return payloadFromHash(new URL(value).hash);
    } catch (_) {
      return null;
    }
  }

  function appUrl(payload) {
    return "felixfs://import#" + encodeURIComponent(payload);
  }

  function cameraUrl(payload, base) {
    return base.split("#")[0] + "#" + encodeURIComponent(payload);
  }

  const api = { payloadFromHash, payloadFromText, appUrl, cameraUrl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FelixLink = api;
})(typeof window === "undefined" ? globalThis : window);
