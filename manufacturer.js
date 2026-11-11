/* manufacturer.js — Manufacturer Dashboard */

const me = requireRole("manufacturer");
renderNav(me, "Manufacturer Dashboard");
document.getElementById("pageTitle").textContent = me.name + " · batches";

function myBatches() {
  return getBatches().filter(function (b) { return b.manufacturer === me.name; })
    .sort(function (a, b) { return b.batchId.localeCompare(a.batchId); });
}

function whereNow(b) {
  const s = activeShipmentFor(b.batchId);
  if (s) return "On the road to " + esc(s.to) + '<span class="pt-sub">' + esc(s.shipmentId) + " · " + esc(s.driver) + "</span>";
  if (b.currentHolder === me.name) return "At factory";
  return esc(b.currentHolder);
}

function renderStats(list) {
  const count = function (fn) { return list.filter(fn).length; };
  const tiles = [
    ["Total batches", list.length, "info"],
    ["At factory", count(function (b) { return b.currentHolder === me.name && !activeShipmentFor(b.batchId); }), "info"],
    ["On the road", count(function (b) { return !!activeShipmentFor(b.batchId); }), "info"],
    ["Under review", count(function (b) { return b.status === "Under Review"; }), "warn"],
    ["Recalled", count(function (b) { return b.status === "Recalled"; }), "bad"]
  ];
  document.getElementById("stats").innerHTML = tiles.map(function (t) {
    return '<div class="pt-stat pt-stat--' + t[2] + '"><p class="pt-stat__label">' + t[0] + '</p><p class="pt-stat__value">' + t[1] + "</p></div>";
  }).join("");
}

function actionsFor(b) {
  const a = ['<button class="btn btn-outline-secondary" data-act="view">View</button>',
    '<button class="btn btn-outline-secondary" data-act="qr">QR</button>'];
  const canDispatch = b.status === "Genuine" && !isExpired(b) && b.currentHolder === me.name && !activeShipmentFor(b.batchId);
  if (canDispatch) a.push('<button class="btn btn-outline-primary" data-act="dispatch">Dispatch</button>');
  if (b.status === "Genuine" || b.status === "Under Review") a.push('<button class="btn btn-outline-danger" data-act="recall">Recall</button>');
  if (b.status === "Recalled") a.push('<button class="btn btn-outline-danger" data-act="impact">Impact list</button>');
  return '<div class="pt-actions">' + a.join("") + "</div>";
}

function render() {
  const all = myBatches();
  renderStats(all);
  const q = document.getElementById("search").value;
  const f = document.getElementById("filter").value;
  const list = all.filter(function (b) { return matchesSearch(b, q) && matchesFilter(b, f); });
  document.getElementById("rows").innerHTML = list.length ? list.map(function (b) {
    return '<tr data-id="' + b.batchId + '">' +
      "<td>" + serial(b.batchId) + "</td>" +
      "<td>" + esc(b.drugName) + "</td>" +
      "<td>" + Number(b.quantity).toLocaleString("en-IN") + "</td>" +
      "<td>" + fmtDay(b.expiryDate) + expiryChip(b) + "</td>" +
      "<td>" + whereNow(b) + "</td>" +
      "<td>" + statusBadge(b.status) + "</td>" +
      "<td>" + actionsFor(b) + "</td></tr>";
  }).join("") : emptyRow(7, "No batches match. Register a batch or clear the filters.");
}

document.getElementById("rows").addEventListener("click", function (e) {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const b = getBatch(btn.closest("tr").dataset.id);
  const act = btn.dataset.act;
  if (act === "view") viewBatch(b.batchId);
  if (act === "qr") showQr(b.batchId);
  if (act === "dispatch") openDispatchModal(b, me, render);
  if (act === "recall") openRecallModal(b, me, render);
  if (act === "impact") showImpact(b.batchId);
});
document.getElementById("registerBtn").addEventListener("click", function () { openRegisterModal(me, render); });
document.getElementById("search").addEventListener("input", render);
document.getElementById("filter").addEventListener("change", render);
document.getElementById("csvBtn").addEventListener("click", function () { exportLedgerCsv(myBatches(), "ledger-" + me.name.replace(/\s+/g, "-").toLowerCase() + ".csv"); });

render();
