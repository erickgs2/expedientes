# Valoración — Photo Capture, Phase 2 (Progressive Timeline) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff browse a patient's photos chronologically across every visit, grouped by visit
date, oldest first, read-only. Final phase of the photo capture sub-project.

**Architecture:** No schema change — `Photo.patientId` was already denormalized in Phase 1 for
exactly this query. One new backend endpoint returns a flat list of a patient's photos; a new
`PhotoTimelineComponent` groups them by visit client-side, cross-referencing the existing
`ValoracionService.list()` (which already carries each visit's `fecha`) rather than having the
backend join `Photo` to `Valoracion`.

**Tech Stack:** Same as Phase 1 — Next.js route handlers, Prisma, Angular standalone components +
Material, Transloco. No new library work.

## Global Constraints

- All code, identifiers, comments, and commit messages are in English; every user-facing string
  goes through Transloco.
- Every task touching `apps/api` must be verified with **both** `npx nx build api` (dev-mode) and
  `npx nx run api:build` (production). Every task touching `apps/web` must be verified with
  `npx nx build web` (production).
- No new backend work beyond the one read endpoint — no new permission, no new Prisma model, no
  seed changes. Reuses `valoracion:view` exactly as Phase 1 already does for photo reads.
- No new unit tests: no new pure-logic module is introduced (the grouping is straightforward array
  filtering/sorting directly in the component, matching this project's practice of only extracting
  and testing functions that are genuinely security- or correctness-critical in isolation, per this
  sub-project's own Phase 1 final review) — verified by building and manual testing.
- Commit after every task using the working tree state left by that task's steps.

---

## Task 1: Backend — patient-scoped photo timeline endpoint

**Files:**
- Modify: `apps/api/src/lib/photo/photo.ts`
- Create: `apps/api/src/app/api/patients/[patientId]/photos/route.ts`

**Interfaces:**
- Produces: `GET /api/patients/[patientId]/photos` — consumed by Task 2's frontend service.

- [ ] **Step 1: Add the service function**

In `apps/api/src/lib/photo/photo.ts`, add this function alongside the existing ones (after
`listPhotos`, don't touch `getValoracionPatientId`/`createPhoto`/`deletePhoto`):

```ts
export async function listPatientPhotos(patientId: string) {
  return prisma.photo.findMany({
    where: { patientId },
    orderBy: { createdAt: 'asc' },
  });
}
```

- [ ] **Step 2: Add the route**

Create `apps/api/src/app/api/patients/[patientId]/photos/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { listPatientPhotos } from '../../../../../lib/photo/photo';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'valoracion', 'view');
    const { patientId } = await params;

    const photos = await listPatientPhotos(patientId);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'PatientPhotoTimeline',
      entityId: patientId,
      patientId,
    });

    return NextResponse.json({ photos });
  }
);
```

This mirrors `apps/api/src/app/api/patients/[patientId]/valoracion/route.ts`'s `GET` handler
exactly (same conventions: `withApiErrors`, `requireAuth`, audit log, `Promise<{...}>` params) —
no existence pre-check on `patientId` is needed since `listPatientPhotos` simply returns an empty
array for a patient with no photos, which is valid, not an error.

- [ ] **Step 3: Build and verify**

Run: `npx nx build api` then `npx nx run api:build` — both must succeed.

Start the API (`npx nx dev api`) and verify with curl (replace `<patientId>` with a real patient
id, `<cookie>` with a logged-in session cookie). If that patient already has photos from Phase 1
testing (across one or more Valoraciones), this alone proves cross-visit aggregation:

```bash
curl http://localhost:3000/api/patients/<patientId>/photos -H "Cookie: <cookie>"
```

Expected: `200` with a `photos` array containing every photo belonging to that patient, regardless
of which Valoración each one was uploaded to. If the patient has photos on more than one
Valoración, confirm the response includes photos from all of them, not just one — this is the
behavior this endpoint exists to provide. If no test data exists yet, upload a photo to two
different Valoraciones for the same patient first (via the existing
`POST /api/valoracion/[id]/photos` from Phase 1), then repeat this GET and confirm both appear.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/photo/photo.ts apps/api/src/app/api/patients/[patientId]/photos
git commit -m "Add patient-scoped photo timeline endpoint"
```

---

## Task 2: Frontend — PhotoTimelineComponent, route, nav links, i18n, full verification

**Files:**
- Modify: `apps/web/src/app/valoracion/valoracion.service.ts`
- Create: `apps/web/src/app/valoracion/photo/photo-timeline.component.ts`
- Modify: `apps/web/src/app/app.routes.ts`
- Modify: `apps/web/src/app/historia-clinica/historia-clinica-form.component.ts`
- Modify: `apps/web/src/app/valoracion/valoracion-list.component.ts`
- Modify: `apps/web/src/assets/i18n/es.json`
- Modify: `apps/web/src/assets/i18n/en.json`

**Interfaces:**
- Consumes: `GET /api/patients/[patientId]/photos` (Task 1), `ValoracionService.list()` (existing,
  unchanged, from Phase 1's predecessor work).
- Produces: the complete Phase 2 feature and the complete photo capture sub-project — no further
  consumers within this plan or this sub-project.

- [ ] **Step 1: Add the service method**

In `apps/web/src/app/valoracion/valoracion.service.ts`, add this method to the `ValoracionService`
class, after `listPhotos` (don't touch the other methods):

```ts
  listPatientPhotos(patientId: string): Promise<Photo[]> {
    return firstValueFrom(
      this.http.get<{ photos: Photo[] }>(`/api/patients/${patientId}/photos`)
    ).then((r) => r.photos);
  }
```

- [ ] **Step 2: Create the timeline component**

Create `apps/web/src/app/valoracion/photo/photo-timeline.component.ts`:

```ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import type { Photo, PhotoTag } from '@expedientes/shared-types';
import { ActivePatientStore } from '../../patient-drive/active-patient.store';
import { ValoracionService } from '../valoracion.service';

interface PhotoTimelineGroup {
  valoracionId: string;
  fecha: string;
  photos: Photo[];
}

@Component({
  selector: 'app-photo-timeline',
  standalone: true,
  imports: [TranslocoModule],
  template: `
    <h1>{{ 'photoTimeline.title' | transloco }} — {{ patient()?.fullName }}</h1>
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else {
      @for (group of groups(); track group.valoracionId) {
        <section class="timeline-group">
          <h2>{{ group.fecha.substring(0, 10) }}</h2>
          <div class="photo-grid">
            @for (photo of group.photos; track photo.id) {
              <div class="photo-item">
                <img [src]="photoUrl(photo)" alt="" />
                <span class="photo-tag">{{ tagLabelKey(photo.tag) | transloco }}</span>
              </div>
            }
          </div>
        </section>
      } @empty {
        <p>{{ 'photoTimeline.empty' | transloco }}</p>
      }
    }
  `,
  styles: [
    `
      .timeline-group {
        margin-bottom: 24px;
      }
      .photo-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 8px;
        margin-top: 8px;
      }
      .photo-item {
        position: relative;
      }
      .photo-item img {
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        border-radius: 4px;
        display: block;
      }
      .photo-tag {
        position: absolute;
        bottom: 4px;
        left: 4px;
        background: rgba(0, 0, 0, 0.6);
        color: #fff;
        font-size: 12px;
        padding: 2px 6px;
        border-radius: 4px;
      }
    `,
  ],
})
export class PhotoTimelineComponent implements OnInit {
  private readonly valoracionService = inject(ValoracionService);
  private readonly activePatient = inject(ActivePatientStore);

  protected readonly patient = this.activePatient.patient;
  protected readonly loading = signal(true);
  protected readonly groups = signal<PhotoTimelineGroup[]>([]);

  async ngOnInit(): Promise<void> {
    const patient = this.patient();
    if (!patient) {
      this.loading.set(false);
      return;
    }
    try {
      const [visits, photos] = await Promise.all([
        this.valoracionService.list(patient.id),
        this.valoracionService.listPatientPhotos(patient.id),
      ]);
      const groups = visits
        .map((visit) => ({
          valoracionId: visit.id,
          fecha: visit.fecha,
          photos: photos.filter((photo) => photo.valoracionId === visit.id),
        }))
        .filter((group) => group.photos.length > 0)
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
      this.groups.set(groups);
    } finally {
      this.loading.set(false);
    }
  }

  protected photoUrl(photo: Photo): string {
    return `/api/files/${photo.filePath}`;
  }

  protected tagLabelKey(tag: PhotoTag): string {
    return tag === 'BEFORE' ? 'valoracion.photos.before' : 'valoracion.photos.after';
  }
}
```

Note this reuses the exact `photo-grid`/`photo-item`/`photo-tag` visual pattern already established
by Phase 1's `PhotoGalleryComponent`, and reuses the `valoracion.photos.before`/`.after` i18n keys
for tag labels rather than duplicating them — only the page-level chrome (`photoTimeline.*`) is new.

- [ ] **Step 3: Add the route**

In `apps/web/src/app/app.routes.ts`, add this route to the `appRoutes` array (after the
`valoracion/:id` route, or anywhere among the other patient-scoped routes):

```ts
  {
    path: 'photos',
    canActivate: [authGuard, permissionGuard('valoracion', 'view'), activePatientGuard],
    loadComponent: () =>
      import('./valoracion/photo/photo-timeline.component').then(
        (m) => m.PhotoTimelineComponent
      ),
  },
```

- [ ] **Step 4: Add the nav link to Historia Clínica**

In `apps/web/src/app/historia-clinica/historia-clinica-form.component.ts`, the template currently
has, right after the `<h1>`:

```html
      <a *appHasPermission="'valoracion:view'" mat-button routerLink="/valoracion">{{
        'historiaClinica.viewValoraciones' | transloco
      }}</a>
```

Add a second link right after it, still before the `<form ...>`:

```html
      <a *appHasPermission="'valoracion:view'" mat-button routerLink="/photos">{{
        'photoTimeline.navLink' | transloco
      }}</a>
```

`RouterLink` is already imported in this file — no import changes needed here.

- [ ] **Step 5: Add the nav link to the Valoración list**

In `apps/web/src/app/valoracion/valoracion-list.component.ts`:

Add `RouterLink` to the Angular Router import (this file doesn't import it yet):

```ts
import { Router, RouterLink } from '@angular/router';
```

Add `RouterLink` to the `imports` array in the `@Component` decorator.

In the template, after the existing "new" button and before `<mat-list>`, add:

```html
    <a *appHasPermission="'valoracion:view'" mat-button routerLink="/photos">{{
      'photoTimeline.navLink' | transloco
    }}</a>
```

- [ ] **Step 6: Add the i18n strings**

In `apps/web/src/assets/i18n/es.json`, add a new top-level `"photoTimeline"` key (a sibling of
`"valoracion"`/`"historiaClinica"`, not nested inside either):

```json
  "photoTimeline": {
    "title": "Cronología de fotos",
    "navLink": "Cronología de fotos",
    "empty": "No hay fotos registradas"
  },
```

In `apps/web/src/assets/i18n/en.json`, the equivalent:

```json
  "photoTimeline": {
    "title": "Photo timeline",
    "navLink": "Photo timeline",
    "empty": "No photos recorded"
  },
```

- [ ] **Step 7: Build, test, and manually verify (full checklist)**

Run: `npx nx build web` — must succeed. Run: `npx nx test web` — existing suite must still pass,
unaffected by this task.

Serve (`npx nx serve web` + `npx nx dev api`) and manually verify, in both Spanish and English:
- From the Historia Clínica page, click "Photo timeline" — navigates to `/photos`, showing the
  active patient's name in the header.
- From the Valoración list page, the same link is present and works.
- For a patient with photos across multiple Valoraciones (from Phase 1 testing, or create fresh
  test data): each visit with at least one photo appears as its own dated section, oldest visit
  first; visits with no photos don't appear at all.
- Each photo shows correctly with its Before/After tag; there is no capture button, no delete
  button anywhere on this page.
- For a patient with no photos at all, the empty-state message appears instead of a blank page.
- Log in as a user with only `valoracion:view` (no `edit`) — the timeline page works identically
  (it was already read-only for everyone), and the nav links to it are still visible from both
  Historia Clínica and Valoración (gated on `view`, not `edit`).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/valoracion/valoracion.service.ts apps/web/src/app/valoracion/photo/photo-timeline.component.ts apps/web/src/app/app.routes.ts apps/web/src/app/historia-clinica/historia-clinica-form.component.ts apps/web/src/app/valoracion/valoracion-list.component.ts apps/web/src/assets/i18n
git commit -m "Add photo timeline page, nav links, complete photo capture Phase 2"
```
