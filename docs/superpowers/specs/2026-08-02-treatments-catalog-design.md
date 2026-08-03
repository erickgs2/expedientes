# Treatments — Sub-project 1: Treatment Catalog

Status: approved
Date: 2026-08-02

## Purpose

Let an administrator manage the clinic's catalog of treatment types, each with an editable
consent-form text template, so later Treatments sub-projects have real treatment types to select
from and real consent text to pre-fill when a patient signs. This is sub-project 1 of 4 for the
Treatments module (see `2026-08-01-project-overview.md`) — foundational; nothing else in this
module can reference a treatment type until this exists.

## Scope

In scope:
- Admin CRUD for treatment types: name, an editable plain-text consent-form template, active/
  inactive status
- Deactivate instead of delete — an inactive type disappears from future "select a treatment"
  flows (built in later sub-projects) but is never removed, so nothing that already references it
  breaks
- A list screen showing every type (active and inactive), each with a quick active/inactive
  toggle, and a dialog-based create/edit form
- A new nav link in the app shell, alongside the existing admin Users/Roles links

Out of scope:
- Selecting treatment types for a patient visit (sub-project 2)
- Consent signing (sub-project 3)
- Rich-text formatting for the consent template (plain text only, per this project's low-effort
  convention — can be revisited later if it turns out to matter)
- Hard delete (deliberately not offered — see Scope above)

## Architecture

**Data model:**

```prisma
model TreatmentType {
  id              String   @id @default(uuid())
  name            String
  consentTemplate String
  active          Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**Permissions:** reuses the `treatments` permission module already seeded from Foundation
(`view`/`create`/`edit` — no `delete` action exists, which is exactly right for a
deactivate-not-delete design; toggling `active` is just another `edit`). No seed changes needed.

**Backend:** standard CRUD routes —
- `GET /api/treatment-types` (`treatments:view`) — lists every type, active and inactive
- `POST /api/treatment-types` (`treatments:create`) — creates a new type, `active` defaults `true`
- `PATCH /api/treatment-types/[id]` (`treatments:edit`) — updates name/consent template, and/or
  toggles `active`

**Frontend:** mirrors the existing RBAC admin Users/Roles pattern (the closest precedent in this
codebase — an admin list component + a `MatDialog`-based create/edit form component):
- `TreatmentTypeListComponent` — shows every type (not filtered to active-only; an admin
  management screen should show everything), each row with a quick active/inactive toggle and an
  edit button
- `TreatmentTypeFormDialogComponent` — name + consent-template text area, used for both create and
  edit, matching `RoleFormDialogComponent`'s shape

**Navigation:** a new link in the app shell toolbar (`app.component.ts`), alongside the existing
"Users"/"Roles" links, gated on `treatments:view`. Route `/admin/treatments`, matching the existing
`/admin/users`/`/admin/roles` convention — not patient-scoped, since this is a global catalog, not
a clinical record tied to an active patient.

## Error Handling

Standard pattern already established throughout this app: failures surface via the existing global
error-interceptor toast; the list/dialog stay in their last-known-good state rather than showing a
broken or partially-updated screen.

## Testing

Same low-effort convention as every prior module: no new pure-logic module is introduced (this is
straightforward CRUD, matching the RBAC admin screens' own untested precedent) — verified by
building and manual testing.
