"use strict";

const assert = require("node:assert/strict");
const { payloadFromHash, payloadFromText, appUrl, cameraUrl } = require("./open/link.js");

const payload = "FX1|ABC+/=|123";
const hash = "#" + encodeURIComponent(payload);
assert.equal(payloadFromHash(hash), payload);
assert.equal(payloadFromHash("#not-felix"), null);
assert.equal(payloadFromHash("#%XX"), null);
assert.equal(payloadFromHash(""), null);
assert.equal(payloadFromHash(new URL("https://example.test/open" + hash).hash), payload);
assert.equal(payloadFromHash(new URL(appUrl(payload)).hash), payload);
assert.equal(payloadFromText(payload), payload);
assert.equal(payloadFromText("  " + payload + "\n"), payload);
assert.equal(payloadFromText("https://example.test/open/" + hash), payload);
assert.equal(payloadFromText("not a payload"), null);
assert.equal(cameraUrl(payload, "https://example.test/open/#old"), "https://example.test/open/#" + encodeURIComponent(payload));
console.log("Felix link tests passed");
