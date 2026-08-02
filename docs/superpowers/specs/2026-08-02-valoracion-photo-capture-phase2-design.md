# Valoración — Photo Capture, Phase 2: Progressive Timeline

Status: approved
Date: 2026-08-02

## Purpose

Let staff browse a patient's photo history chronologically across every visit, grouped by visit
date, to see the evolving before/after record over time. This is Phase 2 of 2 for the photo
capture sub-project (see `2026-08-01-project-overview.md`) — the last phase of this sub-project.

## Scope

In scope:
- A patient-level view listing every photo across all of a patient's Valoración visits
- Grouped by visit, each group labeled with that visit's date
- Sorted oldest-first (chronological/progressive — watching change unfold over time)
- Visits with no photos are skipped, not shown as empty groups
- Read-only: no delete, no capture controls — managing a specific visit's photos stays on that
  visit's own page (Phase 1)
- A new route, reachable via a nav link from both the Historia Clínica and Valoración pages,
  matching the existing sibling-module-link pattern already used between those two

Out of scope:
- A two-point-in-time side-by-side comparison view
- Any schema change (none needed — see Architecture)
- Any change to Treatments (not yet built; a schema change there is already noted as a known gap
  in the project roadmap)

## Architecture

**No schema change.** `Photo.patientId` was already denormalized and indexed in Phase 1
specifically for this phase's query — `prisma.photo.findMany({ where: { patientId } })` needs no
join.

**Backend:** one new endpoint, `GET /api/patients/[patientId]/photos` (`valoracion:view`, same
permission already used throughout this feature), returning a flat, unfiltered list of that
patient's photos across every visit.

**Grouping happens client-side, not server-side.** The frontend already has (or can cheaply fetch)
`ValoracionService.list(patientId)` — `ValoracionSummary[]`, including each visit's `fecha` — from
Phase 1's Valoración list page. Rather than have the backend join `Photo` to `Valoracion` to embed
each photo's visit date, the new `PhotoTimelineComponent` fetches both lists and assembles groups
itself: for each visit (sorted oldest-first by `fecha`), collect that visit's photos by matching
`valoracionId`, and skip any visit with none. This keeps the new backend endpoint a trivial flat
read and reuses data-fetching the app already does elsewhere, rather than growing the query surface
for a grouping that's cheap to do in the component.

**Component:** `PhotoTimelineComponent`, standalone, at a new route (guarded the same way as
Historia Clínica/Valoración: `authGuard`, `permissionGuard('valoracion', 'view')`,
`activePatientGuard`).

## UI / UX

- Each visit's group is a labeled section (the visit's date) containing a grid of that visit's
  photos, each showing its Before/After tag — visually similar to Phase 1's per-visit gallery grid,
  but with no capture button and no delete controls.
- Oldest visit first, most recent last — reading top-to-bottom follows the patient's actual
  progression over time.
- Empty state (patient has no photos at all across any visit) shown clearly rather than a blank
  page.
- A "Photo timeline" link is added to both the Historia Clínica page and the Valoración list page,
  alongside their existing cross-links to each other.

## Error Handling

A failed fetch (either the visit list or the photo list) surfaces via the existing global
error-interceptor toast; the page shows its empty/error state rather than a partially-populated or
broken timeline.

## Testing

Same low-effort convention as Phase 1: no new pure-logic module is introduced (the grouping logic
is straightforward array filtering/sorting directly in the component, not extracted into a
separately-tested pure function, matching this project's practice of only extracting and testing
functions that are genuinely security- or correctness-critical in isolation) — verified by building
and manual testing.
