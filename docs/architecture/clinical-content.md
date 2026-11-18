# Clinical content (NOM-004-SSA3-2012 5.9, 6.1, 6.2) — phase D

All fields added here are optional. MedCloud serves aesthetic clinics, where many of these sections rarely apply; they exist so a record can meet the norm when they do, and a blank one never blocks a save. Validation lives in one place, `apps/api/src/lib/clinical/clinical-fields.ts`: each field's kind and limits (text length, vital-sign ranges, the listed phototypes, skin types, units and routes). A missing key leaves a field alone; a blank value clears it.

## 5.9 Identification on every note
- `Patient.recordNumber`: the clinic's record number, assigned in order of registration (existing patients were numbered by the migration; new ones take the next, retrying on the unique `(clinicId, recordNumber)` index).
- `Patient.birthDate` and `Patient.sex` are copied from the historia clínica on every save (and by the migration), so the banner on every patient screen and the PDF header show record number, age and sex. Patients without them show a non-blocking nudge.

## 6.1 Historia clínica
New columns on `HistoriaClinica`, in the norm's order: personal pathological history and present illness; review of systems (skin, cardiovascular, endocrine, neurological, other); vital signs, weight and height (BMI computed, never stored); Fitzpatrick phototype, skin type, facial examination, skin lesions; study results, diagnosis, prognosis, treatment plan. The form shows them as three optional steps after the interview. Attachments for study results are not included yet (text only).

## 6.2 Nota de evolución
`Valoracion` and `Treatment` carry evolution, vital signs, study results, diagnosis, prognosis and instructions. A treatment visit's are saved with PATCH `/api/treatments/:id` (locked once signed, like the rest of the visit). `TreatmentItemProduct` adds quantity, unit (U, ml, mg, g), route, zone and frequency.

## Signatures
What a signature hashes includes these fields only once they hold a value, so notes signed before phase D still match their signature, and historia revisions saved before it compare unchanged.

## PDF
The header prints record number, age (at the export date) and sex. The historia prints the new groups after the interview, each only when something in it was filled; each valoración and visit prints its nota de evolución with a single vital-signs line; products print their application.
