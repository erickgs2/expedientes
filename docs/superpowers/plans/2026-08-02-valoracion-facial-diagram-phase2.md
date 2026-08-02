# Valoración — Facial Diagram Tool, Phase 2 (Multiple Views) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Phase 1's single-view facial diagram canvas into three independently-annotated
views (front, left profile, right profile), switchable instantly with all three canvases live at
once, saved together with one button. No data loss for diagrams already saved in Phase 1.

**Architecture:** Phase 1's `FacialDiagramComponent` (owns its own canvas *and* its own Save
button/HTTP call) splits into two components: `FacialDiagramCanvasComponent` (pure canvas
mechanics for one view — trimmed from Phase 1's component, no Save button, exposes
`getSerializedData()`/`loaded` for a parent to read) and `FacialDiagramViewsComponent` (new — the
view switcher, three live canvas instances, one combined Save button). The backend's single
`Valoracion.diagramData` column becomes a child table, `ValoracionDiagram`, one row per
view-that-has-been-saved.

**Tech Stack:** Same as Phase 1 — Next.js route handlers, Prisma, Angular standalone components +
Material, Transloco, Fabric.js v6.9.1 (already pinned, no new library work in this phase).

## Global Constraints

- All code, identifiers, comments, and commit messages are in English; every user-facing string
  goes through Transloco.
- Every task touching `apps/api` must be verified with **both** `npx nx build api` (dev-mode) and
  `npx nx run api:build` (production). Every task touching `apps/web` must be verified with
  `npx nx build web` (production).
- **Null-vs-undefined rule (established during Historia Clínica, reused here for whole per-view
  records instead of individual text fields):** in the diagram PATCH body's `views` map, an
  **omitted** key means "leave that view's stored data unchanged"; an explicit `null` means "delete
  that view's stored data." The frontend's save logic must apply this precisely — see Task 4.
- Follow existing conventions exactly: routes use `withApiErrors(...)` wrapping a handler that
  calls `requireAuth(request, module, action)` first, then `apiError(...)` for expected 4xx cases,
  then `writeAuditLogSafe(...)` after a successful mutation. Dynamic route params are
  `Promise<{ ... }>`, destructured via `await params`.
- Reuse the existing `valoracion:edit` / `valoracion:view` permissions — no new permission, no seed
  script changes.
- No new unit tests: this phase introduces no new pure-logic module (the existing
  `fabric-shapes.ts`/`fabric-shapes.spec.ts` from Phase 1 are reused unchanged across all three
  views) — verified by building and manual testing, matching Phase 1's convention.
- Commit after every task using the working tree state left by that task's steps.
- This plan assumes Phase 1 is complete and merged (it is — `Valoracion.diagramData`/
  `diagramUpdatedAt`, the `PATCH /api/valoracion/[id]/diagram` route, `ValoracionService`,
  `FacialDiagramComponent`, and `fabric-shapes.ts` all already exist on `main`).

---

