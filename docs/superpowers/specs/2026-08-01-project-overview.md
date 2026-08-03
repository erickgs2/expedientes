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
   `2026-08-01-foundation-design.md`) — complete. **Known gap (2026-08-02, flagged by photo
   capture's Phase 2 final review):** `AuthService.logout()` does not clear
   `ActivePatientStore`/its `sessionStorage` key, so a second user logging in on the same browser
   session can silently inherit the previous user's active patient via `activePatientGuard`. Not a
   new access grant (any `patients:view` user could already look that patient up), but worth a
   small fix — `activePatient.clear()` in `logout()` — the next time Foundation-level auth code is
   touched.
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
      2. **Multiple diagram views** — front/left/right profile, each independently annotated —
         complete
      3. **Cross-visit watermark/reference overlay** — toggleable, per-visit-selectable
         reference layers showing past visits' annotations — complete. The facial diagram
         drawing tool sub-project is now complete (all 3 phases).
   3. **Photo capture** — camera capture with a centering oval guide, before/after tagging,
      progressive timeline; builds on Foundation's existing file storage. Decomposed
      (2026-08-02) into two phases:
      1. **Capture + per-visit gallery** — camera capture with the oval framing guide,
         session-wide before/after mode toggle, upload, and a gallery of the current visit's
         photos, embedded in the Valoración detail page — complete
      2. **Progressive timeline** — patient-level chronological before/after view across all of
         a patient's visits — complete. The photo capture sub-project is now complete (both
         phases), and with it, all three Valoración sub-projects are complete.
