/* common.js — standalone stand-in for the shared helpers manufacturer.js expects
   (auth / data / ui). Demo data lives in localStorage. If you already have your
   own auth.js / ledger.js / ui.js, load those instead of this file. */

const LS_KEY = "pharmatrace.demo.v1";
const DEMO_USER = { name: "Apex Pharma Ltd", role: "manufacturer" };

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function isoIn(days) { return new Date(Date.now() + days * 864e5).toISOString().slice(0, 10); }

/* ---------- storage ---------- */
function load() {
  try { const s = JSON.parse(localStorage.getItem(LS_KEY)); if (s) return s; } catch (e) {}
  const m = DEMO_USER.name;
  const s = {
    batches: [
      { batchId: "B-2026-0001", drugName: "Paracetamol 500mg", quantity: 50000, expiryDate: isoIn(400), manufacturer: m, currentHolder: m, status: "Genuine" },
      { batchId: "B-2026-0002", drugName: "Amoxicillin 250mg", quantity: 20000, expiryDate: isoIn(20), manufacturer: m, currentHolder: m, status: "Genuine" },
      { batchId: "B-2026-0003", drugName: "Metformin 500mg", quantity: 35000, expiryDate: isoIn(300), manufacturer: m, currentHolder: "City Distributors", status: "Under Review" },
      { batchId: "B-2025-0009", drugName: "Cetirizine 10mg", quantity: 12000, expiryDate: isoIn(-10), manufacturer: m, currentHolder: m, status: "Genuine" }
    ],
    shipments: [], log: {}
  };
  s.batches.forEach(function (b) { s.log[b.batchId] = [{ event: "Batch registered", by: m, at: new Date().toISOString() }]; });
  save(s); return s;
}
function save(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }
function getBatches() { return load().batches; }
function getBatch(id) { return getBatches().find(function (b) { return b.batchId === id; }); }
function activeShipmentFor(id) { return load().shipments.find(function (s) { return s.batchId === id && s.status === "In transit"; }); }
function addLog(s, id, event, by) { (s.log[id] = s.log[id] || []).push({ event: event, by: by, at: new Date().toISOString() }); }

/* ---------- auth / nav ---------- */
function requireRole(role) { return DEMO_USER.role === role ? DEMO_USER : (location.href = "about:blank"); }
function renderNav(me, page) {
  document.getElementById("nav").className = "pt-nav";
  document.getElementById("nav").innerHTML =
    '<div class="pt-nav__inner"><span class="pt-brand"><b>Pharma</b>Trace</span>' +
    '<span class="pt-nav__page">' + esc(page) + "</span>" +
    '<div class="pt-nav__right"><div class="pt-user"><span class="pt-user__role">' + esc(me.role) +
    '</span><span class="pt-user__name">' + esc(me.name) + "</span></div></div></div>";
}