## Task 1: Prisma schema — ValoracionDiagram table + migration + shared types

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_valoracion_diagram_views/` (generated + hand-edited,
  see Step 2)
- Modify: `libs/shared/types/src/lib/valoracion.ts`

**Interfaces:**
- Produces: `DiagramView` enum (`FRONT`/`LEFT_PROFILE`/`RIGHT_PROFILE`) and `ValoracionDiagram`
  Prisma model, plus the regenerated `@prisma/client` types — consumed by Task 2's service layer.
  Produces the updated `Valoracion`/`ValoracionDiagram`/`ValoracionDiagramsUpdateInput` shared TS
  types — consumed by Task 3's frontend service and Task 4's components.

- [ ] **Step 1: Update the Prisma schema**

In `prisma/schema.prisma`, modify the `Valoracion` model — remove `diagramData`/`diagramUpdatedAt`
and add a back-relation field — and add the new enum and model right after it:

```prisma
model Valoracion {
  id        String   @id @default(uuid())
  patientId String
  patient   Patient  @relation(fields: [patientId], references: [id])

  fecha                 DateTime @default(now())
  queQuiereElPaciente   String?
  queNecesitaElPaciente String?
  notas                 String?

  diagrams ValoracionDiagram[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([patientId])
}

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

- [ ] **Step 2: Generate the migration WITHOUT applying it, then hand-edit in the data backfill**

Run: `npx prisma migrate dev --create-only --name add_valoracion_diagram_views`

This writes `prisma/migrations/<timestamp>_add_valoracion_diagram_views/migration.sql` but does
NOT run it yet. Open that file — it will contain (in some order) a `CreateEnum` for
`DiagramView`, a `CreateTable` for `ValoracionDiagram`, a `CreateIndex` for the unique constraint,
an `AddForeignKey`, and an `AlterTable "Valoracion" DROP COLUMN "diagramData", DROP COLUMN
"diagramUpdatedAt"`.

Edit the file so a backfill `INSERT` runs **after** the new table/FK exist and **before** the old
columns are dropped — i.e. insert the block below between the generated `AddForeignKey` statement
and the generated `AlterTable ... DROP COLUMN` statement. The end result must be equivalent to
this (exact generated formatting for the other statements may differ slightly — that's fine, only
the ordering and the inserted block matter):

```sql
-- CreateEnum
CREATE TYPE "DiagramView" AS ENUM ('FRONT', 'LEFT_PROFILE', 'RIGHT_PROFILE');

-- CreateTable
CREATE TABLE "ValoracionDiagram" (
    "id" TEXT NOT NULL,
    "valoracionId" TEXT NOT NULL,
    "view" "DiagramView" NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValoracionDiagram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ValoracionDiagram_valoracionId_view_key" ON "ValoracionDiagram"("valoracionId", "view");

-- AddForeignKey
ALTER TABLE "ValoracionDiagram" ADD CONSTRAINT "ValoracionDiagram_valoracionId_fkey" FOREIGN KEY ("valoracionId") REFERENCES "Valoracion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: copy any diagram data saved during Phase 1 (a single value on the Valoracion row
-- itself) into a FRONT-view row in the new table, before the source columns are dropped below.
-- Phase 1 only ever had one view, and every save always set diagramUpdatedAt alongside
-- diagramData, so COALESCE is a defensive fallback, not an expected path.
INSERT INTO "ValoracionDiagram" ("id", "valoracionId", "view", "data", "updatedAt")
SELECT gen_random_uuid(), "id", 'FRONT', "diagramData", COALESCE("diagramUpdatedAt", "updatedAt")
FROM "Valoracion"
WHERE "diagramData" IS NOT NULL;

-- AlterTable
ALTER TABLE "Valoracion" DROP COLUMN "diagramData",
DROP COLUMN "diagramUpdatedAt";
```

Then apply it: `npx prisma migrate dev` (no flags this time — it detects the already-written,
not-yet-applied migration and runs it, updating `@prisma/client`'s generated types). Verify the
command completes without errors and prints that the migration was applied.

**Verification:** confirm the backfill worked before moving on. If your local database has a
Valoración with Phase 1 diagram data saved, query it directly (e.g. via `npx prisma studio` or a
short script) and confirm a `ValoracionDiagram` row now exists for it with `view = 'FRONT'` and
`data` matching what was previously in `diagramData`. If no local data has any saved diagram yet,
note that in your report instead — the backfill logic still needs to be correct, just unexercised.

- [ ] **Step 3: Update the shared types**

Replace the contents of `libs/shared/types/src/lib/valoracion.ts` with:

```ts
export type DiagramView = 'FRONT' | 'LEFT_PROFILE' | 'RIGHT_PROFILE';

export interface ValoracionDiagram {
  view: DiagramView;
  data: Record<string, unknown>;
  updatedAt: string;
}

export interface Valoracion {
  id: string;
  patientId: string;
  fecha: string;
  queQuiereElPaciente: string | null;
  queNecesitaElPaciente: string | null;
  notas: string | null;
  diagrams: ValoracionDiagram[];
}

export interface ValoracionUpdateInput {
  fecha?: string;
  queQuiereElPaciente?: string | null;
  queNecesitaElPaciente?: string | null;
  notas?: string | null;
}

export interface ValoracionDiagramsUpdateInput {
  views: {
    front?: Record<string, unknown> | null;
    leftProfile?: Record<string, unknown> | null;
    rightProfile?: Record<string, unknown> | null;
  };
}
```

This removes `diagramData`/`diagramUpdatedAt` from `Valoracion` (replaced by `diagrams`) and
replaces the old singular `ValoracionDiagramUpdateInput` with the new plural
`ValoracionDiagramsUpdateInput`. `ValoracionUpdateInput` is unchanged.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations libs/shared/types/src/lib/valoracion.ts
git commit -m "Add ValoracionDiagram table for per-view diagram data, migrate Phase 1 data"
```

---

## Task 2: Backend — multi-view diagram save endpoint

**Files:**
- Modify: `apps/api/src/lib/valoracion/valoracion.ts`
- Modify: `apps/api/src/app/api/valoracion/[id]/diagram/route.ts`

**Interfaces:**
- Consumes: `DiagramView` enum, `ValoracionDiagram` Prisma model (Task 1).
- Produces: rewritten `PATCH /api/valoracion/[id]/diagram` accepting `{ views: {...} }` — consumed
  by Task 3's frontend service. `getValoracion` now returns the `diagrams` relation — consumed by
  the existing (unchanged) `GET /api/valoracion/[id]` route, which returns whatever `getValoracion`
  gives it.

- [ ] **Step 1: Update the service functions**

In `apps/api/src/lib/valoracion/valoracion.ts`, replace the `getValoracion` and
`updateValoracionDiagram` functions (leave `listValoraciones`, `createValoracion`,
`updateValoracion`, and the `ValoracionUpdateData` interface untouched):

```ts
import type { DiagramView, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

// ...(ValoracionUpdateData interface, listValoraciones, createValoracion stay as-is)...

export async function getValoracion(id: string) {
  return prisma.valoracion.findUnique({
    where: { id },
    include: { diagrams: true },
  });
}

export async function updateValoracion(id: string, data: ValoracionUpdateData) {
  return prisma.valoracion.update({ where: { id }, data });
}

const VIEW_KEY_TO_ENUM: Record<string, DiagramView> = {
  front: 'FRONT',
  leftProfile: 'LEFT_PROFILE',
  rightProfile: 'RIGHT_PROFILE',
};

export interface DiagramViewsUpdate {
  front?: Prisma.InputJsonValue | null;
  leftProfile?: Prisma.InputJsonValue | null;
  rightProfile?: Prisma.InputJsonValue | null;
}

/**
 * Upserts or clears whichever views are present in `views`. A key mapped to `null` deletes that
 * view's row (if any); an omitted key is left untouched — same null-means-clear,
 * omitted-means-unchanged rule this project uses for individual text fields, applied here to whole
 * per-view records. All writes run in one transaction.
 */
export async function updateValoracionDiagrams(id: string, views: DiagramViewsUpdate) {
  const operations = (Object.entries(views) as [keyof DiagramViewsUpdate, Prisma.InputJsonValue | null | undefined][])
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      const view = VIEW_KEY_TO_ENUM[key];
      if (value === null) {
        return prisma.valoracionDiagram.deleteMany({ where: { valoracionId: id, view } });
      }
      return prisma.valoracionDiagram.upsert({
        where: { valoracionId_view: { valoracionId: id, view } },
        create: { valoracionId: id, view, data: value },
        update: { data: value },
      });
    });

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }
  return getValoracion(id);
}
```

- [ ] **Step 2: Rewrite the PATCH route**

Replace `apps/api/src/app/api/valoracion/[id]/diagram/route.ts` entirely with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  updateValoracionDiagrams,
  type DiagramViewsUpdate,
} from '../../../../../lib/valoracion/valoracion';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

const VALID_VIEW_KEYS = ['front', 'leftProfile', 'rightProfile'];

interface DiagramBody {
  views?: Record<string, Record<string, unknown> | null>;
}

export const PATCH = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'valoracion', 'edit');
    const { id } = await params;
    const body = (await request.json()) as DiagramBody;

    if (!body.views || typeof body.views !== 'object') {
      return apiError('INVALID_INPUT', 'views is required', 400);
    }
    for (const [key, value] of Object.entries(body.views)) {
      if (!VALID_VIEW_KEYS.includes(key)) {
        return apiError('INVALID_INPUT', `Unknown view "${key}"`, 400);
      }
      if (value !== null && (typeof value !== 'object' || Array.isArray(value))) {
        return apiError('INVALID_INPUT', `Invalid data for view "${key}"`, 400);
      }
    }

    // No existence pre-check for most cases: `upsert`/`deleteMany` on a bad `valoracionId` either
    // no-ops (deleteMany) or fails the FK constraint (upsert's create), both handled below. The one
    // case that needs an explicit check is an all-omitted-or-empty `views` body against a bad id,
    // where no database operation runs at all to surface the error — `getValoracion` returning
    // `null` catches that.
    const valoracion = await updateValoracionDiagrams(id, body.views as DiagramViewsUpdate);
    if (!valoracion) {
      return apiError('NOT_FOUND', 'Valoración not found', 404);
    }

    await writeAuditLogSafe({
      userId,
      action: 'update',
      entity: 'Valoracion',
      entityId: valoracion.id,
      patientId: valoracion.patientId,
    });

    return NextResponse.json({ valoracion });
  }
);
```

