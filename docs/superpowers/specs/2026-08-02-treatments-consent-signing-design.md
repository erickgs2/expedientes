# Treatments — Sub-project 3: Consent Signing

Status: approved
Date: 2026-08-02

## Purpose

Let each treatment type selected on a Treatment visit get its own signed consent: the consent
text is pre-filled from the treatment type's catalog template, the patient signs by drawing a
signature on-screen, and the signed text + signature are stored immutably — a later edit to the
catalog's template must never change what an already-signed consent appears to say. This is
sub-project 3 of 4 for the Treatments module (see `2026-08-01-project-overview.md`), built on
sub-project 2's `Treatment`/`TreatmentItem` visit core.

## Scope

In scope:
- Sign a single treatment item's consent: review the pre-filled text (from its treatment type's
  current `consentTemplate`), draw a signature, submit.
- Store the exact text shown at signing time and the signature image, both immutable afterward.
- View an already-signed item's consent (its snapshotted text + embedded signature image),
  read-only.
- Prevent a treatment item that already has a signed consent from being removed from its visit
  (the checkbox on the treatment detail page locks once signed).
- Fix the treatment-item save endpoint's delete-and-recreate replace strategy, which would
  otherwise orphan a signed consent's foreign key on an unrelated edit to the same visit.

Out of scope (deferred, not part of this sub-project):
- Voiding or re-signing a consent once signed — signing is a one-time, irreversible action per
  item. A mis-drawn signature can be cleared and redrawn only before the initial submission.
- Any "visit complete" gate — this app has no such concept anywhere today, and signing stays
  optional per item rather than blocking anything.
- PDF export of a signed consent (the "Exportar" module, later in the roadmap).
- Per-treatment diagram annotations and photos (sub-project 4).

## Architecture

### Data model

```prisma
model Consent {
  id                 String        @id @default(uuid())
  treatmentItemId    String        @unique
  treatmentItem      TreatmentItem @relation(fields: [treatmentItemId], references: [id])
  consentText        String
  signatureImagePath String
  signedAt           DateTime      @default(now())
}
```

One consent per treatment item (`@unique` on `treatmentItemId`). `consentText` is a snapshot,
copied verbatim from `TreatmentType.consentTemplate` by the server at signing time — never
re-read live from the catalog afterward, so a later catalog edit can't retroactively change what a
signed consent appears to say (the hard requirement flagged by the treatment catalog's final
review). `signatureImagePath` is a relative path in the same format as `Photo.filePath`, resolved
through the existing `apps/api/src/lib/storage/file-storage.ts` (`saveFile(buffer, 'consents',
patientId, 'signature.jpg')`) and served back through the existing authenticated
`/api/files/[...path]` route (already serves JPEG inline; the signature is stored as JPEG
specifically so no changes are needed there — see Frontend below).

`TreatmentItem` gains an implicit optional `consent Consent?` back-relation (Prisma infers this
automatically from `Consent.treatmentItem`'s `@relation`).

### Fixing the item-replace endpoint (prerequisite)

`replaceTreatmentItems` (`apps/api/src/lib/treatment/treatment.ts`) currently deletes every
`TreatmentItem` row for a treatment and recreates the submitted set from scratch on every save —
explicitly flagged by its own code comment, written during sub-project 2, as needing to change
before anything attaches per-item data. This sub-project makes that change:

- The replace becomes an upsert-diff keyed on `(treatmentId, treatmentTypeId)`: an item that
  stays selected keeps its existing `id` (and therefore its `consent`, if any) and only has its
  `notes` updated; an item newly selected is created; an item no longer submitted is deleted.
- Before performing the diff, the endpoint checks whether any item being removed already has a
  signed `Consent`. If so, the whole save is rejected with `400 INVALID_INPUT` — enforced
  server-side, not just via the disabled checkbox on the frontend, matching this app's convention
  of never relying on client-only enforcement for anything data-integrity-relevant.

### Backend endpoints

- `GET /api/treatment-items/[id]` (`treatments:view`) — one item's full detail: `treatmentTypeId`,
  `treatmentTypeName`, `notes`, `patientId` and `treatmentId` (for the frontend's patient-mismatch
  guard and back-navigation), the treatment type's current `consentTemplate` text (for pre-fill
  when unsigned), and the signed `consent` (`consentText`, `signatureImagePath`, `signedAt`) when
  one exists, else `null`.
- `POST /api/treatment-items/[id]/consent` (`treatments:edit`) — signs it. Multipart body with a
  single `signature` field (JPEG image), validated with the same size (1KB–10MB) and magic-byte
  checks already used for photo uploads. The server reads the item's *current*
  `TreatmentType.consentTemplate` itself to build `consentText` — the client never sends consent
  text, so a tampered request can't alter what the record says was agreed to. Returns `409
  CONFLICT` if the item already has a consent (no re-signing). On success: saves the image via
  `saveFile`, creates the `Consent` row, audit-logs `{ action: 'create', entity: 'Consent',
  entityId: consent.id, patientId }`, returns the created consent.

Both reuse the existing `treatments:view`/`treatments:edit` permissions — no new permission row,
matching how photos and diagram annotations reuse their parent module's actions rather than
getting their own.

### Frontend

- `TreatmentDetailComponent` (existing): each selected-and-saved item gains a consent-status
  action next to its notes — "Firmar consentimiento" ("Sign consent") if unsigned, "Ver
  consentimiento" ("View consent") if already signed. A newly-checked item with no backend id yet
  (not yet saved) shows neither — consistent with the existing "save first" requirement for
  anything else per-item.
- New page `ConsentSignComponent` (route `/treatments/items/:itemId/consent`): fetches the item
  detail via the new `GET` endpoint. If unsigned: shows the pre-filled `consentTemplate` text
  (read-only) and a signature canvas — freehand pointer/touch drawing, a "Limpiar" ("Clear")
  button to redo before submitting, and a "Firmar" ("Sign") button that captures the canvas as a
  JPEG blob (flattened onto an opaque white background, `canvas.toBlob('image/jpeg', quality)` —
  the same mechanism already used by `PhotoCaptureComponent`) and `POST`s it. If already signed:
  shows the snapshotted `consentText` and the embedded signature image, both read-only, with no
  form controls. "Volver" ("Back") returns to `/treatments/:treatmentId`. Uses the same
  patient-mismatch guard pattern as every other detail page in this app (compares the fetched
  item's `patientId` against `ActivePatientStore`).
- The signature pad's freehand-drawing code is new — the facial diagram tool's Fabric.js canvas
  stores vector JSON in a database column, not a rasterized image, so it isn't reusable plumbing
  here. The blob-capture-and-upload half (`canvas.toBlob` → `FormData` → `POST`) directly reuses
  the pattern already proven by `PhotoCaptureComponent`.

## Error Handling

Standard pattern already established throughout this app: failures surface via the existing
global error-interceptor toast. The consent-sign page keeps the drawn signature on screen if the
submit fails, so the patient doesn't have to re-draw it to retry.

## Testing

Same low-effort convention as every prior module: no new pure-logic module is introduced (this is
CRUD plus a signature-capture form) — verified by building and manual/API-level testing, matching
the precedent set by every prior sub-project in this module.
