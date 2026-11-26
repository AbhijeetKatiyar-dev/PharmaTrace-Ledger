/* actions.js — the business actions shared by several pages.
   Every action: checks the role, validates input, appends to the ledger,
   saves, writes the audit log and notifies the people involved. */

function opt(value, label, selected) {
  return '<option value="' + esc(value) + '"' + (selected ? " selected" : "") + ">" + esc(label) + "</option>";
}
function todayIso() { return new Date().toISOString().slice(0, 10); }
function localDateTime(ms) {
  const d = new Date(ms), p = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}

// ---------- Manufacturer: register a new batch ----------
function openRegisterModal(user, onDone) {
  const newId = nextBatchId();
  const exp = new Date(); exp.setFullYear(exp.getFullYear() + 2);
  openModal({
    title: "Register new batch", confirmText: "Register batch",
    body:
      '<div class="row g-3">' +
      '<div class="col-12"><label class="form-label" for="rBatch">Batch ID (assigned automatically)</label>' +
      '<input class="form-control pt-mono-input" id="rBatch" value="' + newId + '" readonly></div>' +
      '<div class="col-sm-8"><label class="form-label" for="rDrug">Drug name and strength</label>' +
      '<input class="form-control" id="rDrug" placeholder="e.g. Paracetamol 500mg" required></div>' +
      '<div class="col-sm-4"><label class="form-label" for="rQty">Quantity (units)</label>' +
      '<input class="form-control" id="rQty" type="number" min="1" step="1" placeholder="10000" required></div>' +
      '<div class="col-sm-6"><label class="form-label" for="rMfg">Manufacture date</label>' +
      '<input class="form-control" id="rMfg" type="date" value="' + todayIso() + '" max="' + todayIso() + '" required></div>' +
      '<div class="col-sm-6"><label class="form-label" for="rExp">Expiry date</label>' +
      '<input class="form-control" id="rExp" type="date" value="' + exp.toISOString().slice(0, 10) + '" required></div>' +
      '<div class="col-12"><label class="form-label" for="rLoc">Factory location</label>' +
      '<input class="form-control" id="rLoc" value="' + esc(user.location) + '" required></div></div>',
    onConfirm: function (body) {
      if (!canDo(user, "manufacturer")) return false;
      const drug = fieldValue(body, "rDrug"), qty = Number(fieldValue(body, "rQty"));
      const mfg = fieldValue(body, "rMfg"), expD = fieldValue(body, "rExp"), loc = fieldValue(body, "rLoc");
      if (!drug || !qty || !mfg || !expD || !loc) return "Fill in every field.";
      if (qty < 1 || !Number.isInteger(qty)) return "Quantity must be a whole number above 0.";
      if (expD <= mfg) return "Expiry date must be after the manufacture date.";
      if (getBatch(newId)) return "Batch ID " + fmtId(newId) + " already exists. Close and try again.";
      const batch = { batchId: newId, drugName: drug, manufacturer: user.name, quantity: qty,
        mfgDate: mfg, expiryDate: expD, status: "Genuine", currentHolder: user.name, history: [] };
      appendEntry(batch, { location: loc, actor: user.name, status: "Manufactured · " + qty + " units" });
      updateBatch(batch);
      audit(user.name, user.role, "Registered batch " + drug, newId);
      toast("Batch " + fmtId(newId) + " registered");
      if (onDone) onDone();
      showQr(newId);
    }
  });
}