- [ ] **Step 3: Build and verify**

Run: `npx nx build api` then `npx nx run api:build` — both must succeed.

Start the API (`npx nx dev api`) and verify with curl (replace `<id>` with a real Valoración id and
`<cookie>` with a logged-in session cookie — see Phase 1's task reports for the login flow if
needed):

```bash
curl -X PATCH http://localhost:3000/api/valoracion/<id>/diagram \
  -H "Content-Type: application/json" \
  -H "Cookie: <cookie>" \
  -d '{"views":{"front":{"version":1,"objects":[],"nextPinNumber":1},"leftProfile":{"version":1,"objects":[],"nextPinNumber":1}}}'
```

Expected: `200` with `valoracion.diagrams` containing two entries, `view: "FRONT"` and
`view: "LEFT_PROFILE"`. Then:

```bash
curl -X PATCH http://localhost:3000/api/valoracion/<id>/diagram \
  -H "Content-Type: application/json" \
  -H "Cookie: <cookie>" \
  -d '{"views":{"leftProfile":null}}'
```

Expected: `200` with `valoracion.diagrams` now containing only the `FRONT` entry (leftProfile
deleted) — and unrelated to this second call, the `FRONT` entry from the first call is still
present, proving the omitted `rightProfile` key never touched anything. Finally `GET
/api/valoracion/<id>` and confirm the same `diagrams` state persists.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/valoracion/valoracion.ts apps/api/src/app/api/valoracion/[id]/diagram/route.ts
git commit -m "Rewrite diagram PATCH endpoint for multi-view save/clear"
```

---

## Task 3: Frontend service + per-view placeholder assets

**Files:**
- Modify: `apps/web/src/app/valoracion/valoracion.service.ts`
- Create: `apps/web/src/assets/facial-diagram-placeholder-left.svg`
- Create: `apps/web/src/assets/facial-diagram-placeholder-right.svg`

**Interfaces:**
- Consumes: `ValoracionDiagramsUpdateInput` (Task 1), `PATCH /api/valoracion/[id]/diagram` (Task 2).
- Produces: `ValoracionService.updateDiagrams(id, input): Promise<Valoracion>` — consumed by Task
  4's `FacialDiagramViewsComponent`. Produces the two new placeholder asset URLs — consumed by
  Task 4's `FacialDiagramCanvasComponent`.

- [ ] **Step 1: Replace the diagram service method**

In `apps/web/src/app/valoracion/valoracion.service.ts`, update the import and replace
`updateDiagram` with `updateDiagrams`:

```ts
import type {
  Valoracion,
  ValoracionUpdateInput,
  ValoracionDiagramsUpdateInput,
} from '@expedientes/shared-types';

