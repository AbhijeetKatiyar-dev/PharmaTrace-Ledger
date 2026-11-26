/* check.js — public patient page. No login; shows only Safe / Do not use. */

const input = document.getElementById("batchInput");
const resultBox = document.getElementById("result");

function check(id) {
  const r = verifyBatch(id, null); // no pharmacy context, so no clone check here
  let safe = r.state === "ok";
  let title = safe ? "Genuine: safe to use" : "Do not use this medicine";
  let message = safe
    ? "This batch is registered and its supply chain record is intact."
    : (r.state === "invalid" ? r.message : "Return it to your pharmacist. " + publicReason(r));
  if (r.state === "invalid") title = r.title;
  let html = statusAlert({ state: safe ? "ok" : (r.state === "invalid" ? "invalid" : "bad"), title: title, message: message });
  if (r.batch) {
    const b = r.batch;
    html += '<dl class="pt-facts"><dt>Medicine</dt><dd>' + esc(b.drugName) + "</dd><dt>Made by</dt><dd>" + esc(b.manufacturer) +
      "</dd><dt>Batch</dt><dd>" + serial(b.batchId) + "</dd><dt>Expires</dt><dd>" + fmtDay(b.expiryDate) + "</dd></dl>";
  }
  resultBox.innerHTML = html;
}
function publicReason(r) {
  return {
    notfound: "This ID is not registered by any manufacturer.",
    tampered: "Its supply chain record has been altered.",
    counterfeit: "It has been confirmed as counterfeit.",
    recalled: "The manufacturer has recalled it.",
    review: "It is being investigated by the regulator.",
    expired: "It has expired."
  }[r.state] || "";
}

document.getElementById("searchForm").addEventListener("submit", function (e) { e.preventDefault(); check(input.value); });
input.addEventListener("input", function () {
  input.value = input.value.replace(/\D/g, "").slice(0, 12).replace(/(\d{4})(?=\d)/g, "$1 ");
});
resultBox.addEventListener("click", function (e) {
  const t = e.target.closest("[data-try]");
  if (t) { input.value = fmtId(t.dataset.try); check(t.dataset.try); }
});
document.getElementById("scanBtn").addEventListener("click", function () {
  openScanner(function (id) { input.value = fmtId(id); check(id); });
});

// Opened from a QR code: check.html#100000000001
function checkFromHash() {
  const fromHash = (location.hash || "").replace("#", "");
  if (/^\d{12}$/.test(fromHash)) { input.value = fmtId(fromHash); check(fromHash); }
}
window.addEventListener("hashchange", checkFromHash);
checkFromHash();
