# Treatment Product Traceability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record which products were used in each treatment item — brand, lot number, optional expiry, optional packaging photo — so a recalled lot can be traced back to the patients who received it.

**Architecture:** A `TreatmentItemProduct` row per product, owned by a treatment item and cascading with it. CRUD lives under the existing treatment-item API namespace and reuses the established file-storage and image-validation helpers. The brand field is free text with autocomplete sourced from a `DISTINCT brand` query over prior entries. Expiry is normalized server-side to the last day of the printed month by one pure, unit-tested function.

**Tech Stack:** Nx monorepo (npm workspaces), Next.js 16 API routes, Prisma + PostgreSQL, Angular 22 standalone components with Angular Material and Transloco, `@react-pdf/renderer` 4.5.1, Jest for API unit tests.

**Spec:** `docs/superpowers/specs/2026-08-10-treatment-product-traceability-design.md`

**Independence:** This plan shares no code with `2026-08-10-consent-legal-document.md` beyond `saveFile` and `isJpeg`, which both already exist. It can be executed before, after, or alongside it.

## Global Constraints

- Run every task through nx with npm: `npm exec nx <target> <project>`. Never call `tsc`, `jest` or `next` directly.
- Test command: `npm exec nx test api` — the whole suite runs in about 3 seconds, so always run all of it rather than filtering to one file. Typecheck the API with `npm exec nx build api` (the `api` project has only `build` and `test` targets — no `typecheck`, no `lint`; `next build` is what typechecks it). Web: `npm exec nx typecheck web` and `npm exec nx build web`.
- `treatments` has **no** `delete` action in the seeded permission set. Product mutations use `treatments:edit`, matching the existing treatment-item photo delete route at `apps/api/src/app/api/treatment-items/[id]/photos/[photoId]/route.ts:14`.
- Photo uploads reuse the existing validation: `content-length` early-out at 10MB, authoritative post-read bounds of 1KB–10MB, and `isJpeg(buffer)` from `apps/api/src/lib/storage/image-signature.ts`. Do not write a new upload path.
- All user-facing strings go through Transloco with keys added to **both** `apps/web/src/assets/i18n/es.json` and `apps/web/src/assets/i18n/en.json`. PDF strings go in `apps/api/src/lib/export/pdf-labels.ts` under both `es` and `en`.
- Angular components are standalone and use signals. Dialog components inject `MAT_DIALOG_DATA` as a field declared **before** any field initializer that reads it (see `RoleFormDialogComponent` — this avoids a production-build-only TS2729 error).
- Detail screens compare the fetched record's `patientId` against `ActivePatientStore` and redirect to `/treatments` on mismatch, keeping the loading state up for the duration of the navigation. Follow `apps/web/src/app/treatments/treatment-photo.component.ts:47-70`.
- Commit after every task. Prefix messages with `feat:` or `refactor:`.
- **On the level of detail below:** server-side logic, types and pure functions are given as literal code, because their signatures are contracts between tasks. Angular screens are specified as a list of controls, bindings, validators and permission gates plus the exact existing file to mirror. That is deliberate — this repo has strong per-component conventions (signal state, `mismatched` guard, `canEdit` plain field, Transloco keys) that are better copied from the named neighbour than reinvented from a code block in a plan. If a step names a file to mirror, open it first.

---

### Task 1: Schema, migration and expiry normalization

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_treatment_item_product/migration.sql` (generated)
- Create: `apps/api/src/lib/treatment/product-expiry.ts`
- Create: `apps/api/src/lib/treatment/product-expiry.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma model `TreatmentItemProduct`; `normalizeExpiryToMonthEnd(value: string): Date | null` from `apps/api/src/lib/treatment/product-expiry.ts`.

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

Add after `model TreatmentItemPhoto`:

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

Add the back-relation to `model TreatmentItem`:

```prisma
  products        TreatmentItemProduct[]
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npm exec prisma migrate dev --name treatment_item_product`
Expected: migration applies, `prisma generate` runs.

- [ ] **Step 3: Write the failing test**

Create `apps/api/src/lib/treatment/product-expiry.spec.ts`:

