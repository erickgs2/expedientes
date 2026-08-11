# Expedientes

Electronic patient records for an aesthetic medicine clinic: clinical history, facial assessments
with annotated diagrams and photography, treatments with product traceability, legally structured
informed consents, appointments with WhatsApp reminders, and a PDF export of the whole record.

The interface is Spanish-first (English translations included). Consent documents always print in
Spanish, whatever the interface language — a signed consent is an archived legal instrument, so it
reproduces exactly as it was signed.

## Stack

| | |
|---|---|
| Monorepo | [Nx](https://nx.dev) with npm workspaces |
| Web | Angular 22, standalone components, signals, Angular Material, Transloco |
| API | Next.js 16 route handlers |
| Database | PostgreSQL via Prisma 5 |
| PDF | `@react-pdf/renderer` |
| Mobile | Capacitor shell (iOS/Android) pointing at the deployed web app |
| Tests | Jest, over pure logic modules |

```
apps/
  web/     Angular client
  api/     Next.js API + PDF generation + notifications
  mobile/  Capacitor wrapper
libs/
  shared/types/   types shared by web and api, plus the consent boilerplate
prisma/    schema, migrations, seed
docs/superpowers/  design specs and implementation plans per feature
```

## Getting started

Requires Node 20+ and a reachable PostgreSQL instance. There is no Docker setup — Postgres runs
natively.

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL, JWT_SECRET and the seed admin
npx prisma migrate deploy
npx prisma db seed
```

The seed creates the permission set, an Admin role holding all of it, the admin user from
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, and a blank `ClinicSettings` row carrying the reference
consent wording.

**Change `SEED_ADMIN_PASSWORD` from the default before the app is reachable from anywhere but your
own machine.**

Run the two apps in separate terminals:

```bash
npx nx dev api      # http://localhost:3000
npx nx serve web    # http://localhost:4200
```

### Everyday commands

```bash
npx nx test api          # the whole suite, ~3s
npx nx build api         # also what typechecks the API — it has no separate typecheck target
npx nx build web
npx nx typecheck web
npx nx lint web
```

The `api` project only has `build` and `test` targets. `nx typecheck api` and `nx lint api` do not
exist.

## First-run configuration

Sign in as the admin and open **Datos de la clínica** (`/admin/clinic`). Until the doctor's name and
cédula are filled in, **consent signing is deliberately blocked** — a consent without the treating
physician's identity is exactly the defect the structured consent exists to prevent.

Set there:

- **Clinic logo** — printed centred at the top of every exported PDF page. PNG with a transparent
  background works best.
- **Doctor title, name and cédula**, and the default *lugar*.
- **The two declaration paragraphs** — the fixed legal text wrapping each consent. Seeded with the
  clinic's reference wording; *Restaurar texto sugerido* puts it back if edited away.
- **The doctor's signature**, drawn once and stamped onto every consent in the export.
- **WhatsApp notifications** (optional) — see below.

Then create treatment types under **Catálogo de tratamientos** (`/admin/treatments`). Each carries
five consent sections: procedure description (required), risks, alternatives, aftercare and
contraindications. Every field shows a worked example as placeholder text.

## Environment

```
DATABASE_URL          PostgreSQL connection string
JWT_SECRET            signing secret for session cookies
STORAGE_ROOT          where uploads live (default ./storage, relative to apps/api)
SEED_ADMIN_EMAIL      admin account created by the seed
SEED_ADMIN_PASSWORD   its password — change from the default
```

`.env` is git-ignored, as is the storage directory: **no uploaded photo, signature or logo is ever
committed.**

WhatsApp settings (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, the two template names and
the template language) are also supported here, but the clinic settings screen is the better place —
changing them there needs no redeploy, and stored values win over the environment. The environment
remains useful for injecting the token from a secret manager instead of typing it into a form.

## How the record fits together

**Patient** → **Historia clínica** (one per patient: personal details, medical history, allergies,
family history) → **Valoraciones** (assessment visits with annotated facial diagrams and
before/after photography) → **Tratamientos** (each visit selects treatment types; each of those
carries its own diagram, photos, products used, and consent).

**Consents.** Signing snapshots every printed value onto the row — clinic and physician identity,
both interpolated declarations, the catalog sections, the place, the patient's identification, and
the signing date resolved in the clinic's local timezone. Editing settings or the catalog afterwards
can never change what an already-signed consent says. Signing is one-time and irreversible.

**Product traceability.** Each treatment item records the products used — brand (autocompleted from
prior entries), lot number, expiry, and an optional photo of the packaging — so a recalled batch can
be traced to the patients who received it. Expiry is normalised server-side to the end of the
printed month, since packaging prints MM/YYYY.

**Appointments** send a WhatsApp confirmation on booking and a reminder two hours before, via a
sweep running every five minutes inside the API process. Templates must be authored and approved in
Meta Business Manager; the app only references them by name. With no credentials configured the
feature silently no-ops.

**Export** produces one PDF: the record itself, then each signed consent as its own annex pages with
a repeating letterhead and a true per-consent page counter. The four modules — historia clínica,
valoración, tratamientos, consentimientos — are independently selectable, so consents can be
exported alone.

## Access control

Every route is guarded by role-based permissions, checked on the server on every request rather than
only in the UI. Modules: `patients`, `historia-clinica`, `valoracion`, `treatments`, `appointments`,
`export`, `rbac-admin`, `clinic-settings`. Users and roles are managed under `/admin/users` and
`/admin/roles`.

`clinic-settings` is deliberately narrower than the rest: it governs the doctor's stored signature
image, which is the one asset that could be used to fabricate a consent. Files served from the
`clinic/` storage bucket require it too.

Mutations write to an `AuditLog` carrying the acting user and the patient involved.

## Mobile

`apps/mobile` is a Capacitor shell that loads the deployed web app from a URL, so authentication
cookies and relative `/api` paths behave exactly as in a browser. It needs the server URL at build
time:

```bash
EXPEDIENTES_SERVER_URL=http://192.168.0.10 npx cap sync
```

## Deployment

| Environment | Target | Guide |
|---|---|---|
| `dev` | Raspberry Pi on a home network, DuckDNS hostname | [docs/deployment/dev-pi-runbook.md](docs/deployment/dev-pi-runbook.md) |
| `qa` | EC2 instance, Postgres on the box, images in S3 | [docs/deployment/qa-runbook.md](docs/deployment/qa-runbook.md) |

An Android APK for testers is built from the same source: see
[docs/deployment/android-apk.md](docs/deployment/android-apk.md). The mobile app is a shell around
the deployed web app, so the server URL is baked in at build time and each APK points at one
environment.

Both deploy automatically on a push to their branch. Both terminate TLS with Caddy, which is not
optional: the session cookie is `secure` in production, so over plain HTTP a browser discards it and
login fails with no visible error.

## Design documents

Each feature was specified before it was built. `docs/superpowers/specs/` holds the designs and
`docs/superpowers/plans/` the implementation plans — useful for understanding *why* something works
the way it does, particularly the consent immutability rules and the export's language handling.
