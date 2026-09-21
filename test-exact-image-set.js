"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const payload = fs.readFileSync(path.join(__dirname, "open/image/goat-1000.fqx"), "ascii").trim();
const [prefix, body, checksum] = payload.split("|");
assert.equal(prefix, "FQX1");
const binary = Buffer.from(body, "base64url");
assert.equal(binary.subarray(0, 4).toString("ascii"), "FQX1");
assert.equal(binary.readUInt16LE(4), 1000);
const nameLength = binary.readUInt16LE(6);
const fileLength = Number(binary.readBigUInt64LE(8));
assert.equal(binary.subarray(16, 16 + nameLength).toString("utf8"), "goat.png");
const exact = binary.subarray(16 + nameLength);
assert.equal(exact.length, fileLength);
assert.equal(fileLength, 2_281_094);
assert.equal(crypto.createHash("sha256").update(exact).digest("hex"), "a77cd4724e3489770d771aa138649537c893facaab08d7cc5d05624c9fd7605b");
assert.equal(checksum, crc32(binary).toString(16).padStart(8, "0"));

if (process.env.FELIX_EXACT_SOURCE) {
  const original = fs.readFileSync(process.env.FELIX_EXACT_SOURCE);
  assert.deepEqual(exact, original);
}
console.log(`FQX1 exact: ${fileLength} bytes x 1000, SHA-256 ${crypto.createHash("sha256").update(exact).digest("hex")}`);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
