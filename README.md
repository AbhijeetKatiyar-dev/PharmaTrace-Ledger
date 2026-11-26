# PharmaTrace Ledger

A pharmaceutical supply-chain track-and-trace prototype. Enter or scan a batch ID to verify a medicine's origin, status and custody history before it reaches a patient.

Built for the Polaris School of Technology OJT (PST_PD_159) with HTML, CSS, vanilla JavaScript and Bootstrap 5. There is no backend: demo data is stored in the browser's `localStorage`.

## Run it

- **Locally:** open `index.html` in a browser, or run `python -m http.server` in this folder and open `http://localhost:8000`.
- **Online:** push to GitHub and deploy from the `main` branch using GitHub Pages. Camera-based QR scanning requires HTTPS.

## Portals and roles

| Role | Page | What they do |
|---|---|---|
| Manufacturer | `manufacturer.html` | Register batches, generate QR labels, dispatch batches and initiate recalls |
| Supply Manager | `manager.html` | Verify incoming shipments, manage hub stock, add custody entries, forward stock and export CSV |
| Pharmacist | `verify.html` | Scan or enter a batch ID, verify before dispensing, receive deliveries and report suspicious packs |
| Regulator | `regulator.html` | Review flagged batches, clear or recall them, mark counterfeits and inspect the audit log |
| Patient | `check.html` | Public medicine check; no login required |

There is no Driver portal. A shipment is created by the Manufacturer or Supply Manager. The destination's Supply Manager or Pharmacist confirms receipt after checking the seal and counted quantity.

## Demo login accounts

All demo accounts use the password **`ptdemo123`**. The account determines the role; users cannot select a role on the login page.

| Email | Organisation | Role |
|---|---|---|
| `manufacturer@pharmatrace.demo` | XYZ Pharma | Manufacturer |
| `sunrise@pharmatrace.demo` | Sunrise Labs | Manufacturer |
| `manager@pharmatrace.demo` | ABC Mumbai Hub | Supply Manager |
| `blrhub@pharmatrace.demo` | Bengaluru Distribution Hub | Supply Manager |
| `pharmacist@pharmatrace.demo` | Apollo Pharmacy | Pharmacist |
| `medplus@pharmatrace.demo` | MedPlus Koramangala | Pharmacist |
| `regulator@pharmatrace.demo` | Drug Control Office | Regulator |

These are public demonstration credentials, not secure production accounts. The login check is implemented in browser-side JavaScript and can be bypassed by someone with access to the project files or browser storage.

## Demo walkthrough

1. Sign in as `manufacturer@pharmatrace.demo` and register a batch or select one already at XYZ Pharma.
2. Dispatch a genuine, unexpired batch to ABC Mumbai Hub. Enter an expected arrival, seal number and quantity.
3. Sign in as `manager@pharmatrace.demo`. Open Incoming Shipments and choose **Verify & receive**. Enter the seal number and quantity. A mismatch moves the batch to **Under Review**.
4. Sign in as `pharmacist@pharmatrace.demo` and verify `1000 0000 0001` (genuine), `1000 0000 0002` (recalled) or `1000 0000 0005` (near expiry).
5. Sign in as `regulator@pharmatrace.demo` to review suspicious batches, clear them, recall them or mark them counterfeit.
6. **Tamper test:** open DevTools → Application → Local Storage and edit a `location` inside `pt_batches`. Verify that batch again; the hash chain should fail and show **Ledger tampered**.

Use **Reset demo data** on the login page to restore the sample records.

## How the ledger works

Each custody event stores a SHA-256 fingerprint of itself plus the previous event's fingerprint (`ledger.js`). Events are appended to the batch history. Editing an old event causes its fingerprint check to fail.

## Prototype checks and limitations

- Shipment receipt checks the recorded seal number, seal condition and counted quantity.
- A mismatch places the batch **Under Review** and creates a report for the regulator.
- Duplicate batch verification can identify a batch being checked at a location other than its recorded holder.
- Delayed shipments are flagged when their expected arrival time has passed.
- QR labels link to the public patient-check page.
- Shipment status is a prototype workflow; there is no live GPS or logistics-provider integration.
- Data lives in one browser. Different users do not share data across devices or browsers.
- Role routing and login validation run in the browser only. A real deployment would require server-side authentication, authorization and a database.

## Main files

All HTML, CSS and JavaScript files are currently in the repository root. Keep the asset paths below relative to the page files when deploying to GitHub Pages.

```
index.html          Login page; account determines role
manufacturer.html   Manufacturer dashboard
manager.html        Supply Manager dashboard
verify.html         Pharmacist verification portal
regulator.html      Regulator console
check.html          Public patient check
style.css           Shared theme and layout
ledger.js        SHA-256 hash chain and verification rules
data.js          Local Storage helpers and sample data
ui.js            Shared UI components, alerts, timeline, CSV and QR
auth.js          Demo login session, role guard, navigation and notifications
actions.js       Registration, dispatch, recall, receipt, reporting and custody actions
scanner.js       QR scanning (camera or photo)
```

## Libraries (CDN)

Bootstrap 5.3.3, qrcodejs 1.0.0 (QR generation), html5-qrcode 2.3.8 (QR scanning).
