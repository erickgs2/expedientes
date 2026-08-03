# Treatments — Sub-project 2: Treatment Visit Core

Status: approved
Date: 2026-08-02

## Purpose

Let staff create a Treatment visit for a patient, see that patient's treatment history on entry,
and select one or more treatment types from the catalog for the visit with per-treatment notes.
This is sub-project 2 of 4 for the Treatments module (see `2026-08-01-project-overview.md`), built
on sub-project 1's treatment catalog.

## Scope

In scope:
- Create a Treatment visit for a patient (date, defaulting to today, matching Valoración's
  established pattern)
- A visit list page showing the patient's treatment history — past visits with the treatment
  names used on each — satisfying "load previous applied treatments... on entry"
- Select one or more active treatment types for a visit via a checkbox list
- Per-treatment notes: each checked treatment type gets its own notes field within the visit
- One combined save action persisting the whole selection + notes together

Out of scope (later sub-projects):
- Consent signing (sub-project 3)
- Per-treatment diagram annotations and photos (sub-project 4)
- Removing/locking a treatment selection once other data (consent, diagram, photos) references it
  — for this sub-project, selections are freely editable; sub-project 3 will need to decide what
  happens to a selection that already has a signed consent

## Architecture

**Data model:**

```prisma
model Treatment {
  id        String          @id @default(uuid())
  patientId String
  patient   Patient         @relation(fields: [patientId], references: [id])
  fecha     DateTime        @default(now())
  items     TreatmentItem[]
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  @@index([patientId])
}

model TreatmentItem {
  id              String        @id @default(uuid())
  treatmentId     String
  treatment       Treatment     @relation(fields: [treatmentId], references: [id])
  treatmentTypeId String
  treatmentType   TreatmentType @relation(fields: [treatmentTypeId], references: [id])
  notes           String?

  @@unique([treatmentId, treatmentTypeId])
}
```

`Treatment` mirrors `Valoracion`'s shape (a patient-scoped, dated visit record). `TreatmentItem` is
a join row carrying its own `notes` — the same row later sub-projects will attach a signed consent
and diagram/photo data to, one row per treatment type selected in a visit.

**Backend:**
- `POST /api/patients/[patientId]/treatments` (`treatments:create`) — creates an empty visit
  (`fecha` defaults to today, matching Valoración's create flow), no items yet
- `GET /api/patients/[patientId]/treatments` (`treatments:view`) — lists the patient's visits,
  each including its items' treatment type names (for the history summary)
- `GET /api/treatments/[id]` (`treatments:view`) — full detail for one visit, including items with
  their treatment type and notes
- `PATCH /api/treatments/[id]/items` (`treatments:edit`) — saves the whole selected set + notes in
  one call, matching the facial diagram tool's "edit client-side, one Guardar persists everything"
  pattern rather than a per-checkbox API call. For this sub-project, the save replaces the item set
  (delete-and-recreate in a transaction) — safe now since nothing yet references a `TreatmentItem`,
  but sub-project 3 (consent) will need this to become a smarter diff once consent records start
  attaching to individual items, so a re-save doesn't orphan or destroy a signed consent. Noted
  explicitly here so it isn't a surprise when that sub-project starts.

**Frontend:**
- `TreatmentListComponent` mirrors `ValoracionListComponent` — a "Nuevo tratamiento" button plus a
  read-only history summary (each past visit's date and the treatment names used on it)
- `TreatmentDetailComponent` shows the visit date, a checkbox list of every active treatment type
  (inactive types are excluded from selection but a type already selected on this visit before
  being deactivated elsewhere stays visible/checked, so existing data is never silently hidden),
  and an inline notes field that appears under each checked type. One "Guardar" button saves the
  whole form.

**Permissions:** reuses `treatments:view/create/edit` throughout — no new permissions, no seed
changes.

## Error Handling

Standard pattern already established throughout this app: failures surface via the existing global
error-interceptor toast; the form stays in its last-edited state so a failed save can be retried
without re-entering everything.

## Testing

Same low-effort convention as every prior module: no new pure-logic module is introduced (this is
CRUD plus a client-side selection form, matching the established untested precedent for this shape
of feature) — verified by building and manual testing.