```ts
import { normalizeExpiryToMonthEnd } from './product-expiry';

describe('normalizeExpiryToMonthEnd', () => {
  it('returns null for an empty value', () => {
    expect(normalizeExpiryToMonthEnd('')).toBeNull();
  });

  it('moves a mid-month date to the last day of that month', () => {
    expect(normalizeExpiryToMonthEnd('2027-05-14')?.toISOString()).toBe(
      '2027-05-31T23:59:59.999Z'
    );
  });

  it('leaves an already month-end date on the same day', () => {
    expect(normalizeExpiryToMonthEnd('2027-05-31')?.toISOString()).toBe(
      '2027-05-31T23:59:59.999Z'
    );
  });

  it('handles February in a leap year', () => {
    expect(normalizeExpiryToMonthEnd('2028-02-03')?.toISOString()).toBe(
      '2028-02-29T23:59:59.999Z'
    );
  });

  it('handles February in a common year', () => {
    expect(normalizeExpiryToMonthEnd('2027-02-03')?.toISOString()).toBe(
      '2027-02-28T23:59:59.999Z'
    );
  });

  it('handles December without rolling into the next year', () => {
    expect(normalizeExpiryToMonthEnd('2027-12-01')?.toISOString()).toBe(
      '2027-12-31T23:59:59.999Z'
    );
  });

  it('accepts a full ISO timestamp', () => {
    expect(normalizeExpiryToMonthEnd('2027-05-14T09:30:00.000Z')?.toISOString()).toBe(
      '2027-05-31T23:59:59.999Z'
    );
  });

  it('throws on an unparseable value', () => {
    expect(() => normalizeExpiryToMonthEnd('not-a-date')).toThrow();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm exec nx test api`
Expected: FAIL — `Cannot find module './product-expiry'`.

- [ ] **Step 5: Write the implementation**

Create `apps/api/src/lib/treatment/product-expiry.ts`:

```ts
export class InvalidExpiryError extends Error {}

/**
 * Packaging prints an expiry as MM/YYYY, never a specific day, so a product is usable through the
 * end of the printed month. Normalizing every stored expiry to that month's final instant makes
 * "was this expired when it was used?" a direct comparison against the treatment date with no
 * off-by-one ambiguity, and it is deliberately done here — server-side — so there is exactly one
 * implementation of the rule regardless of what the client's date picker produced.
 *
 * UTC throughout: the value is a calendar fact about a package, not a moment in the clinic's local
 * time, and reading it back in another timezone must not shift it into a different month.
 */
export function normalizeExpiryToMonthEnd(value: string): Date | null {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidExpiryError(`Unparseable expiry date: ${value}`);
  }
  // Day 0 of the *next* month is the last day of this one, which handles February and leap years
  // without a table.
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm exec nx test api`
Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
git add prisma apps/api/src/lib/treatment/product-expiry.ts apps/api/src/lib/treatment/product-expiry.spec.ts
git commit -m "feat: add TreatmentItemProduct schema and expiry normalization"
```

---

### Task 2: Products API

**Files:**
- Create: `apps/api/src/lib/treatment/treatment-product.ts`
- Create: `apps/api/src/app/api/treatment-items/[id]/products/route.ts`
- Create: `apps/api/src/app/api/treatment-items/[id]/products/[productId]/route.ts`
- Create: `apps/api/src/app/api/treatment-products/brands/route.ts`
- Create: `libs/shared/types/src/lib/treatment-product.ts`
- Modify: `libs/shared/types/src/index.ts`

**Interfaces:**
- Consumes: `normalizeExpiryToMonthEnd`, `InvalidExpiryError` (Task 1); `saveFile`, `isJpeg`, `requireAuth`, `apiError`, `withApiErrors`, `writeAuditLogSafe`.
- Produces:
  - `TreatmentProductRecord` and `TreatmentProductInput` in `@expedientes/shared-types`.
  - `listProducts(treatmentItemId)`, `createProduct(treatmentItemId, patientId, data)`, `updateProduct(id, data)`, `deleteProduct(id)`, `getProduct(id)`, `listBrands(prefix)` from `apps/api/src/lib/treatment/treatment-product.ts`.

- [ ] **Step 1: Add the shared types**

Create `libs/shared/types/src/lib/treatment-product.ts`:

```ts
export interface TreatmentProductRecord {
  id: string;
  brand: string;
  lotNumber: string;
  /** ISO timestamp at the last instant of the printed expiry month, or null. */
  expiryDate: string | null;
  photoPath: string | null;
  createdAt: string;
}

