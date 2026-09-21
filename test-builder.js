"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { compileBytes, encodeVolume } = require("./open/felix-builder-core.js");

assert.throws(() => encodeVolume([]), /at least one file/);

const first = encodeVolume([
  { name: "hello.txt", bytes: Buffer.from("Hello from FelixQR.\n") },
  { name: "data.bin", bytes: Uint8Array.from([0, 1, 127, 128, 255]) },
]);
const second = encodeVolume([
  { name: "hello.txt", bytes: Buffer.from("Hello from FelixQR.\n") },
  { name: "data.bin", bytes: Uint8Array.from([0, 1, 127, 128, 255]) },
]);

assert.match(first.payload, /^FX1\|[A-Za-z0-9_-]+\|[0-9a-f]{8}$/);
assert.equal(first.payload, second.payload);
assert.deepEqual(first.fileNames, ["hello.txt", "data.bin"]);

const repeated = Buffer.alloc(4096);
for (let index = 0; index < repeated.length; index += 1) repeated[index] = "FELIX".charCodeAt(index % 5);
repeated[777] = 33;
const repeatedModel = compileBytes(repeated);
assert.equal(repeatedModel.kind, "procedural");
assert.equal(repeatedModel.label, "5-byte repeating geometry");
assert.equal(repeatedModel.corrections.length, 1);

const linear = Uint8Array.from({ length: 4096 }, (_, index) => (17 + 29 * index) & 255);
const linearModel = compileBytes(linear);
assert.equal(linearModel.kind, "procedural");
assert.equal(linearModel.label, "linear geometry");

const orbitPattern = [9, 41, 7, 203, 88, 14, 160];
const orbit = Uint8Array.from({ length: 4096 }, (_, index) => (
  orbitPattern[index % orbitPattern.length]
  + Math.floor(index / orbitPattern.length) * 13
) & 255);
orbit[2001] ^= 73;
const orbitModel = compileBytes(orbit);
assert.equal(orbitModel.kind, "procedural");
assert.equal(orbitModel.label, "7-phase orbit geometry");
assert.equal(orbitModel.corrections.length, 1);

let translatedState = 11;
const translatedBase = Uint8Array.from({ length: 256 }, () => {
  translatedState = (translatedState * 1664525 + 1013904223) >>> 0;
  return translatedState >>> 24;
});
const translatedCells = Uint8Array.from({ length: 256 * 64 }, (_, index) => (
  translatedBase[index % 256] + Math.floor(index / 256) * 17
) & 255);
const translatedModel = compileBytes(translatedCells);
assert.equal(translatedModel.kind, "procedural");
assert.equal(translatedModel.label, "256-phase orbit geometry");

const quadratic = Uint8Array.from(
  { length: 4096 },
  (_, index) => (7 + 5 * index + 3 * index * index) & 255,
);
quadratic[3011] ^= 19;
const quadraticModel = compileBytes(quadratic);
assert.equal(quadraticModel.kind, "procedural");
assert.equal(quadraticModel.label, "quadratic geometry");
assert.equal(quadraticModel.corrections.length, 1);

const xorRamp = Uint8Array.from(
  { length: 4096 },
  (_, index) => 0xa5 ^ ((37 * index) & 255),
);
xorRamp[2222] ^= 0x80;
const xorModel = compileBytes(xorRamp);
assert.equal(xorModel.kind, "procedural");
assert.equal(xorModel.label, "XOR-ramp geometry");
assert.equal(xorModel.corrections.length, 1);

let state = 1;
const noise = Uint8Array.from({ length: 4096 }, () => {
  state = (state * 1664525 + 1013904223) >>> 0;
  return state >>> 24;
});
assert.equal(compileBytes(noise).kind, "literal");

const procedural = encodeVolume([{ name: "pattern.bin", bytes: repeated }]);
assert.equal(procedural.proceduralFiles, 1);
assert.ok(procedural.savedBytes > 4000);
assert.ok(procedural.payload.length < 500);

const tiled = Buffer.alloc(256 * 16);
for (let cell = 0; cell < 16; cell += 1) {
  for (let position = 0; position < 256; position += 1) {
    tiled[cell * 256 + position] = cell % 2 === 0
      ? (cell * 11) & 255
      : (17 + cell * 3 + position * (cell + 1)) & 255;
  }
}
tiled[5 * 256 + 17] ^= 91;
tiled[12 * 256 + 200] ^= 33;
const tiledModel = compileBytes(tiled);
assert.equal(tiledModel.kind, "grid");
assert.equal(tiledModel.label, "16-cell geometric lattice");

const woven = Buffer.alloc(256 * 64);
state = 7;
for (let cell = 0; cell < 64; cell += 1) {
  state = (state * 1664525 + 1013904223) >>> 0;
  woven.fill(state & 1 ? 0x2a : 0xd7, cell * 256, (cell + 1) * 256);
}
const wovenModel = compileBytes(woven);
assert.equal(wovenModel.kind, "grid");
assert.equal(wovenModel.groups.length, 2);

if (process.argv[2]) fs.writeFileSync(process.argv[2], first.payload + "\n");
console.log("Felix builder tests passed");
