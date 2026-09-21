"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const payload = fs.readFileSync("./open/image/owo-1000.payload.txt", "ascii").trim();
const parts = payload.split("|");
assert.equal(parts[0], "FQI1");
const binary = Buffer.from(parts[1], "base64url");
assert.equal(crc32(binary), Number.parseInt(parts[2], 16) >>> 0);

const magic = binary.subarray(0, 4).toString("ascii");
const originalWidth = binary.readUInt16LE(4);
const originalHeight = binary.readUInt16LE(6);
const width = binary.readUInt16LE(8);
const height = binary.readUInt16LE(10);
const repeats = binary.readUInt16LE(12);
const leaves = binary.readUInt16LE(14);
assert.equal(magic, "FQI1");
assert.deepEqual([originalWidth, originalHeight, width, height, repeats, leaves], [1280, 720, 128, 72, 1000, 600]);

const nodes = 2 * leaves - 1;
const tokenLength = Math.ceil(nodes * 2 / 8);
const tokens = binary.subarray(16, 16 + tokenLength);
const colors = binary.subarray(16 + tokenLength);
const pixels = Buffer.alloc(width * height * 3);
let tokenIndex = 0;
let colorIndex = 0;

function tokenAt(index) {
  return (tokens[Math.floor(index / 4)] >>> ((index % 4) * 2)) & 3;
}

function fill(x, y, regionWidth, regionHeight, color) {
  for (let row = y; row < y + regionHeight; row += 1) {
    for (let column = x; column < x + regionWidth; column += 1) {
      const offset = (row * width + column) * 3;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
    }
  }
}

function decode(x, y, regionWidth, regionHeight) {
  const token = tokenAt(tokenIndex);
  tokenIndex += 1;
  if (token === 0) {
    fill(x, y, regionWidth, regionHeight, colors.subarray(colorIndex, colorIndex + 3));
    colorIndex += 3;
  } else if (token === 1) {
    const first = Math.floor(regionWidth / 2);
    decode(x, y, first, regionHeight);
    decode(x + first, y, regionWidth - first, regionHeight);
  } else if (token === 2) {
    const first = Math.floor(regionHeight / 2);
    decode(x, y, regionWidth, first);
    decode(x, y + first, regionWidth, regionHeight - first);
  } else {
    assert.fail("invalid tree token");
  }
}

decode(0, 0, width, height);
assert.equal(tokenIndex, nodes);
assert.equal(colorIndex, colors.length);
assert.equal(
  crypto.createHash("sha256").update(pixels).digest("hex"),
  "2b08166e8c476a7572909c8a9ce89bb480cd719ee9991b83b41929be29d2431d",
);
assert.equal(`owo-${String(1).padStart(4, "0")}.png`, "owo-0001.png");
assert.equal(`owo-${String(repeats).padStart(4, "0")}.png`, "owo-1000.png");
console.log("FQI1 deterministic decoder tests passed");
