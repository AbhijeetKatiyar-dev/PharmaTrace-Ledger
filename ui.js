/* ui.js — small reusable UI pieces ("components") shared by every page */

// ---------- Theme: follow the system / viewer theme ----------
(function syncTheme() {
  const root = document.documentElement;
  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function apply() {
    const t = root.getAttribute("data-theme");
    const dark = t ? t === "dark" : !!(mq && mq.matches);
    root.setAttribute("data-bs-theme", dark ? "dark" : "light");
  }
  apply();
  if (mq && mq.addEventListener) mq.addEventListener("change", apply);
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
})();

// ---------- Text helpers ----------
function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function fmtId(id) { return String(id).replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3"); }
function fmtDate(iso) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDay(isoDay) {
  return new Date(String(isoDay).slice(0, 10) + "T12:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function serial(id) { return '<span class="pt-serial">' + esc(fmtId(id)) + "</span>"; }

// ---------- StatusBadge ----------
const STATUS_KIND = { "Genuine": "ok", "Under Review": "warn", "Recalled": "bad", "Counterfeit": "bad", "Expired": "bad" };
const STATUS_ICON = { ok: "✔", warn: "⚠", bad: "✖", info: "●" };
function statusBadge(status) {
  const kind = STATUS_KIND[status] || "info";
  return '<span class="pt-badge pt-badge--' + kind + '">' + STATUS_ICON[kind] + " " + esc(status) + "</span>";
}
function shipmentBadge(s) {
  let kind = { "In Transit": "info", "Awaiting receipt": "warn", "Delivered": "ok", "Halted": "bad" }[s.status] || "info";
  let html = '<span class="pt-badge pt-badge--' + kind + '">' + esc(s.status) + "</span>";
  if (isDelayed(s)) html += ' <span class="pt-badge pt-badge--bad">⏱ Delayed</span>';
  return html;
}
function expiryChip(batch) {
  const d = daysToExpiry(batch);
  if (d < 0) return ' <span class="pt-badge pt-badge--bad">Expired</span>';
  if (d <= 30) return ' <span class="pt-badge pt-badge--warn">' + d + " days left</span>";
  if (d <= 90) return ' <span class="pt-badge pt-badge--info">' + d + " days left</span>";
  return "";
}

// ---------- StatusAlert (full-width banner) ----------
const RESULT_KIND = { ok: "ok", review: "warn", incoming: "warn", invalid: "warn" };
function statusAlert(result) {
  const kind = RESULT_KIND[result.state] || "bad";
  const icon = kind === "ok" ? "✔" : (kind === "warn" ? "⚠" : "✖");
  return '<div class="pt-alert pt-alert--' + kind + '" role="alert">' +
    '<span class="pt-alert__icon" aria-hidden="true">' + icon + "</span>" +
    '<div><p class="pt-alert__title">' + esc(result.title) + "</p>" +
    '<p class="pt-alert__msg">' + esc(result.message) + "</p></div></div>";
}

// ---------- TimelineStep / timeline ----------
function entryKind(status) {
  if (/^Recalled|counterfeit|halted|mismatch|discrepancy|Wrong PIN/i.test(status)) return "bad";
  if (/Reported|review/i.test(status)) return "warn";
  if (/^Received|^Manufactured|Cleared/i.test(status)) return "ok";
  return "info";
}
function timelineStep(entry, broken) {
  return '<li class="pt-step pt-step--' + entryKind(entry.status) + (broken ? " pt-step--broken" : "") + '">' +
    '<span class="pt-step__dot" aria-hidden="true"></span>' +
    '<div class="pt-step__body">' +
    '<p class="pt-step__event">' + esc(entry.status) + "</p>" +
    '<p class="pt-step__meta"><time>' + esc(fmtDate(entry.timestamp)) + "</time> · " + esc(entry.location) + " · " + esc(entry.actor) + "</p>" +
    '<p class="pt-step__hash" title="SHA-256 fingerprint of this entry">#' + esc(entry.hash.slice(0, 12)) + " ← #" + esc(entry.prevHash.slice(0, 8)) + (broken ? " · <strong>chain broken here</strong>" : "") + "</p>" +
    "</div></li>";
}
function renderTimeline(batch) {
  const chain = verifyChain(batch);
  return '<ol class="pt-timeline">' + batch.history.map(function (e, i) {
    return timelineStep(e, !chain.ok && i === chain.index);
  }).join("") + "</ol>";
}

// Drug detail grid
function batchFacts(batch) {
  const chain = verifyChain(batch);
  const rows = [
    ["Batch ID", serial(batch.batchId)],
    ["Drug", esc(batch.drugName)],
    ["Manufacturer", esc(batch.manufacturer)],
    ["Quantity", Number(batch.quantity).toLocaleString("en-IN") + " units"],
    ["Manufactured", fmtDay(batch.mfgDate)],
    ["Expires", fmtDay(batch.expiryDate) + expiryChip(batch)],
    ["Current holder", esc(batch.currentHolder)],
    ["Status", statusBadge(batch.status)],
    ["Ledger", chain.ok ? '<span class="pt-badge pt-badge--ok">✔ Chain intact · ' + batch.history.length + " entries</span>" : '<span class="pt-badge pt-badge--bad">✖ Tampered at entry ' + (chain.index + 1) + "</span>"]
  ];
  return '<dl class="pt-facts">' + rows.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("") + "</dl>";
}

// ---------- Modal (one reusable Bootstrap modal) ----------
let _modal = null, _modalEl = null, _modalCfg = null, _pendingCfg = null, _modalState = "closed";
function ensureModal() {
  if (_modalEl) return;
  _modalEl = document.createElement("div");
  _modalEl.className = "modal fade";
  _modalEl.tabIndex = -1;
  _modalEl.setAttribute("aria-labelledby", "ptModalTitle");
  _modalEl.innerHTML =
    '<div class="modal-dialog modal-dialog-scrollable"><form class="modal-content" novalidate id="ptModalForm">' +
    '<div class="modal-header"><h2 class="modal-title h5" id="ptModalTitle"></h2>' +
    '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>' +
    '<div class="modal-body"></div>' +
    '<div class="pt-modal-error mx-3" role="alert" hidden></div>' +
    '<div class="modal-footer"><button type="button" class="btn btn-outline-secondary pt-cancel" data-bs-dismiss="modal">Cancel</button>' +
    '<button type="submit" class="btn btn-primary pt-confirm">Save</button></div></form></div>';
  document.body.appendChild(_modalEl);
  _modal = new bootstrap.Modal(_modalEl);
  _modalEl.querySelector("form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!_modalCfg || !_modalCfg.onConfirm) { _modal.hide(); return; }
    const result = _modalCfg.onConfirm(_modalEl.querySelector(".modal-body"));
    const errBox = _modalEl.querySelector(".pt-modal-error");
    if (typeof result === "string") { errBox.textContent = result; errBox.hidden = false; return; }
    if (result === false) return;
    _modal.hide();
  });
  _modalEl.addEventListener("hide.bs.modal", function () {
    _modalState = "closing";
    if (_modalCfg && _modalCfg.onClose) _modalCfg.onClose();
  });
  _modalEl.addEventListener("hidden.bs.modal", function () {
    _modalState = "closed";
    if (_pendingCfg) { const c = _pendingCfg; _pendingCfg = null; showModal(c); }
  });
}
function showModal(cfg) {
  _modalCfg = cfg;
  _modalEl.querySelector(".modal-dialog").className = "modal-dialog modal-dialog-scrollable" + (cfg.size ? " modal-" + cfg.size : "");
  _modalEl.querySelector(".modal-title").textContent = cfg.title;
  const body = _modalEl.querySelector(".modal-body");
  body.innerHTML = cfg.body;
  const confirm = _modalEl.querySelector(".pt-confirm");
  const cancel = _modalEl.querySelector(".pt-cancel");
  if (cfg.confirmText === null) { confirm.hidden = true; cancel.textContent = "Close"; }
  else {
    confirm.hidden = false; cancel.textContent = "Cancel";
    confirm.textContent = cfg.confirmText || "Save";
    confirm.className = "btn pt-confirm " + (cfg.danger ? "btn-danger" : "btn-primary");
  }
  _modalEl.querySelector(".pt-modal-error").hidden = true;
  _modalState = "open";
  _modal.show();
  if (cfg.onOpen) cfg.onOpen(body);
  const first = body.querySelector("input:not([type=hidden]):not([readonly]), select, textarea");
  if (first) _modalEl.addEventListener("shown.bs.modal", function f() { first.focus(); _modalEl.removeEventListener("shown.bs.modal", f); });
}
function openModal(cfg) {
  ensureModal();
  // Bootstrap can't open a modal while one is closing, so queue the next one.
  if (_modalState === "open") { _pendingCfg = cfg; _modal.hide(); }
  else if (_modalState === "closing") { _pendingCfg = cfg; }
  else showModal(cfg);
}
function fieldValue(body, id) { const el = body.querySelector("#" + id); return el ? el.value.trim() : ""; }

// ---------- Toast ----------
function toast(message, kind) {
  let box = document.getElementById("ptToasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "ptToasts"; box.className = "pt-toasts"; box.setAttribute("aria-live", "polite");
    document.body.appendChild(box);
  }
  const t = document.createElement("div");
  t.className = "pt-toast pt-toast--" + (kind || "ok");
  t.textContent = message;
  box.appendChild(t);
  setTimeout(function () { t.classList.add("is-leaving"); setTimeout(function () { t.remove(); }, 300); }, 3800);
}

// ---------- Batch detail modal ----------
function viewBatch(batchId) {
  const b = getBatch(batchId);
  if (!b) return;
  openModal({
    title: b.drugName, size: "lg", confirmText: null,
    body: batchFacts(b) + '<h3 class="pt-section-label mt-4">Custody chain</h3>' + renderTimeline(b)
  });
}

// ---------- QR code modal ----------
function checkUrl(batchId) {
  try { return new URL("check.html#" + batchId, location.href).href; } catch (e) { return "check.html#" + batchId; }
}
function showQr(batchId) {
  const b = getBatch(batchId);
  openModal({
    title: "QR label · " + b.drugName, confirmText: null,
    body: '<div class="pt-qr-label"><div id="ptQr" class="pt-qr"></div>' +
      "<div><p class=\"mb-1 fw-semibold\">" + esc(b.drugName) + "</p>" +
      '<p class="mb-1">' + serial(b.batchId) + "</p>" +
      '<p class="small text-body-secondary mb-0">Mfg ' + fmtDay(b.mfgDate) + " · Exp " + fmtDay(b.expiryDate) + "<br>" + esc(b.manufacturer) + "</p></div></div>" +
      '<p class="small text-body-secondary mt-3 mb-2">Scanning this code with any phone camera opens the public check page for this batch.</p>' +
      '<button type="button" class="btn btn-outline-primary btn-sm" id="ptQrDownload">Download PNG</button>',
    onOpen: function (body) {
      const holder = body.querySelector("#ptQr");
      if (typeof QRCode === "undefined") { holder.textContent = "QR library did not load."; return; }
      new QRCode(holder, { text: checkUrl(b.batchId), width: 148, height: 148, correctLevel: QRCode.CorrectLevel.M });
      body.querySelector("#ptQrDownload").addEventListener("click", function () {
        const canvas = holder.querySelector("canvas");
        if (!canvas) return;
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = "batch-" + b.batchId + ".png";
        a.click();
      });
    }
  });
}

// ---------- CSV export ----------
function csvCell(v) { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function exportLedgerCsv(batches, filename) {
  const rows = [["batchId", "drugName", "manufacturer", "expiryDate", "batchStatus", "timestamp", "location", "actor", "event", "hash"]];
  batches.forEach(function (b) {
    b.history.forEach(function (e) {
      rows.push([b.batchId, b.drugName, b.manufacturer, b.expiryDate, b.status, e.timestamp, e.location, e.actor, e.status, e.hash]);
    });
  });
  const csv = rows.map(function (r) { return r.map(csvCell).join(","); }).join("\n");
  openModal({
    title: "Export ledger (" + (rows.length - 1) + " rows)", confirmText: null, size: "lg",
    body: '<p class="small text-body-secondary">One row per custody event. Opens in Excel or Google Sheets.</p>' +
      '<div class="d-flex flex-wrap gap-2 mb-3"><button type="button" class="btn btn-primary btn-sm" id="csvDownload">Download ' + esc(filename) + "</button>" +
      '<button type="button" class="btn btn-outline-primary btn-sm" id="csvCopy">Copy CSV</button></div>' +
      '<label for="csvText" class="form-label small">Preview</label><textarea id="csvText" class="form-control pt-mono-input" rows="8" readonly>' + esc(csv) + "</textarea>",
    onOpen: function (body) {
      body.querySelector("#csvDownload").addEventListener("click", function () {
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      });
      body.querySelector("#csvCopy").addEventListener("click", function () {
        const ta = body.querySelector("#csvText");
        const done = function () { toast("CSV copied"); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(csv).then(done).catch(function () { ta.select(); toast("Text selected. Press Ctrl+C to copy.", "info"); });
        } else { ta.select(); toast("Text selected. Press Ctrl+C to copy.", "info"); }
      });
    }
  });
}

// ---------- Simple table search/filter helper ----------
function matchesSearch(batch, q) {
  q = q.toLowerCase().replace(/\s/g, "");
  return !q || batch.batchId.indexOf(q) !== -1 || batch.drugName.toLowerCase().replace(/\s/g, "").indexOf(q) !== -1;
}
function matchesFilter(batch, f) {
  if (!f || f === "all") return true;
  if (f === "expiring") return daysToExpiry(batch) >= 0 && daysToExpiry(batch) <= 30;
  if (f === "expired") return isExpired(batch);
  return batch.status === f;
}
function emptyRow(cols, text) {
  return '<tr><td colspan="' + cols + '" class="pt-empty-cell">' + esc(text) + "</td></tr>";
}
