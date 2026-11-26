/* data.js
   All data lives in the browser's localStorage as JSON text.
   On the very first visit we seed realistic sample data. */

const KEYS = {
  batches: "pt_batches",
  shipments: "pt_shipments",
  users: "pt_users",
  notifications: "pt_notifications",
  reports: "pt_reports",
  audit: "pt_auditLog",
  current: "pt_currentUser"
};

// In-memory copy, used if the browser blocks localStorage (e.g. private mode).
const memoryStore = {};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return JSON.parse(raw);
  } catch (e) { /* storage blocked: fall back to memory */ }
  return key in memoryStore ? JSON.parse(memoryStore[key]) : fallback;
}

function save(key, value) {
  const text = JSON.stringify(value);
  memoryStore[key] = text;
  try { localStorage.setItem(key, text); } catch (e) { /* memory copy still works this session */ }
}

// ---------- Getters / setters ----------
function getBatches() { return load(KEYS.batches, []); }
function saveBatches(list) { save(KEYS.batches, list); }
function getBatch(id) { return getBatches().find(function (b) { return b.batchId === id; }); }
function updateBatch(batch) {
  const list = getBatches();
  const i = list.findIndex(function (b) { return b.batchId === batch.batchId; });
  if (i === -1) list.push(batch); else list[i] = batch;
  saveBatches(list);
}

function getShipments() { return load(KEYS.shipments, []); }
function saveShipments(list) { save(KEYS.shipments, list); }
function updateShipment(s) {
  const list = getShipments();
  const i = list.findIndex(function (x) { return x.shipmentId === s.shipmentId; });
  if (i === -1) list.push(s); else list[i] = s;
  saveShipments(list);
}
function activeShipmentFor(batchId) {
  return getShipments().find(function (s) {
    return s.batchId === batchId && s.status !== "Delivered" && s.status !== "Halted";
  });
}
function isDelayed(s) {
  return (s.status === "Assigned" || s.status === "In Transit") && new Date(s.expectedArrival) < new Date();
}

function getUsers() { return load(KEYS.users, []); }
function getUser(name) { return getUsers().find(function (u) { return u.name === name; }); }
function usersByRole(role) { return getUsers().filter(function (u) { return u.role === role; }); }

function getReports() { return load(KEYS.reports, []); }
function saveReports(list) { save(KEYS.reports, list); }
function getAudit() { return load(KEYS.audit, []); }
function getNotifications() { return load(KEYS.notifications, []); }
function saveNotifications(list) { save(KEYS.notifications, list); }

// ---------- Helpers that record activity ----------
function notify(names, message) {
  const list = getNotifications();
  [].concat(names).forEach(function (to) {
    if (to) list.unshift({ id: Date.now() + Math.random(), to: to, message: message, time: new Date().toISOString(), read: false });
  });
  saveNotifications(list.slice(0, 300));
}

function audit(who, role, action, batchId, time) {
  const list = getAudit();
  list.unshift({ who: who, role: role, action: action, batchId: batchId || "", time: time || new Date().toISOString() });
  save(KEYS.audit, list.slice(0, 1000));
}

function nextBatchId() {
  const max = getBatches().reduce(function (m, b) { return Math.max(m, Number(b.batchId)); }, 100000000000);
  return String(max + 1);
}
function nextShipmentId() {
  const n = getShipments().reduce(function (m, s) { return Math.max(m, Number(s.shipmentId.slice(3))); }, 0) + 1;
  return "SH-" + String(n).padStart(4, "0");
}
function randomSeal() { return "S-" + String(Math.floor(10000 + Math.random() * 90000)); }