// ...inside the ValoracionService class, replacing the old updateDiagram method...

  updateDiagrams(id: string, input: ValoracionDiagramsUpdateInput): Promise<Valoracion> {
    return firstValueFrom(
      this.http.patch<{ valoracion: Valoracion }>(`/api/valoracion/${id}/diagram`, input)
    ).then((r) => r.valoracion);
  }
```

- [ ] **Step 2: Add the left-profile placeholder**

Create `apps/web/src/assets/facial-diagram-placeholder-left.svg` — a generic side-profile outline
(nose pointing left), same simple line-art style and 480×600 size as Phase 1's front placeholder:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600" width="480" height="600">
  <rect width="480" height="600" fill="#fafafa"/>
  <path d="M300 130
           C 250 120, 200 140, 180 190
           C 165 225, 168 260, 175 285
           L 150 300
           L 175 320
           C 178 340, 185 360, 195 375
           C 175 385, 165 400, 170 415
           C 200 440, 240 450, 280 445
           C 330 438, 365 405, 375 360
           C 385 315, 375 265, 355 220
           C 340 185, 320 155, 300 130 Z"
        fill="none" stroke="#c9c9c9" stroke-width="2"/>
  <ellipse cx="300" cy="230" rx="8" ry="11" fill="none" stroke="#c9c9c9" stroke-width="2"/>
  <path d="M270 380 Q290 388 310 378" fill="none" stroke="#c9c9c9" stroke-width="2"/>
</svg>
```

