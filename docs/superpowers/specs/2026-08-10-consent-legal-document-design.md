# Consents — Structured Legal Document

Status: approved
Date: 2026-08-10

## Purpose

Turn the consent from a free-text block plus one patient signature into a real informed-consent
document with legal weight: it identifies the clinic and the treating physician (name and cédula),
identifies the patient and the document they identified themselves with, states where and when it
was signed, describes the procedure along with its risks, alternatives, aftercare and
contraindications, and carries signature blocks for the patient, an optional witness, and the
physician. It prints in the record export as its own annex pages — one or more per consent, with a
per-consent page counter — so a printed consent stands on its own as a signed instrument.

The paper form this replaces (`CONSENTIMIENTO INFORMADO`, with LUGAR / FECHA / YO … / SE IDENTIFICA
CON / PACIENTE / TESTIGO / MÉDICO) is the reference for the layout and the boilerplate wording.

## Scope

In scope:
- New `ClinicSettings` single-row table holding the clinic and physician identity, the default
  place, the two boilerplate paragraphs, and the physician's stored signature image; plus an
  admin screen and API to edit it.
- `TreatmentType` consent template split into named sections: description (required), risks,
  alternatives, aftercare, contraindications (all optional).
- `Consent` rewritten to snapshot every printed value at signing time.
- A pure `buildConsentDocument` function in `apps/api/src/lib/consent/`, whose output feeds both
  the signing screen (over the API) and the PDF renderer.
- Signing screen captures place, patient identification, and an optional witness name +
  signature, alongside the existing patient signature.
- The record export renders each signed consent on its own `<Page>` with fixed header/footer and
  a true per-consent `Página X de Y`.

Out of scope:
- Backward compatibility with consents signed under the old format. There are none in use; the
  existing `Consent` rows and their signature files are dropped by the migration.
- Voiding or re-signing a consent. Signing stays a one-time, irreversible action per item, as
  established in `2026-08-02-treatments-consent-signing-design.md`.
- A standalone per-consent PDF download from the signing screen. Consents appear in the record
  export only.
- Per-page patient initials.
- Multiple physicians. The clinic has one identity; a per-user override is deliberately deferred.

## Architecture

### Data model

```prisma
model ClinicSettings {
  id                  String   @id @default("singleton")
  clinicName          String
  defaultPlace        String
  doctorTitle         String
  doctorName          String
  doctorLicense       String
  doctorSignaturePath String?
  declarationBefore   String
  declarationAfter    String
  updatedAt           DateTime @updatedAt
}
```

A single row, its primary key defaulting to the literal string `singleton`. Every read and write
targets `where: { id: 'singleton' }`, so a second row cannot be created by the application; the
seed upserts it with the defaults below. This is simpler than a separate constraint and makes the
"there is exactly one clinic identity" invariant visible in the schema.

`declarationBefore` and `declarationAfter` hold the boilerplate that surrounds the procedure
sections, seeded verbatim from the paper form and editable afterwards without a deploy. They
support the placeholders `{{patientName}}`, `{{doctorTitle}}`, `{{doctorName}}`,
`{{doctorLicense}}` and `{{clinicName}}`. An unrecognized `{{…}}` token is left in the text
untouched rather than blanked, so a typo in an edited paragraph is visible instead of silently
deleting content.

The seeded `declarationAfter` extends the paper wording with two clauses the paper form lacks and
that carry real weight for this practice: the patient's right to revoke consent at any time before
the procedure, and authorization for clinical photography (the app already stores treatment
photos). Both are plain editable text — they can be reworded or deleted from the admin screen.

```prisma
model TreatmentType {
  // …existing fields…
  consentDescription       String
  consentRisks             String?
  consentAlternatives      String?
  consentAftercare         String?
  consentContraindications String?
}
```

`consentTemplate` is renamed to `consentDescription` and stays required; the four new fields are
optional so existing catalog entries remain valid and can be enriched over time.

