/* auth.js — demo login, role guard, navigation bar and notification bell.
   Note: roles are checked in the browser only. Real security needs a backend. */

const ROLE_INFO = {
  manufacturer: { label: "Manufacturer", page: "manufacturer.html", desc: "Register batches, dispatch, recall" },
  manager: { label: "Supply Manager", page: "manager.html", desc: "Receive shipments, store, forward" },
  pharmacist: { label: "Pharmacist", page: "verify.html", desc: "Scan or enter a batch ID before dispensing" },
  regulator: { label: "Regulator", page: "regulator.html", desc: "Review flagged batches, read the audit log" }
};

function getCurrentUser() { return load(KEYS.current, null); }
function login(user) { save(KEYS.current, { name: user.name, role: user.role }); }
function logout() {
  try { localStorage.removeItem(KEYS.current); } catch (e) { }
  delete memoryStore[KEYS.current];
  location.href = "index.html";
}

// Call at the top of every protected page. Returns the full user record.
function requireRole(role) {
  const current = getCurrentUser();
  const user = current && getUser(current.name);
  if (!user || user.role !== role) {
    location.replace("index.html");
    throw new Error("Not signed in as " + role);
  }
  return user;
}

// Guard used inside actions, so a role check also blocks the save itself.
function canDo(user, role) {
  if (!user || user.role !== role) { toast("Unauthorized action for your role.", "bad"); return false; }
  return true;
}

function renderNav(user, pageTitle) {
  const nav = document.getElementById("nav");
  const role = ROLE_INFO[user.role];
  nav.className = "pt-nav";
  nav.innerHTML =
    '<div class="pt-nav__inner">' +
    '<a class="pt-brand" href="index.html" aria-label="PharmaTrace Ledger home">' + brandMark() + '<span>PharmaTrace <b>Ledger</b></span></a>' +
    '<span class="pt-nav__page">' + esc(pageTitle) + "</span>" +
    '<div class="pt-nav__right">' +
    '<div class="dropdown">' +
    '<button class="pt-bell" type="button" data-bs-toggle="dropdown" aria-expanded="false" id="bellBtn" aria-label="Notifications">' + bellIcon() + '<span class="pt-bell__count" id="bellCount" hidden></span></button>' +
    '<div class="dropdown-menu dropdown-menu-end pt-bell__menu" id="bellMenu"></div></div>' +
    '<div class="pt-user"><span class="pt-user__role">' + esc(role.label) + '</span><span class="pt-user__name">' + esc(user.name) + "</span></div>" +
    '<button class="btn btn-sm btn-outline-secondary" type="button" id="logoutBtn">Log out</button>' +
    "</div></div>";
  document.getElementById("logoutBtn").addEventListener("click", logout);
  renderBell(user);
  document.getElementById("bellBtn").addEventListener("click", function () {
    const list = getNotifications();
    list.forEach(function (n) { if (n.to === user.name) n.read = true; });
    saveNotifications(list);
    setTimeout(function () { renderBellCount(user); }, 400);
  });
}

function renderBellCount(user) {
  const unread = getNotifications().filter(function (n) { return n.to === user.name && !n.read; }).length;
  const c = document.getElementById("bellCount");
  if (!c) return;
  c.textContent = unread; c.hidden = unread === 0;
}
function renderBell(user) {
  const mine = getNotifications().filter(function (n) { return n.to === user.name; }).slice(0, 12);
  document.getElementById("bellMenu").innerHTML = '<p class="pt-bell__head">Notifications</p>' +
    (mine.length ? mine.map(function (n) {
      return '<div class="pt-bell__item' + (n.read ? "" : " is-unread") + '"><p>' + esc(n.message) + "</p><time>" + esc(fmtDate(n.time)) + "</time></div>";
    }).join("") : '<p class="pt-bell__empty">No notifications yet.</p>');
  renderBellCount(user);
}

function brandMark() {
  return '<svg class="pt-brand__mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="7" fill="var(--pt-accent)"/>' +
    '<path d="M13 8h6v5h5v6h-5v5h-6v-5H8v-6h5z" fill="var(--pt-accent-ink)"/></svg>';
}
function bellIcon() {
  return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/></svg>';
}
