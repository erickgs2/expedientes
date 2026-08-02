# Valoración — Facial Diagram Tool, Phase 1: Core Canvas (Single View)

Status: approved
Date: 2026-08-02

## Purpose

Add a drawing canvas to the Valoración detail page where clinic staff can freehand-draw, drop
generic markers, and pin text notes over a placeholder face-diagram image, then save and reload
that annotation set. This is Phase 1 of 3 for the facial diagram tool (see
`2026-08-01-project-overview.md`); it covers a single diagram view only. Multiple views (front/
left/right profile) and cross-visit watermark overlays are later, independent phases.

## Scope

In scope:
- One canvas, one diagram, per Valoración record
- Freehand drawing with a choice of color and stroke width
- A small starter set of generic markers (pin, X, star) placeable by click
- Pinned text notes anchored to a point on the canvas
- Click-to-select, then delete, individual annotations
- "Clear all" to wipe the current diagram
- Explicit save ("Guardar diagrama"), matching the rest of the app's save pattern
- Load/redisplay of a previously saved diagram
- Read-only display for users without edit permission
- A generic placeholder base image (not admin-uploadable yet — that's deferred)

Out of scope (future phases/modules):
- Multiple diagram views per visit (Phase 2)
- Cross-visit watermark/reference overlay (Phase 3)
- Admin-managed template image upload
- Reuse by Treatments (will happen naturally once this component exists, but no Treatments-specific
  work is done here)

## Architecture

**Canvas library:** Fabric.js v6 (TypeScript-native). It provides free-drawing brushes, an object
model for shapes/text (needed for click-to-select and click-to-delete), and JSON
serialization/deserialization out of the box — avoiding a large amount of hand-rolled hit-testing
and persistence code that a raw `<canvas>` implementation would require.

**Component:** a new standalone Angular component, `FacialDiagramComponent`
(`apps/web/src/app/valoracion/facial-diagram/facial-diagram.component.ts`), embedded inside
`ValoracionDetailComponent`'s template and given `valoracionId` as an `@Input()`. Canvas/Fabric
integration is a distinct concern (imperative library, DOM canvas element, non-reactive-forms)
from the existing text-field form, so it gets its own file rather than growing
`valoracion-detail.component.ts` further.

**Base image:** a static placeholder SVG asset (a simple front-facing face outline), added at
`apps/web/src/assets/facial-diagram-placeholder.svg`, set as the Fabric canvas's background image.
It is not an annotatable object — only the vector objects drawn on top (strokes, markers, text)
are stored and editable.

**Persistence format:** Fabric's serialized canvas JSON (`canvas.toJSON()`), stored as-is — a
vector/object representation, not a flattened raster snapshot. This is required for click-to-delete
(need addressable objects) and will be required again for Phase 3's watermark overlay (need to
replay past visits' objects on top of the current canvas at reduced opacity).

## Data Model

Add two fields directly to the existing `Valoracion` Prisma model:

```prisma
model Valoracion {
  // ...existing fields...
  diagramData      Json?
  diagramUpdatedAt DateTime?
}
```

`Valoracion` is already one record per visit, and Phase 1 is exactly one diagram per visit, so no
new table is needed yet. When Phase 2 (multiple views) arrives, this will migrate to a child table
keyed by view (e.g. `ValoracionDiagram { id, valoracionId, view, data, updatedAt }`); that
migration is explicitly not part of this phase.

## API

**Extend `GET /api/valoracion/[id]`** (existing route) to include `diagramData` and
`diagramUpdatedAt` in the response — no new read route needed.

**New route: `PATCH /api/valoracion/[id]/diagram`**
- Body: `{ diagramData: object }` (the Fabric canvas JSON)
- Permission: `valoracion:edit` (same permission already gating the rest of this page's writes)
- Behavior: validates the record exists and belongs to the given id (reusing the existing
  `getValoracionOrThrow`-style lookup used by the current PATCH route), writes `diagramData` and
  sets `diagramUpdatedAt = new Date()`, then calls `writeAuditLogSafe` (action: update, entity:
  Valoracion) exactly like the existing text-field PATCH does.
- Kept as a separate route from the existing `PATCH /api/valoracion/[id]` (which handles
  `fecha`/`queQuiereElPaciente`/`queNecesitaElPaciente`/`notas`) because the diagram has its own
  save action in the UI ("Guardar diagrama" is a distinct button from the form's "Guardar") and a
  distinct, larger payload shape — conflating them would mean every diagram autosave-adjacent
  change also re-sends/re-validates the text fields for no reason.

## UI / UX

**Toolbar** (visible only with `valoracion:edit`; read-only canvas with no toolbar otherwise):

- **Pencil (freehand draw)**: toggle button; when active, a small popover offers 4 preset colors
  (black, red, blue, green) and 3 stroke widths (thin/medium/thick). Uses Fabric's
  `PencilBrush`.
- **Markers**: a palette of 3 generic starter markers — numbered pin, X mark, star — each rendered
  as a simple Fabric shape group (no image assets needed). Click a marker in the palette, then
  click the canvas to place it at that point.
- **Text note**: click the button, then click the canvas — drops an editable `IText` object
  anchored at that point; click into it to type.
- **Delete selected**: any object (stroke, marker, text) can be clicked to select it (Fabric's
  built-in selection handles); pressing Delete/Backspace or clicking this button removes it. This
  replaces the roadmap language "delete-marks mode" with plain click-to-select-then-delete — same
  outcome, no separate mode toggle needed.
- **Clear all**: wipes every object on the canvas. Behind a confirm dialog (destructive,
  irreversible until the next save — and irreversible entirely once saved).
- **Guardar diagrama**: explicit save button, serializes the canvas via `toJSON()` and PATCHes it.
  No autosave, matching the rest of this page's save pattern.

**Touch/stylus (tablet) support**: Fabric's pointer-event handling covers touch and stylus input
without extra code. The canvas element gets `touch-action: none` in CSS so the browser's native
scroll/pan/zoom gestures don't fight with drawing strokes.

**Load behavior**: on init, `FacialDiagramComponent` fetches the Valoración record (already
includes `diagramData`), and if present, calls `canvas.loadFromJSON()` to restore it. If absent,
the canvas starts empty over the placeholder background.

## Error Handling

- **Save failure**: the existing global `error.interceptor.ts` toast pattern surfaces the error;
  the canvas's in-memory state is left untouched so the user can retry without losing work.
- **Load failure** (e.g. malformed stored JSON): falls back to an empty canvas over the placeholder
  rather than blocking the page — a broken diagram shouldn't prevent viewing/editing the rest of
  the Valoración record.

## Permissions

Reuses the existing `valoracion:edit` / `valoracion:view` permissions already defined for this
module — no new permission is introduced. `valoracion:edit` gates the toolbar and the save route;
`valoracion:view` alone renders the canvas read-only (diagram visible, no controls).

## Testing

Per this project's established low-effort testing convention: a couple of cheap unit tests on the
backend (diagram PATCH persists `diagramData`/`diagramUpdatedAt`; the route rejects a caller who
only has `valoracion:view`). No canvas-level or e2e testing — the user verifies the drawing UX
manually.