export interface TreatmentProductInput {
  brand: string;
  lotNumber: string;
  /** `YYYY-MM-DD`; the server normalizes it to the end of that month. Empty string clears it. */
  expiryDate: string;
}
```

Add `export * from './lib/treatment-product.js';` to `libs/shared/types/src/index.ts`, matching the existing export style.

- [ ] **Step 2: Write the data-access module**

Create `apps/api/src/lib/treatment/treatment-product.ts`:

```ts
import { prisma } from '../prisma/client';

export interface ProductWriteData {
  brand: string;
  lotNumber: string;
  expiryDate: Date | null;
  photoPath?: string;
}

export function listProducts(treatmentItemId: string) {
  return prisma.treatmentItemProduct.findMany({
    where: { treatmentItemId },
    orderBy: { createdAt: 'asc' },
  });
}

export function getProduct(id: string) {
  return prisma.treatmentItemProduct.findUnique({ where: { id } });
}

export function createProduct(treatmentItemId: string, patientId: string, data: ProductWriteData) {
  return prisma.treatmentItemProduct.create({
    data: { treatmentItemId, patientId, ...data },
  });
}

export function updateProduct(id: string, data: ProductWriteData) {
  return prisma.treatmentItemProduct.update({ where: { id }, data });
}

export function deleteProduct(id: string) {
  return prisma.treatmentItemProduct.delete({ where: { id } });
}

/**
 * Powers the brand autocomplete. Brand names are not patient data, so this is deliberately not
 * scoped to a patient — the whole point is to suggest brands entered on other patients' records.
 * The route still requires `treatments:view` so it cannot be used as an unauthenticated probe.
 */
export async function listBrands(prefix: string): Promise<string[]> {
  const rows = await prisma.treatmentItemProduct.findMany({
    where: { brand: { startsWith: prefix, mode: 'insensitive' } },
    distinct: ['brand'],
    select: { brand: true },
    orderBy: { brand: 'asc' },
    take: 10,
  });
  return rows.map((r) => r.brand);
}
```

- [ ] **Step 3: Write the collection route**

Create `apps/api/src/app/api/treatment-items/[id]/products/route.ts` with `GET` (`treatments:view`, returns `{ products }`) and `POST` (`treatments:edit`).

`POST` must, in order: apply the `content-length` early-out at 10MB → load the treatment item with its treatment to get `patientId`, 404 if missing → read `brand`, `lotNumber`, `expiryDate` and the optional `photo` from `formData` → reject 400 when `brand` or `lotNumber` is blank after trimming or exceeds 120 characters → call `normalizeExpiryToMonthEnd`, catching `InvalidExpiryError` and returning `apiError('INVALID_INPUT', 'expiryDate is not a valid date', 400)` → when a photo is present, enforce the 1KB–10MB bounds and `isJpeg`, then `saveFile(buffer, 'treatment-products', patientId, 'product.jpg')` → create the row → `writeAuditLogSafe({ userId, action: 'create', entity: 'TreatmentItemProduct', entityId: product.id, patientId })` → return 201.

Validating the photo *before* creating the row is what keeps a product from ever existing with a silently-dropped image.

- [ ] **Step 4: Write the item route**

Create `apps/api/src/app/api/treatment-items/[id]/products/[productId]/route.ts` with `PATCH` and `DELETE`, both `treatments:edit`.

Both must first load the product and verify `product.treatmentItemId === id` from the path, returning 404 otherwise:

```ts
    const product = await getProduct(productId);
    if (!product || product.treatmentItemId !== id) {
      return apiError('NOT_FOUND', 'Product not found', 404);
    }
```

Without that check, a valid product id from one treatment item could be mutated through another item's URL. `PATCH` then applies the same field validation as `POST` and may replace the photo; the superseded file is left on disk, matching how the app already treats replaced binaries. Both write audit entries (`action: 'update'` / `'delete'`) carrying `product.patientId`.

- [ ] **Step 5: Write the brands route**

Create `apps/api/src/app/api/treatment-products/brands/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { listBrands } from '../../../../lib/treatment/treatment-product';
import { requireAuth } from '../../../../lib/http/require-auth';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

