# Platform portal (`/plataforma`)

The operator's console for the whole service, separate from every clinic in every way.

## Access

- Accounts live in `PlatformAdmin`, not `User`. The first one is created by the seed from
  `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` (once; never updated from there).
- Sign-in is two steps: password (`POST /api/plataforma/auth/login`), then a TOTP code
  (`POST /api/plataforma/auth/totp`). The first sign-in enrols an authenticator app
  (`GET /api/plataforma/auth/totp-setup` gives the secret and an `otpauth://` link); the second factor
  is mandatory. Codes: RFC 6238, ±1 step of drift, a used step is never accepted again.
- TOTP secrets are stored encrypted (AES-256-GCM, key from `PLATFORM_SECRET_KEY` or `JWT_SECRET`).
- The session is its own cookie, `medcloud_platform`, `SameSite=Strict`, sent only to `/api/plataforma`,
  signed with a derived key and an audience claim so a clinic token can never pass for it. Pending
  (between password and code) lasts 10 minutes; a full session 4 hours.
- Sign-in attempts are rate-limited per IP and per admin.

## What it shows

Counts and plans only: never a patient's name or anything clinical, and there is no way to act as a
clinic.

- **Panel**: clinics (total, new in 7/30 days, Free/Premium, paid vs granted, suspended), estimated
  MRR (yearly plans as 1/12), paid conversion, and the server's load now and over 24 hours.
- **Clínicas**: tabs Todas/Gratis/Premium with counts, search by clinic or owner email, follow-up filters
  (ends in 7/30 days without auto-renewal, failed payment, no activity in 30 days), CSV export (clinic
  data only, formulas neutralised), multiple selection for **Dar Premium**.
- **Clinic detail**: plan, counts, contact, suspend/reactivate (with reason), grant history and revoke.
- **Precios**: new price version with preview (annual price, the saving clinics see, net after card
  fees) and history. Limits keep both prices payable with OXXO (10–10,000 MXN) and the discount at 0–50%.
- **Documentos legales**: versions with acceptance counts; publish a new version from Markdown with
  preview and a line diff against the version in force. Placeholders in brackets block publishing.
  Every active user is emailed the change summary in the background, paced for Resend.
- **Bitácora**: every portal action (`PlatformAuditLog`).

## Manual Premium

`POST /api/plataforma/grants` gives 1–24 months to up to 100 clinics at once, all or nothing, starting
now or when the clinic's current Premium ends. Each grant is a `PlanGrant`; the owner gets an email,
and another 7 days before it ends (hourly check, sent once, skipped if something else keeps the clinic
on Premium).

## Server metrics

Read every 30 seconds in the API process from `/proc/stat` and `/proc/meminfo` (which inside Docker
describe the host), `statfs` on the storage volume, `pg_database_size` and the process RSS. One sample
every 5 minutes is stored in `ServerMetricSample` and kept 7 days.

## Not yet

- QR code for enrolment (the secret and the `otpauth://` link work in every authenticator app).
- Stripe prices are created with each price version once payments exist (phase 5).
- Saving a legal draft before publishing; today the editor publishes directly.
