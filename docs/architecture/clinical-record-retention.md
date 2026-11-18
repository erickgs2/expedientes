# Clinical record retention and consent witnesses (NOM-004, phase A)

NOM-004-SSA3-2012 asks that a clinical record be kept at least five years after the last medical act
(5.4), that nothing in it be erased (5.11), and that an informed consent carry two witnesses and the
authorization to attend contingencies (10.1.1). Phase A of the compliance plan implements those.

## Patients are archived, not deleted

- `DELETE /api/patients/[id]` archives (`archivedAt`, `archivedById`, `archiveReason`). Same
  permission as before (`patients:delete`); a reason is required.
- Archiving cancels the patient's future appointments in the same transaction, so the calendar, the
  day's desk and the WhatsApp reminders stop counting on them.
- Lists and searches show active patients. `GET /api/patients?archived=1` lists the archived ones;
  an active search returns `archivedMatches` so the screen can point to them.
- An archived record is read-only: every route that writes to a patient's chart calls
  `assertPatientWritable` / `assertRecordWritable` (`lib/patients/patient-archive.ts`) and answers
  409 `PATIENT_ARCHIVED`. Reading and exporting work as usual.
- `POST /api/patients/[id]/restore` puts the patient back.
- `POST /api/patients/[id]/purge` deletes for good: clinic owner only, archived only, five years
  after the last care (latest valoración or treatment, or the registration date), and the request
  repeats the patient's full name. The audit entry outlives the record.

## Photos are retired, not deleted

- `DELETE …/photos/[photoId]` (valoración and treatment item) sets `archivedAt`; the file stays and
  keeps counting toward storage. `POST …/photos/[photoId]/restore` puts it back.
- Galleries, timeline, summaries and the day's desk count active photos only; `?archived=1` on a
  gallery lists the retired ones with who retired them.
- The export takes an optional `retiredPhotos` module (off by default) that adds an annex.

## Consents: two witnesses and the contingencies clause

- A digital signature requires both witnesses (`WITNESSES_REQUIRED`). The second witness can use the
  clinic's stored one (`ClinicSettings.secondWitnessName` / `secondWitnessSignaturePath`); its image
  is copied onto the consent, so a later change in the settings never alters a signed letter.
- The contingencies clause (`CONSENT_CONTINGENCY_CLAUSE`, wording pending legal review) prints after
  the declarations and is frozen into `Consent.contingencyClauseSnapshot`. It is not part of the
  editable declarations.
- Consents signed before this keep exactly what they were signed with: one witness, no clause.
- The blank paper letter always has two witness lines; the paper-scan registration records an
  optional second witness name.
