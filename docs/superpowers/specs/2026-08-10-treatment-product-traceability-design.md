# Treatments — Product Traceability

Status: approved
Date: 2026-08-10

## Purpose

Record which products were used in each treatment item, with enough detail to answer the question
that matters when a manufacturer recalls a batch: *which patients received lot X?* Each entry
carries a brand, a lot number, an optional expiry date, and an optional photo of the packaging —
the photo being the fastest way to capture a box in the room, and the evidence that the lot number
was transcribed from the real thing.

This is independent of the consent work in `2026-08-10-consent-legal-document-design.md`; the two
share no code beyond the file-storage and image-validation helpers both already reuse.

## Scope

In scope:
- New `TreatmentItemProduct` model: brand, lot number, optional expiry, optional photo.
- CRUD endpoints under the existing treatment-item namespace, plus a brand-autocomplete endpoint.
- A "Productos utilizados" screen per treatment item, reached from the treatment detail page
  alongside the existing consent / diagram / photos actions.
- Extraction of the camera plumbing from `PhotoCaptureComponent` into a reusable
  `CameraCaptureComponent` that emits a blob.
- Products listed in the record export under their treatment item.

Out of scope:
- A managed product catalog. Brands are free text with autocomplete from prior entries.
- A cross-patient "find every treatment using lot X" search screen. The data and the index exist
  to support it; the UI is deferred until it is actually needed.
- Stock or inventory tracking of any kind.
- Reusing the existing `PhotoTag` enum. A product photo is not a `BEFORE`/`AFTER` clinical photo
  and belongs to a product row, not to a gallery.

## Architecture

### Data model

```prisma
model TreatmentItemProduct {
  id              String        @id @default(uuid())
  treatmentItemId String
  treatmentItem   TreatmentItem @relation(fields: [treatmentItemId], references: [id], onDelete: Cascade)
  patientId       String
  brand           String
  lotNumber       String
  expiryDate      DateTime?
  photoPath       String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@index([treatmentItemId])
  @@index([lotNumber])
}
```

`brand` and `lotNumber` are required — they are the entire point of the record. `expiryDate` and
`photoPath` are optional: a smudged or missing box must not block saving a lot number that was read
aloud from it.

`patientId` is denormalized onto the row, matching `TreatmentItemPhoto`. It is what `saveFile`
needs to build the storage path, and it lets a future recall query resolve affected patients
without joining back through `TreatmentItem` → `Treatment`.

`expiryDate` is stored as the **last day of the printed month**. Packaging prints MM/YYYY, not a
day, and normalizing to month-end makes "was this expired when it was used?" a direct comparison
against `Treatment.fecha` with no off-by-one ambiguity. The normalization is performed
**server-side** and is authoritative: the client sends whatever date its month picker produced, and
`normalizeExpiryToMonthEnd` in `apps/api/src/lib/treatment/product-expiry.ts` decides what is
stored. The client does not pre-normalize, so there is exactly one implementation of the rule.

`onDelete: Cascade` matches `TreatmentItemPhoto`: removing a treatment item removes its product
rows. The item-replace endpoint's upsert-diff (see
`2026-08-02-treatments-consent-signing-design.md`) preserves item ids across saves, so an unrelated
edit to the visit does not disturb recorded products.

### Backend endpoints