export const GET = withApiErrors(async (request: NextRequest) => {
  await requireAuth(request, 'treatments', 'view');
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ brands: [] });
  const brands = await listBrands(q);
  return NextResponse.json({ brands });
});
```

- [ ] **Step 6: Typecheck**

Run: `npm exec nx build api`
Expected: PASS.

- [ ] **Step 7: Verify by hand**

Against a running API with a known treatment item id: `POST` a product with brand, lot and a JPEG returns 201; `GET` lists it; `PATCH` on that product through a *different* item's URL returns 404; `POST` with a blank lot returns 400; `POST` with `expiryDate=nope` returns 400; `GET /api/treatment-products/brands?q=bo` returns the brand.

- [ ] **Step 8: Commit**

```bash
git add libs/shared/types apps/api
git commit -m "feat: add treatment product API"
```

---

### Task 3: Camera capture extraction

**Files:**
- Create: `apps/web/src/app/shared/photo/camera-capture.component.ts`
- Modify: `apps/web/src/app/shared/photo/photo-capture.component.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `CameraCaptureComponent` (selector `app-camera-capture`) with input `disabled: boolean`, input `busy: boolean`, and output `captured: OutputEmitterRef<Blob>`. It emits a downscaled JPEG blob and knows nothing about tags, uploads or data sources.

This is a refactor with no behaviour change. It exists because Task 4 needs a second consumer of the camera; do not restructure anything the product screen does not need.

- [ ] **Step 1: Move the camera plumbing**

Create `apps/web/src/app/shared/photo/camera-capture.component.ts` and move from `photo-capture.component.ts`: the hidden `<input type="file" capture="environment">` fallback and its `onFileSelected`, `openCamera`/`closeCamera`, the `<video>` element with the oval guide, `capture()`, the review step with `retake()`, the `MAX_CAPTURE_DIMENSION = 1920` / `JPEG_QUALITY = 0.9` downscale-and-encode, `cameraError`, and `OnDestroy` stream teardown. Keep every existing comment — in particular the one explaining why the file input lives outside the `@if` branch.

Where the old component called `dataSource.upload(...)` on "use photo", the new one emits:

```ts
  readonly captured = output<Blob>();
```

and the review-primary button calls `this.captured.emit(blob)` then `this.closeCamera()`. The `busy` input drives the spinner and the disabled states that `uploading()` drove before, so the parent owns the in-flight state.

- [ ] **Step 2: Reduce `PhotoCaptureComponent` to a wrapper**

`PhotoCaptureComponent` keeps its `dataSource` input, the `BEFORE`/`AFTER` `mat-button-toggle-group`, the `tag` signal, `setTag`, the `uploaded` output and the `uploading` signal. Its template becomes the toggle group plus `<app-camera-capture [busy]="uploading()" (captured)="onCaptured($event)" />`, where `onCaptured` sets `uploading`, calls `dataSource.upload(blob, tag())`, emits `uploaded`, and clears `uploading` in a `finally`.

- [ ] **Step 3: Build**

Run: `npm exec nx build web`
Expected: PASS.

- [ ] **Step 4: Verify no regression by hand**

