"use strict";

const builder = document.querySelector("#builder");

if (builder) {
  const databaseName = "felixqr-local-files";
  const storeName = "files";
  const picker = document.querySelector("#builder-files");
  const list = document.querySelector("#managed-files");
  const empty = document.querySelector("#files-empty");
  const count = document.querySelector("#file-count");
  const total = document.querySelector("#file-total");
  const clearButton = document.querySelector("#clear-files");
  const buildButton = document.querySelector("#build-felixqr");
  const builderMessage = document.querySelector("#builder-message");
  const result = document.querySelector("#builder-result");
  const resultMessage = document.querySelector("#result-message");
  const resultSize = document.querySelector("#result-size");
  const resultFiles = document.querySelector("#result-files");
  const resultEncoding = document.querySelector("#result-encoding");
  const resultSavings = document.querySelector("#result-savings");
  const openBuiltApp = document.querySelector("#open-built-app");
  const downloadFx1 = document.querySelector("#download-built-fx1");
  const copyLink = document.querySelector("#copy-built-link");
  const downloadQr = document.querySelector("#download-built-qr");
  const canvas = document.querySelector("#built-qr");
  let records = [];
  let fx1Url = null;

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function resetResult() {
    if (fx1Url) URL.revokeObjectURL(fx1Url);
    fx1Url = null;
    result.hidden = true;
    canvas.hidden = true;
    copyLink.hidden = true;
    downloadQr.removeAttribute("href");
    downloadQr.setAttribute("aria-disabled", "true");
  }

  function render() {
    list.replaceChildren();
    const bytes = records.reduce((sum, file) => sum + file.size, 0);
    count.textContent = `${records.length} ${records.length === 1 ? "file" : "files"}`;
    total.textContent = formatBytes(bytes);
    empty.hidden = records.length > 0;
    clearButton.disabled = records.length === 0;
    buildButton.disabled = records.length === 0;

    for (const file of records) {
      const item = document.createElement("li");
      item.className = "managed-file";

      const details = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = file.name;
      const size = document.createElement("small");
      size.textContent = formatBytes(file.size);
      details.append(name, size);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-file";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${file.name}`);
      remove.addEventListener("click", async () => {
        await withStore("readwrite", (store) => store.delete(file.id));
        records = records.filter((candidate) => candidate.id !== file.id);
        resetResult();
        render();
      });

      item.append(details, remove);
      list.append(item);
    }
  }

  async function restoreFiles() {
    records = await withStore("readonly", (store) => store.getAll());
    records.sort((a, b) => a.addedAt - b.addedAt);
    render();
  }

  async function addFiles(files) {
    builderMessage.textContent = "Saving files in this browser...";
    for (const file of files) {
      const record = {
        id: `${file.name}\u0000${file.size}\u0000${file.lastModified}`,
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        addedAt: Date.now(),
        bytes: await file.arrayBuffer(),
      };
      await withStore("readwrite", (store) => store.put(record));
    }
    builderMessage.textContent = "Saved locally. Nothing was uploaded.";
    resetResult();
    await restoreFiles();
  }

  picker.addEventListener("change", async () => {
    const files = Array.from(picker.files || []);
    picker.value = "";
    if (!files.length) return;
    try {
      await addFiles(files);
    } catch (error) {
      builderMessage.textContent = `Could not save those files: ${error.message}`;
    }
  });

  clearButton.addEventListener("click", async () => {
    await withStore("readwrite", (store) => store.clear());
    records = [];
    builderMessage.textContent = "Local file list cleared.";
    resetResult();
    render();
  });

  buildButton.addEventListener("click", async () => {
    resetResult();
    builderMessage.textContent = "Building your FelixQR locally...";
    try {
      const encoded = FelixBuilder.encodeVolume(records.map((file) => ({
        name: file.name,
        bytes: new Uint8Array(file.bytes),
      })));
      const fx1Blob = new Blob([encoded.payload + "\n"], { type: "text/plain;charset=utf-8" });
      fx1Url = URL.createObjectURL(fx1Blob);
      downloadFx1.href = fx1Url;
      downloadFx1.download = "my-files.fx1";
      openBuiltApp.href = FelixLink.appUrl(encoded.payload);
      resultSize.textContent = formatBytes(new TextEncoder().encode(encoded.payload).length);
      resultFiles.textContent = `${records.length}`;
      resultEncoding.textContent = encoded.gridFiles
        ? encoded.gridFiles === 1 ? "Cell lattice" : `${encoded.gridFiles} cell lattices`
        : encoded.proceduralFiles ? `${encoded.proceduralFiles} procedural` : "Literal exact";
      resultSavings.textContent = encoded.savedBytes > 0
        ? formatBytes(encoded.savedBytes)
        : "0 bytes";
      result.hidden = false;

      const configuredBase = document.querySelector('meta[name="felix-phone-base"]')?.content;
      const loopback = location.hostname === "127.0.0.1" || location.hostname === "localhost";
      const cameraBase = loopback && configuredBase ? configuredBase : location.href;
      const link = FelixLink.cameraUrl(encoded.payload, cameraBase);
      copyLink.dataset.link = link;
      try {
        await QRCode.toCanvas(canvas, link, {
          errorCorrectionLevel: "L",
          margin: 4,
          width: 520,
          color: { dark: "#111714", light: "#ffffff" },
        });
        canvas.hidden = false;
        copyLink.hidden = false;
        downloadQr.href = canvas.toDataURL("image/png");
        downloadQr.download = "my-felixqr.png";
        downloadQr.removeAttribute("aria-disabled");
        resultMessage.textContent = "Your exact FelixQR is ready. The compiler used procedural geometry wherever it made the payload smaller.";
      } catch (error) {
        resultMessage.textContent = "The exact compiler used the smallest representation it found, but this collection still exceeds one standard QR. Save the Felix file or remove files.";
        console.warn("FelixQR rendering failed", error);
      }
      builderMessage.textContent = "Built entirely in this browser. Nothing was uploaded.";
    } catch (error) {
      builderMessage.textContent = `Could not build this FelixQR: ${error.message}`;
    }
  });

  copyLink.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(copyLink.dataset.link);
      copyLink.textContent = "Link copied";
      setTimeout(() => { copyLink.textContent = "Copy FelixQR link"; }, 1800);
    } catch (_) {
      builderMessage.textContent = "The browser could not copy the link. Download the Felix file instead.";
    }
  });

  restoreFiles().catch((error) => {
    builderMessage.textContent = `Local storage is unavailable: ${error.message}`;
  });
}
