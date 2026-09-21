"use strict";

const status = document.querySelector("#status");
const actions = document.querySelector("#actions");
const metadata = document.querySelector("#metadata");
const payloadSize = document.querySelector("#payload-size");
const openButton = document.querySelector("#open-app");
const downloadButton = document.querySelector("#download");
const manual = document.querySelector("#manual");
const form = document.querySelector("#payload-form");
const input = document.querySelector("#payload-input");
const fileInput = document.querySelector("#payload-file");
const formMessage = document.querySelector("#form-message");
let downloadUrl = null;

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + (bytes === 1 ? " byte" : " bytes");
  return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + " KiB";
}

function render() {
  const payload = FelixLink.payloadFromHash(location.hash);

  if (downloadUrl) {
    URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
  }

  if (!payload) {
    status.textContent = "Turn an ordinary camera scan into a browsable, read-only drive. Scan a FelixQR code or open a saved Felix file below.";
    status.classList.remove("error");
    actions.hidden = true;
    metadata.hidden = true;
    manual.open = true;
    return;
  }

  const bytes = new TextEncoder().encode(payload).length;
  status.textContent = "Your FelixQR drive is ready to open.";
  status.classList.remove("error");
  payloadSize.textContent = formatBytes(bytes);
  metadata.hidden = false;
  actions.hidden = false;
  manual.open = false;
  openButton.href = FelixLink.appUrl(payload);
  downloadUrl = URL.createObjectURL(new Blob([payload + "\n"], { type: "text/plain;charset=utf-8" }));
  downloadButton.href = downloadUrl;
  downloadButton.download = "felix-volume.fx1";
}

function loadPayload(text) {
  const payload = FelixLink.payloadFromText(text);
  if (!payload) {
    formMessage.textContent = "That does not look like a FelixQR link or Felix file.";
    input.setAttribute("aria-invalid", "true");
    return;
  }

  formMessage.textContent = "";
  input.removeAttribute("aria-invalid");
  location.hash = encodeURIComponent(payload);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadPayload(input.value);
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  loadPayload(await file.text());
});

document.querySelectorAll("[data-scroll]").forEach((link) => {
  link.addEventListener("click", (event) => {
    const section = document.getElementById(link.dataset.scroll);
    if (!section) return;
    event.preventDefault();
    section.scrollIntoView();
  });
});

window.addEventListener("hashchange", render);
render();
