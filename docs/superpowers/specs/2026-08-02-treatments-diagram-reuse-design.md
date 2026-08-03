# Treatments — Sub-project 4a: Diagram Reuse

Status: approved
Date: 2026-08-02

## Purpose

Let each treatment item on a Treatment visit have its own facial-diagram annotations, drawn with
the same tool already built for Valoración — without hardcoding that tool to Valoración. This is
the first of two mini-cycles under sub-project 4 ("Diagram + photo reuse") in the Treatments
module (see `2026-08-01-project-overview.md`); the second, later mini-cycle does the equivalent
extraction for photo capture and is out of scope here.

## Scope

In scope:
- A new `TreatmentItemDiagram` model, one row per (treatment item, view), mirroring
  `ValoracionDiagram`'s shape exactly.
- Extracting `FacialDiagramViewsComponent`/`FacialDiagramCanvasComponent` from their
  Valoración-specific coupling (`ValoracionService` injection, hardcoded `'valoracion'` permission
  module) into a form both Valoración and Treatments can drive, without changing either's current
  behavior.
- A dedicated per-item diagram page, reachable from the treatment detail page via an action link —
  mirroring the exact UX pattern consent signing already established (per-item action link →
  dedicated page).
- A reference/watermark picker scoped to this patient's past items of the *same* treatment type
  only (not Valoración visits, not other treatment types).

Out of scope (deferred):
- Photo capture reuse — a separate, later mini-cycle.
- Any lock preventing a treatment item with diagram data from being deselected. Signed consents
  already block deselection (a legal-record concern); diagram data does not get the same
  protection here — deselecting a not-yet-consented item still deletes it and its diagrams, same
  as today. Accepted as a lower-severity, documented gap, matching how comparable minor risks have
  been recorded in this project's roadmap elsewhere rather than fixed preemptively.
- Renaming the `valoracion.diagram.*` i18n namespace — its contents (tool names, color labels) are
  generic drawing-tool vocabulary, not Valoración-specific wording, so both modules read the exact
  same keys unchanged.
- Any change to `ValoracionDetailComponent`'s or `ValoracionDiagram`'s existing behavior — the
  extraction must be behavior-preserving for Valoración, verified by the existing diagram tool's
  manual test flows still working identically afterward.

## Architecture

### Data model

```prisma
model TreatmentItemDiagram {
  id              String        @id @default(uuid())
  treatmentItemId String
  treatmentItem   TreatmentItem @relation(fields: [treatmentItemId], references: [id])
  view            DiagramView
  data            Json
  updatedAt       DateTime      @updatedAt

  @@unique([treatmentItemId, view])
}
```

Reuses the existing `DiagramView` enum (`FRONT`/`LEFT_PROFILE`/`RIGHT_PROFILE`) and the existing
placeholder base images — this is the same three-view facial diagram, just attached to a different
owner. A dedicated model (rather than adding a nullable second FK to `ValoracionDiagram`) keeps
this change zero-risk to Valoración's already-shipped, reviewed diagram data and queries, matching
this project's established precedent of giving a new owner its own model (e.g. `Consent` in the
prior sub-project) rather than retrofitting an existing one with dual-ownership branching that
Postgres/Prisma can't natively enforce as mutually exclusive.