All require the existing `treatments` permissions — no new permission module, matching how photos
and diagrams reuse their parent module's actions.

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/api/treatment-items/[id]/products` | `treatments:view` | list, ordered by `createdAt` |
| `POST` | `/api/treatment-items/[id]/products` | `treatments:edit` | multipart: fields + optional photo |
| `PATCH` | `/api/treatment-items/[id]/products/[productId]` | `treatments:edit` | correct a typo; may add or replace the photo |
| `DELETE` | `/api/treatment-items/[id]/products/[productId]` | `treatments:edit` | |
| `GET` | `/api/treatment-products/brands?q=` | `treatments:view` | distinct brands for autocomplete |

`treatments` has no `delete` action in the seeded permission set, and the existing treatment-item
photo routes already use `edit` for both upload and delete. These routes follow that precedent
rather than introducing a new permission row.

`PATCH` and `DELETE` verify that the product's `treatmentItemId` matches the `[id]` in the path
before acting, so a valid product id from one item cannot be operated on through another item's
URL.

The photo is stored via `saveFile(buffer, 'treatment-products', patientId, 'product.jpg')` and
validated with the same 1KB–10MB bounds and `isJpeg` magic-byte check the photo and consent routes
already share — no new upload logic. Replacing a photo writes the new file and then updates the
row; the superseded file is left on disk, matching how the app already treats replaced binaries.

The brands endpoint runs a `DISTINCT brand` query with a case-insensitive prefix filter, ordered
alphabetically and capped at 10 results. Brand names are not PHI, but the endpoint still requires
`treatments:view` so it cannot be used as an unauthenticated probe of the installation.

All four mutating routes write audit entries (`entity: 'TreatmentItemProduct'`) carrying the item's
`patientId`, exactly as the photo routes do.

### Frontend

**`CameraCaptureComponent`** (`shared/photo/camera-capture.component.ts`): the camera plumbing
extracted from `PhotoCaptureComponent` — `getUserMedia` with the native-camera `<input capture>`
fallback, the shutter, the review-and-retake step, and the downscale-to-1920 / JPEG-0.9 encode. It
emits a `Blob` and knows nothing about tags, uploads or data sources. `PhotoCaptureComponent`
becomes a thin wrapper that adds the `BEFORE`/`AFTER` toggle and uploads the emitted blob through
its `PhotoDataSource`, so the valoración and treatment-item galleries are unchanged from the
user's point of view. The extraction is justified by having a second consumer, not on principle.

**`TreatmentProductsComponent`** (route `/treatments/items/:itemId/products`, guarded by
`authGuard`, `permissionGuard('treatments', 'view')` and `activePatientGuard`): follows the same
shape as the sibling item screens. It uses the established patient-mismatch guard — compare the
fetched item's `patientId` against `ActivePatientStore` and redirect to `/treatments` on a
mismatch, keeping the loading state up for the duration of the navigation so another patient's data
is never briefly rendered.

The screen lists product cards showing brand, lot number, expiry and a photo thumbnail, with edit
and delete actions gated on `treatments:edit` / `treatments:delete`. An expiry date earlier than
the parent treatment's `fecha` is flagged inline — the record should make an expired-product entry
obvious rather than merely storable.

**`TreatmentProductFormDialogComponent`**: brand via `mat-autocomplete` backed by the brands
endpoint (debounced, minimum two characters, free text always accepted), lot number as a text
input, expiry as a `matDatepicker` in month-year mode (`startView="multi-year"`, closed on
`monthSelected`), and a photo slot using `CameraCaptureComponent` that
holds the captured blob locally until the dialog is saved. Saving posts everything in one
multipart request, so a product is never persisted half-entered. It follows this project's
`MAT_DIALOG_DATA` field-ordering convention — `data` injected as a field before any initializer
that reads it, as documented in `RoleFormDialogComponent`.

**`TreatmentDetailComponent`**: gains a fourth per-item action, "Productos utilizados", next to the
existing consent / diagram / photos links at
`apps/web/src/app/treatments/treatment-detail.component.ts:108-124`. Like the others, it appears
only once the item has a saved backend id.

### Export

`gather-export-data.ts` includes each item's products, and `build-pdf.tsx` renders them inside the
existing `TreatmentItemBlock` as a compact "Productos utilizados" table: brand, lot, expiry. Product
photos are **not** embedded in the export — they are working evidence for transcription, and
inlining one image per product would inflate every export for little clinical value. The screen
remains the place to look at them.

## Error Handling

- `brand` and `lotNumber` are required, trimmed, and capped at 120 characters each; a blank or
  whitespace-only value is rejected `400`.
- `expiryDate`, when present, must parse as a date; a non-parsing value is rejected `400` rather
  than silently stored as null.
- The photo, when present, gets the full existing validation path; an invalid image rejects the
  whole request so a product is never created with a silently-dropped photo.
- `404` when the treatment item or the product does not exist, or when the product does not belong
  to the item in the path.
- Failures surface through the existing global error-interceptor toast. The dialog stays open with
  its values and captured photo intact when a save fails.

## Testing

Following the repo convention of unit-testing pure logic rather than routes or components, the one
new pure module gets a spec:

`apps/api/src/lib/treatment/product-expiry.spec.ts` — the month-end normalization: a mid-month
input normalized to the last day of that month, February in a leap year and a common year, December
rolling correctly, and an already-month-end input left unchanged.

Manual verification: add a product with and without a photo, edit one, delete one, confirm the
brand autocomplete suggests a previously-entered brand, confirm the expiry warning appears for a
product that expired before the treatment date, and confirm the products table appears in the
export.

All new UI labels go into `es.json`/`en.json`; the export's column headings join `pdf-labels.ts`.
