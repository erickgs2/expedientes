# Exportar — PDF Export

Status: approved
Date: 2026-08-03

## Purpose

Let staff generate a single PDF containing a patient's clinical record — Historia Clínica,
Valoración history, and Treatment history (with signed consents) — to hand to the patient or
another provider. This is the sixth top-level module in the roadmap (see
`2026-08-01-project-overview.md`), building on top of every clinical-data module already shipped.

## Scope

In scope:
- A per-patient export page reachable from a new top-level "Exportar" nav item, requiring an
  active patient (like Historia Clínica/Valoración/Treatments).
- Three independently selectable modules — Historia Clínica, Valoración, Treatments — each
  checked by default so "export everything" is just the default state; unchecking any subset
  achieves "export specific modules."
- Facial-diagram annotations (Valoración and Treatment-item diagrams) rendered into the PDF as
  images, produced client-side before the export request is sent.
- Signed consent text and signature images, included automatically whenever Treatments is
  checked — no separate toggle, since a consent doesn't exist independently of its treatment item.
- The exported PDF's language follows the app's current language toggle at the moment of export.
- An audit-log entry recording that an export happened, which modules were included, and in what
  language.

Out of scope (deferred):
- Photos (Valoración/Treatment before/after images) — explicitly excluded from this pass.
- Appointment/booking history — not part of the clinical record this feature targets.
- Any persisted export history (a table of past exports, a "re-download" list) — generation is
  synchronous and ephemeral: the user clicks, waits, and receives the file directly. Nothing is
  written to disk beyond the response stream.
- Per-visit or per-item granularity in the selection UI (e.g. picking individual Valoración visits
  to include) — the three module-level toggles are the only selection surface.
- Multi-patient/bulk export.

## Architecture

### Frontend: selection page and diagram rendering

New route `/export`, guarded by `[authGuard, permissionGuard('export', 'view'), activePatientGuard]`
— reuses the already-seeded `export:view`/`export:create` permissions, no seed changes needed. A
new `ExportComponent` shows three checkboxes (Historia Clínica, Valoración, Treatments — all
checked by default) and a "Generate PDF" button, gated by `export:create`.

Before submitting, the component renders every facial diagram belonging to a checked module into a
PNG:
1. Fetch the patient's Historia Clínica (for module presence only — it has no diagrams), full
   Valoración list (each with its diagrams), and full Treatment list (each item with its
   diagrams) — reusing the existing `HistoriaClinicaService`/`ValoracionService`/`TreatmentsService`
   read methods, no new backend endpoints needed for this step.
2. For each diagram found across the checked modules, render it to a PNG using the same Fabric.js
   "load JSON over the base placeholder image" logic `FacialDiagramCanvasComponent` already uses
   for interactive drawing — extracted into a small reusable function both the interactive
   component and this export flow call — against an off-screen `<canvas>` created just for this
   render and discarded afterward. This keeps Fabric.js and canvas rendering entirely client-side;
   the backend never touches diagram JSON directly.
3. If any single diagram fails to render (rare — e.g. corrupted stored JSON), the whole export is
   aborted before any request is sent, with an error shown to the user, rather than silently
   producing a PDF missing one image. This is a document staff may hand to a patient or another
   provider — a visibly-incomplete failure is safer than a silently-incomplete one.

### Backend: export endpoint

`POST /api/patients/[patientId]/export` (`export:create`), sent as `multipart/form-data` — matching
this app's existing upload convention (photo/signature uploads already use `FormData` +
`request.formData()`, not base64-JSON). Fields:
- `modules` — a JSON string, e.g. `{"historiaClinica":true,"valoracion":true,"treatments":false}`.
- `language` — `"es"` or `"en"`.
- Zero or more diagram image files, one per diagram the frontend rendered, each keyed predictably
  (e.g. `diagram_valoracion_<valoracionId>_<view>`, `diagram_treatmentItem_<itemId>_<view>`) so the
  backend can match each image back to the record it belongs to when assembling the document.

The handler re-fetches every selected module's data server-side (never trusts the client for
anything beyond which modules/language were chosen and the rendered diagram images) — the same
`get`/`list` functions the existing Historia Clínica/Valoración/Treatments routes already use —
builds the PDF with `@react-pdf/renderer` (a new dependency: a declarative, component-based PDF
layout library that runs entirely in Node, no headless browser), and streams it back directly:
`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="<patient
name>-<date>.pdf"`. Nothing is written to disk. After a successful build, a
`writeAuditLogSafe` entry is written: `action: 'create'`, `entity: 'PatientExport'`,
`entityId: patientId`, `patientId`, `metadata: { modules, language }`.

If the request fails at any point (a module's data fetch throws, PDF assembly throws), the handler
returns the app's standard structured error response — never a partial or corrupt PDF stream.

### PDF document structure

One document per export request:
1. A header: patient identity (full name, phone, document id) and the generation date.
2. One section per checked module, in a fixed order — Historia Clínica, Valoración, Treatments —
   each mirroring the field groupings of its on-screen detail page:
   - **Historia Clínica**: every field, grouped the same way the form is (personal info, medical
     info, personal history, family history, allergies).
   - **Valoración**: each visit, chronologically, with its notes and its rendered diagram images.
   - **Treatments**: each visit, chronologically, each item's notes, its rendered diagram images,
     and — if signed — its consent (the consent text exactly as stored at signing time, plus the
     signature image embedded directly from disk; no client rendering needed for this one, it's
     already a raster image).
3. A module that's unchecked, or where the patient has no data for it yet (e.g. no Historia
   Clínica filled in), is skipped entirely — never rendered as an empty placeholder section.

All PDF text goes through the same Transloco string keys/values already used on-screen, resolved
server-side for the requested `language` at generation time (not through the Angular pipe, since
this runs entirely on the backend).

### Permissions

Reuses the already-seeded `export:view`/`export:create` module — no seed changes. `export:view`
gates the page, `export:create` gates the backend endpoint itself.

**Correction (2026-08-03, from the final implementation review):** an earlier draft of this
section claimed `export:create` alone was sufficient — that the endpoint would not additionally
require `historia-clinica:view`/`valoracion:view`/`treatments:view`. That turned out to be
inaccurate given the chosen architecture: the frontend renders facial-diagram annotations to PNG
client-side before submitting the export request, which means it fetches each Valoración/Treatment
visit's data through those modules' own existing, permission-gated endpoints first. A role holding
only `export:*` gets a 403 partway through that fetch and the export fails. In practice, generating
an export therefore requires `export:create` **plus** `valoracion:view`/`treatments:view` for
whichever modules are checked (Historia Clínica has no diagrams and is fetched entirely
server-side, so it has no such requirement). This is treated as the accepted, reasonable behavior
rather than a gap to close — a records-generation role needing read access to the data it
generates documents from is unsurprising. A genuinely view-less "export only" role is not supported
by this sub-project; it would need a new `export:create`-gated backend endpoint that supplies
diagram data directly, bypassing `valoracion:view`/`treatments:view` entirely — deferred unless
that need actually surfaces.

## Error Handling

Standard pattern already established throughout this app: failures surface via the existing global
error-interceptor toast. The one deliberate departure is the client-side diagram-rendering
pre-check (see above) — an export is never submitted, and never partially generated, if a diagram
that should be included can't be rendered.

## Testing

Same low-effort convention as every prior module: no automated tests, verified by building and
manual testing — generating an export with each module combination, in both languages, confirming
the resulting PDF's content, section order, and embedded images (diagrams and consent signatures)
are correct.
