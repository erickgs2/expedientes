# Project Overview — Expedientes (Aesthetic Clinic Patient Records)

Status: approved (decomposition + cross-cutting decisions)
Date: 2026-08-01

## Purpose

A web application to digitalize the medical histories of an aesthetic doctor's patients: unify
patient information, consent forms (e-signed), treatment notes, and facial-diagram annotations
into a single record per patient. Used on desktop for record-keeping and on tablet (and
installable iOS/Android apps) for in-consult drawing/photo capture.

Default UI language is Spanish; English is available via a runtime toggle. All code, naming, and
comments are in English regardless of UI language.

## Technical stack

- Monorepo: Nx
- Backend: Next.js (API/route-handlers only, no rendered pages) + Prisma ORM
- Database: PostgreSQL
- Frontend: Angular + Angular Material (custom rose/red theme, light + dark mode)
- Mobile: Capacitor (from the Ionic toolchain) wraps the same Angular app for installable
  iOS/Android builds — no separate Ionic UI component set, Material stays the single UI system
- i18n: Transloco, runtime ES/EN switching, default ES, per-user saved preference
- Deployment: self-hosted via docker-compose (Postgres, Next.js API, Angular served via nginx) on
  the clinic's own VPS/server — chosen over managed cloud because of sensitive medical data
- Tenancy: single clinic, single doctor calendar, multiple staff users with RBAC
- Testing: low effort throughout — basic unit tests only where cheap (auth/RBAC logic, service
  functions); no e2e suite. The user tests manually.

## Cross-cutting product decisions

- **WhatsApp notifications**: sent via WhatsApp Business API (Meta/Twilio), not manual click-to-send
- **Consent signatures**: captured by drawing a signature on-screen (canvas), embedded as an image
  into the stored consent record and into exported PDFs
- **RBAC**: fully custom role builder — Admin can create arbitrary roles and assign any
  combination of per-module, per-action permissions (view/create/edit/delete/export); no
  self-registration or email-based password reset — Admin creates accounts and sets/resets
  passwords directly
- **Audit trail**: a basic audit log records who did what (create/update/delete/sensitive-view) to
  which patient record and when
- **Treatment catalog**: Admin-managed catalog of treatment types; each type has an editable
  consent-form text template. A single Treatment visit can include multiple treatment types, each
  with its own consent, notes, and diagram annotations
- **Offline**: not required for v1 — tablet/mobile assumed always connected to clinic
  network/internet
- **File storage**: uploaded photos and signed consent files live on a local disk volume on the
  server, referenced by path in Postgres, served through an authenticated API route

## Module roadmap (build order)

Each item below gets its own brainstorm → spec → plan → implementation cycle:

1. **Foundation** — Nx monorepo, auth/RBAC, i18n, Material theming, Patient Drive shell,
   audit log, file storage, deployment scaffold. (see
   `2026-08-01-foundation-design.md`) — complete
2. **Historia Clínica** — general patient intake record — complete
3. **Valoración** — facial assessment. Decomposed (2026-08-02) into three independent
   sub-projects, each with its own brainstorm → spec → plan → cycle, build order as listed:
   1. **Visit records** — a minimal per-visit container (date, "qué quiere/necesita el
      paciente", general notes) — complete
   2. **Facial diagram drawing tool** — designed for reuse by Treatments. Further decomposed
      (2026-08-02) into three incremental phases, each building on the last:
      1. **Core canvas (single view)** — freehand drawing, predefined markers, pinned text
         notes, save/load for one diagram view. A generic placeholder base image is used until
         an admin-upload flow exists (deferred, not part of this phase). — complete
      2. **Multiple diagram views** — front/left/right profile, each independently annotated
      3. **Cross-visit watermark/reference overlay** — toggleable, per-visit-selectable
         reference layers showing past visits' annotations
   3. **Photo capture** — camera capture with a centering oval guide, before/after tagging,
      progressive timeline; builds on Foundation's existing file storage
4. **Treatments** — follow-up visits: treatment selection, consent signing, diagram, photos
   (reuses Valoración's diagram tool and photo capture)
5. **Appointment management** — scheduling + WhatsApp notifications
6. **Exportar** — PDF export, selectable modules
7. **Ionic/Capacitor packaging** — installable iOS/Android builds of the finished app

## Requirements captured for future modules (not yet designed in detail)

These were gathered during initial brainstorming so they aren't lost before their module's turn.
They are **inputs to**, not a replacement for, that module's own brainstorming session.

### Historia Clínica — fields

- Fecha (defaults to current date, editable)
- **Información del paciente**: Ocupación, Fecha de nacimiento, Edad, Sexo, Alergias (structured
  tags, admin-managed catalog + custom), Qué quiere el paciente, Qué necesita el paciente,
  Atributos emocionales
  - "Qué quiere / qué necesita / atributos emocionales" are captured here as a baseline, and again
    (refined) per-visit inside Valoración
- **Información médica**: Enfermedades actuales, Medicamentos para acné en los últimos 3 meses,
  Cirugías estéticas o tratamientos estéticos anteriores, Rutina de cuidado facial
- **Antecedentes personales no patológicos**: consumo de alcohol/tabaco/drogas, tipo y frecuencia
  de ejercicio, vacunas, posibilidades de embarazo
- **Antecedentes heredofamiliares**: free text

### Valoración — facial assessment

- Structured fields (admin-configurable, e.g. skin type, symmetry, notable zones) + free text notes
- Facial diagram drawing tool (shared with Treatments):
  - Freehand drawing, text annotations pinned to a point, predefined markers/icons
  - Multiple diagram views (e.g. front, left profile, right profile), each with independent
    annotations
  - Delete-marks mode; "clear all" clears only the current visit's layer
  - Previous visits' annotations can be overlaid as watermark/reference layers: a toggle turns
    this on/off, and when on, the user can pick which specific past visit(s) to show/hide
  - No base diagram image yet — build to accept an admin-uploaded template image (SVG/PNG);
    ship with a generic placeholder until the real one is provided
- Photo capture:
  - Multiple photos per session, before/after tagging
  - Capture directly from device camera with a centered oval guide overlay (near full-screen) to
    keep face framing/size consistent across sessions
  - Progressive timeline: Valoración creates the baseline photo set; each follow-up Treatment visit
    adds more, building an evolving before/after history per patient

### Treatments — follow-up visits

- Load previous applied treatments and full historical record for the patient on entry
- Select one or more treatments from the catalog per visit
- Each treatment in the visit gets its own consent (per-treatment-type template, signed via
  drawn signature), notes, and diagram annotations
- Reuses the same diagram tool and photo capture/progression as Valoración

### Appointment management

- Calendar views: day/week/month
- Status tracking: Scheduled, Confirmed, Completed, Cancelled, No-show
- Link an appointment to planned treatment(s)
- WhatsApp: confirmation message on booking + automatic reminder before the appointment
  (e.g. 24h prior)

### Exportar

- Generate a PDF containing all patient info (Historia Clínica, Valoración, Treatments, consents)
- User can choose to export everything or select specific modules
- Exported PDF language follows the app's current language toggle at export time