// ---------- Dispatch / forward to a destination ----------
function openDispatchModal(batch, user, onDone) {
  const destinations = getUsers().filter(function (u) {
    return (u.role === "manager" || u.role === "pharmacist") && u.name !== user.name;
  });
  openModal({
    title: "Dispatch " + batch.drugName, confirmText: "Dispatch shipment",
    body:
      '<p class="small text-body-secondary mb-3">Batch ' + serial(batch.batchId) + '. The destination will be notified to verify the seal and quantity when the shipment arrives.</p>' +
      '<div class="row g-3">' +
      '<div class="col-12"><label class="form-label" for="dTo">Destination</label><select class="form-select" id="dTo"><option value="">Choose a hub or pharmacy</option>' +
      destinations.map(function (u) { return opt(u.name, u.name + " · " + u.location); }).join("") + "</select></div>" +
      '<div class="col-sm-6"><label class="form-label" for="dEta">Expected arrival</label><input class="form-control" type="datetime-local" id="dEta" value="' + localDateTime(Date.now() + 8 * 3600000) + '"></div>' +
      '<div class="col-sm-6"><label class="form-label" for="dSeal">Seal number on the carton</label><input class="form-control pt-mono-input" id="dSeal" value="' + randomSeal() + '"></div>' +
      '<div class="col-sm-6"><label class="form-label" for="dQty">Quantity loaded</label><input class="form-control" type="number" id="dQty" value="' + batch.quantity + '"></div></div>',
    onConfirm: function (body) {
      if (user.role !== "manufacturer" && user.role !== "manager") { toast("Unauthorized action for your role.", "bad"); return false; }
      const fresh = getBatch(batch.batchId);
      if (fresh.status !== "Genuine") return "Only Genuine batches can be dispatched. This batch is " + fresh.status + ".";
      if (isExpired(fresh)) return "This batch has expired and cannot be dispatched.";
      if (fresh.currentHolder !== user.name) return "You can only dispatch batches you currently hold.";
      if (activeShipmentFor(fresh.batchId)) return "This batch already has an active shipment.";
      const to = fieldValue(body, "dTo"), eta = fieldValue(body, "dEta");
      const seal = fieldValue(body, "dSeal"), qty = Number(fieldValue(body, "dQty"));
      if (!to || !eta || !seal || !fieldValue(body, "dQty")) return "Fill in every field.";
      if (new Date(eta) <= new Date()) return "Expected arrival must be in the future.";
      if (qty !== Number(fresh.quantity)) return "Quantity loaded must match the batch quantity (" + fresh.quantity + ").";
      const s = { shipmentId: nextShipmentId(), batchId: fresh.batchId, from: user.name, to: to,
        sealNumber: seal, quantity: qty, expectedArrival: new Date(eta).toISOString(),
        status: "In Transit", createdAt: new Date().toISOString() };
      appendEntry(fresh, { location: user.location, actor: user.name,
        status: "Dispatched to " + to + " · Shipment " + s.shipmentId + " · Seal " + seal + " · Qty " + qty });
      updateBatch(fresh);
      updateShipment(s);
      notify(to, "Shipment " + s.shipmentId + " (" + fresh.drugName + ") has been dispatched from " + user.name + ". Verify the seal and quantity when it arrives.");
      audit(user.name, user.role, "Dispatched " + s.shipmentId + " to " + to, fresh.batchId);
      toast("Shipment dispatched. " + to + " has been notified.");
      if (onDone) onDone();
    }
  });
}

// ---------- Recall (manufacturer or regulator) ----------
function openRecallModal(batch, user, onDone) {
  openModal({
    title: "Recall " + batch.drugName, confirmText: "Recall batch", danger: true,
    body:
      '<p>Batch ' + serial(batch.batchId) + '. Every pharmacist and patient who checks this ID will see <strong>Recalled: do not dispense</strong>.</p>' +
      '<label class="form-label" for="rcReason">Reason for recall</label>' +
      '<input class="form-control" id="rcReason" placeholder="e.g. Contamination found in QC retest">' +
      '<div class="form-check mt-3"><input class="form-check-input" type="checkbox" id="rcConfirm">' +
      '<label class="form-check-label" for="rcConfirm">I understand a recall cannot be undone.</label></div>',
    onConfirm: function (body) {
      if (user.role !== "manufacturer" && user.role !== "regulator") { toast("Unauthorized action for your role.", "bad"); return false; }
      const reason = fieldValue(body, "rcReason");
      if (!reason) return "Enter a reason for the recall.";
      if (!body.querySelector("#rcConfirm").checked) return "Tick the box to confirm the recall.";
      const fresh = getBatch(batch.batchId);
      fresh.status = "Recalled";
      appendEntry(fresh, { location: user.location, actor: user.name, status: "Recalled – " + reason });
      updateBatch(fresh);
      const impact = impactList(fresh);
      notify(impact.concat(["Drug Control Office", fresh.manufacturer]).filter(function (n) { return n !== user.name; }),
        "Recall: " + fresh.drugName + " (" + fmtId(fresh.batchId) + ") – " + reason + ". Stop all movement and do not dispense.");
      audit(user.name, user.role, "Recalled batch – " + reason, fresh.batchId);
      toast("Batch recalled. " + impact.length + " locations notified.", "bad");
      if (onDone) onDone();
      showImpact(fresh.batchId);
    }
  });
}

