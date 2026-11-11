// PharmaTrace: a small localStorage demo for medicine batch tracking.

const DATA_KEY = "pharmatrace.ledger.v2";
const ROLE_KEY = "pharmatrace.role";
const $ = (id) => document.getElementById(id);
const day = (number) => new Date(Date.now() + number * 86400000).toISOString().slice(0, 10);
const time = (number) => new Date(Date.now() + number * 86400000).toISOString();
const esc = (text) => String(text).replace(/[&<>"]/g, (letter) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[letter]);
let selectedBatch;

function sampleData() {
  const plant = "Orion Pharma Plant", hub = "Central Supply Hub", pharmacy = "Lakeside Pharmacy";
  const batch = (batchId, medicineName, manufacturer, made, expiry, initialLocation, currentLocation, currentStatus, age) =>
    ({ batchId, medicineName, manufacturer, manufactureDate: day(made), expiryDate: day(expiry), initialLocation, currentLocation, currentStatus, createdAt: time(-age) });
  const event = (batchId, eventType, fromLocation, toLocation, age, notes = "") =>
    ({ batchId, eventType, fromLocation, toLocation, timestamp: time(-age), notes });

  return {
    batches: [
      batch("PT-2026-0001", "Amoxicillin 500 mg", "Orion Pharma", -120, 640, plant, hub, "Received", 30),
      batch("PT-2026-0002", "Paracetamol 650 mg", "Orion Pharma", -60, 700, plant, plant, "Registered", 5),
      batch("PT-2026-0003", "Insulin Glargine", "Helios Biologics", -45, 320, pharmacy, pharmacy, "In Transit", 6),
      batch("PT-2025-0107", "Cetirizine 10 mg", "Orion Pharma", -770, -40, plant, pharmacy, "Received", 300)
    ],
    custodyEvents: [
      event("PT-2026-0001", "dispatch", plant, hub, 29, "Sealed cartons"),
      event("PT-2026-0001", "receipt", plant, hub, 28),
      event("PT-2026-0003", "dispatch", pharmacy, hub, 1, "Cold transport"),
      event("PT-2025-0107", "dispatch", plant, pharmacy, 299),
      event("PT-2025-0107", "receipt", plant, pharmacy, 298)
    ]
  };
}

function getData() {
  try {
    const saved = JSON.parse(localStorage.getItem(DATA_KEY));
    if (saved?.batches && saved?.custodyEvents) return saved;
  } catch { /* use the sample data */ }
  const data = sampleData();
  saveData(data);
  return data;
}

function saveData(data) { localStorage.setItem(DATA_KEY, JSON.stringify(data)); }
function role() { return localStorage.getItem(ROLE_KEY) || "manager"; }
function getBatch(id) { return getData().batches.find((batch) => batch.batchId === id); }
function eventsFor(id) { return getData().custodyEvents.filter((event) => event.batchId === id).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); }
function status(batch) { return batch.expiryDate < day(0) ? "Expired" : batch.currentStatus; }
function showError(id, message) { $(id).textContent = message; }

function render() {
  const data = getData(), manager = role() === "manager";
  const search = $("search").value.toLowerCase().trim(), filter = $("filter").value;
  const visible = data.batches.filter((batch) => `${batch.batchId} ${batch.medicineName} ${batch.manufacturer} ${batch.currentLocation}`.toLowerCase().includes(search) && (filter === "all" || status(batch) === filter));
  const cards = [["All batches", ""], ["In Transit", "warn"], ["Received", "good"], ["Expired", "bad"]];

  $("role").value = role();
  $("addBatch").hidden = !manager;
  $("roleMessage").hidden = manager;
  $("roleMessage").textContent = "Pharmacist mode: you can search and view history, but cannot change records.";
  $("summary").innerHTML = cards.map(([name, style], index) => `<div class="card ${style}"><span>${name}</span><strong>${index ? data.batches.filter((batch) => status(batch) === name).length : data.batches.length}</strong></div>`).join("");

  const places = [...new Set([...data.batches.flatMap((batch) => [batch.initialLocation, batch.currentLocation]), ...data.custodyEvents.flatMap((event) => [event.fromLocation, event.toLocation])])];
  $("locations").innerHTML = places.map((place) => `<option value="${esc(place)}">`).join("");
  $("batchList").innerHTML = visible.length ? visible.map((batch) => {
    const currentStatus = status(batch), receiving = batch.currentStatus === "In Transit";
    const move = manager ? `<button data-action="move" data-id="${batch.batchId}" ${currentStatus === "Expired" && !receiving ? "disabled" : ""}>${receiving ? "Receive" : "Dispatch"}</button>` : "";
    return `<tr><td><strong>${esc(batch.batchId)}</strong></td><td>${esc(batch.medicineName)}<span class="small">${esc(batch.manufacturer)}</span></td><td>${batch.expiryDate}</td><td>${esc(batch.currentLocation)}</td><td><span class="badge ${currentStatus.toLowerCase().replace(" ", "")}">${currentStatus}</span></td><td><div class="actions"><button class="secondary" data-action="history" data-id="${batch.batchId}">History</button>${move}</div></td></tr>`;
  }).join("") : `<tr><td colspan="6">No matching batches found.</td></tr>`;
}

function openBatchDialog() {
  if (role() !== "manager") return;
  $("batchForm").reset();
  showError("batchError", "");
  $("batchDialog").showModal();
}

function saveBatch(event) {
  event.preventDefault();
  const batch = Object.fromEntries(new FormData($("batchForm")));
  batch.batchId = batch.batchId.trim().toUpperCase();
  const message = Object.values(batch).some((value) => !value.trim()) ? "Please fill in every field."
    : !/^[A-Z0-9-]{3,30}$/.test(batch.batchId) ? "Batch ID can only use letters, numbers, and hyphens."
    : getBatch(batch.batchId) ? "This batch ID already exists."
    : batch.manufactureDate > day(0) ? "Manufacturing date cannot be in the future."
    : batch.expiryDate <= batch.manufactureDate ? "Expiry date must be after manufacturing date." : "";
  if (message) return showError("batchError", message);

  Object.assign(batch, { currentLocation: batch.initialLocation, currentStatus: "Registered", createdAt: new Date().toISOString() });
  const data = getData();
  data.batches.push(batch);
  saveData(data);
  $("batchDialog").close();
  render();
}

function openMoveDialog(id) {
  selectedBatch = getBatch(id);
  if (!selectedBatch || role() !== "manager") return;
  const receiving = selectedBatch.currentStatus === "In Transit", lastEvent = eventsFor(id).at(-1);
  $("moveTitle").textContent = `${receiving ? "Receive" : "Dispatch"} ${id}`;
  $("moveInfo").textContent = receiving ? "The receipt location must match the earlier dispatch." : `Current location: ${selectedBatch.currentLocation}`;
  $("fromLocation").value = receiving ? lastEvent.fromLocation : selectedBatch.currentLocation;
  $("toLocation").value = receiving ? lastEvent.toLocation : "";
  $("toLocation").readOnly = receiving;
  $("toField").firstChild.textContent = receiving ? "Received at " : "Destination ";
  $("notes").value = "";
  showError("moveError", "");
  $("moveDialog").showModal();
}

function saveMove(event) {
  event.preventDefault();
  const destination = $("toLocation").value.trim(), notes = $("notes").value.trim();
  if (!destination || destination.length > 60 || notes.length > 200) return showError("moveError", "Enter a destination; location must be under 60 characters and notes under 200.");
  const receiving = selectedBatch.currentStatus === "In Transit", data = getData();
  data.custodyEvents.push({ batchId: selectedBatch.batchId, eventType: receiving ? "receipt" : "dispatch", fromLocation: $("fromLocation").value, toLocation: destination, timestamp: new Date().toISOString(), notes });
  Object.assign(selectedBatch, receiving ? { currentLocation: destination, currentStatus: "Received" } : { currentStatus: "In Transit" });
  saveData(data);
  $("moveDialog").close();
  render();
}

function showHistory(id) {
  const batch = getBatch(id);
  if (!batch) return;
  const details = [["Medicine", batch.medicineName], ["Manufacturer", batch.manufacturer], ["Manufactured", batch.manufactureDate], ["Expiry", batch.expiryDate], ["Current location", batch.currentLocation], ["Status", status(batch)]];
  const history = eventsFor(id).map((event) => `<li><strong>${event.eventType === "dispatch" ? "Dispatch" : "Receipt"}</strong>: ${esc(event.fromLocation)} → ${esc(event.toLocation)}<span class="small">${new Date(event.timestamp).toLocaleString()}${event.notes ? ` — ${esc(event.notes)}` : ""}</span></li>`).join("");
  $("historyTitle").textContent = `History: ${batch.batchId}`;
  $("historyContent").innerHTML = `<div class="history-details">${details.map(([label, value]) => `<div><span>${label}</span>${esc(value)}</div>`).join("")}</div><h3>Custody history</h3><ol class="timeline"><li><strong>Registered</strong>: ${esc(batch.initialLocation)}<span class="small">${new Date(batch.createdAt).toLocaleString()}</span></li>${history || "<li>No handoffs yet.</li>"}</ol>`;
  $("historyDialog").showModal();
}

$("addBatch").addEventListener("click", openBatchDialog);
$("batchForm").addEventListener("submit", saveBatch);
$("moveForm").addEventListener("submit", saveMove);
$("search").addEventListener("input", render);
$("filter").addEventListener("change", render);
$("role").addEventListener("change", (event) => { localStorage.setItem(ROLE_KEY, event.target.value); render(); });
$("batchList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) button.dataset.action === "history" ? showHistory(button.dataset.id) : openMoveDialog(button.dataset.id);
});
$("reset").addEventListener("click", () => { if (confirm("Reset all records to the sample data?")) { saveData(sampleData()); render(); } });
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => $(button.dataset.close).close()));

render();
