/* manager.js — Supply Manager (hub) dashboard */

const me = requireRole("manager");
renderNav(me, "Manager Dashboard");
document.getElementById("pageTitle").textContent = me.name;

function incoming() {
  return getShipments().filter(function (s) { return s.to === me.name && s.status !== "Delivered" && s.status !== "Halted"; });
}
function outgoing() {
  return getShipments().filter(function (s) { return s.from === me.name; }).reverse();
}
function stock() {
  return getBatches().filter(function (b) { return b.currentHolder === me.name && !activeShipmentFor(b.batchId); });
}

function renderStats() {
  const st = stock();
  const tiles = [
    ["Incoming", incoming().length, "info"],
    ["In stock", st.length, "info"],
    ["Expiring ≤ 30 days", st.filter(function (b) { return daysToExpiry(b) >= 0 && daysToExpiry(b) <= 30; }).length, "warn"],
    ["Under review or recalled", st.filter(function (b) { return b.status !== "Genuine"; }).length, "bad"]
  ];
  document.getElementById("stats").innerHTML = tiles.map(function (t) {
    return '<div class="pt-stat pt-stat--' + t[2] + '"><p class="pt-stat__label">' + t[0] + '</p><p class="pt-stat__value">' + t[1] + "</p></div>";
  }).join("");
}

function render() {
  renderStats();

  const inc = incoming();
  document.getElementById("incoming").innerHTML = inc.length ? inc.map(function (s) {
    const b = getBatch(s.batchId);
    return '<tr data-ship="' + s.shipmentId + '"><td class="pt-serial">' + esc(s.shipmentId) + "</td>" +
      "<td>" + esc(b.drugName) + '<span class="pt-sub">' + serial(b.batchId) + "</span></td>" +
      "<td>" + esc(s.from) + "</td>" +
      "<td>" + esc(fmtDate(s.expectedArrival)) + "</td><td>" + shipmentBadge(s) + "</td>" +
      '<td><button class="btn btn-sm btn-primary" data-act="receive">Verify &amp; receive</button></td></tr>';
  }).join("") : emptyRow(6, "Nothing on its way to this hub.");

  const q = document.getElementById("search").value, f = document.getElementById("filter").value;
  const list = stock().filter(function (b) { return matchesSearch(b, q) && matchesFilter(b, f); })
    .sort(function (a, b) { return daysToExpiry(a) - daysToExpiry(b); });
  document.getElementById("stock").innerHTML = list.length ? list.map(function (b) {
    const ok = b.status === "Genuine" && !isExpired(b);
    return '<tr data-id="' + b.batchId + '"><td>' + serial(b.batchId) + "</td><td>" + esc(b.drugName) + "</td><td>" + esc(b.manufacturer) + "</td>" +
      "<td>" + fmtDay(b.expiryDate) + expiryChip(b) + "</td><td>" + statusBadge(b.status) + "</td>" +
      '<td><div class="pt-actions"><button class="btn btn-outline-secondary" data-act="view">View</button>' +
      (ok ? '<button class="btn btn-outline-secondary" data-act="entry">Add entry</button><button class="btn btn-outline-primary" data-act="forward">Forward</button>' : "") +
      (b.status === "Genuine" ? '<button class="btn btn-outline-danger" data-act="report">Report</button>' : "") +
      "</div></td></tr>";
  }).join("") : emptyRow(6, "No stock matches. Received shipments appear here.");

  const out = outgoing();
  document.getElementById("outgoing").innerHTML = out.length ? out.map(function (s) {
    const b = getBatch(s.batchId);
    return '<tr><td class="pt-serial">' + esc(s.shipmentId) + "</td><td>" + esc(b.drugName) + "</td><td>" + esc(s.to) + "</td><td>" + shipmentBadge(s) + "</td></tr>";
  }).join("") : emptyRow(4, "Nothing sent from this hub yet.");
}

document.getElementById("incoming").addEventListener("click", function (e) {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.closest("tr").dataset.ship;
  openReceiveModal(getShipments().find(function (s) { return s.shipmentId === id; }), me, render);
});
document.getElementById("stock").addEventListener("click", function (e) {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const b = getBatch(btn.closest("tr").dataset.id);
  if (btn.dataset.act === "view") viewBatch(b.batchId);
  if (btn.dataset.act === "entry") openAddEntryModal(b, me, render);
  if (btn.dataset.act === "forward") openDispatchModal(b, me, render);
  if (btn.dataset.act === "report") openReportModal(b, me, render);
});
document.getElementById("search").addEventListener("input", render);
document.getElementById("filter").addEventListener("change", render);
document.getElementById("csvBtn").addEventListener("click", function () { exportLedgerCsv(stock(), "ledger-" + me.name.replace(/\s+/g, "-").toLowerCase() + ".csv"); });

render();