Open a valoración's photos and a treatment item's photos. Take a photo with the live camera and one through the native-camera fallback, tag each `BEFORE` and `AFTER`, and confirm both upload and appear in the gallery exactly as before.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/shared/photo
git commit -m "refactor: extract CameraCaptureComponent from PhotoCaptureComponent"
```

---

### Task 4: Products screen

**Files:**
- Create: `apps/web/src/app/treatments/treatment-product.service.ts`
- Create: `apps/web/src/app/treatments/treatment-products.component.ts`
- Create: `apps/web/src/app/treatments/treatment-product-form-dialog.component.ts`
- Modify: `apps/web/src/app/app.routes.ts`
- Modify: `apps/web/src/app/treatments/treatment-detail.component.ts`
- Modify: `apps/web/src/assets/i18n/es.json`, `apps/web/src/assets/i18n/en.json`

**Interfaces:**
- Consumes: `TreatmentProductRecord`, `TreatmentProductInput` (Task 2); `CameraCaptureComponent` (Task 3); `ActivePatientStore`, `AuthService`.
- Produces: `TreatmentProductService` with `list(itemId)`, `create(itemId, input, photo)`, `update(itemId, productId, input, photo)`, `delete(itemId, productId)`, `brands(q)`; route `/treatments/items/:itemId/products`.

- [ ] **Step 1: Write the service**

Create `apps/web/src/app/treatments/treatment-product.service.ts` following the shape of `treatment-photo.service.ts`: `HttpClient` injected, `firstValueFrom`, one method per endpoint. `create` and `update` build a `FormData` with `brand`, `lotNumber`, `expiryDate` and, when present, `photo`.

- [ ] **Step 2: Add the i18n keys**

Under `treatments` in both `es.json` and `en.json`:

```json
    "productsTitle": "Productos utilizados",
    "viewProducts": "Ver productos",
    "addProducts": "Productos utilizados",
    "noProducts": "No hay productos registrados",
    "productBrand": "Marca",
    "productLot": "Lote",
    "productExpiry": "Caducidad",
    "productPhoto": "Foto del empaque",
    "productExpired": "Caducado al momento del tratamiento",
    "addProduct": "Agregar producto",
    "editProduct": "Editar producto",
    "deleteProduct": "Eliminar producto",
    "confirmDeleteProduct": "¿Eliminar este producto del tratamiento?",
```

English: `"Products used"`, `"View products"`, `"Products used"`, `"No products recorded"`, `"Brand"`, `"Lot"`, `"Expiry"`, `"Package photo"`, `"Expired at the time of treatment"`, `"Add product"`, `"Edit product"`, `"Delete product"`, `"Remove this product from the treatment?"`.

- [ ] **Step 3: Write the dialog**

Create `apps/web/src/app/treatments/treatment-product-form-dialog.component.ts`. `data: { itemId: string; product: TreatmentProductRecord | null }` injected as a field **before** the `form` initializer that reads it.

- `brand`: `matInput` with `[matAutocomplete]`, options from a signal fed by a `valueChanges` subscription that debounces 250ms, requires 2+ characters, and calls `service.brands(q)`. Free text is always accepted — the autocomplete only suggests.
- `lotNumber`: `matInput`, `Validators.required`.
- `expiryDate`: `matInput` with `[matDatepicker]`, the datepicker configured `startView="multi-year"` and closing on `(monthSelected)` so only a month and year are ever picked. Send the picked date as `YYYY-MM-DD`; the server decides what is stored.
- Photo: `<app-camera-capture (captured)="onPhotoCaptured($event)" />` storing the blob in a signal, with a preview `<img>` from `URL.createObjectURL`. When editing a product that already has a photo, show it until a new one is captured.

Save posts everything in one request so a product is never persisted half-entered. Revoke the object URL in `ngOnDestroy`.

- [ ] **Step 4: Write the screen**

Create `apps/web/src/app/treatments/treatment-products.component.ts`, modelled directly on `treatment-photo.component.ts` — including the `mismatched` guard pattern and its comment. It lists product cards (brand, lot, expiry, thumbnail linking to `/api/files/${photoPath}`), an "Agregar producto" button gated on `canEdit`, and edit/delete actions per card also gated on `canEdit`. `canEdit` is a plain field set once in `ngOnInit` from `auth.hasPermission('treatments', 'edit')`.

Flag an expired product inline: when `product.expiryDate` is non-null and earlier than the parent treatment's `fecha`, render the `treatments.productExpired` warning on the card. The treatment's `fecha` comes from the item detail's treatment — fetch it alongside the products.

- [ ] **Step 5: Register the route**

In `apps/web/src/app/app.routes.ts`, add alongside the existing `treatments/items/:itemId/photos` entry:

```ts
  {
    path: 'treatments/items/:itemId/products',
    canActivate: [authGuard, permissionGuard('treatments', 'view'), activePatientGuard],
    loadComponent: () =>
      import('./treatments/treatment-products.component').then(
        (m) => m.TreatmentProductsComponent
      ),
  },
```

- [ ] **Step 6: Add the tile to the treatment detail screen**

In `apps/web/src/app/treatments/treatment-detail.component.ts`, add a fourth `item-action` after the photos link (currently at line 124), matching the existing markup exactly:

```html
                <a class="item-action" [routerLink]="['/treatments/items', item.itemId, 'products']">
                  <mat-icon aria-hidden="true">vaccines</mat-icon>
                  <span>{{
                    (canEdit ? 'treatments.addProducts' : 'treatments.viewProducts') | transloco
                  }}</span>
                </a>
