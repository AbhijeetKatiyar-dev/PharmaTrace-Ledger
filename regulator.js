/* regulator.js — Regulator console: decide on flagged batches, watch shipments, read the audit log */

const me = requireRole("regulator");
renderNav(me, "Regulator Console");

function latestReport(batchId) {
  return getReports().find(function (r) { return r.batchId === batchId; });
}

function decide(batch, decision) {
  const labels = {
    clear: { title: "Clear " + batch.drugName, btn: "Clear batch", danger: false, help: "The batch returns to Genuine and can be dispensed again." },
    counterfeit: { title: "Mark " + batch.drugName + " counterfeit", btn: "Mark counterfeit", danger: true, help: "Every check of this ID will show Counterfeit. Everyone who held it is notified." }
  };
  const l = labels[decision];
  openModal({
    title: l.title, confirmText: l.btn, danger: l.danger,
    body: "<p>" + esc(l.help) + "</p>" +
      '<label class="form-label" for="decNote">Finding (recorded in the ledger)</label>' +
      '<input class="form-control" id="decNote" placeholder="' + (decision === "clear" ? "e.g. Seal number typo confirmed with hub" : "e.g. Lab test: no active ingredient") + '">',
    onConfirm: function (body) {
      if (!canDo(me, "regulator")) return false;
      const note = fieldValue(body, "decNote");
      if (!note) return "Record your finding before deciding.";
      const fresh = getBatch(batch.batchId);
      if (decision === "clear") {
        fresh.status = "Genuine";
        appendEntry(fresh, { location: me.location, actor: me.name, status: "Cleared by regulator – " + note });
        notify([fresh.manufacturer, fresh.currentHolder], "Cleared: " + fresh.drugName + " (" + fmtId(fresh.batchId) + ") – " + note + ".");
        toast("Batch cleared.");
      } else {
        fresh.status = "Counterfeit";
        appendEntry(fresh, { location: me.location, actor: me.name, status: "Marked counterfeit – " + note });
        notify(impactList(fresh).concat([fresh.manufacturer]), "Counterfeit: " + fresh.drugName + " (" + fmtId(fresh.batchId) + ") – " + note + ". Quarantine all packs.");
        toast("Batch marked counterfeit.", "bad");
      }
      updateBatch(fresh);
      audit(me.name, me.role, (decision === "clear" ? "Cleared – " : "Marked counterfeit – ") + note, fresh.batchId);
      render();
    }
  });
}