function showImpact(batchId) {
  const b = getBatch(batchId);
  const list = impactList(b);
  const active = activeShipmentFor(batchId);
  openModal({
    title: "Recall impact · " + b.drugName, confirmText: null,
    body: '<p>Every hub and pharmacy that held batch ' + serial(b.batchId) + " has been notified:</p>" +
      (list.length ? '<ul class="pt-impact">' + list.map(function (n) {
        const u = getUser(n);
        return "<li><strong>" + esc(n) + "</strong><span>" + esc(u ? u.location : "") + (n === b.currentHolder ? " · holds it now" : "") + "</span></li>";
      }).join("") + "</ul>" : '<p class="text-body-secondary">The batch never left the factory, so no other location is affected.</p>') +
      (active ? '<p class="pt-note pt-note--warn">Shipment ' + esc(active.shipmentId) + " is still " + esc(active.status.toLowerCase()) + " on its way to " + esc(active.to) + ". Contact the receiving location and transport provider before moving the batch.</p>" : "")
  });
}

// ---------- Receive a shipment (hub or pharmacy) ----------
function openReceiveModal(shipment, user, onDone) {
  const b = getBatch(shipment.batchId);
  openModal({
    title: "Receive " + shipment.shipmentId, confirmText: "Confirm receipt",
    body:
      '<p class="small text-body-secondary">' + esc(b.drugName) + " · batch " + serial(b.batchId) + " · from " + esc(shipment.from) + " · expected " + esc(fmtDate(shipment.expectedArrival)) + "</p>" +
      '<p class="pt-note">Confirm the shipment has arrived. Check the carton yourself and enter what you <strong>see</strong>, not what is on the paperwork.</p>' +
      '<div class="row g-3"><div class="col-sm-6"><label class="form-label" for="rcSeal">Seal number on the carton</label>' +
      '<input class="form-control pt-mono-input" id="rcSeal" placeholder="S-00000"></div>' +
      '<div class="col-sm-6"><label class="form-label" for="rcQty">Units counted</label>' +
      '<input class="form-control" type="number" id="rcQty" placeholder="' + shipment.quantity + '"></div>' +
      '<div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" id="rcIntact" checked>' +
      '<label class="form-check-label" for="rcIntact">Seal is intact and unbroken</label></div></div></div>',
    onConfirm: function (body) {
      if (user.role !== "manager" && user.role !== "pharmacist") { toast("Unauthorized action for your role.", "bad"); return false; }
      if (shipment.to !== user.name) return "This shipment is addressed to " + shipment.to + ".";
      const latestShipment = getShipments().find(function (item) { return item.shipmentId === shipment.shipmentId; });
      if (!latestShipment || latestShipment.status === "Delivered" || latestShipment.status === "Halted") return "This shipment is no longer awaiting receipt.";
      const seal = fieldValue(body, "rcSeal").toUpperCase(), qty = Number(fieldValue(body, "rcQty"));
      const intact = body.querySelector("#rcIntact").checked;
      if (!seal || !fieldValue(body, "rcQty")) return "Enter the seal number and the units you counted.";
      const problems = [];
      if (seal !== shipment.sealNumber.toUpperCase()) problems.push("seal mismatch (expected " + shipment.sealNumber + ", found " + seal + ")");
      if (!intact) problems.push("seal broken");
      if (qty !== Number(shipment.quantity)) problems.push("quantity mismatch (expected " + shipment.quantity + ", counted " + qty + ")");
      const fresh = getBatch(shipment.batchId);
      shipment.status = "Delivered";
      shipment.receivedAt = new Date().toISOString();
      fresh.currentHolder = user.name;
      if (problems.length) {
        fresh.status = "Under Review";
        appendEntry(fresh, { location: user.location, actor: user.name, status: "Received with discrepancy – " + problems.join("; ") });
        const reports = getReports();
        reports.unshift({ batchId: fresh.batchId, by: user.name, reason: "Receipt check failed", note: problems.join("; "), time: new Date().toISOString() });
        saveReports(reports);
        notify(["Drug Control Office", fresh.manufacturer, shipment.from], "Under review: " + fresh.drugName + " (" + fmtId(fresh.batchId) + ") received at " + user.name + " with " + problems.join("; ") + ".");
        audit(user.name, user.role, "Receipt check failed: " + problems.join("; "), fresh.batchId);
        toast("Discrepancy recorded. Batch moved to Under Review.", "warn");
      } else {
        appendEntry(fresh, { location: user.location, actor: user.name, status: "Received at " + user.name + " · seal ✔ quantity ✔" });
        audit(user.name, user.role, "Received " + shipment.shipmentId, fresh.batchId);
        toast("Received. All checks passed.");
      }
      updateBatch(fresh);
      updateShipment(shipment);
      if (onDone) onDone();
    }
  });
}

