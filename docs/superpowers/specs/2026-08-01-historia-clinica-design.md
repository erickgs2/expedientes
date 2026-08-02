# Historia Clínica — Design Spec

Status: approved
Date: 2026-08-01
Depends on: `2026-08-01-project-overview.md`, `2026-08-01-foundation-design.md` (Foundation is
complete — Patient Drive, auth/RBAC, i18n, theming, audit log, and file storage already exist)

## Purpose

The second module of Expedientes: a general patient intake record. One evolving record per
patient, editable over time (not versioned snapshots) — captures personal info, medical
background, and personal/family history. Builds directly on Foundation's Patient Drive: selecting
or creating a patient now auto-navigates into that patient's Historia Clínica.

## Deliberate exception to the project's English-naming convention

The project overview states all code/naming is in English, with Spanish only in UI text via
Transloco. `HistoriaClinica`'s Prisma schema fields (`ocupacion`, `fechaNacimiento`,
`queQuiereElPaciente`, etc.) are a **deliberate, confirmed exception**: these are specific
medical-intake terms lifted directly from the clinic's actual Spanish-language paper form, and the
user chose to keep them in Spanish in the schema rather than translate them to English identifiers.
This does not affect what patients/staff see — UI labels still come from Transloco
(`historiaClinica.fields.*`) exactly as with every other module. Later clinical modules
(Valoración, Treatments) should follow this same precedent for domain-specific clinical field
names, while everything else (function names, route paths, service/component names, comments)
stays in English as usual.

## Product decisions (settled during brainstorming)

- **Single evolving record per patient.** Created on first save, edited afterward. No version
  history beyond what the existing audit log already captures (who changed what, when).
- **Navigation:** selecting or creating a patient in Patient Drive (`patient-search.component.ts`)
  navigates to `/historia-clinica` immediately. (Future modules will need to revisit this — once
  more than one clinical module exists, "auto-navigate to which one?" becomes a real question.
  Out of scope for now; noted for whoever builds Valoración next.)
- **Alergias** uses a lightweight, auto-populated catalog (no dedicated admin-management screen) —
  an `Allergy` row is created the first time a name is used, and an autocomplete endpoint suggests
  previously-used values. Staff can always type a new one.
- **Edad** is computed and displayed from Fecha de nacimiento — not a stored field, to avoid it
  going stale.

## Architecture

### Data model (Prisma)

```prisma
model HistoriaClinica {
  id        String   @id @default(uuid())
  patientId String   @unique
  patient   Patient  @relation(fields: [patientId], references: [id])

  fecha DateTime @default(now())

  // Información del paciente
  ocupacion             String?
  fechaNacimiento       DateTime?
  sexo                  String?   // "masculino" | "femenino" | "otro"
  queQuiereElPaciente   String?
  queNecesitaElPaciente String?
  atributosEmocionales  String?

  // Información médica
  enfermedadesActuales        String?
  medicamentosAcne3Meses      String?
  cirugiasEsteticasAnteriores String?
  rutinaCuidadoFacial         String?

  // Antecedentes personales no patológicos
  consumoAlcohol          String?
  consumoTabaco           String?
  consumoDrogas           String?
  tipoFrecuenciaEjercicio String?
  vacunas                 String?
  posibilidadEmbarazo     String?   // "si" | "no" | "no_aplica"

  // Antecedentes heredofamiliares
  antecedentesHeredofamiliares String?

  allergies HistoriaClinicaAllergy[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Allergy {
  id        String                    @id @default(uuid())
  name      String                    @unique
  historias HistoriaClinicaAllergy[]
}

model HistoriaClinicaAllergy {
  historiaClinicaId String
  allergyId         String
  historiaClinica   HistoriaClinica @relation(fields: [historiaClinicaId], references: [id], onDelete: Cascade)
  allergy           Allergy         @relation(fields: [allergyId], references: [id], onDelete: Cascade)

  @@id([historiaClinicaId, allergyId])
}
```

`Patient` itself is unchanged from Foundation — this keeps the fast-path search/summary model
minimal, with clinical detail living in its own bounded record.

### Backend (`apps/api`)

- `apps/api/src/lib/historia-clinica/historia-clinica.ts` — service functions:
  `getHistoriaClinica(patientId)`, `createHistoriaClinica(patientId, data)` (throws if one already
  exists — 409), `updateHistoriaClinica(patientId, data)` (throws if none exists — 404),
  `searchAllergies(query)` (autocomplete), `upsertAllergiesByName(names[])` (find-or-create,
  returns their ids, used internally when saving a Historia Clínica's allergy list).
- Routes:
  - `GET /api/patients/:patientId/historia-clinica` — `historia-clinica:view`. 404 if none exists
    yet (frontend treats this as "show empty form", not an error state).
  - `POST /api/patients/:patientId/historia-clinica` — `historia-clinica:create`. 409 if one
    already exists.
  - `PATCH /api/patients/:patientId/historia-clinica` — `historia-clinica:edit`. 404 if none
    exists yet.
  - `GET /api/allergies?q=` — `historia-clinica:view` (same permission as viewing the record that
    uses them; no separate module needed for a catalog this small).
- Audit log: `view` on GET, `create` on POST, `update` on PATCH — same shape as every other
  Foundation module (`entity: 'HistoriaClinica'`, `patientId` set).
- Uses the existing `withApiErrors` wrapper (added in Foundation's final-review fix pass) for
  structured error responses — no new error-handling pattern needed.

### Frontend (`apps/web`)

- `apps/web/src/app/auth/active-patient.guard.ts` — new guard, redirects to `/patients` if
  `ActivePatientStore.patient()` is null. Mirrors `authGuard`'s shape.
- Route: `{ path: 'historia-clinica', canActivate: [authGuard, activePatientGuard], loadComponent: ... }`
- `apps/web/src/app/historia-clinica/historia-clinica.service.ts` — `get()`, `create()`,
  `update()`, `searchAllergies(query)`, mirroring the `PatientsService` pattern from Foundation.
- `apps/web/src/app/historia-clinica/historia-clinica-form.component.ts` — single page, sectioned
  with `mat-expansion-panel` per group (Información del paciente / Información médica /
  Antecedentes personales / Antecedentes heredofamiliares). On load: `GET`, and if 404 show a blank
  form in "create" mode; if 200, pre-fill and switch to "edit" mode. Save button calls `create()`
  or `update()` accordingly. Edad is a read-only computed field next to Fecha de nacimiento
  (recomputed on every change to that field, not stored).
- Allergies: `mat-chip` multi-select with autocomplete (Angular Material's
  `MatAutocompleteModule` + `MatChipsModule`), backed by `searchAllergies()`.
- `patient-search.component.ts` (Foundation, Task 17): after `activePatient.select(...)` on both
  the search-result click path and the create-patient path, add
  `this.router.navigate(['/historia-clinica'])`.
- i18n: new Transloco keys under `historiaClinica.*` for every label/section title, in both
  `es.json` and `en.json` — follow the pattern established in Foundation's final-review fix pass
  (every user-facing string goes through `| transloco`, no hardcoded English).

### Error handling

Nothing new — `withApiErrors` on the backend, `errorInterceptor` on the frontend, both already
established in Foundation.

### Testing

Consistent with the project-wide low-effort testing decision: this module is CRUD + a form, with
no pure/isolable logic worth unit-testing beyond what Foundation already covers (auth, RBAC,
patient search). No new unit tests planned. Verified manually: create a patient, confirm
auto-navigation, fill and save Historia Clínica, reload and confirm it pre-fills, edit and confirm
changes persist, confirm allergy autocomplete suggests previously-entered values.
