# Note authorship and electronic signature (NOM-004-SSA3-2012 5.10, 5.11)

Phases B and C of the NOM-004 plan. Covers three note kinds: valoración, treatment visit (including its items, diagrams and products) and historia clínica.

## Data
- `createdById` on each note: the author. Existing rows were backfilled from the first `create` AuditLog entry; rows created before this change are flagged `legacyRecord = true` and cannot be signed.
- `fecha` stays the clinical date; the real time shown is `createdAt`, rendered in the clinic time zone.
- Signature: `signedById`, `signedAt`, `signedHash` (sha256 of a stable serialisation of the note content), plus a snapshot of `signerName`, `signerTitle`, `signerLicense`, so later profile changes do not rewrite past signatures.
- User: `professionalTitle`, `professionalLicense`, `signingPinHash` (bcrypt).

## Flow
- Signing is manual: POST `/api/notes/sign {kind, id, pin}`. Requires edit permission on the note's module, a writable (non-archived) patient, a licence on the profile and the user's 6-digit PIN. Five wrong PINs in 15 minutes lock signing for that user. Every signature writes an AuditLog `sign` entry.
- The PIN is set at `/perfil` (PUT `/api/me/signing-pin`), which asks for the account password.
- `/api/notes/unsigned` lists the user's own unsigned notes from the last 7 days; Today shows them as a reminder.
- The PDF export prints the authorship and signature line under each note.

## Phase C: locking, addenda and versions
- Every route that edits a note calls `beginNoteEdit` before writing and `afterNoteEdit` after. A signed valoración or treatment visit (including its items, diagrams and products) answers 409 `NOTE_SIGNED`. Photos and consents are not part of the signed content and stay open.
- Drafts stay editable; each save that changed something writes an AuditLog `update` whose `metadata.changes` holds each changed field's before and after. Diagram strokes are logged as a 12-character hash per view.
- Addenda (`ClinicalAddendum`): POST `/api/notes/addenda {kind, id, text, diagrams?, pin}` for a signed valoración or treatment visit only. Written and signed in one step with the same PIN check and limit; text and/or the addendum's own diagram views; `contentHash` over its content. There is no route or function to edit or delete one. They print under their note in the PDF, with their diagrams (`diagram_addendum_<id>_<view>`).
- Historia clínica (`HistoriaClinicaRevision`): not locked. Every save that changes the content keeps a numbered revision with the full content; signing stamps the latest revision, which keeps its signature when the historia changes later (the historia's own signature is voided, as in phase B). Revision 1 of an existing historia is written by the API on its first save or when its history is opened, from the content the app reads, marked `legacyRecord` when the historia was. Once a known user saves a new version it becomes signable. GET `/api/patients/:id/historia-clinica/revisions` lists versions newest first with the changed fields.
- Purging a patient (5 years) deletes addenda and revisions with the rest of the record.

## Not covered
Photos and consents are outside the signed content (consents carry their own signatures). This is a simple electronic signature in the sense of the Código de Comercio, not a FIEL/e.firma advanced signature; legal sufficiency is pending review.
