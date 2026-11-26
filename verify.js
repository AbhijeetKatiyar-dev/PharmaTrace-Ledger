/* verify.js — Pharmacist Verification Portal */

const me = requireRole("pharmacist");
renderNav(me, "Verification Portal");
document.getElementById("atLine").innerHTML = "Verifying at <strong>" + esc(me.name) + "</strong>, " + esc(me.location) +
  ". Scan the QR on the pack or type the 12-digit Batch ID.";

const input = document.getElementById("batchInput");
const resultBox = document.getElementById("result");

function showResult(id) {
  const r = verifyBatch(id, me.name);
  let html = statusAlert(r);
  if (r.batch) {
    const b = r.batch;
    const canReport = b.status === "Genuine" && b.currentHolder === me.name;
    html += '<div class="d-grid gap-3 mt-3"><div>' + batchFacts(b) + "</div>" +
      '<div><h2 class="pt-section-label">Custody chain · oldest first</h2>' + renderTimeline(b) + "</div>" +
      (canReport ? '<div><button class="btn btn-outline-danger btn-sm" type="button" id="reportBtn">Report suspicious batch</button>' +
        '<span class="small text-body-secondary ms-2">Use this if the pack, seal or tablets look wrong.</span></div>' : "") + "</div>";
  }
  resultBox.innerHTML = html;
  const rb = document.getElementById("reportBtn");
  if (rb) rb.addEventListener("click", function () { openReportModal(r.batch, me, function () { showResult(r.batch.batchId); render(); }); });
  audit(me.name, me.role, "Verified batch: " + r.title, r.batch ? r.batch.batchId : String(id));
}

document.getElementById("searchForm").addEventListener("submit", function (e) {
  e.preventDefault();
  showResult(input.value);
});
// Barcode scanners type the code and press Enter, so the form submit above handles them too.
input.addEventListener("input", function () {
  const digits = input.value.replace(/\D/g, "").slice(0, 12);
  input.value = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
});
resultBox.addEventListener("click", function (e) {
  const t = e.target.closest("[data-try]");
  if (t) { input.value = fmtId(t.dataset.try); showResult(t.dataset.try); }
});
document.getElementById("scanBtn").addEventListener("click", function () {
  openScanner(function (id) { input.value = fmtId(id); showResult(id); });
});

function render() {
  const inc = getShipments().filter(function (s) { return s.to === me.name && s.status !== "Delivered" && s.status !== "Halted"; });
  document.getElementById("incoming").innerHTML = inc.length ? inc.map(function (s) {
    const b = getBatch(s.batchId);
    return '<tr data-ship="' + s.shipmentId + '"><td class="pt-serial">' + esc(s.shipmentId) + "</td><td>" + esc(b.drugName) +
      '<span class="pt-sub">' + serial(b.batchId) + "</span></td><td>" + esc(s.from) + "</td><td>" + shipmentBadge(s) + "</td>" +
      '<td><button class="btn btn-sm btn-primary" data-act="receive">Verify &amp; receive</button></td></tr>';
  }).join("") : emptyRow(5, "No deliveries on the way.");

  const shelf = getBatches().filter(function (b) { return b.currentHolder === me.name && !activeShipmentFor(b.batchId); });
  document.getElementById("stock").innerHTML = shelf.length ? shelf.map(function (b) {
    return '<tr><td>' + serial(b.batchId) + "</td><td>" + esc(b.drugName) + "</td><td>" + fmtDay(b.expiryDate) + expiryChip(b) + "</td><td>" + statusBadge(b.status) +
      '</td><td><button class="btn btn-sm btn-outline-primary" data-verify="' + b.batchId + '">Verify</button></td></tr>';
  }).join("") : emptyRow(5, "No stock yet. Received deliveries appear here.");
}

document.getElementById("incoming").addEventListener("click", function (e) {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.closest("tr").dataset.ship;
  openReceiveModal(getShipments().find(function (s) { return s.shipmentId === id; }), me, render);
});
document.getElementById("stock").addEventListener("click", function (e) {
  const btn = e.target.closest("[data-verify]");
  if (!btn) return;
  input.value = fmtId(btn.dataset.verify);
  showResult(btn.dataset.verify);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

render();
