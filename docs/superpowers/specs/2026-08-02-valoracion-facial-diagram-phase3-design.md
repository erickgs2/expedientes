# Valoración — Facial Diagram Tool, Phase 3: Cross-Visit Reference Overlay

Status: approved
Date: 2026-08-02

## Purpose

Let staff overlay one past visit's annotations as a translucent, non-interactive reference layer
while viewing or editing any of the three diagram views (front/left profile/right profile) built
in Phases 1-2, for visual comparison against the current visit's diagram. This is Phase 3 of 3 for
the facial diagram tool (see `2026-08-01-project-overview.md`) — the last phase of this
sub-project.

## Scope

In scope:
- A toggle to show/hide a reference overlay, and — when on — a picker listing the patient's other
  Valoraciones (by date) to choose which one to reference
- One past visit referenced at a time (not multiple simultaneously)
- The reference overlay applies per view: selecting a past visit shows that visit's FRONT data on
  the current record's front canvas, its LEFT_PROFILE data on the left canvas, etc. — all three
  update together, since all three canvases already stay mounted (Phase 2)
- Reference objects are visually distinct (reduced opacity), never selectable/editable, always
  rendered behind the current visit's own annotations, and never included when the current visit
  is saved or cleared
- The reference selection is ephemeral — not persisted, resets on page reload
- Available to anyone who can view the page, not gated on edit permission

Out of scope:
- Multiple simultaneous past-visit overlays
- Persisting the overlay selection
- Any new backend endpoint (see Architecture — existing endpoints already provide everything
  needed)
- Any change to Phase 1/2's own save/load behavior for the current visit's diagram

## Architecture

**No new backend endpoints.** The list of a patient's other Valoraciones already exists via
`ValoracionService.list(patientId)` (`GET /api/patients/[patientId]/valoracion`), returning
lightweight `ValoracionSummary[]` — no diagram data, cheap to fetch for a picker. Once a specific
past visit is selected, its full diagram data already comes back from
`ValoracionService.get(id)` (`GET /api/valoracion/[id]`), which already returns the complete
`diagrams` array for all three views (Phase 2). Both endpoints are already permitted for anyone who
can reach this page — referencing another visit of the *same* patient is not a new access grant,
just a new way of reading data already retrievable by navigating to that visit's own page.

**`FacialDiagramViewsComponent`** gains:
- A new `@Input() patientId` (passed down from `ValoracionDetailComponent`, which already has the
  active patient available)
- On init, fetches `ValoracionService.list(patientId)` and filters out the current `valoracionId`,
  giving the picker's option list — if this list is empty (the patient has no other visits), the
  entire reference control is hidden rather than shown with an empty picker
- A toggle + `mat-select` picker (visible regardless of edit permission — this is a passive viewing
  aid, same as the view switcher)
- When a visit is picked, fetches that visit's full record once via `ValoracionService.get(id)` and
  derives each view's slice of its `diagrams` array, passing it down to the matching child canvas
  as a new `referenceData` input. Turning the toggle off, or picking nothing, sets `referenceData`
  to `null` for all three children.

**`FacialDiagramCanvasComponent`** gains a `referenceData: Record<string, unknown> | null` input
that — unlike `initialDiagramData`, which is only read once at load — can change over the
component's lifetime, since the user can pick a different past visit (or toggle the overlay
off) at any time without reloading the page. On change:
- Any previously-added reference objects are removed first
- The new data's `objects` array is run through the exact same security allowlist
  (`ALLOWED_OBJECT_TYPES`/`findDisallowedType`) already hardened in Phase 1 for the primary
  diagram — this is stored data from another record, still untrusted input, and gets the same
  defense against a crafted `clipPath`/`fill`/`stroke` fetch
- The filtered objects are enlivened, set `selectable: false, evented: false` (so they can never be
  clicked, selected, or deleted — no extra guard needed elsewhere), given reduced opacity, sent to
  the back of the canvas's render order (so the current visit's own annotations always stay
  visibly on top), and tracked in a separate list
- `getSerializedData()` excludes tracked reference objects from what it serializes — a reference
  overlay is never saved as part of the current visit's diagram
- `clearAll()` excludes tracked reference objects from what it removes — "Clear all" only ever
  touches the current visit's own annotations, never a reference layer

## UI / UX

- A checkbox ("Mostrar visita anterior de referencia" / "Show reference from a past visit") above
  or alongside the existing view switcher. Hidden entirely if the patient has no other visits.
- When checked, a dropdown listing the patient's other Valoraciones by date (most recent first,
  matching the existing list-ordering convention) appears.
- Picking a visit overlays its matching-view annotations on all three canvases at once (only the
  currently-visible one is seen, but switching views shows the correct reference for that view
  immediately, with no extra fetch — it was already applied).
- Unchecking the toggle clears the overlay from all three views.
- No loading spinner for the on-demand fetch when a visit is picked — the overlay simply appears
  once the data arrives, consistent with this feature's low-effort-polish convention elsewhere.

## Error Handling

If fetching the picker's visit list or a selected visit's full data fails, the failure surfaces via
the existing global error-interceptor toast; the reference toggle simply has nothing to show (as if
no visit were selected) rather than blocking the page or the primary diagram's own load/save/draw
functionality, which remains fully independent of this feature.

## Testing

Same low-effort convention as Phases 1-2: no new pure-logic module is introduced (the allowlist
being reused is already covered by Phase 1's existing hardening and manual verification practice)
— verified by building and manual testing across all three views with a real past visit referenced.
