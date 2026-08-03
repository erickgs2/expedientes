# Appointment Management — Sub-project 1: Appointment Core

Status: approved
Date: 2026-08-03

## Purpose

Let staff book, view, and manage appointments on a clinic-wide calendar: day/week/month views,
status tracking through an appointment's lifecycle, and an optional link to which treatment
types are planned for the visit. This is sub-project 1 of 2 for the "Appointment management"
module (see `2026-08-01-project-overview.md`). Sub-project 2 (WhatsApp notifications) builds on
top of this and is entirely out of scope here.

## Scope

In scope:
- Book an appointment: patient, start time, duration, optional planned treatment types, optional
  notes.
- A clinic-wide calendar with day/week/month views, showing every patient's appointments —
  reachable without first selecting an active patient, unlike every other module in this app.
- Status tracking through five states: Scheduled, Confirmed, Completed, Cancelled, No-show —
  freely transitionable in any direction, no enforced state machine.
- A soft overlap warning (not a hard block) when a new or edited appointment's time conflicts
  with another appointment that day.
- Editing and hard-deleting an appointment.
- A secondary "Agendar cita" entry point from Historia Clínica, pre-filling the active patient.

Out of scope (deferred):
- WhatsApp booking confirmations and reminders — sub-project 2.
- Recurring or multi-session appointments — one appointment is one time block.
- Any write coupling between an appointment and a Treatment visit. Planned treatment types are
  purely informational, chosen from the existing catalog at booking time; creating the actual
  Treatment visit when the patient arrives remains the fully separate, already-built flow. Nothing
  here auto-creates, links to, or updates a `Treatment`/`TreatmentItem` record.
- Hard-blocking overlapping appointments — real clinics sometimes double-book intentionally
  (quick check-ins overlapping a longer appointment's tail); the system warns, staff decide.

## Architecture

### Data model

```prisma
enum AppointmentStatus {
  SCHEDULED
  CONFIRMED
  COMPLETED
  CANCELLED
  NO_SHOW
}

model Appointment {
  id              String                     @id @default(uuid())
  patientId       String
  patient         Patient                    @relation(fields: [patientId], references: [id])
  startTime       DateTime
  durationMinutes Int
  status          AppointmentStatus          @default(SCHEDULED)
  notes           String?
  treatmentTypes  AppointmentTreatmentType[]
  createdAt       DateTime                   @default(now())
  updatedAt       DateTime                   @updatedAt

  @@index([patientId])
  @@index([startTime])
}

model AppointmentTreatmentType {
  id              String        @id @default(uuid())
  appointmentId   String
  appointment     Appointment   @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  treatmentTypeId String
  treatmentType   TreatmentType @relation(fields: [treatmentTypeId], references: [id])

  @@unique([appointmentId, treatmentTypeId])
}
```

Free-form `startTime` + `durationMinutes` (not fixed slots) — matches how a real clinic books
appointments of varying length depending on the planned treatment. `AppointmentTreatmentType` is a
lightweight join, cascade-deleted with its appointment (deleting an appointment should not leave
orphaned planning rows); `TreatmentType` itself is never deleted by anything in this app (matches
the existing deactivate-don't-delete catalog design), so no cascade concern on that side. Status
has no enforced transition rules — any value can change to any other value — a deliberate
simplicity choice matching this app's general pattern of guiding rather than gating staff
workflow.

### Backend

- `GET /api/appointments?from=<ISO date>&to=<ISO date>` (`appointments:view`) — lists appointments
  whose `startTime` falls within the range, including each one's patient name and planned
  treatment type names (denormalized for calendar rendering, matching the established pattern used
  by `TreatmentSummary`). Backs all three calendar views: day/week views request a narrow range,
  month view requests the whole visible month.
- `POST /api/appointments` (`appointments:create`) — creates an appointment with
  `patientId`/`startTime`/`durationMinutes` required, `notes`/`treatmentTypeIds` optional.
- `GET /api/appointments/[id]` (`appointments:view`) — full detail for the edit dialog.
- `PATCH /api/appointments/[id]` (`appointments:edit`) — updates any subset of fields (including
  `status`), using the same null-clears/omitted-unchanged convention already established
  throughout this app for partial updates. `treatmentTypeIds`, when present, replaces the whole
  set (delete-and-recreate the join rows in a transaction — safe here since nothing else
  references an `AppointmentTreatmentType` row's own id, unlike `TreatmentItem`'s history with
  diagrams/photos/consent).
- `DELETE /api/appointments/[id]` (`appointments:delete`) — hard delete, for correcting
  data-entry mistakes. Day-to-day lifecycle (patient cancelled, no-show, etc.) goes through
  `status`, not deletion.

No dedicated overlap-check endpoint. The calendar view (and the booking dialog, which opens from a
calendar click and already has that day's appointments in view) reuses the list endpoint above;
the frontend computes any time-range overlap client-side and shows a warning banner before save.
The backend never rejects a create/update because of overlap.

### Frontend

- New top-level nav item **"Calendario"**, route `/calendar`, guarded by
  `[authGuard, permissionGuard('appointments', 'view')]` only — no `activePatientGuard`, since a
  clinic-wide calendar inherently spans every patient.
- `AppointmentCalendarComponent` — day/week/month view switcher, custom-built using existing
  Material primitives (no new calendar library dependency, matching how every other UI surface in
  this app was built). Day/week views position appointment blocks on a vertical time axis by
  `startTime`/`durationMinutes`; month view shows a compact per-day list (a full time-positioned
  grid doesn't fit a month cell). Clicking an empty slot opens the booking dialog pre-filled with
  that time; clicking an existing appointment opens it for editing.
- `AppointmentFormComponent` as a `MatDialog` (matching the RBAC-admin/Treatment-catalog dialog
  pattern, not Valoración/Treatments' full-page pattern) — a patient search/autocomplete (reusing
  the existing patient-search backend endpoint from Patient Drive), start time + duration, a
  checkbox list of active treatment types (reusing the catalog, same pattern as treatment-visit
  selection), a notes field, and — when editing — a status dropdown. Shows the client-computed
  overlap warning here before save.
- A secondary entry point: Historia Clínica gains an **"Agendar cita"** cross-link (matching its
  existing links to Valoración/Photos/Treatments), opening the same booking dialog pre-filled with
  the active patient.

### Permissions

Reuses the already-seeded `appointments:view`/`create`/`edit`/`delete` module — no seed changes
needed.

## Error Handling

Standard pattern already established throughout this app: failures surface via the existing global
error-interceptor toast; the booking dialog stays open with its last-entered values on a failed
save so it can be retried without re-entering everything.

## Testing

Same low-effort convention as every prior module: no new pure-logic module beyond the overlap
computation, which is simple date-range comparison — verified by building and manual testing.
