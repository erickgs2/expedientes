# Note authorship and electronic signature (NOM-004-SSA3-2012 5.10, 5.11)

Phase B of the NOM-004 plan. Covers three note kinds: valoración, treatment visit (including its items, diagrams and products) and historia clínica.

## Data
- `createdById` on each note: the author. Existing rows were backfilled from the first `create` AuditLog entry; rows created before this change are flagged `legacyRecord = true` and cannot be signed.
- `fecha` stays the clinical date; the real time shown is `createdAt`, rendered in the clinic time zone.
- Signature: `signedById`, `signedAt`, `signedHash` (sha256 of a stable serialisation of the note content), plus a snapshot of `signerName`, `signerTitle`, `signerLicense`, so later profile changes do not rewrite past signatures.
- User: `professionalTitle`, `professionalLicense`, `signingPinHash` (bcrypt).

## Flow
- Signing is manual: POST `/api/notes/sign {kind, id, pin}`. Requires edit permission on the note's module, a writable (non-archived) patient, a licence on the profile and the user's 6-digit PIN. Five wrong PINs in 15 minutes lock signing for that user. Every signature writes an AuditLog `sign` entry.
- The PIN is set at `/perfil` (PUT `/api/me/signing-pin`), which asks for the account password.
- Editing a signed note recomputes the hash; if the content changed the signature is voided and an AuditLog `update` with `signatureVoided: true` is written. Phase C will replace voiding with locking plus addenda.
- `/api/notes/unsigned` lists the user's own unsigned notes from the last 7 days; Today shows them as a reminder.
- The PDF export prints the authorship and signature line under each note.

## Not covered
Photos and consents are outside the signed content (consents carry their own signatures). This is a simple electronic signature in the sense of the Código de Comercio, not a FIEL/e.firma advanced signature; legal sufficiency is pending review.
