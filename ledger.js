
// ---------- SHA-256 (pure JavaScript, synchronous) ----------
function sha256(ascii) {
  function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
  var mathPow = Math.pow, maxWord = mathPow(2, 32), i, j, result = "";
  var words = [], asciiBitLength = ascii.length * 8;
  var hash = sha256.h = sha256.h || [];
  var k = sha256.k = sha256.k || [];
  var primeCounter = k.length, isComposite = {};
  for (var candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += "\x80";
  while (ascii.length % 64 - 56) ascii += "\x00";
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return "";
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = ((asciiBitLength / maxWord) | 0);
  words[words.length] = asciiBitLength;
  for (j = 0; j < words.length;) {
    var w = words.slice(j, j += 16), oldHash = hash;
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
      var temp1 = hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] +
        (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
          w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
      var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      var b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? 0 : "") + b.toString(16);
    }
  }
  return result;
}

function hashText(text) {
  // convert to UTF-8 bytes first so names like "→" hash correctly
  return sha256(unescape(encodeURIComponent(text)));
}

// The first entry links to a fingerprint of the batch's fixed details,
// so changing the drug name, manufacturer or expiry is also detected.
function genesisHash(batch) {
  return hashText(["GENESIS", batch.batchId, batch.drugName, batch.manufacturer,
    batch.quantity, batch.mfgDate, batch.expiryDate].join("|"));
}

function entryHash(entry) {
  return hashText([entry.timestamp, entry.location, entry.actor, entry.status, entry.prevHash].join("|"));
}

// Add one custody event. Old entries are never touched.
function appendEntry(batch, data) {
  const prev = batch.history[batch.history.length - 1];
  const entry = {
    timestamp: data.timestamp || new Date().toISOString(),
    location: data.location,
    actor: data.actor,
    status: data.status,
    prevHash: prev ? prev.hash : genesisHash(batch)
  };
  entry.hash = entryHash(entry);
  batch.history.push(entry);
  return entry;
}

// Walk the chain and recompute every fingerprint.
function verifyChain(batch) {
  const h = batch.history || [];
  for (let i = 0; i < h.length; i++) {
    const expectedPrev = i === 0 ? genesisHash(batch) : h[i - 1].hash;
    if (h[i].prevHash !== expectedPrev || entryHash(h[i]) !== h[i].hash) {
      return { ok: false, index: i };
    }
  }
  return { ok: true };
}

// ---------- Derived values (calculated, never stored) ----------
function daysToExpiry(batch) {
  const end = new Date(batch.expiryDate + "T23:59:59");
  return Math.ceil((end - new Date()) / 86400000);
}
function isExpired(batch) { return daysToExpiry(batch) < 0; }
function isRecalled(batch) { return batch.status === "Recalled"; }
function lastEntry(batch) { return batch.history[batch.history.length - 1]; }

// Every hub and pharmacy that ever held this batch (used for recalls).
function impactList(batch) {
  const places = [];
  batch.history.forEach(function (e) {
    const u = getUser(e.actor);
    if (u && (u.role === "manager" || u.role === "pharmacist") && places.indexOf(u.name) === -1) {
      places.push(u.name);
    }
  });
  return places;
}

// ---------- Verification (used by the pharmacist and patient pages) ----------
// Returns { state, title, message, batch }
function verifyBatch(rawId, verifyingAt) {
  const id = String(rawId || "").replace(/\D/g, "");
  if (id.length !== 12) {
    return { state: "invalid", title: "Enter a valid 12-digit Batch ID",
      message: "Batch IDs have exactly 12 digits. Check the label and try again." };
  }
  const batch = getBatch(id);
  if (!batch) {
    return { state: "notfound", title: "Batch not registered: possible counterfeit",
      message: "No manufacturer has registered this ID. Do not dispense. Report the pack to the regulator." };
  }
  const chain = verifyChain(batch);
  if (!chain.ok) {
    return { state: "tampered", batch: batch, title: "Ledger tampered: do not dispense",
      message: "Entry " + (chain.index + 1) + " of this batch's history was changed after it was recorded. The custody chain cannot be trusted." };
  }
  if (batch.status === "Counterfeit") {
    return { state: "counterfeit", batch: batch, title: "Counterfeit: do not dispense",
      message: "The regulator has confirmed packs with this ID as counterfeit." };
  }
  if (batch.status === "Recalled") {
    return { state: "recalled", batch: batch, title: "Recalled: do not dispense",
      message: recallReason(batch) };
  }
  if (batch.status === "Under Review") {
    return { state: "review", batch: batch, title: "Under review: do not dispense until cleared",
      message: "A check failed or a report was filed: " + latestFlag(batch) + "." };
  }
  if (isExpired(batch)) {
    return { state: "expired", batch: batch, title: "Expired: do not dispense",
      message: "This batch expired on " + fmtDay(batch.expiryDate) + "." };
  }
  if (verifyingAt) {
    const incoming = getShipments().find(function (s) {
      return s.batchId === batch.batchId && s.to === verifyingAt && s.status !== "Delivered" && s.status !== "Halted";
    });
    if (incoming) {
      return { state: "incoming", batch: batch, title: "On its way to you: receive it first",
        message: "Shipment " + incoming.shipmentId + " is " + incoming.status.toLowerCase() + ". Complete the receipt check (seal and quantity) before dispensing." };
    }
    if (batch.currentHolder !== verifyingAt) {
      return { state: "clone", batch: batch, title: "Possible clone: this batch was delivered elsewhere",
        message: "The ledger shows this batch is held by " + batch.currentHolder + ", not " + verifyingAt + ". The pack in your hand may carry a copied ID." };
    }
  }
  return { state: "ok", batch: batch, title: "Custody Chain Verified",
    message: "Registered by " + batch.manufacturer + ". Every handoff was confirmed. Expires " + fmtDay(batch.expiryDate) + "." };
}

function recallReason(batch) {
  for (let i = batch.history.length - 1; i >= 0; i--) {
    if (/^Recalled/.test(batch.history[i].status)) return batch.history[i].status + ".";
  }
  return "The manufacturer has recalled this batch.";
}
function latestFlag(batch) {
  for (let i = batch.history.length - 1; i >= 0; i--) {
    const s = batch.history[i].status;
    if (/Reported|discrepancy|halted|PIN|mismatch/i.test(s)) return s;
  }
  return "awaiting regulator decision";
}
