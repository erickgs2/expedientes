# Valoración — Facial Diagram Tool, Phase 2: Multiple Diagram Views

Status: approved
Date: 2026-08-02

## Purpose

Extend the facial diagram canvas built in Phase 1 (single view) to three independently-annotated
views — front, left profile, right profile — each with its own placeholder background and canvas
state, switchable instantly within the Valoración detail page, saved together with one button. This
is Phase 2 of 3 for the facial diagram tool (see `2026-08-01-project-overview.md`).

## Scope

In scope:
- Three views per Valoración: front, left profile, right profile
- Instant switching between views with no data-loss risk (all three canvases stay live)
- One combined "Guardar diagrama" save action for all three views
- A view is only persisted once it actually has content — an untouched view stays absent, and
  clearing a previously-saved view's content down to empty removes its stored row
- A distinct generic placeholder background per view (front reuses Phase 1's asset; left/right
  profile get new generic line-art placeholders)
- Per-view pin numbering (each view's numbered markers are independent of the other views')
- Migration of any existing Phase 1 single-view data into the new per-view data model, with no
  data loss

Out of scope (future phases/modules):
- Cross-visit watermark/reference overlay (Phase 3)
- Admin-managed template image upload (deferred since Phase 1, still deferred)
- Photo capture (Valoración sub-project 3)

## Architecture

Phase 1's `FacialDiagramComponent` combined canvas mechanics with its own Save button and its own
HTTP call. That shape doesn't support "one button saves all three views," so it splits into two
components:

**`FacialDiagramCanvasComponent`** (`apps/web/src/app/valoracion/facial-diagram/facial-diagram-canvas.component.ts`,
renamed/trimmed from Phase 1's `FacialDiagramComponent`) — pure canvas mechanics for one view: the
Fabric canvas, the toolbar (pencil/markers/text/delete-selected/clear-all), and that view's
placeholder background image. Takes `@Input() view: DiagramView` and
`@Input() initialDiagramData: Record<string, unknown> | null`. No longer owns a Save button or an
HTTP call — instead exposes a method, `getSerializedData(): { version: number; objects: object[];
nextPinNumber: number } | null`, returning `null` when the canvas has zero objects (nothing to
persist for that view), for a parent to pull from on demand.

**`FacialDiagramViewsComponent`** (new, `apps/web/src/app/valoracion/facial-diagram/facial-diagram-views.component.ts`) —
owns a `mat-button-toggle-group` view-switcher (front / left profile / right profile), mounts all
three `FacialDiagramCanvasComponent` instances at once (the inactive ones hidden via CSS, never
destroyed — this is what makes switching instant and loss-free), and owns the single "Guardar
diagrama" button: on click, it calls `getSerializedData()` on all three children and sends the
combined result in one API call.

`ValoracionDetailComponent` swaps its `<app-facial-diagram>` element for
`<app-facial-diagram-views>`.

## Data Model

`Valoracion.diagramData` / `diagramUpdatedAt` (added in Phase 1) move off `Valoracion` into a new
child table, one row per view that has actually been saved:

```prisma
enum DiagramView {
  FRONT
  LEFT_PROFILE
  RIGHT_PROFILE
}

model ValoracionDiagram {
  id           String      @id @default(uuid())
  valoracionId String
  valoracion   Valoracion  @relation(fields: [valoracionId], references: [id])
  view         DiagramView
  data         Json
  updatedAt    DateTime    @updatedAt

  @@unique([valoracionId, view])
}
```

`data` holds the same shape Phase 1 established: `{ version: 1, objects: [...], nextPinNumber }` —
now scoped per view instead of per Valoración.

**Migration path:** the migration adds `ValoracionDiagram` and the `DiagramView` enum, backfills any
existing non-null `Valoracion.diagramData` into a `FRONT` row (carrying over `diagramUpdatedAt` as
that row's `updatedAt`), then drops `Valoracion.diagramData` and `diagramUpdatedAt`. This preserves
every diagram saved during Phase 1 — nothing is lost, and it lands in the view a Phase-1-only record
was implicitly always meant to represent (front).

A view is only ever written when it has content: saving `{ views: { front: {...} } }` with `left`
and `right` omitted upserts only the front row. Sending an explicit `null` for a view (e.g.
`{ views: { left: null } }`) deletes that view's row — this is the same null-means-clear,
omitted-means-leave-unchanged rule this project established during Historia Clínica, applied here to
whole per-view records instead of individual text fields.

## API

**`PATCH /api/valoracion/[id]/diagram`** — body shape changes from Phase 1's `{ diagramData }` to:

```json
{
  "views": {
    "front": { "version": 1, "objects": [...], "nextPinNumber": 3 },
    "leftProfile": null,
    "rightProfile": { "version": 1, "objects": [...], "nextPinNumber": 1 }
  }
}
```

Only keys present in `views` are touched. For each present key: a non-null value upserts that
view's `ValoracionDiagram` row (by the `@@unique([valoracionId, view])` constraint); an explicit
`null` deletes that view's row if it exists (a no-op if it doesn't). All writes for one request run
in a single transaction. Permission gate (`valoracion:edit`) and audit logging follow the same
pattern as Phase 1's route.

**`GET /api/valoracion/[id]`** — response gains a `diagrams` array of whatever `ValoracionDiagram`
rows exist for that Valoración (`{ view, data, updatedAt }[]`), replacing the old top-level
`diagramData`/`diagramUpdatedAt` fields. Views with no saved data simply don't appear in the array.

## UI / UX

- A `mat-button-toggle-group` above the canvas switches which of the three views is visible
  ("Frente" / "Perfil izquierdo" / "Perfil derecho"). All three canvases are already initialized and
  live underneath; switching just changes which one is displayed (CSS, not re-render).
- The toolbar (pencil color/width, markers, text, delete-selected, clear-all) is shared chrome that
  acts on whichever view is currently visible — not three independent toolbars.
- Pin numbering (`pinCounter`/`nextPinNumber`) is tracked per view: front, left, and right each have
  their own independent numbering sequence, since they're visually and clinically separate diagrams.
- One "Guardar diagrama" button, matching Phase 1's explicit-save pattern (no autosave), now saving
  all three views' current state in one request.
- Read-only rendering (no toolbar, no save button, canvas non-interactive) for `valoracion:view`-only
  users applies to the whole `FacialDiagramViewsComponent`, same as Phase 1.

## Placeholders

Two new generic placeholder SVGs, same simple line-art style as Phase 1's existing front-facing one:
`facial-diagram-placeholder-left.svg` and `facial-diagram-placeholder-right.svg` (basic profile
outlines — forehead/nose/lips/chin silhouette). Front reuses Phase 1's existing
`facial-diagram-placeholder.svg` unchanged. All three remain generic placeholders, still fully
replaceable later by the deferred admin-upload feature.

## Error Handling

Same as Phase 1: a failed save surfaces via the existing global error-interceptor toast and leaves
all three canvases' in-memory state untouched for retry. A failed load for any one view falls back
to that view's empty canvas over its placeholder rather than blocking the other two views or the
page.

## Testing

Same low-effort convention as Phase 1: no new pure-logic module is introduced by this phase (the
existing `fabric-shapes.ts`/`fabric-shapes.spec.ts` from Phase 1 are reused unchanged across all
three views), so no new unit tests are added. Verified by building and manual testing across all
three views.