- [ ] **Step 3: Add the right-profile placeholder**

Create `apps/web/src/assets/facial-diagram-placeholder-right.svg` — the exact mirror of the left
placeholder (nose pointing right), achieved with an SVG horizontal-flip transform so the inner
shapes don't need to be hand-recomputed:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600" width="480" height="600">
  <rect width="480" height="600" fill="#fafafa"/>
  <g transform="scale(-1,1) translate(-480,0)">
    <path d="M300 130
             C 250 120, 200 140, 180 190
             C 165 225, 168 260, 175 285
             L 150 300
             L 175 320
             C 178 340, 185 360, 195 375
             C 175 385, 165 400, 170 415
             C 200 440, 240 450, 280 445
             C 330 438, 365 405, 375 360
             C 385 315, 375 265, 355 220
             C 340 185, 320 155, 300 130 Z"
          fill="none" stroke="#c9c9c9" stroke-width="2"/>
    <ellipse cx="300" cy="230" rx="8" ry="11" fill="none" stroke="#c9c9c9" stroke-width="2"/>
    <path d="M270 380 Q290 388 310 378" fill="none" stroke="#c9c9c9" stroke-width="2"/>
  </g>
</svg>
```

- [ ] **Step 4: Build and commit**

Run: `npx nx build web` — must succeed.

```bash
git add apps/web/src/app/valoracion/valoracion.service.ts apps/web/src/assets/facial-diagram-placeholder-left.svg apps/web/src/assets/facial-diagram-placeholder-right.svg
git commit -m "Add multi-view diagram save method and left/right placeholder assets"
```

---

## Task 4: Split into FacialDiagramCanvasComponent + FacialDiagramViewsComponent, wire into the detail page

**Files:**
- Create: `apps/web/src/app/valoracion/facial-diagram/facial-diagram-canvas.component.ts`
- Delete: `apps/web/src/app/valoracion/facial-diagram/facial-diagram.component.ts` (replaced by the
  file above — this task's Step 1 is a rename-and-trim, not an addition alongside the old file)
- Create: `apps/web/src/app/valoracion/facial-diagram/facial-diagram-views.component.ts`
- Modify: `apps/web/src/app/valoracion/valoracion-detail.component.ts`
- Modify: `apps/web/src/assets/i18n/es.json`
- Modify: `apps/web/src/assets/i18n/en.json`

**Interfaces:**
- Consumes: `ValoracionService.updateDiagrams` (Task 3), `DiagramView`/`ValoracionDiagram` shared
  types (Task 1), the two new placeholder assets (Task 3), `fabric-shapes.ts` (unchanged, from
  Phase 1).
- Produces: `FacialDiagramCanvasComponent` (`@Input() view`, `@Input() initialDiagramData`, public
  `getSerializedData()` and `loaded` signal) and `FacialDiagramViewsComponent`
  (`@Input() valoracionId`, `@Input() diagrams`) — this is the final task in the plan, no further
  consumers.

This task is a bite-sized-step breakdown of one coherent change: Phase 1's single component that
drew a canvas *and* saved it becomes two components — a trimmed-down canvas-only child, and a new
parent that holds three of them plus the (now singular, combined) save action. Read the *current*
`apps/web/src/app/valoracion/facial-diagram/facial-diagram.component.ts` before starting — Step 1
below is expressed as a diff against it, not a full rewrite from scratch, so you need to see
exactly what's there first.

- [ ] **Step 1: Create `FacialDiagramCanvasComponent` from the current `FacialDiagramComponent`**

Create `apps/web/src/app/valoracion/facial-diagram/facial-diagram-canvas.component.ts` by copying
the current `facial-diagram.component.ts` and applying these changes:

1. Rename the class `FacialDiagramComponent` → `FacialDiagramCanvasComponent`, and the `@Component`
   `selector` from `'app-facial-diagram'` → `'app-facial-diagram-canvas'`.
2. Remove the import of `ValoracionService` and the field
   `private readonly valoracionService = inject(ValoracionService);`.
3. Add the import `import type { DiagramView } from '@expedientes/shared-types';`.
4. Replace:
   ```ts
   @Input({ required: true }) valoracionId!: string;
   @Input() initialDiagramData: Record<string, unknown> | null = null;
   ```
   with:
   ```ts
   @Input({ required: true }) view!: DiagramView;
   @Input() initialDiagramData: Record<string, unknown> | null = null;
   ```
5. Replace the single `PLACEHOLDER_IMAGE_URL` constant:
   ```ts
   const PLACEHOLDER_IMAGE_URL = '/assets/facial-diagram-placeholder.svg';
   ```
   with a per-view map:
   ```ts
   const PLACEHOLDER_IMAGE_URLS: Record<DiagramView, string> = {
     FRONT: '/assets/facial-diagram-placeholder.svg',
     LEFT_PROFILE: '/assets/facial-diagram-placeholder-left.svg',
     RIGHT_PROFILE: '/assets/facial-diagram-placeholder-right.svg',
   };
   ```
   and in `ngAfterViewInit`, change:
   ```ts
   const background = await FabricImage.fromURL(PLACEHOLDER_IMAGE_URL);
   ```
   to:
   ```ts
   const background = await FabricImage.fromURL(PLACEHOLDER_IMAGE_URLS[this.view]);
   ```
6. Change the `loaded` signal from `protected` to public, since `FacialDiagramViewsComponent` needs
   to read it through a `viewChild()` reference:
   ```ts
   readonly loaded = signal(false);
   ```
   (was `protected readonly loaded = signal(false);`)
7. Remove the `saving` signal entirely (`protected readonly saving = signal(false);`) — saving is
   no longer this component's responsibility.
8. Remove the entire `save()` method.
9. In the template, remove the Save button:
   ```html
   <button
     mat-flat-button
     color="primary"
     type="button"
     [disabled]="saving() || !loaded()"
     (click)="save()"
   >
     {{ 'valoracion.diagram.save' | transloco }}
   </button>
   ```
   Keep the "Delete selected" and "Clear all" buttons in the `diagram-actions` div — those still
   apply to this view's canvas specifically and stay here.
10. Add a public method, placed after `save()` used to be (i.e. near the end of the class):
    ```ts
    /**
     * Serializes this view's current canvas state, or `null` if nothing has been drawn — the
     * parent uses `null` to mean "clear this view" when the user emptied out a previously-saved
     * diagram, and omits the view entirely (not `null`) when this canvas never finished loading, so
     * a slow/failed load can never overwrite good stored data for this view.
     */
    getSerializedData(): { version: number; objects: object[]; nextPinNumber: number } | null {
      const objects = this.canvas.getObjects().map((obj) => obj.toObject());
      if (objects.length === 0) return null;
      return { version: 1, objects, nextPinNumber: this.pinCounter };
    }
    ```

Everything else — the toolbar, `onCanvasMouseDown`, `deleteSelected`, `clearAll`, `onKeyDown`, the
`ALLOWED_OBJECT_TYPES` allowlist and its helpers, the `text:editing:exited` empty-note cleanup, the
`destroyed` guard, the pin-counter restore-on-load logic — stays exactly as it is today. It already
operates on exactly one view's canvas; nothing about it changes when that canvas is one of three
instead of the only one.

Delete the old file: `apps/web/src/app/valoracion/facial-diagram/facial-diagram.component.ts`.

- [ ] **Step 2: Create `FacialDiagramViewsComponent`**

Create `apps/web/src/app/valoracion/facial-diagram/facial-diagram-views.component.ts`:

```ts
import { Component, Input, OnInit, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { TranslocoModule } from '@jsverse/transloco';
import type {
  DiagramView,
  ValoracionDiagram,
  ValoracionDiagramsUpdateInput,
} from '@expedientes/shared-types';
import { AuthService } from '../../auth/auth.service';
import { ValoracionService } from '../valoracion.service';
import { FacialDiagramCanvasComponent } from './facial-diagram-canvas.component';

const VIEW_ORDER: DiagramView[] = ['FRONT', 'LEFT_PROFILE', 'RIGHT_PROFILE'];

const VIEW_LABEL_KEYS: Record<DiagramView, string> = {
  FRONT: 'valoracion.diagram.views.front',
  LEFT_PROFILE: 'valoracion.diagram.views.leftProfile',
  RIGHT_PROFILE: 'valoracion.diagram.views.rightProfile',
};

@Component({
  selector: 'app-facial-diagram-views',
  standalone: true,
  imports: [MatButtonModule, MatButtonToggleModule, TranslocoModule, FacialDiagramCanvasComponent],
  template: `
    <div class="diagram-views">
      <mat-button-toggle-group [value]="activeView()">
        @for (view of viewOrder; track view) {
          <mat-button-toggle [value]="view" (click)="activeView.set(view)">
            {{ viewLabelKey(view) | transloco }}
          </mat-button-toggle>
        }
      </mat-button-toggle-group>

      <div [hidden]="activeView() !== 'FRONT'">
        <app-facial-diagram-canvas
          #frontCanvas
          [view]="'FRONT'"
          [initialDiagramData]="dataFor('FRONT')"
        />
      </div>
      <div [hidden]="activeView() !== 'LEFT_PROFILE'">
        <app-facial-diagram-canvas
          #leftCanvas
          [view]="'LEFT_PROFILE'"
          [initialDiagramData]="dataFor('LEFT_PROFILE')"
        />
      </div>
      <div [hidden]="activeView() !== 'RIGHT_PROFILE'">
        <app-facial-diagram-canvas
          #rightCanvas
          [view]="'RIGHT_PROFILE'"
          [initialDiagramData]="dataFor('RIGHT_PROFILE')"
        />
      </div>

      @if (canEdit) {
        <div class="diagram-views-actions">
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="saving()"
            (click)="save()"
          >
            {{ 'valoracion.diagram.save' | transloco }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .diagram-views-actions {
        margin-top: 8px;
      }
    `,
  ],
})
export class FacialDiagramViewsComponent implements OnInit {
  @Input({ required: true }) valoracionId!: string;
  @Input() diagrams: ValoracionDiagram[] = [];

