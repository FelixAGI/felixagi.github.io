(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FelixBuilder = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";

  class Writer {
    constructor() {
      this.values = [];
    }

    byte(value) {
      this.values.push(value & 255);
    }

    bytes(values) {
      for (const value of values) this.byte(value);
    }

    var(value) {
      let remaining = value;
      while (remaining >= 128) {
        this.byte((remaining % 128) | 128);
        remaining = Math.floor(remaining / 128);
      }
      this.byte(remaining);
    }

    big(value) {
      let remaining = BigInt(value);
      const bytes = [];
      while (remaining > 0n) {
        const word = Number(remaining & 0xffffffffn);
        bytes.push(word & 255, (word >>> 8) & 255, (word >>> 16) & 255, word >>> 24);
        remaining >>= 32n;
      }
      this.var(bytes.length);
      this.bytes(bytes);
    }

    word(values) {
      this.var(256);
      this.var(values.length);
      for (const value of values) this.var(value);
    }

    finish() {
      return Uint8Array.from(this.values);
    }
  }

  class ProgramBuilder {
    constructor() {
      this.instructions = [];
    }

    add(tag, ...operands) {
      const index = this.instructions.length;
      this.instructions.push({ tag, operands });
      return index;
    }
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const value of bytes) {
      crc ^= value;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function base64url(bytes) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let output = "";
    for (let index = 0; index < bytes.length; index += 3) {
      const length = Math.min(3, bytes.length - index);
      const value = (bytes[index] << 16)
        | ((bytes[index + 1] || 0) << 8)
        | (bytes[index + 2] || 0);
      output += alphabet[(value >>> 18) & 63];
      output += alphabet[(value >>> 12) & 63];
      if (length > 1) output += alphabet[(value >>> 6) & 63];
      if (length > 2) output += alphabet[value & 63];
    }
    return output;
  }

  function safeNames(files) {
    const used = new Set();
    return files.map((file, index) => {
      const original = String(file.name || `file-${index + 1}`);
      const cleaned = original
        .replace(/[\\/|\u0000-\u001f\u007f]/g, "_")
        .replace(/^\.{1,2}$/, "file") || `file-${index + 1}`;
      let name = cleaned;
      let suffix = 2;
      while (used.has(name)) {
        const dot = cleaned.lastIndexOf(".");
        const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned;
        const extension = dot > 0 ? cleaned.slice(dot) : "";
        name = `${stem}-${suffix}${extension}`;
        suffix += 1;
      }
      used.add(name);
      return name;
    });
  }

  function putProgram(writer, program) {
    writer.var(program.instructions.length);
    for (const instruction of program.instructions) {
      writer.byte(instruction.tag);
      for (const operand of instruction.operands) writer.var(operand);
    }
    writer.var(1);
    writer.var(program.output);
  }

  function putContent(writer, content) {
    if (content.kind === "angular") {
      writer.byte(1);
      writer.word(content.bytes);
    } else {
      writer.byte(2);
      writer.big(content.start);
      writer.big(content.length);
    }
  }

  function putBranch(writer, branch) {
    writer.var(branch.rotation);
    writer.var(256);
    writer.word(new TextEncoder().encode(branch.name));
    if (branch.content) putContent(writer, branch.content);
    else writer.byte(0);
    writer.var(branch.children.length);
    for (const child of branch.children) putBranch(writer, child);
  }

  function angularSize(bytes) {
    let length = bytes.length;
    let size = 4;
    while (length >= 128) {
      size += 1;
      length = Math.floor(length / 128);
    }
    for (const byte of bytes) size += byte < 128 ? 1 : 2;
    return size;
  }

  function exactPeriod(bytes) {
    if (bytes.length < 2 || bytes.length > 16 * 1024 * 1024) return bytes.length;
    const prefix = new Uint32Array(bytes.length);
    for (let index = 1, matched = 0; index < bytes.length; index += 1) {
      while (matched > 0 && bytes[index] !== bytes[matched]) matched = prefix[matched - 1];
      if (bytes[index] === bytes[matched]) matched += 1;
      prefix[index] = matched;
    }
    return bytes.length - prefix[bytes.length - 1];
  }

  function modalPattern(bytes, period) {
    const pattern = new Uint8Array(period);
    for (let phase = 0; phase < period; phase += 1) {
      const counts = new Uint32Array(256);
      let best = 0;
      for (let offset = phase; offset < bytes.length; offset += period) {
        const value = bytes[offset];
        counts[value] += 1;
        if (counts[value] > counts[best]) best = value;
      }
      pattern[phase] = best;
    }
    return pattern;
  }

  function orbitPattern(bytes, period, drift) {
    const pattern = new Uint8Array(period);
    for (let phase = 0; phase < period; phase += 1) {
      const counts = new Uint32Array(256);
      let best = 0;
      for (let offset = phase; offset < bytes.length; offset += period) {
        const chart = Math.floor(offset / period);
        const value = (bytes[offset] - chart * drift) & 255;
        counts[value] += 1;
        if (counts[value] > counts[best]) best = value;
      }
      pattern[phase] = best;
    }
    return pattern;
  }

  function modalOrbitDrift(bytes, period) {
    const counts = new Uint32Array(256);
    let best = 0;
    for (let offset = period; offset < bytes.length; offset += 1) {
      const drift = (bytes[offset] - bytes[offset - period]) & 255;
      counts[drift] += 1;
      if (counts[drift] > counts[best]) best = drift;
    }
    return best;
  }

  function correctionsFor(bytes, predict, limit) {
    const corrections = [];
    for (let offset = 0; offset < bytes.length; offset += 1) {
      if (bytes[offset] !== predict(offset)) {
        corrections.push({ offset, value: bytes[offset] });
        if (corrections.length > limit) return null;
      }
    }
    return corrections;
  }

  function compilePattern(builder, phase, bytes) {
    if (bytes.length === 1) return builder.add(0, bytes[0]);
    let output = builder.add(0, bytes[bytes.length - 1]);
    for (let index = bytes.length - 2; index >= 0; index -= 1) {
      const expected = builder.add(0, index);
      const matches = builder.add(21, phase, expected);
      const value = builder.add(0, bytes[index]);
      output = builder.add(24, matches, value, output);
    }
    return output;
  }

  function compileModel(builder, local, candidate) {
    let output;
    if (candidate.model.kind === "linear") {
      const step = builder.add(0, candidate.model.step);
      const product = builder.add(8, local, step);
      const start = builder.add(0, candidate.model.start);
      output = builder.add(6, product, start);
    } else if (candidate.model.kind === "quadratic") {
      const square = builder.add(8, local, local);
      const curve = builder.add(0, candidate.model.curve);
      const curved = builder.add(8, square, curve);
      const step = builder.add(0, candidate.model.step);
      const linear = builder.add(8, local, step);
      const terms = builder.add(6, curved, linear);
      const start = builder.add(0, candidate.model.start);
      output = builder.add(6, terms, start);
    } else if (candidate.model.kind === "xor") {
      const step = builder.add(0, candidate.model.step);
      const product = builder.add(8, local, step);
      const start = builder.add(0, candidate.model.start);
      output = builder.add(11, product, start);
    } else if (candidate.model.kind === "orbit") {
      const period = builder.add(0, candidate.model.bytes.length);
      const phase = builder.add(10, local, period);
      const chart = builder.add(9, local, period);
      const drift = builder.add(0, candidate.model.drift);
      const translation = builder.add(8, chart, drift);
      const pattern = compilePattern(builder, phase, candidate.model.bytes);
      output = builder.add(6, pattern, translation);
    } else if (candidate.model.bytes.length === 1) {
      output = builder.add(0, candidate.model.bytes[0]);
    } else {
      const period = builder.add(0, candidate.model.bytes.length);
      const phase = builder.add(10, local, period);
      output = compilePattern(builder, phase, candidate.model.bytes);
    }
    for (const correction of candidate.corrections) {
      const offset = builder.add(0, correction.offset);
      const matches = builder.add(21, local, offset);
      const value = builder.add(0, correction.value);
      output = builder.add(24, matches, value, output);
    }
    return output;
  }

  function candidateSize(candidate, length) {
    const builder = new ProgramBuilder();
    const local = builder.add(1, 0);
    const output = compileModel(builder, local, candidate);
    const writer = new Writer();
    putProgram(writer, { instructions: builder.instructions, output });
    putContent(writer, { kind: "lattice", start: 0, length });
    return writer.finish().length;
  }

  function compileGlobal(values) {
    const bytes = values instanceof Uint8Array ? values : new Uint8Array(values);
    const literalBytes = angularSize(bytes);
    let best = null;
    let bestSize = literalBytes;
    if (bytes.length === 0) {
      return { kind: "literal", bytes, label: "literal exact", estimatedBytes: literalBytes };
    }

    const periods = new Set();
    const searchLimit = bytes.length <= 1024 * 1024 ? 64 : 16;
    for (let period = 1; period <= Math.min(searchLimit, bytes.length); period += 1) {
      periods.add(period);
    }
    const exact = exactPeriod(bytes);
    for (const period of [128, 256, exact]) {
      if (period > 0 && period <= Math.min(4096, bytes.length)) periods.add(period);
    }
    const orbitPeriods = new Set();
    for (let period = 1; period <= Math.min(16, bytes.length); period += 1) {
      orbitPeriods.add(period);
    }
    for (const period of [24, 32, 48, 64, 128, 256, exact]) {
      if (period > 0 && period <= Math.min(256, bytes.length)) orbitPeriods.add(period);
    }

    for (const period of periods) {
      const pattern = modalPattern(bytes, period);
      const corrections = correctionsFor(
        bytes,
        (offset) => pattern[offset % period],
        Math.max(0, Math.floor(bestSize / 8)),
      );
      if (!corrections) continue;
      const candidate = {
        model: { kind: "repeat", bytes: pattern },
        corrections,
        label: period === 1 ? "constant geometry" : `${period}-byte repeating geometry`,
      };
      const size = candidateSize(candidate, bytes.length);
      if (size < bestSize) {
        best = candidate;
        bestSize = size;
      }
    }

    if (bytes.length > 1) {
      const start = bytes[0];
      const step = (bytes[1] - bytes[0]) & 255;
      const corrections = correctionsFor(
        bytes,
        (offset) => (start + step * offset) & 255,
        Math.max(0, Math.floor(bestSize / 8)),
      );
      if (corrections) {
        const candidate = {
          model: { kind: "linear", start, step },
          corrections,
          label: "linear geometry",
        };
        const size = candidateSize(candidate, bytes.length);
        if (size < bestSize) {
          best = candidate;
          bestSize = size;
        }
      }

      const xorStep = bytes[0] ^ bytes[1];
      const xorCorrections = correctionsFor(
        bytes,
        (offset) => bytes[0] ^ ((xorStep * offset) & 255),
        Math.max(0, Math.floor(bestSize / 8)),
      );
      if (xorCorrections) {
        const candidate = {
          model: { kind: "xor", start: bytes[0], step: xorStep },
          corrections: xorCorrections,
          label: "XOR-ramp geometry",
        };
        const size = candidateSize(candidate, bytes.length);
        if (size < bestSize) {
          best = candidate;
          bestSize = size;
        }
      }
    }

    if (bytes.length > 2) {
      const secondDifference = (bytes[2] - 2 * bytes[1] + bytes[0]) & 255;
      if ((secondDifference & 1) === 0) {
        for (const curve of [secondDifference / 2, secondDifference / 2 + 128]) {
          const step = (bytes[1] - bytes[0] - curve) & 255;
          const corrections = correctionsFor(
            bytes,
            (offset) => {
              const local = offset & 255;
              return (bytes[0] + step * local + curve * local * local) & 255;
            },
            Math.max(0, Math.floor(bestSize / 8)),
          );
          if (!corrections) continue;
          const candidate = {
            model: { kind: "quadratic", start: bytes[0], step, curve },
            corrections,
            label: "quadratic geometry",
          };
          const size = candidateSize(candidate, bytes.length);
          if (size < bestSize) {
            best = candidate;
            bestSize = size;
          }
        }
      }
    }

    for (const period of orbitPeriods) {
      if (bytes.length <= period) continue;
      const drift = modalOrbitDrift(bytes, period);
      if (drift === 0) continue;
      const pattern = orbitPattern(bytes, period, drift);
      const corrections = correctionsFor(
        bytes,
        (offset) => (pattern[offset % period] + Math.floor(offset / period) * drift) & 255,
        Math.max(0, Math.floor(bestSize / 8)),
      );
      if (!corrections) continue;
      const candidate = {
        model: { kind: "orbit", bytes: pattern, drift },
        corrections,
        label: `${period}-phase orbit geometry`,
      };
      const size = candidateSize(candidate, bytes.length);
      if (size < bestSize) {
        best = candidate;
        bestSize = size;
      }
    }

    return best
      ? { kind: "procedural", bytes, ...best, estimatedBytes: bestSize }
      : { kind: "literal", bytes, label: "literal exact", estimatedBytes: literalBytes };
  }

  const CELL_BYTES = 256;

  function modelInstructionCount(candidate) {
    let model;
    if (candidate.model.kind === "linear" || candidate.model.kind === "xor") model = 4;
    else if (candidate.model.kind === "quadratic") model = 8;
    else if (candidate.model.kind === "orbit") {
      const pattern = candidate.model.bytes.length === 1
        ? 1
        : 1 + 4 * (candidate.model.bytes.length - 1);
      model = 6 + pattern;
    } else {
      model = candidate.model.bytes.length === 1
        ? 1
        : 3 + 4 * (candidate.model.bytes.length - 1);
    }
    return model + 4 * candidate.corrections.length;
  }

  function literalCellModel(bytes) {
    const pattern = modalPattern(bytes, 1);
    return {
      model: { kind: "repeat", bytes: pattern },
      corrections: correctionsFor(bytes, () => pattern[0], bytes.length),
    };
  }

  function modelKey(candidate) {
    let model;
    if (candidate.model.kind === "linear") {
      model = `l:${candidate.model.start}:${candidate.model.step}`;
    } else if (candidate.model.kind === "quadratic") {
      model = `q:${candidate.model.start}:${candidate.model.step}:${candidate.model.curve}`;
    } else if (candidate.model.kind === "xor") {
      model = `x:${candidate.model.start}:${candidate.model.step}`;
    } else if (candidate.model.kind === "orbit") {
      model = `o:${candidate.model.drift}:${Array.from(candidate.model.bytes).join(".")}`;
    } else {
      model = `r:${Array.from(candidate.model.bytes).join(".")}`;
    }
    const corrections = candidate.corrections
      .map((item) => `${item.offset}:${item.value}`)
      .join(".");
    return `${model}|${corrections}`;
  }

  function compileGridModel(builder, local, candidate) {
    const cellSize = builder.add(0, CELL_BYTES);
    const cell = builder.add(9, local, cellSize);
    const position = builder.add(10, local, cellSize);
    let output = builder.add(0, 0);
    for (const group of candidate.groups) {
      let matches = null;
      for (const index of group.indices) {
        const cellValue = builder.add(0, index);
        const isCell = builder.add(21, cell, cellValue);
        matches = matches === null ? isCell : builder.add(13, matches, isCell);
      }
      const cellOutput = compileModel(builder, position, group.model);
      output = builder.add(24, matches, cellOutput, output);
    }
    return output;
  }

  function gridCandidateSize(candidate, length) {
    const builder = new ProgramBuilder();
    const local = builder.add(1, 0);
    const output = compileGridModel(builder, local, candidate);
    const writer = new Writer();
    putProgram(writer, { instructions: builder.instructions, output });
    putContent(writer, { kind: "lattice", start: 0, length });
    return writer.finish().length;
  }

  function compileGrid(bytes, ceiling) {
    const cells = [];
    const grouped = new Map();
    let roughInstructions = 4;
    for (let start = 0; start < bytes.length; start += CELL_BYTES) {
      const cellBytes = bytes.subarray(start, Math.min(start + CELL_BYTES, bytes.length));
      const compiled = compileGlobal(cellBytes);
      const cell = compiled.kind === "procedural" ? compiled : literalCellModel(cellBytes);
      cells.push(cell);
      const key = modelKey(cell);
      let group = grouped.get(key);
      if (!group) {
        group = { model: cell, indices: [] };
        grouped.set(key, group);
        roughInstructions += modelInstructionCount(cell);
      }
      group.indices.push(cells.length - 1);
      roughInstructions += 3;
      if (roughInstructions * 3 >= ceiling) return null;
    }
    const candidate = {
      kind: "grid",
      bytes,
      cells,
      groups: Array.from(grouped.values()),
      label: `${cells.length}-cell geometric lattice`,
    };
    candidate.estimatedBytes = gridCandidateSize(candidate, bytes.length);
    return candidate.estimatedBytes < ceiling ? candidate : null;
  }

  function compileBytes(values) {
    const bytes = values instanceof Uint8Array ? values : new Uint8Array(values);
    const global = compileGlobal(bytes);
    if (bytes.length < CELL_BYTES * 2
      || (global.kind === "procedural" && global.estimatedBytes < 1024)) {
      return global;
    }
    const grid = compileGrid(bytes, global.estimatedBytes);
    return grid && grid.estimatedBytes < global.estimatedBytes ? grid : global;
  }

  function buildProgram(files) {
    let start = 0;
    for (const file of files) {
      if (file.kind === "literal") continue;
      file.start = start;
      start += file.bytes.length;
    }
    const points = Math.max(1, start);
    const columns = Math.ceil(Math.sqrt(points));
    const rows = Math.ceil(points / columns);
    const builder = new ProgramBuilder();
    const row = builder.add(1, 0);
    const columnCount = builder.add(0, columns);
    const rowStart = builder.add(8, row, columnCount);
    const column = builder.add(1, 1);
    const coordinate = builder.add(6, rowStart, column);
    let output = builder.add(0, 0);
    for (const file of files) {
      if (file.kind === "literal") continue;
      const startValue = builder.add(0, file.start);
      const local = file.start === 0 ? coordinate : builder.add(7, coordinate, startValue);
      const fileOutput = file.kind === "grid"
        ? compileGridModel(builder, local, file)
        : compileModel(builder, local, file);
      const end = file.start + file.bytes.length;
      const endValue = builder.add(0, end);
      let inside = builder.add(22, coordinate, endValue);
      if (file.start > 0) {
        const before = builder.add(0, file.start - 1);
        const afterStart = builder.add(23, coordinate, before);
        inside = builder.add(12, afterStart, inside);
      }
      output = builder.add(24, inside, fileOutput, output);
    }
    return { instructions: builder.instructions, output, rows, columns };
  }

  function buildBinary(files, names) {
    const program = buildProgram(files);
    const children = files.map((file, index) => ({
      rotation: (index + 1) % 256,
      name: names[index],
      content: file.kind !== "literal"
        ? { kind: "lattice", start: file.start, length: file.bytes.length }
        : { kind: "angular", bytes: file.bytes },
      children: [],
    }));

    const writer = new Writer();
    writer.bytes(new TextEncoder().encode("FXB1"));
    writer.var(1);
    writer.var(1);
    writer.var(2);
    writer.var(program.rows);
    writer.var(program.rows);
    writer.var(program.columns);
    writer.var(program.columns);
    writer.var(1);
    putProgram(writer, program);
    putBranch(writer, { rotation: 0, name: "", content: null, children });
    return writer.finish();
  }

  function encodeVolume(files) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("Choose at least one file.");
    }
    const normalized = files.map((file) => ({
      name: file.name,
      bytes: file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes),
    }));
    const names = safeNames(normalized);
    let compiled = normalized.map((file) => compileBytes(file.bytes));
    let binary = buildBinary(compiled, names);
    const literals = normalized.map((file) => ({
      kind: "literal",
      bytes: file.bytes,
      label: "literal exact",
    }));
    const literalBinary = buildBinary(literals, names);
    if (binary.length >= literalBinary.length) {
      compiled = literals;
      binary = literalBinary;
    }

    const checksum = crc32(binary).toString(16).padStart(8, "0");
    return {
      payload: `FX1|${base64url(binary)}|${checksum}`,
      binaryBytes: binary.length,
      fileNames: names,
      sourceBytes: normalized.reduce((sum, file) => sum + file.bytes.byteLength, 0),
      proceduralFiles: compiled.filter((file) => file.kind !== "literal").length,
      gridFiles: compiled.filter((file) => file.kind === "grid").length,
      savedBytes: literalBinary.length - binary.length,
      modes: compiled.map((file) => file.label),
    };
  }

  return { compileBytes, encodeVolume };
});
