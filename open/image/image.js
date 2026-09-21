(function () {
  "use strict";

  const status = document.querySelector("#status");
  const preview = document.querySelector("#preview");
  const qr = document.querySelector("#qr");
  const files = document.querySelector("#files");
  const saveImage = document.querySelector("#save-image");
  const saveQr = document.querySelector("#save-qr");
  const openApp = document.querySelector("#open-app");

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const value of bytes) {
      crc ^= value;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function decodeBase64url(value) {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function parseExactSet(payload) {
    const parts = payload.trim().split("|");
    if (parts.length !== 3 || parts[0] !== "FQX1") throw new Error("This is not an FQX1 exact file set.");
    const binary = decodeBase64url(parts[1]);
    if (crc32(binary) !== (Number.parseInt(parts[2], 16) >>> 0)) throw new Error("The exact file set checksum does not match.");
    const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    if (new TextDecoder().decode(binary.subarray(0, 4)) !== "FQX1") throw new Error("The FQX1 binary header is missing.");
    const repeatCount = view.getUint16(4, true);
    const nameLength = view.getUint16(6, true);
    const fileLength = Number(view.getBigUint64(8, true));
    const contentAt = 16 + nameLength;
    if (!repeatCount || !nameLength || contentAt + fileLength !== binary.length) throw new Error("The exact file set has an invalid shape.");
    const name = new TextDecoder().decode(binary.subarray(16, contentAt));
    const bytes = binary.slice(contentAt);
    return { bytes, name, repeatCount };
  }

  function formatBytes(value) {
    const units = ["bytes", "KiB", "MiB", "GiB"];
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(2)} ${units[unit]}`;
  }

  function repeatedName(name, index, width) {
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    return `${stem}-${String(index).padStart(width, "0")}${extension}`;
  }

  function renderDirectory(set) {
    const first = [1, 2, 3, 4, 5].filter((value) => value <= set.repeatCount);
    const last = Array.from({ length: Math.min(5, set.repeatCount) }, (_, index) => set.repeatCount - 4 + index)
      .filter((value) => value > 5);
    const shown = [...first, ...last];
    const width = Math.max(4, String(set.repeatCount).length);
    shown.forEach((index, position) => {
      if (position === first.length && last.length) {
        const gap = document.createElement("li");
        const ellipsis = document.createElement("em");
        ellipsis.textContent = "...";
        const description = document.createElement("span");
        description.textContent = "procedural entries";
        gap.append(ellipsis, description);
        files.append(gap);
      }
      const item = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = repeatedName(set.name, index, width);
      const exact = document.createElement("span");
      exact.textContent = "exact";
      item.append(name, exact);
      files.append(item);
    });
    document.querySelector("#file-count").textContent = set.repeatCount.toLocaleString();
  }

  function downloadUrl(url, name) {
    const link = document.createElement("a");
    link.download = name;
    link.href = url;
    link.click();
  }

  async function start() {
    const setName = new URLSearchParams(location.search).get("set") || "goat-1000.fqx";
    if (!/^[a-z0-9-]+\.fqx$/.test(setName)) throw new Error("Choose a bundled Felix image set.");
    const response = await fetch(setName);
    if (!response.ok) throw new Error("The exact Felix image set could not be loaded.");
    const set = parseExactSet(await response.text());
    const imageType = set.name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    const imageUrl = URL.createObjectURL(new Blob([set.bytes], { type: imageType }));
    preview.alt = `${set.name}, decoded byte-for-byte from the Felix exact set`;
    preview.onload = () => {
      document.querySelector("#image-caption").textContent = `Original ${preview.naturalWidth} x ${preview.naturalHeight} ${imageType === "image/png" ? "PNG" : "JPEG"}, byte-for-byte`;
    };
    preview.src = imageUrl;
    saveImage.textContent = `Save original ${imageType === "image/png" ? "PNG" : "JPEG"}`;
    document.querySelector("#model-size").textContent = formatBytes(set.bytes.length);
    document.querySelector("#logical-size").textContent = formatBytes(set.bytes.length * set.repeatCount);
    document.querySelector("#page-title").textContent = `One scan opens ${formatBytes(set.bytes.length * set.repeatCount)}.`;
    renderDirectory(set);

    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", set.bytes));
    const hash = Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
    status.textContent = `${set.name} is stored once and reused ${set.repeatCount.toLocaleString()} times. Every file is byte-identical. SHA-256 ${hash.slice(0, 16)}...`;
    saveImage.disabled = false;
    saveImage.addEventListener("click", () => downloadUrl(imageUrl, set.name));

    const origin = ["127.0.0.1", "localhost"].includes(location.hostname) ? "https://felixagi.github.io" : location.origin;
    const link = `${origin}${location.pathname}?set=${encodeURIComponent(setName)}`;
    openApp.href = `felixfs://import?url=${encodeURIComponent(link)}`;
    openApp.hidden = false;
    await QRCode.toCanvas(qr, link, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 520,
      color: { dark: "#111714", light: "#ffffff" },
    });
    saveQr.disabled = false;
    saveQr.addEventListener("click", () => downloadUrl(qr.toDataURL("image/png"), `${set.name.replace(/\.[^.]+$/, "")}-${set.repeatCount}-exact-felixqr.png`));
  }

  start().catch((error) => {
    status.textContent = error.message;
    status.style.color = "#9b3d36";
    console.error(error);
  });
})();