```prisma
model Consent {
  id                        String        @id @default(uuid())
  treatmentItemId           String        @unique
  treatmentItem             TreatmentItem @relation(fields: [treatmentItemId], references: [id])
  place                     String
  patientNameSnapshot       String
  patientIdentification     String
  clinicNameSnapshot        String
  doctorTitleSnapshot       String
  doctorNameSnapshot        String
  doctorLicenseSnapshot     String
  declarationBeforeSnapshot String
  declarationAfterSnapshot  String
  sections                  Json
  patientSignatureImagePath String
  witnessName               String?
  witnessSignatureImagePath String?
  signedAt                  DateTime      @default(now())
}
```

Every value that appears on the printed page is snapshotted, extending the immutability rule
`consentText` already followed: editing the clinic identity, the boilerplate, or a catalog entry
must never change what an already-signed consent appears to say. The declaration snapshots are
stored **already interpolated**, so re-rendering never has to reconstruct the placeholder context.
`sections` is a JSON array of `{ key, body }` — JSON rather than five columns because the set of
sections is the part most likely to grow, and nothing queries an individual section.

The one deliberate exception is `ClinicSettings.doctorSignaturePath`, which is read **live** at
export time rather than snapshotted. This is intentional and requested: uploading the physician's
signature once applies it to consents that were already signed. The physician's identity —
the name and cédula that legally bind the document — is still snapshotted, so a later settings edit
can change which signature image is stamped but never which physician the patient consented to.

### Migration

`ClinicSettings` is created and seeded. `TreatmentType.consentTemplate` is renamed to
`consentDescription` (a rename, so existing catalog text is preserved). Existing `Consent` rows are
deleted, since none exist in real use and the new non-null columns cannot be back-filled with
values that were never captured. The migration does not delete the corresponding signature files
from storage; that is a one-line manual cleanup of `storage/consents/` noted in the plan.

### Shared document model

`buildConsentDocument` lives in `apps/api/src/lib/consent/build-consent-document.ts`; the
`ConsentBlock` union is declared in `libs/shared/types` so the Angular renderer can type the
blocks it receives.

The document is assembled **only on the server**. The signing screen does not build it — it
renders a `ConsentBlock[]` returned by the API, both for the pre-signing preview and for an
already-signed consent. This is a stronger guarantee than sharing the function would be: the text
the patient reads on screen is produced by the exact code path that produces the archived PDF, so
the two cannot drift even in principle. It also avoids standing up a new workspace lib with its
own package, tsconfigs and jest config for a single function.

```ts
export type ConsentBlock =
  | { kind: 'title'; text: string }
  | { kind: 'fieldLine'; label: string; value: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'sectionHeading'; text: string }
  | { kind: 'signatureBlock'; role: 'patient' | 'witness' | 'doctor';
      caption: string; subCaption?: string };

export function buildConsentDocument(input: ConsentDocumentInput): ConsentBlock[];
```

`ConsentDocumentInput` carries the identity values, the two declaration paragraphs, the section
bodies, the signing details (place, date, patient name, identification, witness name) and a label
bundle. It is shaped so that both a live preview (settings + catalog entry, before signing) and a
stored snapshot (the `Consent` row, after signing) map onto it — the same input type, populated
from different sources, which is what guarantees the preview and the archived document agree.

Emitted block order:

1. `title` — CONSENTIMIENTO INFORMADO
2. `fieldLine` — LUGAR, FECHA, PACIENTE
3. `fieldLine` — SE IDENTIFICA CON
4. `paragraph` — interpolated `declarationBefore`
5. per present section, `sectionHeading` + `paragraph` — PROCEDIMIENTO, RIESGOS Y COMPLICACIONES,
   ALTERNATIVAS DE TRATAMIENTO, CUIDADOS POSTERIORES, CONTRAINDICACIONES
6. `paragraph` — interpolated `declarationAfter`
7. `signatureBlock` — PACIENTE, TESTIGO (omitted entirely when there is no witness), MÉDICO

