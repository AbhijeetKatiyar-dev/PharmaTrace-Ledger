/* scanner.js — scan a batch QR with the camera, or from a photo.
   Uses the html5-qrcode library. Camera access needs HTTPS (GitHub Pages is fine). */

function extractBatchId(text) {
  const m = String(text).match(/\d{12}/);
  return m ? m[0] : "";
}

function openScanner(onResult) {
  let scanner = null;
  openModal({
    title: "Scan batch QR", confirmText: null,
    body: '<div id="scanReader"></div>' +
      '<p class="small text-body-secondary mt-3 mb-2" id="scanMsg">Point the camera at the QR on the label.</p>' +
      '<label class="form-label" for="scanFile">No camera? Use a photo of the QR</label>' +
      '<input class="form-control" type="file" id="scanFile" accept="image/*">',
    onOpen: function (body) {
      const msg = body.querySelector("#scanMsg");
      if (typeof Html5Qrcode === "undefined") { msg.textContent = "The QR scanner library did not load. Type the ID instead."; return; }
      scanner = new Html5Qrcode("scanReader");
      function done(text) {
        const id = extractBatchId(text);
        if (!id) { msg.textContent = "That QR does not contain a 12-digit batch ID."; return; }
        stop();
        _modal.hide();
        onResult(id);
      }
      scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 220 }, done, function () { })
        .catch(function () { msg.textContent = "Camera is not available here. Upload a photo of the QR instead."; });
      body.querySelector("#scanFile").addEventListener("change", function (e) {
        const file = e.target.files[0];
        if (!file) return;
        stop().then(function () {
          scanner.scanFile(file, false).then(done).catch(function () { msg.textContent = "No QR code found in that photo. Try a sharper picture."; });
        });
      });
    },
    onClose: function () { stop(); }
  });
  function stop() {
    if (scanner && scanner.isScanning) {
      return scanner.stop().catch(function () { });
    }
    return Promise.resolve();
  }
}