```

- [ ] **Step 7: Build**

Run: `npm exec nx build web`
Expected: PASS.

- [ ] **Step 8: Verify by hand**

From a treatment, open Productos utilizados. Add a product with a photo, then one without. Type the first two letters of the saved brand on the second — the autocomplete suggests it. Edit a lot number. Set an expiry earlier than the treatment date and confirm the warning appears. Delete a product. Confirm a view-only user sees the list with no add/edit/delete controls.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "feat: record products used per treatment item"
```

---

### Task 5: Products in the record export

**Files:**
- Modify: `apps/api/src/lib/export/gather-export-data.ts`
- Modify: `apps/api/src/lib/export/build-pdf.tsx`
- Modify: `apps/api/src/lib/export/pdf-labels.ts`

**Interfaces:**
- Consumes: `listProducts` (Task 2).
- Produces: `ExportTreatmentItem.products: Array<{ brand: string; lotNumber: string; expiryDate: string | null }>`.

- [ ] **Step 1: Extend the gathered data**

In `apps/api/src/lib/export/gather-export-data.ts`, add to `ExportTreatmentItem`:

```ts
  products: Array<{ brand: string; lotNumber: string; expiryDate: string | null }>;
```

and populate it inside `gatherTreatments`'s per-item mapping:

```ts
            products: (await listProducts(item.id)).map((p) => ({
              brand: p.brand,
              lotNumber: p.lotNumber,
              expiryDate: p.expiryDate ? p.expiryDate.toISOString() : null,
            })),
```

- [ ] **Step 2: Add the labels**

In `apps/api/src/lib/export/pdf-labels.ts`, extend the `treatments` group in the `PdfLabels` interface and both language objects with:

```ts
    products: string;
    productBrand: string;
    productLot: string;
    productExpiry: string;
```

Spanish: `'Productos utilizados'`, `'Marca'`, `'Lote'`, `'Caducidad'`. English: `'Products used'`, `'Brand'`, `'Lot'`, `'Expiry'`.

- [ ] **Step 3: Render the table**

In `apps/api/src/lib/export/build-pdf.tsx`, add to the `styles` sheet:

```ts
  productRow: { flexDirection: 'row', marginBottom: 2 },
  productCell: { flex: 1 },
```

and render inside `TreatmentItemBlock`, after the diagrams and before the consent reference:

```tsx
      {item.products.length > 0 && (
        <View>
          <Text style={styles.subsectionTitle}>{l.products}</Text>
          <View style={styles.productRow}>
            <Text style={[styles.productCell, styles.itemTitle]}>{l.productBrand}</Text>
            <Text style={[styles.productCell, styles.itemTitle]}>{l.productLot}</Text>
            <Text style={[styles.productCell, styles.itemTitle]}>{l.productExpiry}</Text>
          </View>
          {item.products.map((p, i) => (
            <View key={i} style={styles.productRow}>
              <Text style={styles.productCell}>{p.brand}</Text>
              <Text style={styles.productCell}>{p.lotNumber}</Text>
              <Text style={styles.productCell}>
                {p.expiryDate ? p.expiryDate.substring(0, 7) : '—'}
              </Text>
            </View>
          ))}
        </View>
      )}
```

Expiry prints as `YYYY-MM`, the precision the packaging actually carries. Product photos are deliberately not embedded — they are transcription evidence, and one image per product would inflate every export for little clinical value.

- [ ] **Step 4: Typecheck**

Run: `npm exec nx build api`
Expected: PASS.

- [ ] **Step 5: Verify by hand**

Export a patient record whose treatment has two products, one with an expiry and one without. Confirm the table appears under the treatment item with the header row, both products, `YYYY-MM` for the dated one and `—` for the other.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/export
git commit -m "feat: include treatment products in the record export"
```

---

## Verification

After Task 5, run the full gate:

```bash
npm exec nx test api
npm exec nx build api
npm exec nx build web
npm exec nx lint web
```

Then walk the end-to-end path: create a treatment → open Productos utilizados → add two products, one with a packaging photo and an expiry → export the record → confirm the products table in the PDF.