function render() {
  const batches = getBatches();
  const ships = getShipments();
  const tampered = batches.filter(function (b) { return !verifyChain(b).ok; });
  const tiles = [
    ["Under review", batches.filter(function (b) { return b.status === "Under Review"; }).length, "warn"],
    ["Recalled", batches.filter(function (b) { return b.status === "Recalled"; }).length, "bad"],
    ["Counterfeit", batches.filter(function (b) { return b.status === "Counterfeit"; }).length, "bad"],
    ["Delayed shipments", ships.filter(isDelayed).length, "warn"],
    ["Tampered ledgers", tampered.length, tampered.length ? "bad" : "ok"]
  ];
  document.getElementById("stats").innerHTML = tiles.map(function (t) {
    return '<div class="pt-stat pt-stat--' + t[2] + '"><p class="pt-stat__label">' + t[0] + '</p><p class="pt-stat__value">' + t[1] + "</p></div>";
  }).join("");

  // Review queue: Under Review batches plus any batch whose hash chain is broken
  const queue = batches.filter(function (b) { return b.status === "Under Review" || !verifyChain(b).ok; });
  document.getElementById("queue").innerHTML = queue.length ? queue.map(function (b) {
    const r = latestReport(b.batchId);
    const broken = !verifyChain(b).ok;
    const why = broken ? "Ledger hash chain broken at entry " + (verifyChain(b).index + 1) : (r ? r.reason + " – " + r.note : latestFlag(b));
    return '<div class="pt-review__item" data-id="' + b.batchId + '"><div><h3>' + esc(b.drugName) + " · " + serial(b.batchId) + "</h3>" +
      "<p>" + esc(why) + "</p><p>Raised by " + esc(r ? r.by : "system") + " · held by " + esc(b.currentHolder) + " · " + statusBadge(b.status) + "</p></div>" +
      '<div class="pt-actions"><button class="btn btn-outline-secondary" data-act="view">View ledger</button>' +
      (broken ? "" : '<button class="btn btn-outline-primary" data-act="clear">Clear</button>') +
      '<button class="btn btn-outline-danger" data-act="recall">Recall</button>' +
      '<button class="btn btn-danger" data-act="counterfeit">Counterfeit</button></div></div>';
  }).join("") : '<div class="pt-panel pt-empty"><p>Nothing to review. Flagged batches appear here automatically.</p></div>';

  const q = document.getElementById("search").value, f = document.getElementById("filter").value;
  document.getElementById("batches").innerHTML = batches.filter(function (b) { return matchesSearch(b, q) && matchesFilter(b, f); }).map(function (b) {
    const ok = verifyChain(b).ok;
    return '<tr data-id="' + b.batchId + '"><td>' + serial(b.batchId) + "</td><td>" + esc(b.drugName) + "</td><td>" + esc(b.manufacturer) + "</td><td>" + esc(b.currentHolder) + "</td>" +
      "<td>" + statusBadge(b.status) + expiryChip(b) + "</td><td>" + (ok ? '<span class="pt-badge pt-badge--ok">✔ intact</span>' : '<span class="pt-badge pt-badge--bad">✖ tampered</span>') + "</td>" +
      '<td><div class="pt-actions"><button class="btn btn-outline-secondary" data-act="view">View</button>' +
      (b.status === "Genuine" ? '<button class="btn btn-outline-danger" data-act="recall">Recall</button>' : "") + "</div></td></tr>";
  }).join("") || emptyRow(7, "No batches match.");

  document.getElementById("shipments").innerHTML = ships.slice().reverse().map(function (s) {
    const b = getBatch(s.batchId);
    return '<tr><td class="pt-serial">' + esc(s.shipmentId) + "</td><td>" + esc(b.drugName) + "</td><td>" + esc(s.from) + " → " + esc(s.to) + "</td><td>" + esc(fmtDate(s.expectedArrival)) + "</td><td>" + shipmentBadge(s) + "</td></tr>";
  }).join("") || emptyRow(5, "No shipments yet.");

  document.getElementById("reports").innerHTML = getReports().map(function (r) {
    return "<tr><td>" + esc(fmtDate(r.time)) + "</td><td>" + serial(r.batchId) + "</td><td>" + esc(r.by) + "</td><td>" + esc(r.reason) + "</td><td>" + esc(r.note) + "</td></tr>";
  }).join("") || emptyRow(5, "No reports filed.");

  document.getElementById("audit").innerHTML = getAudit().slice(0, 200).map(function (a) {
    return "<tr><td>" + esc(fmtDate(a.time)) + "</td><td>" + esc(a.who) + "</td><td>" + esc(a.role) + "</td><td>" + esc(a.action) + "</td><td>" + (a.batchId ? serial(a.batchId) : "") + "</td></tr>";
  }).join("") || emptyRow(5, "No activity yet.");
}

function handle(e) {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const b = getBatch(btn.closest("[data-id]").dataset.id);
  const act = btn.dataset.act;
  if (act === "view") viewBatch(b.batchId);
  if (act === "clear") decide(b, "clear");
  if (act === "counterfeit") decide(b, "counterfeit");
  if (act === "recall") openRecallModal(b, me, render);
}
document.getElementById("queue").addEventListener("click", handle);
document.getElementById("batches").addEventListener("click", handle);
document.getElementById("search").addEventListener("input", render);
document.getElementById("filter").addEventListener("change", render);
document.getElementById("csvBtn").addEventListener("click", function () { exportLedgerCsv(getBatches(), "ledger-all-batches.csv"); });

render();