Sections whose body is absent or blank after trimming are omitted along with their heading. The
function is pure, with no Angular, Prisma or react-pdf imports, so it is directly unit-testable.

### Backend endpoints

- `GET /api/clinic-settings` (`clinic-settings:view`) — returns the singleton, or `null` when it
  has not been configured. Serves the admin screen only. `doctorSignaturePath` is returned as a
  path served through the existing authenticated `/api/files/[...path]` route.
- `PUT /api/clinic-settings` (`clinic-settings:edit`) — multipart: the text fields plus an optional
  `doctorSignature` JPEG. Upserts on `id: 'singleton'`. The signature is validated with the same
  1KB–10MB bounds and `isJpeg` magic-byte check the consent and photo routes already share, and
  stored via `saveFile(buffer, 'clinic', 'settings', 'signature.jpg')`. Writes an audit entry with
  entity `ClinicSettings` and no `patientId` — edits here affect every future consent, so they need
  a trail.
- `GET /api/treatment-items/[id]` (existing, `treatments:view`) — extended to return the treatment
  type's five section fields, the `ConsentDocumentInput` values the preview needs (clinic and
  physician identity, default place, the two declaration paragraphs, `settingsUpdatedAt`), and,
  when signed, the full new `Consent` shape.

  The signing screen deliberately reads the clinic identity through *this* endpoint rather than
  calling `GET /api/clinic-settings`. A clinician who signs consents holds `treatments:edit` but
  not necessarily `clinic-settings:view`; routing the preview through the item endpoint keeps the
  narrower admin permission on the admin screen without locking clinicians out of signing.
- `POST /api/treatment-items/[id]/consent` (existing, `treatments:edit`) — extended. Multipart now
  carries `patientSignature`, optional `witnessSignature`, `place`, `patientIdentification`,
  optional `witnessName`, `templateUpdatedAt`, and `settingsUpdatedAt`.

New permission module `clinic-settings` with `view` and `edit` actions, seeded to the Admin role.
The physician's stored signature image is the one asset in this system that could be misused to
fabricate a consent, so it is deliberately not editable by everyone holding `treatments:edit`.

### Signing flow

The server owns every value written to the `Consent` row. It re-reads `ClinicSettings` and the
`TreatmentType` inside `signTreatmentItemConsent` and builds all `*Snapshot` fields itself; the
client supplies only the three text inputs and the signature images. This preserves the rule
already documented in the consent route: the client never sends document text, so a tampered
request cannot alter what the record says was agreed to.

Two concurrency tokens are checked, each returning `409` with its own message so the user knows
which side moved:

- `templateUpdatedAt` against `TreatmentType.updatedAt` (existing behaviour).
- `settingsUpdatedAt` against `ClinicSettings.updatedAt` (new) — a mid-session edit to the
  boilerplate must not slip wording past a patient who never read it.

Signing is rejected with `409` when `ClinicSettings` is missing or `doctorName`/`doctorLicense` are
blank. A consent that omits the physician's identity is precisely the defect this work exists to
fix, so the server enforces it rather than trusting the UI to.

`Consent.treatmentItemId @unique` continues to guard double-signing. Signature files are written
before the row is created, so a losing concurrent sign leaves orphan images and no bad row — the
same trade-off the current implementation already makes.

### Frontend

- **`SignaturePadComponent`** (`shared/signature-pad/`): the pointer-drawing, white-fill-before-
  first-stroke and JPEG-blob-capture logic extracted verbatim from `ConsentSignComponent`. Three
  consumers now need it (patient, witness, physician-in-settings); three copies of that pointer
  math is the duplication to avoid.
- **`ClinicSettingsComponent`** (route `/admin/clinic`, guarded by
  `permissionGuard('clinic-settings', 'view')`): text fields for the identity values and the two
  boilerplate paragraphs, plus a signature slot using `SignaturePadComponent` with a replace
  action. Save controls are disabled without `clinic-settings:edit`, matching the read-only
  pattern used elsewhere.