// ---------- Report a suspicious batch ----------
function openReportModal(batch, user, onDone) {
  openModal({
    title: "Report suspicious batch", confirmText: "Send report", danger: true,
    body:
      '<p>Batch ' + serial(batch.batchId) + " · " + esc(batch.drugName) + ". The batch will move to <strong>Under Review</strong> until the regulator decides.</p>" +
      '<label class="form-label" for="rpReason">What looks wrong?</label><select class="form-select" id="rpReason">' +
      opt("", "Choose a reason") + opt("Packaging looks wrong", "Packaging looks wrong (print, colour, font)") +
      opt("Seal broken or tampered", "Seal broken or tampered") + opt("Tablets look different", "Tablets look different") +
      opt("Patient reported a reaction", "Patient reported a reaction") + opt("Other", "Other") + "</select>" +
      '<label class="form-label mt-3" for="rpNote">Details</label><textarea class="form-control" id="rpNote" rows="3" placeholder="What did you notice?"></textarea>',
    onConfirm: function (body) {
      if (user.role !== "manager" && user.role !== "pharmacist") { toast("Unauthorized action for your role.", "bad"); return false; }
      const reason = fieldValue(body, "rpReason"), note = fieldValue(body, "rpNote");
      if (!reason) return "Choose a reason.";
      if (!note) return "Add a short description so the regulator can investigate.";
      const fresh = getBatch(batch.batchId);
      if (fresh.status === "Genuine") fresh.status = "Under Review";
      appendEntry(fresh, { location: user.location, actor: user.name, status: "Reported suspicious – " + note });
      updateBatch(fresh);
      const reports = getReports();
      reports.unshift({ batchId: fresh.batchId, by: user.name, reason: reason, note: note, time: new Date().toISOString() });
      saveReports(reports);
      notify(["Drug Control Office", fresh.manufacturer], "Suspicious batch reported by " + user.name + ": " + fresh.drugName + " (" + fmtId(fresh.batchId) + ") – " + reason + ".");
      audit(user.name, user.role, "Reported suspicious – " + reason, fresh.batchId);
      toast("Report sent to the regulator.", "warn");
      if (onDone) onDone();
    }
  });
}

// ---------- Ledger Entry Modal (Supply Manager) ----------
function openAddEntryModal(batch, user, onDone) {
  openModal({
    title: "Add custody entry", confirmText: "Append to ledger",
    body:
      '<p class="small text-body-secondary">Batch ' + serial(batch.batchId) + " · " + esc(batch.drugName) + ". Entries are append-only and cannot be edited later.</p>" +
      '<div class="row g-3"><div class="col-sm-6"><label class="form-label" for="aeLoc">Location</label><input class="form-control" id="aeLoc" value="' + esc(user.location) + '"></div>' +
      '<div class="col-sm-6"><label class="form-label" for="aeActor">Actor</label><input class="form-control" id="aeActor" value="' + esc(user.name) + '" readonly></div>' +
      '<div class="col-12"><label class="form-label" for="aeEvent">Event</label><select class="form-select" id="aeEvent">' +
      opt("", "Choose an event") + opt("Stored in cold room (2–8 °C)", "Stored in cold room (2–8 °C)") + opt("Stored in ambient rack", "Stored in ambient rack") +
      opt("Quality inspection passed", "Quality inspection passed") + opt("Moved to dispatch bay", "Moved to dispatch bay") + opt("custom", "Other (type below)") + "</select></div>" +
      '<div class="col-12"><label class="form-label" for="aeCustom">Custom event</label><input class="form-control" id="aeCustom" placeholder="Only if you chose Other"></div></div>',
    onConfirm: function (body) {
      if (!canDo(user, "manager")) return false;
      let ev = fieldValue(body, "aeEvent");
      if (ev === "custom") ev = fieldValue(body, "aeCustom");
      const loc = fieldValue(body, "aeLoc");
      if (!ev || !loc) return "Choose an event and a location.";
      const fresh = getBatch(batch.batchId);
      if (fresh.currentHolder !== user.name) return "You can only add entries for batches you hold.";
      appendEntry(fresh, { location: loc, actor: user.name, status: ev });
      updateBatch(fresh);
      audit(user.name, user.role, "Ledger entry: " + ev, fresh.batchId);
      toast("Entry appended to the ledger.");
      if (onDone) onDone();
    }
  });
}
