# Treatments — Sub-project 4b: Photo Reuse

Status: approved
Date: 2026-08-03

## Purpose

Let each treatment item on a Treatment visit have its own before/after photo set, captured with
the same camera-capture tool already built for Valoración — without hardcoding that tool to
Valoración. This is the second, final mini-cycle under sub-project 4 ("Diagram + photo reuse") in
the Treatments module (see `2026-08-01-project-overview.md`); the first, diagram reuse, is
complete. Once this lands, Treatments (sub-projects 1-4) is entirely done.

## Scope

In scope:
- A new `TreatmentItemPhoto` model, one row per photo, mirroring `Photo`'s shape.
- Extracting `PhotoCaptureComponent`/`PhotoGalleryComponent` from their Valoración-specific
  coupling (`ValoracionService` injection, hardcoded `'valoracion'` permission module) into a form
  both Valoración and Treatments can drive, without changing either's current behavior.
- A dedicated per-item photo page, reachable from the treatment detail page via an action link —
  mirroring the exact UX pattern consent signing and diagram reuse already established.
- Extending the existing patient-level photo timeline (`PhotoTimelineComponent`) to include
  treatment-item photos alongside Valoración photos, satisfying the product requirement that the
  before/after history "evolves" across both visit types — gated so a user without `treatments:view`
  sees the timeline exactly as it works today.
- Relocating the reusable diagram and photo component folders (`facial-diagram/`, `photo/`) from
  `apps/web/src/app/valoracion/` to a neutral `apps/web/src/app/shared/` location — a pure path
  move, resolving the open note from diagram reuse's final review before this sub-project adds
  another cross-module consumer of the same pattern.

Out of scope (deferred):
- Any lock preventing a treatment item with photos from being deselected — deselecting a
  not-yet-consented item deletes it and its photos together (cascade), matching the diagram
  precedent from the first mini-cycle. Deliberate, not an oversight.
- Cleaning up the on-disk file when a photo row is deleted (or cascade-deleted) — `Photo`'s own
  delete path has never done this; `TreatmentItemPhoto` inherits the same pre-existing gap
  unchanged, not fixed here.
- Any change to how `Valoracion`/`Photo` behave — the extraction must be behavior-preserving for
  Valoración, verified the same way diagram reuse was: an explicit manual regression pass over
  Valoración's existing photo capture/gallery/timeline flows.

## Architecture

### Data model

```prisma
model TreatmentItemPhoto {
  id              String        @id @default(uuid())
  treatmentItemId String
  treatmentItem   TreatmentItem @relation(fields: [treatmentItemId], references: [id], onDelete: Cascade)
  patientId       String
  tag             PhotoTag
  filePath        String
  createdAt       DateTime      @default(now())

  @@index([treatmentItemId])
  @@index([patientId])
}
```

Reuses the existing `PhotoTag` enum (`BEFORE`/`AFTER`) unchanged. `patientId` stays denormalized
directly on the row, matching `Photo`'s own pattern — needed so the patient-level timeline query
(below) doesn't have to join through `Treatment`. `onDelete: Cascade` matches the precedent set by
`TreatmentItemDiagram` in the first mini-cycle: photos are documentation attached to a treatment
selection, not a legal artifact like a signed consent, so deselecting the item correctly takes its
photos with it rather than blocking the save. `TreatmentItem` gains an implicit
`photos TreatmentItemPhoto[]` back-relation.

A dedicated model (rather than a nullable dual-FK on `Photo`) keeps this change zero-risk to
Valoración's already-shipped photo data and queries — the same reasoning already applied to
`Consent` and `TreatmentItemDiagram`.

### Component extraction

**`PhotoCaptureComponent`/`PhotoGalleryComponent`** currently inject `ValoracionService` directly
(one call each: `uploadPhoto`, and `listPhotos`/`deletePhoto` respectively) and
`PhotoGalleryComponent` hardcodes `this.auth.hasPermission('valoracion', 'edit')`. Both become
driven by:

```ts
export interface PhotoRecord {
  id: string;
  tag: PhotoTag;
  filePath: string;
  createdAt: string;
}

export interface PhotoDataSource {
  list(): Promise<PhotoRecord[]>;
  upload(blob: Blob, tag: PhotoTag): Promise<PhotoRecord>;
  delete(photoId: string): Promise<void>;
}
```

`PhotoRecord` is a neutral shape (id, tag, filePath, createdAt only — the fields the components
actually read) rather than the existing `Photo` shared type, which carries `valoracionId` —
meaningless for a treatment-sourced photo. The same structural-typing trick already used for
`DiagramViewRecord`/`ValoracionDiagram` applies here: both `Photo` and the new `TreatmentItemPhoto`
shared type are supersets of `PhotoRecord`'s fields, so existing code (`ValoracionDetailComponent`
handing `Photo[]` to something expecting `PhotoRecord[]`) needs no changes.

