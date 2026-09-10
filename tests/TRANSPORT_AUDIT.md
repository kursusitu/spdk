# Transport resilience — local review, 10 September 2026

Baseline: PWA 47dc9fc / 1.0.15, backend 4f76a25 (reported GAS v64).
Controlled frontend release: 1.0.16. Backend source and GAS deployment unchanged.
Release note: Improve GAS connection resilience and retry handling

## Source review and action classification

The allowlist means **no business writes**, not literally zero effects: legacy
`semakSesi_` can delete expired Sessions rows. A returned application failure is
never retried. This phase does not change that existing backend behavior.

| Actions | Reviewed backend path and effects |
|---|---|
| getDashboardPeserta, getDashboardAdmin | Dashboard.js: session validation and Sheets aggregation only |
| getSenaraiPendaftaran, getPendaftaranSaya, getPesertaBelumDaftar | Dashboard.js: course/registration/user joins and filtering only |
| getSenaraiKursus | Kursus.js clientGetSenaraiKursus: course/registration reads, quota calculation and CPD advisory/config reads only; distinct from catalog |
| getLaporan | Laporan.js clientGetLaporan: reads/aggregations; does not invoke export helpers |
| getKursusUntukKehadiran, getSenaraiKehadiran, getRingkasanKehadiran | Kehadiran.js: lists and attendance reads; no QR generation/backfill helpers |
| getSenaraiMaklumBalas, getSoalanMaklumBalas, getSoalanAdmin, getStatusPesertaMaklumBalas | Maklum.js: course/question/registration/attendance/feedback reads only |
| getProfil, getFotoUrl, getSenaraiPengguna | Auth.js: user reads only after legacy session validation |
| getKursusUntukSuratTawaran, getSenaraiTawaran, getStatusSuratTawaran | Tawaran.js: course/participant/log reads; no send, PDF generation or log append |
| getSijilSaya, verifyCert | Ecert.js: existing certificate/user/course/CPD reads, including contributor snapshot lookup; not autoJanaEcert_ |
| previewCpdSync | CPD.js: non-mutating session check, plan and external-source/diagnostic reads; no execute/upsert/stamps |
| getKursusUntukSijilContributor, getCourseContributors, getContributorEcert | CourseContributors.js: strict non-mutating session check, table validation/reads, snapshot/CPD lookup; no schema creation, issuance or email |

Source was reviewed in the sibling SPDK repository, including helper calls.
The executable list is `TRANSPORT_READ_ACTIONS` in index.html. Tests exercise
every member and every explicit denylist member. Unknown actions have no retry.

Excluded deceptive reads: renewSession (expiry write/deletion),
getSenaraiKursusAktif (catalog auto-tamat), getStatusQR (schema/short-code/URL
backfill), getQRCode (creation/backfill).

All account/session writes, course writes, registrations/approvals, attendance,
QR generation, feedback/questions, offer-letter delivery, contributor
create/generate/update/email, certificate/email generation and executeCpdSync
are excluded. Undefined legacy aliases are also excluded.

## Transport contract

Three total attempts only for allowlisted reads. Backoffs: 500ms and 1500ms.
Retry NETWORK, HTTP 404/500/502/503/504, NON_JSON and MALFORMED_JSON.
Abort, timeout, HTTP 401/403 and other nonselected statuses, invalid response
envelopes, valid business failures and expired sessions are terminal.
JSON MIME validation accepts application/json and application/*+json.

Errors contain name, code, action, httpStatus, retryable, attempt, message.
Codes: NETWORK, ABORTED, TIMEOUT, HTTP_404, HTTP_ERROR, NON_JSON,
MALFORMED_JSON, INVALID_RESPONSE, STALE_REQUEST. Expiry retains AuthExpiredError;
valid success:false retains its original application response.
No raw response body, redirect URL, token, payload or exception message is logged.

Payload is serialized once and every attempt calls the original GAS_URL.
Caller params cannot override the classified action. Token changes reject old
results. Read route changes prevent reuse; Dashboard/Urus Kursus additionally
check view generation and per-panel load sequence. Existing CPD operation
navigation/reconciliation remains under its existing guards.

apiWithTimeout retains its caller's total deadline, including backoff. Bootstrap
remains 15 seconds with one renewal attempt. A timed-out request cannot process
a late auth response even without AbortController. Ordinary api callers retain
their existing lack of an overall timeout; retry bounds do not bound a hanging
fetch. Abort does not cancel an already-running GAS operation.

## UI and validation

Dashboard (both roles) and Urus Kursus show reconnect state, final safe failure
with manual retry, and no false empty-list state on success:false. Other read
callers get a reconnect toast and retain existing final error handling.

Run all PWA tests with Node's test runner against tests/*.test.cjs.
Existing mock Response objects now include status and JSON Content-Type.
One mutation test removes both token defenses to remain an effective negative
control; product CPD logic is unchanged.

Browser fixture: `node tests/serve-transport.cjs`, open
http://127.0.0.1:8766/#admin. It serves the real page with synthetic fetch responses,
blocks external connections using CSP, and never uses real credentials/data.
Buttons select persistent 404 or 404-then-success for Dashboard/Urus Kursus.
The fixture is test-only and must not be included as application code.

## Release considerations

Local validation does not prove Google redirect reliability in production.
Repeated invalid JSON now fails explicitly; future endpoints must return the
JSON MIME and boolean success contract. Backend session cleanup/concurrency and
renewal semantics remain existing limitations. No automatic retry for renewal
means bootstrap may still require manual retry during a Google outage.

APP_VERSION, sw.js cache and version.json are bumped together to 1.0.16.
The narrow allowlist is retained. The release gate passes 39 transport tests,
216 full PWA tests and a desktop/mobile mock-browser check. Actual production
redirect behavior requires a separate post-push smoke check. Backend regression
was not necessary here: backend source and all business actions remain unchanged.