- **`ConsentSignComponent`** (existing route): loads the item, the patient, and clinic settings.
  When settings are missing or the physician identity is blank, signing is blocked with a message
  pointing to `/admin/clinic`. Otherwise it renders the assembled document from
  `buildConsentDocument` — this is what the patient reads — above which sit three inputs: LUGAR
  (pre-filled from `defaultPlace`, required), SE IDENTIFICA CON (pre-filled from
  `patient.documentId`, required), and TESTIGO name (optional). The patient signature pad is
  required; the witness pad renders only once a witness name is typed. After signing, the same
  block list is rendered from the snapshot instead of the live data.

### PDF rendering

New file `apps/api/src/lib/export/consent-document-pdf.tsx`. `build-pdf.tsx` is already 296 lines
and the consent renderer plus its styles would roughly double it.

It exports `<ConsentPage>`, mapping `ConsentBlock[]` to react-pdf primitives with a `kind` switch:
`title` to a centered heading, `fieldLine` to a label with an underlined value, `paragraph` to
justified body text, `sectionHeading` to bold uppercase, and `signatureBlock` to the signature
image over a ruled line with its caption beneath.

Each consent is one `<Page size="A4" wrap>` element inside the existing `<Document>`, emitted after
the record page, flowing onto as many physical sheets as its content needs.
`@react-pdf/renderer` 4.5.1 exposes `subPageNumber` and `subPageTotalPages` in the `Text` render
prop, and these reset per `<Page>` element — so the `fixed` footer prints a true per-consent
`Página X de Y` rather than a counter running across the whole export.

Two layout rules exist for integrity rather than aesthetics:

- Every page carries a `fixed` header (clinic name, CONSENTIMIENTO INFORMADO, treatment type) and
  a `fixed` footer (patient name, signing date, page counter), so a detached sheet still identifies
  its document and its signatory.
- The signature blocks render inside a `wrap={false}` view, so signatures can never be orphaned
  onto a sheet with no consent text above them.

Signature images are read into buffers before the JSX tree is constructed, as `build-pdf.tsx`
already documents — react-pdf needs `Image` `src` data synchronously at render time. The existing
map keyed by treatment-item id is extended to hold the witness signature, and the physician's
signature is read once from `ClinicSettings` and reused across every consent page. A missing or
unreadable signature file prints a blank ruled line and logs, matching the existing per-item
`try/catch`: one bad file must not fail the whole export.

The inline consent block inside the treatment history is replaced by a one-line reference
("Consentimiento firmado el …, ver anexo"), so the history stays scannable and the consent lives
in its annex.

## Error Handling

- `place` and `patientIdentification` are required, trimmed, and capped at 200 characters.
- `witnessName` is optional, but a witness name without a signature, or a witness signature
  without a name, is rejected `400`. A half-captured witness is worse than none.
- Both signature blobs get the full existing treatment: the `content-length` early-out, the
  authoritative post-read size bounds, and `isJpeg` magic-byte verification.
- Failures surface through the existing global error-interceptor toast. The signing screen keeps
  the drawn signatures and typed fields on screen when a submit fails, so nothing has to be
  re-drawn to retry.

## Testing

Matching this repo's convention of unit-testing pure logic modules (`permissions.spec.ts`,
`image-signature.spec.ts`) rather than routes or components:

`apps/api/src/lib/consent/build-consent-document.spec.ts` covers:
- block ordering for a fully-populated document;
- placeholder interpolation, including an unrecognized placeholder left intact;
- optional sections omitted when blank or whitespace, rendered when present;
- the witness signature block absent without a witness and present with one;
- a stored-snapshot input producing output identical to the equivalent live input.

Manual verification: sign a consent with a witness and one without, export the record, and confirm
the annex pages, the per-consent `Página X de Y`, and the stamped physician signature.

All new UI labels go into `es.json`/`en.json`; the PDF's fixed strings join the existing `consent`
label in `pdf-labels.ts`.