`PhotoCaptureComponent`'s `@Input() valoracionId` becomes `@Input({ required: true }) dataSource!: PhotoDataSource`
(it only ever calls `.upload(...)`, matching its current single call site). `PhotoGalleryComponent`
gets `@Input({ required: true }) dataSource!: PhotoDataSource` and
`@Input({ required: true }) permissionModule!: PermissionModule`, passing its own `dataSource`
straight down to the capture child. Neither component's internal behavior changes — camera access,
the oval framing guide (CSS overlay, unchanged), the `canvas.toBlob` capture mechanics, the delete
confirmation flow — all stay exactly as they are, just retargeted through the abstraction, the same
extraction shape already proven for the diagram tool.

Two concrete `PhotoDataSource` implementations exist afterward: Valoración's (constructed by
`ValoracionDetailComponent`, wrapping the existing `ValoracionService` calls, behavior-preserving)
and Treatments' (constructed by the new `TreatmentPhotoComponent`, wrapping a new
`TreatmentPhotoService`).

### Backend

- `apps/api/src/lib/treatment/photo.ts` (new) — mirrors `apps/api/src/lib/photo/photo.ts` exactly,
  retargeted to `treatmentItemId`: `listTreatmentItemPhotos`, `createTreatmentItemPhoto`,
  `deleteTreatmentItemPhoto` (same atomic ownership-scoped delete pattern), and
  `listPatientTreatmentPhotos` for the timeline (below).
- `GET`/`POST /api/treatment-items/[id]/photos` (`treatments:view`/`edit`) — mirror the Valoración
  photo routes exactly: same 1KB–10MB size bounds, same JPEG magic-byte validation via `isJpeg`,
  same `saveFile`-based storage, using the category string `'treatment-photos'` (parallel to
  Valoración's `'photos'`, keeping files physically separated on disk by category).
- `DELETE /api/treatment-items/[id]/photos/[photoId]` (`treatments:edit`).
- `GET /api/patients/[patientId]/treatment-photos` (`treatments:view`, new) — the patient-level
  timeline source for treatment-item photos. Each returned photo carries its owning item's
  `treatmentTypeName` and the parent Treatment's `fecha` denormalized onto it (the same "return
  display-ready fields" pattern `TreatmentSummary.treatmentTypeNames` already uses), so the
  frontend can group and label without a second round trip.

No change is needed to the existing `GET /api/treatment-items/[id]` response — the new photo page
only needs that endpoint's already-present `patientId`/`treatmentId`/`treatmentTypeName` fields for
its mismatch guard and header, and `PhotoGalleryComponent` self-fetches its own photo list via
`dataSource.list()` on init (matching its current behavior), not via a parent-provided input.

### Frontend

- New `TreatmentPhotoService` (mirrors `TreatmentDiagramService`'s shape): `getItem(itemId)`
  (reuses the existing item-detail endpoint), `list(itemId)`, `upload(itemId, blob, tag)`,
  `delete(itemId, photoId)`.
- New page `TreatmentPhotoComponent` (route `/treatments/items/:itemId/photos`) — follows the
  exact same shell as `TreatmentDiagramComponent`/`ConsentSignComponent`: patient-mismatch guard,
  then embeds `<app-photo-gallery>` with a `PhotoDataSource` built from `TreatmentPhotoService`
  closed over this item's id, plus `permissionModule="treatments"`.
- `TreatmentDetailComponent` gains a "Ver/Agregar fotos" action link per saved+selected item, next
  to the existing consent and diagram links.
- `PhotoTimelineComponent` additionally fetches from the new patient-photos endpoint — but only
  when `AuthService.hasPermission('treatments', 'view')` is true client-side, so a user who
  permanently lacks that permission never attempts the call and the timeline works exactly as it
  does today for them. When the call *is* attempted and fails, it surfaces as the existing
  `loadFailed` state — the component's own established design choice already rejects silently
  degrading to an empty state on error, and this extension follows that same choice rather than
  inventing a different one for the new data source. Treatment-item photos group by
  `treatmentItemId`, labeled "*date* — *treatment type name*" (vs. Valoración groups, labeled by
  date alone), merged into one chronologically-sorted list alongside the existing visit groups.

### Folder reorganization

`apps/web/src/app/valoracion/facial-diagram/` (6 files, from the diagram-reuse mini-cycle) and
`apps/web/src/app/valoracion/photo/` (`photo-capture.component.ts`, `photo-gallery.component.ts`,
`photo-timeline.component.ts`, plus any existing spec files) both move to
`apps/web/src/app/shared/facial-diagram/` and `apps/web/src/app/shared/photo/` respectively — pure
path moves, no logic changes. Every import site updates accordingly: `ValoracionDetailComponent`,
`TreatmentDiagramComponent`, `app.routes.ts` (both the existing `/photos` route and the diagram
route already added in 4a), and the new Treatments photo files created by this sub-project.

## Error Handling

Standard pattern already established throughout this app: failures surface via the existing global
error-interceptor toast, except where noted above (`PhotoTimelineComponent`'s existing
`loadFailed` convention, preserved and extended rather than replaced).

## Testing

Same low-effort convention as every prior module: no new pure-logic module is introduced —
verified by building and manual/API-level testing. As with diagram reuse, this sub-project must
explicitly re-verify Valoración's existing photo capture/gallery/timeline flows work identically
after both the extraction and the folder move — a regression here would be a silent break in
already-shipped, previously-reviewed functionality.
