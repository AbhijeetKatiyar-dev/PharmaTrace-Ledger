/* login.js — fixed demo accounts; the account determines the role. */

const DEMO_ACCOUNTS = [
  { email: "manufacturer@pharmatrace.demo", password: "ptdemo123", name: "XYZ Pharma", role: "manufacturer" },
  { email: "sunrise@pharmatrace.demo", password: "ptdemo123", name: "Sunrise Labs", role: "manufacturer" },
  { email: "manager@pharmatrace.demo", password: "ptdemo123", name: "ABC Mumbai Hub", role: "manager" },
  { email: "blrhub@pharmatrace.demo", password: "ptdemo123", name: "Bengaluru Distribution Hub", role: "manager" },
  { email: "pharmacist@pharmatrace.demo", password: "ptdemo123", name: "Apollo Pharmacy", role: "pharmacist" },
  { email: "medplus@pharmatrace.demo", password: "ptdemo123", name: "MedPlus Koramangala", role: "pharmacist" },
  { email: "regulator@pharmatrace.demo", password: "ptdemo123", name: "Drug Control Office", role: "regulator" }
];

function renderDemoCredentials() {
  const holder = document.getElementById("demoCredentials");
  holder.innerHTML = '<details class="pt-note"><summary class="fw-semibold">View demo login credentials</summary>' +
    '<div class="mt-2 small">' + DEMO_ACCOUNTS.map(function (account) {
      const label = ROLE_INFO[account.role].label;
      return '<div class="d-flex flex-wrap justify-content-between gap-1 py-2 border-bottom">' +
        '<span><strong>' + esc(account.name) + '</strong><span class="text-body-secondary"> · ' + esc(label) + '</span></span>' +
        '<span class="text-nowrap"><code>' + esc(account.email) + '</code> / <code>' + esc(account.password) + '</code></span>' +
        '</div>';
    }).join("") + '</div></details>';
}

document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;
  const account = DEMO_ACCOUNTS.find(function (item) {
    return item.email.toLowerCase() === email && item.password === password;
  });
  if (!account) {
    toast("Invalid email or password. Use one of the demo accounts below.", "bad");
    return;
  }
  const user = getUser(account.name);
  if (!user || user.role !== account.role || !ROLE_INFO[user.role]) {
    toast("This demo account is not available. Reset the demo data and try again.", "bad");
    return;
  }
  login(user);
  location.href = ROLE_INFO[user.role].page;
});

// Reset with an inline confirmation (browser confirm() dialogs are not always available)
document.getElementById("resetArea").addEventListener("click", function (e) {
  const area = document.getElementById("resetArea");
  if (e.target.id === "resetBtn") {
    area.innerHTML = '<span class="me-2">Erase all changes and reload the sample data?</span>' +
      '<button class="btn btn-sm btn-danger me-1" type="button" id="resetYes">Reset</button>' +
      '<button class="btn btn-sm btn-outline-secondary" type="button" id="resetNo">Cancel</button>';
  } else if (e.target.id === "resetYes") {
    resetDemoData();
    toast("Demo data reset.");
    area.innerHTML = '<button class="btn btn-sm btn-outline-secondary" type="button" id="resetBtn">Reset demo data</button>';
  } else if (e.target.id === "resetNo") {
    area.innerHTML = '<button class="btn btn-sm btn-outline-secondary" type="button" id="resetBtn">Reset demo data</button>';
  }
});

const sample = getBatch("100000000001");
if (sample) document.getElementById("specExp").textContent = fmtDay(sample.expiryDate);
renderDemoCredentials();

// Keep an existing valid session; obsolete Driver sessions are cleared by data.js migration.
const current = getCurrentUser();
if (current && ROLE_INFO[current.role]) location.replace(ROLE_INFO[current.role].page);