  private readonly valoracionService = inject(ValoracionService);
  private readonly auth = inject(AuthService);

  protected readonly viewOrder = VIEW_ORDER;
  protected readonly activeView = signal<DiagramView>('FRONT');
  protected readonly saving = signal(false);
  protected canEdit = false;

  private readonly frontCanvas = viewChild.required<FacialDiagramCanvasComponent>('frontCanvas');
  private readonly leftCanvas = viewChild.required<FacialDiagramCanvasComponent>('leftCanvas');
  private readonly rightCanvas = viewChild.required<FacialDiagramCanvasComponent>('rightCanvas');

  ngOnInit(): void {
    this.canEdit = this.auth.hasPermission('valoracion', 'edit');
  }

  protected dataFor(view: DiagramView): Record<string, unknown> | null {
    return this.diagrams.find((d) => d.view === view)?.data ?? null;
  }

  protected viewLabelKey(view: DiagramView): string {
    return VIEW_LABEL_KEYS[view];
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      const views: ValoracionDiagramsUpdateInput['views'] = {};
      // Only include a view's data if that view actually finished loading — a view whose canvas
      // is still loading (or failed to load) is omitted entirely rather than sent as `null`, so its
      // existing stored data is left untouched instead of being overwritten by an empty canvas.
      if (this.frontCanvas().loaded()) {
        views.front = this.frontCanvas().getSerializedData();
      }
      if (this.leftCanvas().loaded()) {
        views.leftProfile = this.leftCanvas().getSerializedData();
      }
      if (this.rightCanvas().loaded()) {
        views.rightProfile = this.rightCanvas().getSerializedData();
      }
      await this.valoracionService.updateDiagrams(this.valoracionId, { views });
    } finally {
      this.saving.set(false);
    }
  }
}
```

Note the `[hidden]` wrapper divs, not `@if`/`*ngIf`: all three `FacialDiagramCanvasComponent`
instances are created and initialized immediately, and stay mounted for the component's whole
lifetime — only their visibility toggles. This is what makes switching views instant with no
reload and no data-loss risk (nothing is ever destroyed and recreated on switch). A Fabric canvas
initializes and renders into its buffer correctly regardless of whether its DOM element is
currently `display: none` — the canvas's pixel dimensions come from the explicit `width`/`height`
attributes set in `FacialDiagramCanvasComponent`'s template, not from CSS layout.

- [ ] **Step 3: Wire into `ValoracionDetailComponent`**

In `apps/web/src/app/valoracion/valoracion-detail.component.ts`:

Replace the import:
```ts
import { FacialDiagramComponent } from './facial-diagram/facial-diagram.component';
```
with:
```ts
import { FacialDiagramViewsComponent } from './facial-diagram/facial-diagram-views.component';
```

Replace `FacialDiagramComponent` with `FacialDiagramViewsComponent` in the `@Component`
`imports` array.

Add the import `import type { ValoracionDiagram } from '@expedientes/shared-types';`.

Replace the field:
```ts
protected diagramData: Record<string, unknown> | null = null;
```
with:
```ts
protected diagrams: ValoracionDiagram[] = [];
```

In `ngOnInit`, replace:
```ts
this.diagramData = valoracion.diagramData;
```
with:
```ts
this.diagrams = valoracion.diagrams;
```

In the template, replace:
```html
<app-facial-diagram [valoracionId]="valoracionId" [initialDiagramData]="diagramData" />
```
with:
```html
<app-facial-diagram-views [valoracionId]="valoracionId" [diagrams]="diagrams" />
```

- [ ] **Step 4: Add the view-switcher i18n strings**

In `apps/web/src/assets/i18n/es.json`, inside the existing `"valoracion.diagram"` object, add a
`"views"` key as a sibling of `"tools"`:

```json
      "views": {
        "front": "Frente",
        "leftProfile": "Perfil izquierdo",
        "rightProfile": "Perfil derecho"
      }