// ---------- Sample data ----------
function seedData() {
  const DAY = 86400000, HOUR = 3600000, now = Date.now();
  const at = function (days, hours) { return new Date(now + days * DAY + (hours || 0) * HOUR).toISOString(); };
  const day = function (days) { return new Date(now + days * DAY).toISOString().slice(0, 10); };

  const users = [
    { name: "XYZ Pharma", role: "manufacturer", location: "Pune Plant" },
    { name: "Sunrise Labs", role: "manufacturer", location: "Ahmedabad Plant" },
    { name: "ABC Mumbai Hub", role: "manager", location: "Mumbai Hub" },
    { name: "Bengaluru Distribution Hub", role: "manager", location: "Bengaluru Hub" },
    { name: "Apollo Pharmacy", role: "pharmacist", location: "Indiranagar, Bengaluru" },
    { name: "MedPlus Koramangala", role: "pharmacist", location: "Koramangala, Bengaluru" },
    { name: "Drug Control Office", role: "regulator", location: "New Delhi" }
  ];
  save(KEYS.users, users);
  const loc = function (name) { return users.find(function (u) { return u.name === name; }).location; };

  const batches = [], shipments = [], auditLog = [];
  let shipNo = 0;

  function batch(id, drug, mfr, qty, mfgDays, expDays) {
    const b = { batchId: id, drugName: drug, manufacturer: mfr, quantity: qty,
      mfgDate: day(mfgDays), expiryDate: day(expDays), status: "Genuine", currentHolder: mfr, history: [] };
    batches.push(b);
    return b;
  }
  function ev(b, time, actorName, status, location) {
    const e = appendEntry(b, { timestamp: time, actor: actorName, status: status, location: location || loc(actorName) });
    auditLog.unshift({ who: actorName, role: (users.find(function (u) { return u.name === actorName; }) || {}).role || "", action: status, batchId: b.batchId, time: e.timestamp });
  }
  // A sample shipment: dispatch, optional transit checkpoint, arrival, then receiver confirmation.
  function trip(b, startDay, from, to, checkpoint, stage) {
    const s = { shipmentId: "SH-" + String(++shipNo).padStart(4, "0"), batchId: b.batchId, from: from, to: to,
      sealNumber: "S-" + (80000 + shipNo * 1117), quantity: b.quantity,
      expectedArrival: at(startDay, 10), status: "In Transit", createdAt: at(startDay) };
    shipments.push(s);
    ev(b, at(startDay), from, "Dispatched to " + to + " · Shipment " + s.shipmentId + " · Seal " + s.sealNumber + " · Qty " + b.quantity);
    if (stage === "assigned") return s;
    ev(b, at(startDay, 1), "PharmaTrace Logistics", "Shipment collected for transport · seal " + s.sealNumber + " · " + b.quantity + " units recorded", loc(from));
    if (checkpoint) ev(b, at(startDay, 4), "PharmaTrace Logistics", "In transit – checkpoint " + checkpoint, checkpoint);
    if (stage === "transit") return s;
    ev(b, at(startDay, 8), "PharmaTrace Logistics", "Shipment arrived at " + to + " · awaiting receipt verification", loc(to));
    s.status = "Awaiting receipt";
    if (stage === "awaiting") return s;
    ev(b, at(startDay, 9), to, "Received at " + to + " · seal ✔ quantity ✔");
    s.status = "Delivered"; b.currentHolder = to;
    return s;
  }

  let b;
  // 1. Happy path: factory → Mumbai hub → Apollo Pharmacy
  b = batch("100000000001", "Paracetamol 500mg", "XYZ Pharma", 10000, -20, 730);
  ev(b, at(-20), "XYZ Pharma", "Manufactured · 10000 units");
  trip(b, -18, "XYZ Pharma", "ABC Mumbai Hub", "Lonavala");
  trip(b, -10, "ABC Mumbai Hub", "Apollo Pharmacy", "Hubballi");

  // 2. Recalled batch
  b = batch("100000000002", "Amoxicillin 250mg", "XYZ Pharma", 5000, -40, 500);
  ev(b, at(-40), "XYZ Pharma", "Manufactured · 5000 units");
  trip(b, -35, "XYZ Pharma", "ABC Mumbai Hub", "Lonavala");
  ev(b, at(-2), "XYZ Pharma", "Recalled – contamination found in QC retest");
  b.status = "Recalled";

  // 3. Fresh batch still at the factory
  b = batch("100000000003", "Cetirizine 10mg", "Sunrise Labs", 8000, -3, 900);
  ev(b, at(-3), "Sunrise Labs", "Manufactured · 8000 units");

  // 4. In transit and running late (shipment delay alert)
  b = batch("100000000004", "Insulin Glargine 10ml", "XYZ Pharma", 1200, -6, 60);
  ev(b, at(-6), "XYZ Pharma", "Manufactured · 1200 units");
  const s4 = trip(b, -1, "XYZ Pharma", "Bengaluru Distribution Hub", "Kolhapur", "transit");
  s4.expectedArrival = at(0, -2);

  // 5. Near expiry, in stock at Bengaluru hub
  b = batch("100000000005", "Cough Syrup 100ml", "Sunrise Labs", 3000, -330, 20);
  ev(b, at(-330), "Sunrise Labs", "Manufactured · 3000 units");
  trip(b, -300, "Sunrise Labs", "Bengaluru Distribution Hub", "Hubballi");

  // 6. Reported suspicious → Under Review
  b = batch("100000000006", "Azithromycin 500mg", "Sunrise Labs", 4000, -30, 700);
  ev(b, at(-30), "Sunrise Labs", "Manufactured · 4000 units");
  trip(b, -25, "Sunrise Labs", "MedPlus Koramangala", "Belagavi");
  ev(b, at(-1), "MedPlus Koramangala", "Reported suspicious – blurred print on blister foil");
  b.status = "Under Review";

  // 7. Confirmed counterfeit
  b = batch("100000000007", "Ibuprofen 400mg", "XYZ Pharma", 7000, -60, 600);
  ev(b, at(-60), "XYZ Pharma", "Manufactured · 7000 units");
  trip(b, -55, "XYZ Pharma", "Bengaluru Distribution Hub", "Satara");
  ev(b, at(-3), "Drug Control Office", "Marked counterfeit – packs with this ID seized in Hyderabad");
  b.status = "Counterfeit";

  // 8. Dispatched and currently in transit
  b = batch("100000000008", "Metformin 500mg", "XYZ Pharma", 20000, -1, 800);
  ev(b, at(-1), "XYZ Pharma", "Manufactured · 20000 units");
  const s8 = trip(b, 0, "XYZ Pharma", "ABC Mumbai Hub", "", "assigned");
  s8.createdAt = at(0, -1); s8.expectedArrival = at(1);

  // 9. Arrived at Apollo Pharmacy, waiting for the receipt check
  b = batch("100000000009", "Pantoprazole 40mg", "Sunrise Labs", 6000, -15, 400);
  ev(b, at(-15), "Sunrise Labs", "Manufactured · 6000 units");
  trip(b, -1, "Sunrise Labs", "Apollo Pharmacy", "Davanagere", "awaiting");

  saveBatches(batches);
  saveShipments(shipments);
  auditLog.sort(function (a, c) { return c.time < a.time ? -1 : 1; });
  save(KEYS.audit, auditLog);
  saveReports([
    { batchId: "100000000006", by: "MedPlus Koramangala", reason: "Packaging looks wrong", note: "Blurred print on blister foil", time: at(-1) }
  ]);
  save(KEYS.notifications, [
    { id: 1, to: "ABC Mumbai Hub", message: "Shipment " + s8.shipmentId + " (Metformin 500mg) is on its way from XYZ Pharma. Check the seal and quantity when it arrives.", time: at(0, -1), read: false },
    { id: 3, to: "ABC Mumbai Hub", message: "Recall: Amoxicillin 250mg (100000000002) – contamination found in QC retest. Stop all movement.", time: at(-2), read: false },
    { id: 4, to: "Drug Control Office", message: "Suspicious batch reported by MedPlus Koramangala: Azithromycin 500mg (100000000006).", time: at(-1), read: false },
    { id: 5, to: "Bengaluru Distribution Hub", message: "Cough Syrup 100ml (100000000005) expires in 20 days. Move it first.", time: at(0, -3), read: false },
    { id: 6, to: "Bengaluru Distribution Hub", message: "Shipment " + s4.shipmentId + " (Insulin Glargine 10ml) is delayed. Check its status before receiving.", time: at(-1), read: false },
    { id: 7, to: "Apollo Pharmacy", message: "Shipment of Pantoprazole 40mg (100000000009) delivered. Complete the receipt check.", time: at(-1, 8), read: false }
  ]);
}