/* ---------- formatting / filters ---------- */
function daysLeft(b) { return Math.ceil((new Date(b.expiryDate) - Date.now()) / 864e5); }
function isExpired(b) { return daysLeft(b) < 0; }
function fmtDay(d) { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
function serial(id) { return '<span class="pt-serial">' + esc(id) + "</span>"; }
function expiryChip(b) {
  if (isExpired(b)) return ' <span class="pt-badge pt-badge--bad">Expired</span>';
  const d = daysLeft(b);
  return d <= 30 ? ' <span class="pt-badge pt-badge--warn">' + d + " days left</span>" : "";
}
function statusBadge(st) {
  const cls = { "Genuine": "ok", "Under Review": "warn", "Recalled": "bad", "Counterfeit": "bad" }[st] || "info";
  return '<span class="pt-badge pt-badge--' + cls + '">' + esc(st) + "</span>";
}
function emptyRow(n, msg) { return '<tr><td class="pt-empty-cell" colspan="' + n + '">' + esc(msg) + "</td></tr>"; }
function matchesSearch(b, q) {
  q = (q || "").trim().toLowerCase();
  return !q || b.batchId.toLowerCase().includes(q) || b.drugName.toLowerCase().includes(q);
}
function matchesFilter(b, f) {
  if (f === "all") return true;
  if (f === "expiring") return !isExpired(b) && daysLeft(b) <= 30;
  return b.status === f;
}

/* ---------- toast + modal helpers ---------- */
function toast(msg, type) {
  let box = document.getElementById("toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; box.className = "pt-toasts"; document.body.appendChild(box); }
  const t = document.createElement("div");
  t.className = "pt-toast" + (type ? " pt-toast--" + type : ""); t.textContent = msg; box.appendChild(t);
  setTimeout(function () { t.classList.add("is-leaving"); setTimeout(function () { t.remove(); }, 300); }, 3000);
}
function openModal(title, body, buttons) {
  const el = document.createElement("div");
  el.className = "modal fade"; el.tabIndex = -1;
  el.innerHTML = '<div class="modal-dialog modal-dialog-centered"><div class="modal-content">' +
    '<div class="modal-header"><h5 class="modal-title">' + esc(title) + '</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>' +
    '<div class="modal-body">' + body + '</div><div class="modal-footer"></div></div></div>';
  document.body.appendChild(el);
  const modal = new bootstrap.Modal(el);
  const foot = el.querySelector(".modal-footer");
  (buttons || []).concat([{ label: "Close", cls: "btn-outline-secondary" }]).forEach(function (bt) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn " + bt.cls; b.textContent = bt.label;
    b.onclick = function () { if (!bt.onClick || bt.onClick(el) !== false) modal.hide(); };
    foot.appendChild(b);
  });
  el.addEventListener("hidden.bs.modal", function () { modal.dispose(); el.remove(); });
  modal.show(); return el;
}
function field(id, label, attrs) {
  return '<div class="mb-3"><label class="form-label" for="' + id + '">' + label + '</label><input class="form-control" id="' + id + '" ' + (attrs || "") + "></div>";
}

/* ---------- modals ---------- */
function viewBatch(id) {
  const s = load(), b = getBatch(id);
  const steps = (s.log[id] || []).map(function (l) {
    return '<li class="pt-step"><span class="pt-step__dot"></span><div><p class="pt-step__event">' + esc(l.event) +
      '</p><p class="pt-step__meta">' + esc(l.by) + " · " + new Date(l.at).toLocaleString("en-IN") + "</p></div></li>";
  }).join("");
  openModal("Batch " + id,
    '<dl class="pt-facts mb-3"><div><dt>Drug</dt><dd>' + esc(b.drugName) + "</dd></div><div><dt>Quantity</dt><dd>" +
    Number(b.quantity).toLocaleString("en-IN") + "</dd></div><div><dt>Expiry</dt><dd>" + fmtDay(b.expiryDate) +
    "</dd></div><div><dt>Status</dt><dd>" + statusBadge(b.status) + '</dd></div></dl><ol class="pt-timeline">' + steps + "</ol>");
}
function showQr(id) {
  const el = openModal("QR label · " + id, '<div class="pt-qr-label"><div class="pt-qr" id="qrBox"></div><div>' + serial(id) + "</div></div>");
  new QRCode(el.querySelector("#qrBox"), { text: location.origin + "/verify?batch=" + encodeURIComponent(id), width: 160, height: 160 });
}
function openRegisterModal(me, done) {
  openModal("Register new batch",
    field("rDrug", "Drug name", 'type="text"') + field("rQty", "Quantity", 'type="number" min="1"') + field("rExp", "Expiry date", 'type="date"'),
    [{ label: "Register", cls: "btn-primary", onClick: function (el) {
      const drug = el.querySelector("#rDrug").value.trim(), qty = Number(el.querySelector("#rQty").value), exp = el.querySelector("#rExp").value;
      if (!drug || !(qty > 0) || !exp) { toast("Fill in all fields.", "bad"); return false; }
      const s = load(), id = "B-" + new Date().getFullYear() + "-" + String(s.batches.length + 1).padStart(4, "0");
      s.batches.push({ batchId: id, drugName: drug, quantity: qty, expiryDate: exp, manufacturer: me.name, currentHolder: me.name, status: "Genuine" });
      addLog(s, id, "Batch registered", me.name); save(s); toast("Registered " + id); done();
    } }]);
}
function openDispatchModal(b, me, done) {
  openModal("Dispatch " + b.batchId,
    field("dTo", "Send to", 'type="text" placeholder="e.g. City Distributors"') + field("dDrv", "Driver", 'type="text"'),
    [{ label: "Dispatch", cls: "btn-primary", onClick: function (el) {
      const to = el.querySelector("#dTo").value.trim(), drv = el.querySelector("#dDrv").value.trim();
      if (!to || !drv) { toast("Enter destination and driver.", "bad"); return false; }
      const s = load(), sid = "SHP-" + String(s.shipments.length + 1).padStart(4, "0");
      s.shipments.push({ shipmentId: sid, batchId: b.batchId, to: to, driver: drv, status: "In transit" });
      addLog(s, b.batchId, "Dispatched to " + to + " (" + sid + ")", me.name); save(s); toast("Dispatched " + sid); done();
    } }]);
}
function openRecallModal(b, me, done) {
  openModal("Recall " + b.batchId, '<p class="pt-note pt-note--warn">This marks the batch as Recalled and cannot be undone.</p>' + field("cWhy", "Reason", 'type="text"'),
    [{ label: "Recall batch", cls: "btn-outline-danger", onClick: function (el) {
      const why = el.querySelector("#cWhy").value.trim();
      if (!why) { toast("Give a reason.", "bad"); return false; }
      const s = load(), x = s.batches.find(function (v) { return v.batchId === b.batchId; });
      x.status = "Recalled"; addLog(s, b.batchId, "Recalled: " + why, me.name); save(s); toast("Batch recalled", "warn"); done();
    } }]);
}
function showImpact(id) {
  const s = load(), b = getBatch(id);
  const rows = s.shipments.filter(function (x) { return x.batchId === id; }).map(function (x) {
    return "<li><strong>" + esc(x.to) + "</strong><span>" + esc(x.shipmentId) + " · " + esc(x.driver) + " · " + esc(x.status) + "</span></li>";
  }).join("") || "<li><strong>" + esc(b.currentHolder) + "</strong><span>Current holder</span></li>";
  openModal("Recall impact · " + id, '<ul class="pt-impact">' + rows + "</ul>");
}

/* ---------- CSV ---------- */
function exportLedgerCsv(list, filename) {
  const cols = ["batchId", "drugName", "quantity", "expiryDate", "currentHolder", "status"];
  const csv = [cols.join(",")].concat(list.map(function (b) {
    return cols.map(function (c) { return '"' + String(b[c]).replace(/"/g, '""') + '"'; }).join(",");
  })).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = filename; a.click();
}