```

In `apps/web/src/assets/i18n/en.json`, the equivalent:

```json
      "views": {
        "front": "Front",
        "leftProfile": "Left profile",
        "rightProfile": "Right profile"
      }
```

- [ ] **Step 5: Build, test, and manually verify**

Run: `npx nx build web` — must succeed. Run: `npx nx test web` — the existing
`fabric-shapes.spec.ts` (3 tests) must still pass unaffected.

Serve (`npx nx serve web` + `npx nx dev api`) and manually verify, in both Spanish and English:
- The view-switcher shows three options; the front view is active by default.
- Draw something (a stroke, a marker) on the front view, switch to left profile, draw something
  different there, switch to right profile — confirm each view keeps its own placeholder
  background and its own annotations, and switching back to front still shows what was drawn there
  (nothing is lost or mixed between views).
- Click "Guardar diagrama" — confirm (via the network tab) one `PATCH .../diagram` request fires
  with a `views` body containing `front` and `leftProfile` (both drawn on) but note whether
  `rightProfile` is included — it should be, since all three canvases load synchronously fast in
  practice and finish loading well before a user could plausibly click Save.
- Reload the page — all three views' annotations reappear exactly as drawn, each on its own correct
  placeholder.
- Draw on left profile, save, then use "Clear all" on left profile and save again — confirm (via
  the network tab or by reloading) that the left-profile view is now genuinely gone (the earlier
  saved data doesn't reappear), while front and right profile are unaffected.
- A user with only `valoracion:view` sees the view-switcher and all three views' saved content, but
  no toolbar and no "Guardar diagrama" button on any view.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/valoracion/facial-diagram apps/web/src/app/valoracion/valoracion-detail.component.ts apps/web/src/assets/i18n
git commit -m "Split facial diagram into per-view canvas + views container, wire into detail page"
```