function resetDemoData() {
  Object.keys(KEYS).forEach(function (k) {
    try { localStorage.removeItem(KEYS[k]); } catch (e) { }
    delete memoryStore[KEYS[k]];
  });
  seedData();
}

// Remove Driver accounts and migrate old shipment records when this updated prototype is opened.
function migrateDriverlessDemo() {
  const users = getUsers().filter(function (u) { return u.role !== "driver"; });
  save(KEYS.users, users);

  // Force a fresh sign-in once after this version removes open role selection.
  // Keep the new account-backed session on subsequent page loads.
  const loginMigrationKey = "pt_fixed_account_login_v1";
  if (!load(loginMigrationKey, false)) {
    try { localStorage.removeItem(KEYS.current); } catch (e) { }
    delete memoryStore[KEYS.current];
    save(loginMigrationKey, true);
  } else {
    const current = load(KEYS.current, null);
    if (current && current.role === "driver") {
      try { localStorage.removeItem(KEYS.current); } catch (e) { }
      delete memoryStore[KEYS.current];
    }
  }

  const shipments = getShipments();
  let changed = false;
  shipments.forEach(function (shipment) {
    if (shipment.status === "Assigned") { shipment.status = "In Transit"; changed = true; }
    ["driver", "vehicle", "pin", "pinAttempts", "pickedUpAt", "deliveredAt"].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(shipment, key)) { delete shipment[key]; changed = true; }
    });
  });
  if (changed) saveShipments(shipments);

  // Older demo versions recorded the courier as the current holder during transit.
  // Restore the dispatching location as the last confirmed holder for active shipments.
  const batches = getBatches();
  let batchesChanged = false;
  batches.forEach(function (batch) {
    if (batch.currentHolder === "Ramesh Patil" || batch.currentHolder === "Imran Khan") {
      const active = shipments.find(function (shipment) {
        return shipment.batchId === batch.batchId && shipment.status !== "Delivered" && shipment.status !== "Halted";
      });
      if (active) { batch.currentHolder = active.from; batchesChanged = true; }
    }
  });
  if (batchesChanged) saveBatches(batches);

  const notifications = getNotifications().filter(function (note) {
    return note.to !== "Ramesh Patil" && note.to !== "Imran Khan";
  }).map(function (note) {
    if (/PIN for incoming shipment/i.test(note.message)) {
      note.message = "An incoming shipment is on its way. Verify the seal and quantity when it arrives.";
    }
    return note;
  });
  saveNotifications(notifications);
}

// Seed on first visit
if (getBatches().length === 0) seedData();
migrateDriverlessDemo();