4. **Treatments** — follow-up visits: treatment selection, consent signing, diagram, photos
   (reuses Valoración's diagram tool and photo capture). — complete. Decomposed (2026-08-02) into
   four ordered sub-projects, each with its own brainstorm → spec → plan → cycle:
   1. **Treatment catalog** — admin-managed treatment types, each with an editable consent-form
      text template. Foundational; nothing else in this module can reference a treatment type
      until this exists. — complete
   2. **Treatment visit core** — create a Treatment visit for a patient, show their treatment
      history on entry, select one or more treatment types from the catalog for the visit,
      per-treatment notes. — complete
   3. **Consent signing** — each selected treatment gets its own consent, pre-filled from its
      type's template text, signed via an on-screen drawn signature, embedded as an image in the
      stored consent record. — complete. **Design note (2026-08-02, from the treatment catalog's
      final review):** `TreatmentType.consentTemplate` is freely editable in place with no
      versioning — resolved by this sub-project: the signing endpoint snapshots the rendered
      consent text onto the `Consent` row at signing time (never re-read live), and additionally
      rejects signing (409) if the template changed since the consent page was loaded, so a signed
      document is immutable by construction and provably matches what the patient actually read.
      **Resolved by this sub-project (was a design note from treatment visit core's final
      review):** `PATCH /api/treatments/[id]/items` used to replace a visit's entire
      `TreatmentItem` set via delete-then-recreate; this sub-project rewrote it as an
      upsert-diff that preserves each surviving item's own database id (and therefore any signed
      `Consent` attached to it) across saves, and added a server-side guard (backed by the
      `Consent` FK's `ON DELETE RESTRICT`) rejecting any attempt to remove a treatment type that
      already has a signed consent. **Remaining design notes carried forward:**
      - A `Treatment` visit's `fecha` still has no edit path anywhere (no PATCH endpoint, no UI) —
        a visit created on the wrong calendar day can never be corrected in the record, unlike
        `Valoracion`, which does allow editing its `fecha`. Still an open gap, not addressed by
        this sub-project.
      - The item-replace endpoint still audit-logs only `action: 'update'` with no `metadata` — a
        removed (unsigned) treatment selection and its notes still vanish with no record of what
        was removed (signed items can no longer be removed at all, so the highest-severity case
        this note originally warned about is now closed). Worth capturing before/after
        `treatmentTypeId` sets in `metadata` if this endpoint is revisited again.
      - **New (2026-08-02, from this sub-project's final review):** signing is one-time and
        irreversible by design in this sub-project — there is no way to void or re-sign a consent
        if it was signed by mistake or needs correction. If that need surfaces in practice, a later
        sub-project (or the "Exportar"/admin tooling) will need a deliberate voiding workflow
        (e.g. a superseding consent record rather than mutating the original, to preserve the
        original signed artifact for audit purposes).
      - **New (2026-08-02, from this sub-project's final review):** no optimistic-concurrency
        protection exists for two staff members editing the same visit's item selection
        simultaneously — the second save silently wins and discards the first's changes. This is a
        module-wide gap (also true of `Valoracion`), not specific to consent signing, flagged here
        only because consent signing is the first place a lost concurrent edit could discard
        clinically/legally meaningful data rather than just draft notes.
   4. **Diagram + photo reuse** — adapt the existing facial diagram tool and photo capture for
      per-treatment use within a Treatment visit. — complete. Decomposed (2026-08-02) into two
      ordered mini-cycles, each with its own brainstorm → spec → plan → build, matching how
      Valoración's own diagram tool and photo capture were each built as separate sub-projects:
      1. **Diagram reuse** — extract `FacialDiagramViewsComponent`/`FacialDiagramCanvasComponent`
         from their Valoración-specific coupling and wire the diagram tool into Treatment visits.
         — complete. Resolved the reference-source-abstraction concern raised by the note below: a
         `DiagramDataSource` strategy-object `@Input()` (list/get reference options, save) plus a
         `permissionModule` `@Input()` replaced the hardcoded `ValoracionService`/`'valoracion'`
         coupling, with `ValoracionDetailComponent`'s own usage kept fully behavior-preserving
         (verified via an explicit manual regression pass, twice). A new `TreatmentItemDiagram`
         model (mirroring `ValoracionDiagram`, keyed on `treatmentItemId`, `onDelete: Cascade` so
         deselecting a not-yet-consented item correctly takes its diagrams with it) backs the
         Treatments side.
      2. **Photo reuse** — extract `PhotoCaptureComponent`/`PhotoGalleryComponent` similarly,
         including the `Photo` schema change needed to attach photos to a Treatment visit. —
         complete. A `PhotoDataSource` strategy object (mirroring `DiagramDataSource` exactly) and
         a new `TreatmentItemPhoto` model (mirroring `Photo`, keyed on `treatmentItemId`,
         `onDelete: Cascade` — applied correctly from this sub-project's first task, specifically
         to avoid repeating the `TreatmentItemDiagram` FK mistake caught by the diagram mini-cycle's
         final review) closed out the module. `facial-diagram/` and `photo/` both moved from
         `apps/web/src/app/valoracion/` to `apps/web/src/app/shared/`, resolving the folder-location
         note from the diagram mini-cycle — except `photo-timeline.component.ts`, the patient-level
         cross-visit photo page, which the final review correctly flagged as NOT belonging in
         `shared/` (it's a routed aggregator page depending on both `valoracion/` and `treatments/`
         services, not a dependency-light reusable widget) and which was relocated again, to its own
         `apps/web/src/app/photo-timeline/`, before the module was marked done. That timeline page
         now merges Valoración and Treatment-item photos into one chronologically-sorted view,
         permission-gated so a `treatments:view`-less user sees it exactly as before this
         sub-project. **Design notes (2026-08-03, from this sub-project's final review, deferred
         rather than fixed):**
         - `/photos`'s route guard checks only `valoracion:view`, not `treatments:view` — a
           hypothetical role with `treatments:view` but not `valoracion:view` (RBAC is fully
           custom/admin-configurable, so this is constructible even though no such role exists
           today) could never open a page that now shows their own data. Needs a deliberate
           decision (widen the guard to either permission, or explicitly keep this a
           Valoración-owned page) whenever this next comes up, not an oversight to carry forward
           silently.
         - `/api/files/[...path]` gates every stored image — Valoración photos, treatment photos,
           and consent signatures alike — on `patients:view` alone, not a per-category permission.
           Pre-existing (unchanged by this sub-project, true for consent signatures since that
           module too), but now backs a second PHI-image category; a per-category permission check
           on that route is the eventual fix, not required for this branch.

   **Note (2026-08-02, from the facial
   diagram tool's Phase 3 final review):** `FacialDiagramViewsComponent`/`FacialDiagramCanvasComponent`
   are currently coupled to Valoración specifically — they inject `ValoracionService` directly (for
   save, the reference-visit list, and the reference-visit fetch), require a `patientId`, and
   hardcode `valoracion.diagram.*` i18n keys and the `valoracion:edit` permission check. Reuse by
   Treatments is not drop-in; budget time to extract a reference-source abstraction (e.g. an
   `@Input() referenceSource` exposing `list()`/`get()` plus a label projector) before Treatments'
   own brainstorm/plan assumes these components can be reused as-is. **Resolved 2026-08-03 by the
   diagram reuse mini-cycle above.** **Same note applies to photo
   capture (2026-08-02, from its Phase 1 final review):** `PhotoCaptureComponent`/
   `PhotoGalleryComponent` repeat the identical pattern — both inject `ValoracionService` directly,
   take `valoracionId` as their identity, hardcode `valoracion:edit`/`valoracion:view` permission
   checks and `valoracion.photos.*` i18n keys, and the API lives at
   `/api/valoracion/[id]/photos`. Additionally, `Photo.valoracionId` is a **required** FK to
   `Valoracion` — Treatments' own photo capture will need a schema change (nullable
   `valoracionId` + a `treatmentId`, or a polymorphic owner), not just a component-level
   abstraction, before it can attach photos to a Treatment visit. **Update (2026-08-02, from photo
   capture's Phase 2 final review):** the Phase 2 patient-photo-timeline endpoint
   (`GET /api/patients/[patientId]/photos`) does NOT share this coupling — it's keyed on
   `patientId` only, with no Valoración in the path or query, so it's reusable by Treatments
   as-is. The extraction budget above is specifically for `PhotoCaptureComponent`/
   `PhotoGalleryComponent` (Phase 1) and the diagram tool's components, not the timeline.
   **Resolved 2026-08-03 by the photo reuse mini-cycle above** — including the timeline itself,
   which turned out to need its own (light) touch after all: not the coupling this note warned
   about, but a home of its own once it started aggregating both modules' data.
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