`TreatmentItem` gains an implicit `diagrams TreatmentItemDiagram[]` back-relation (Prisma infers
this from `TreatmentItemDiagram.treatmentItem`'s `@relation`).

### Component extraction

**`FacialDiagramCanvasComponent`** needs exactly one change: its hardcoded
`this.canEdit = this.auth.hasPermission('valoracion', 'edit')` becomes driven by a new
`@Input({ required: true }) permissionModule: string`, so it reads
`this.auth.hasPermission(this.permissionModule, 'edit')` instead. It has no other Valoración
coupling (no service injection, no direct API calls) — this is its only required change. i18n keys
are untouched.

**`FacialDiagramViewsComponent`** currently injects `ValoracionService` directly for three
operations: listing past visits for the reference picker, fetching one past visit's diagrams when
selected as a reference, and saving the current visit's diagrams. These become a single
strategy-object input:

```ts
export interface DiagramViewRecord {
  view: DiagramView;
  data: Record<string, unknown>;
  updatedAt: string;
}

export interface DiagramReferenceOption {
  id: string;
  label: string;
}

export interface DiagramDataSource {
  listReferenceOptions(): Promise<DiagramReferenceOption[]>;
  getReferenceViews(id: string): Promise<DiagramViewRecord[]>;
  save(views: Record<string, Record<string, unknown> | null>): Promise<DiagramViewRecord[]>;
}
```

The component's inputs become:
```ts
@Input({ required: true }) dataSource!: DiagramDataSource;
@Input({ required: true }) permissionModule!: string;
@Input() diagrams: DiagramViewRecord[] = [];
```

`@Input() diagrams` (the *current* owner's views) is unchanged in spirit — still supplied by the
parent, since the parent already fetches its own detail record for other reasons (visit notes,
treatment name, etc.) and diagrams come along with it. Only the reference-listing/fetching and the
save operation move behind `dataSource`, since those are the only places `ValoracionService` was
called directly. `permissionModule` is passed straight through to the canvas child.

Two concrete `DiagramDataSource` implementations exist after this sub-project:
- **Valoración's** (constructed by `ValoracionDetailComponent`, wrapping the existing
  `ValoracionService.list`/`.get`/`.updateDiagrams` calls exactly as today — behavior-preserving,
  not a new capability).
- **Treatments'** (constructed wherever the new diagram page lives, wrapping a new
  `TreatmentDiagramService`, described below).

Neither `FacialDiagramViewsComponent` nor `FacialDiagramCanvasComponent` needs to know which one
it's talking to.

### Backend

- `GET /api/treatment-items/[id]` (existing route from consent signing, `treatments:view`) gains a
  `diagrams: DiagramViewRecord[]` field in its response body, alongside the existing
  `consentTemplate`/`consent` fields. This single endpoint serves two needs: loading the *current*
  item's diagrams (for the diagram page itself) and loading a *reference* item's diagrams (for the
  reference picker) — both are just "fetch one treatment item's diagrams by id."
- `PATCH /api/treatment-items/[id]/diagram` (`treatments:edit`, new) — saves the submitted views
  for this item, mirroring `PATCH /api/valoracion/[id]/diagram`'s validation and upsert/delete
  logic exactly (same `VALID_VIEW_KEYS`-style validation, same per-view upsert-or-delete inside a
  transaction).
- `GET /api/patients/[patientId]/treatment-types/[treatmentTypeId]/items` (`treatments:view`,
  new) — lists this patient's past treatment items of this specific treatment type (id + the
  parent visit's `fecha`, most recent first), backing the reference-option picker. Deliberately
  scoped to one treatment type, not "any past treatment item," per the approved reference-scope
  decision.

### Frontend

- New `TreatmentDiagramService` (Angular, mirrors `ValoracionService`'s shape for just the
  diagram-related calls): `getItem(itemId)` (reuses the extended `GET /api/treatment-items/[id]`),
  `listSameTypeItems(patientId, treatmentTypeId)`, `saveDiagrams(itemId, views)`.
- New page `TreatmentDiagramComponent` (route `/treatments/items/:itemId/diagram`) — follows the
  exact same shell as `ConsentSignComponent`: loading/patient-mismatch guard, then embeds
  `<app-facial-diagram-views>` with `permissionModule="treatments"`, `[diagrams]` from the loaded
  item, and a `dataSource` object built from `TreatmentDiagramService` closed over this item's id,
  this treatment type's id, and this patient's id (for the reference list/fetch and the save call).
  "Volver" returns to `/treatments/:treatmentId`, matching the consent page's back-navigation.
- `TreatmentDetailComponent` gains a "Ver/Editar diagrama" action link per saved+selected item,
  next to the existing consent link, gated by `treatments:edit` (drawing) vs. read-only viewing —
  matching the same visibility rules already established for the consent link (view-only users can
  open the page and see the diagram read-only; only `treatments:edit` users see the drawing
  toolbar, which `FacialDiagramCanvasComponent` already handles via its own `canEdit` check once
  `permissionModule` is wired correctly).

## Error Handling

Standard pattern already established throughout this app: failures surface via the existing global
error-interceptor toast.

## Testing

Same low-effort convention as every prior module: no new pure-logic module is introduced — verified
by building and manual/API-level testing. The one thing this sub-project must explicitly re-verify
manually is that Valoración's existing diagram tool (draw, save, reload, reference overlay) still
works identically after the extraction — a regression there would be a silent break in
already-shipped functionality that a Treatments-focused test pass could easily miss.
