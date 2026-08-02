# Valoración — Facial Diagram Tool, Phase 3 (Cross-Visit Reference Overlay) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff overlay one past visit's annotations as a translucent, non-interactive reference
layer on any of the three diagram views, for comparison while drawing. Last phase of the facial
diagram tool sub-project.

**Architecture:** Purely frontend — no new backend endpoints. `FacialDiagramCanvasComponent` gains a
`referenceData` input it renders as a non-interactive overlay (reusing Phase 1's security
allowlist), excluded from save/clear. `FacialDiagramViewsComponent` gains a toggle + past-visit
picker, fetches the picked visit's diagrams (via the existing `GET /api/valoracion/[id]`), and feeds
each canvas its own view's slice.

**Tech Stack:** Same as Phases 1-2 — Angular standalone components + Material, Transloco, Fabric.js
v6.9.1 (no new library work).

## Global Constraints

- All code, identifiers, comments, and commit messages are in English; every user-facing string
  goes through Transloco.
- Every task touching `apps/web` must be verified with `npx nx build web` (production).
- No new backend work, no new permission, no new endpoint — this phase reuses
  `ValoracionService.list()` and `.get()` exactly as they already exist.
- No new unit tests: no new pure-logic module is introduced (the security allowlist being reused in
  Task 1 is already covered by Phase 1's existing hardening) — verified by building and manual
  testing, matching Phases 1-2's convention.
- Commit after every task using the working tree state left by that task's steps.
- **Fabric.js API note**, same caveat as prior phases: this plan is written against Fabric.js
  v6.9.1's documented API. The one new call this phase introduces —
  `canvas.sendObjectToBack(object)` — should be verified against
  `node_modules/fabric/dist/src/**/*.d.ts` if it doesn't match; the object model and other method
  names this phase reuses (`getObjects`, `add`, `remove`, `util.enlivenObjects`) have been reliable
  across Phases 1-2 and are the part to trust first.

---

## Task 1: FacialDiagramCanvasComponent — reference overlay rendering

**Files:**
- Modify: `apps/web/src/app/valoracion/facial-diagram/facial-diagram-canvas.component.ts`

**Interfaces:**
- Produces: `@Input() referenceData: Record<string, unknown> | null` and its rendering — consumed
  by Task 2's `FacialDiagramViewsComponent`, which will start passing this input once Task 2 lands.
  Until then, this input simply defaults to `null` and nothing changes about the component's
  current behavior — this task alone leaves the app fully working with the new capability unused.

This task's new capability doesn't disturb anything: adding an `@Input()` that defaults to `null`
and is only acted on when set doesn't change any existing behavior, and no other file references
this component's inputs yet (Task 2 does that). Read the current file first — the steps below are
expressed as edits against it, not a full rewrite.

- [ ] **Step 1: Add imports and the `referenceData` input**

In `apps/web/src/app/valoracion/facial-diagram/facial-diagram-canvas.component.ts`, change the
import line:
```ts
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
```
to also bring in `OnChanges` and `SimpleChanges`:
```ts
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
```

Add the new input right after the existing `initialDiagramData` input:
```ts
  @Input({ required: true }) view!: DiagramView;
  @Input() initialDiagramData: Record<string, unknown> | null = null;
  @Input() referenceData: Record<string, unknown> | null = null;
```

Add `OnChanges` to the class's `implements` clause:
```ts
export class FacialDiagramCanvasComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
```

- [ ] **Step 2: Track reference objects separately from the user's own annotations**

The current file has this field block:
```ts
  private pinCounter = 1;
  /**
   * Set at the very top of `ngOnDestroy`. The load sequence awaits network/decode work, so the
   * component can be destroyed (and the canvas disposed) while those promises are still pending;
   * every continuation re-checks this before touching `this.canvas`.
   */
  private destroyed = false;
```
Add the new field directly after `private pinCounter = 1;` and before the `destroyed` field's
comment block:
```ts
  private pinCounter = 1;
  /** Overlay objects from a referenced past visit — never saved, never cleared by "Clear all". */
  private referenceObjects: FabricObject[] = [];
  /**
   * Set at the very top of `ngOnDestroy`. The load sequence awaits network/decode work, so the
   * component can be destroyed (and the canvas disposed) while those promises are still pending;
   * every continuation re-checks this before touching `this.canvas`.
   */
  private destroyed = false;
```

- [ ] **Step 3: Add `ngOnChanges` and the overlay-rendering method**

Add `ngOnChanges` right after `ngOnInit`:
```ts
  ngOnChanges(changes: SimpleChanges): void {
    // Only react once the canvas actually exists — `ngOnChanges` can fire before
    // `ngAfterViewInit` finishes constructing it (e.g. on the very first input binding).
    // `ngAfterViewInit`'s own tail end applies whatever `referenceData` is already set by the time
    // it finishes loading, so an early change here is not lost, just deferred.
    if (!changes['referenceData'] || !this.canvas) return;
    void this.applyReferenceOverlay();
  }
```

Add the overlay method near the end of the class, after `getSerializedData()`:
```ts
  /**
   * Replaces whatever reference overlay is currently shown with the one for `this.referenceData` —
   * removing the old overlay's objects first, then (if new data is present) reviving the new one's
   * objects through the same security allowlist used for the primary diagram (this is stored data
   * from another record, still untrusted input), marking them non-interactive and translucent, and
   * sending them behind everything already on the canvas so the current visit's own annotations —
   * including ones added after this call — always stay visibly on top.
   */
  private async applyReferenceOverlay(): Promise<void> {
    this.referenceObjects.forEach((obj) => this.canvas.remove(obj));
    this.referenceObjects = [];

    if (!this.referenceData || !Array.isArray(this.referenceData['objects'])) {
      this.canvas.requestRenderAll();
      return;
    }

    const stored = this.referenceData['objects'] as Record<string, unknown>[];
    const safe = stored.filter((obj) => findDisallowedDiagramType(obj) === null);
    const objects = await util.enlivenObjects(safe);
    if (this.destroyed) return;

    objects.forEach((obj) => {
      const fabricObj = obj as FabricObject;
      fabricObj.set({ selectable: false, evented: false, opacity: 0.35 });
      this.canvas.add(fabricObj);
      this.canvas.sendObjectToBack(fabricObj);
      this.referenceObjects.push(fabricObj);
    });
    this.canvas.requestRenderAll();
  }
```

- [ ] **Step 4: Apply an already-pending `referenceData` once the initial load finishes**

In `ngAfterViewInit`'s `try` block, right after the existing line
`this.loaded.set(true);` (still inside `try`, before the `catch`), add:
```ts
      if (this.referenceData) {
        await this.applyReferenceOverlay();
      }
```
So that block now reads:
```ts
      this.canvas.requestRenderAll();
      // Only on the success path: leaving this false keeps Save disabled, so a broken load can
      // never overwrite the stored diagram with an empty/partial object set.
      this.loaded.set(true);

      if (this.referenceData) {
        await this.applyReferenceOverlay();
      }
    } catch (error) {
```

- [ ] **Step 5: Exclude reference objects from `getSerializedData()` and `clearAll()`**

Replace `getSerializedData()`:
```ts
  getSerializedData(): { version: number; objects: object[]; nextPinNumber: number } | null {
    const objects = this.canvas.getObjects().map((obj) => obj.toObject());
    if (objects.length === 0) return null;
    return { version: 1, objects, nextPinNumber: this.pinCounter };
  }
```
with:
```ts
  getSerializedData(): { version: number; objects: object[]; nextPinNumber: number } | null {
    const objects = this.canvas
      .getObjects()
      .filter((obj) => !this.referenceObjects.includes(obj))
      .map((obj) => obj.toObject());
    if (objects.length === 0) return null;
    return { version: 1, objects, nextPinNumber: this.pinCounter };
  }
```

Replace `clearAll()`:
```ts
  protected clearAll(): void {
    // Resolved fresh on each use so a live language switch is reflected; `translate` is synchronous
    // once the active bundle is loaded, which it is by the time this button can be clicked.
    if (!confirm(this.transloco.translate('valoracion.diagram.confirmClearAll'))) return;
    [...this.canvas.getObjects()].forEach((obj) => this.canvas.remove(obj));
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }
```
with:
```ts
  protected clearAll(): void {
    // Resolved fresh on each use so a live language switch is reflected; `translate` is synchronous
    // once the active bundle is loaded, which it is by the time this button can be clicked.
    if (!confirm(this.transloco.translate('valoracion.diagram.confirmClearAll'))) return;
    this.canvas
      .getObjects()
      .filter((obj) => !this.referenceObjects.includes(obj))
      .forEach((obj) => this.canvas.remove(obj));
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }
```
(`.filter()` already returns a fresh array independent of the one Fabric mutates internally as
`remove()` is called, so the old spread-copy `[...this.canvas.getObjects()]` is no longer needed —
`.filter()` serves the same "snapshot before mutating" purpose.)

`deleteSelected()` and `onKeyDown()` need no changes: reference objects are `evented: false`, so
they can never become the active object and are already unreachable through either path.

- [ ] **Step 6: Build and verify**

Run: `npx nx build web` — must succeed.

Since `referenceData` is never actually passed by anything yet (Task 2 wires that up), there is no
new manual behavior to verify in the running app for this task specifically — the build succeeding
with the new input, method, and `OnChanges` implementation compiling cleanly is the correctness
check for this task in isolation.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/valoracion/facial-diagram/facial-diagram-canvas.component.ts
git commit -m "Add reference-overlay rendering to FacialDiagramCanvasComponent"
```

---

## Task 2: FacialDiagramViewsComponent — reference toggle and past-visit picker

**Files:**
- Modify: `apps/web/src/app/valoracion/facial-diagram/facial-diagram-views.component.ts`

**Interfaces:**
- Consumes: `FacialDiagramCanvasComponent.referenceData` (Task 1), `ValoracionService.list()` and
  `.get()` (both already exist, unchanged).
- Produces: `FacialDiagramViewsComponent`'s new `@Input({ required: true }) patientId!: string;` —
  consumed by Task 3's wiring in `ValoracionDetailComponent`. Until Task 3 supplies it, this
  required input has no caller yet — see the note in Task 3 about why this task alone still leaves
  the app buildable (the *type* requires it, but nothing fails to compile from an unfulfilled
  `@Input({required:true})` until something actually instantiates the component without it, which
  no file does until Task 3).

- [ ] **Step 1: Replace the file**

Replace the full contents of
`apps/web/src/app/valoracion/facial-diagram/facial-diagram-views.component.ts` with:

```ts
import { Component, Input, OnInit, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoModule } from '@jsverse/transloco';
import type {
  DiagramView,
  ValoracionDiagram,
  ValoracionDiagramsUpdateInput,
  ValoracionSummary,
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
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatSelectModule,
    TranslocoModule,
    FacialDiagramCanvasComponent,
  ],
  template: `
    <div class="diagram-views">
      <mat-button-toggle-group [value]="activeView()">
        @for (view of viewOrder; track view) {
          <mat-button-toggle [value]="view" (click)="activeView.set(view)">
            {{ viewLabelKey(view) | transloco }}
          </mat-button-toggle>
        }
      </mat-button-toggle-group>

      @if (pastVisits().length > 0) {
        <div class="diagram-reference">
          <mat-checkbox [checked]="referenceEnabled()" (change)="toggleReference($event.checked)">
            {{ 'valoracion.diagram.reference.toggle' | transloco }}
          </mat-checkbox>
          @if (referenceEnabled()) {
            <mat-form-field appearance="outline" class="diagram-reference-select">
              <mat-label>{{ 'valoracion.diagram.reference.pick' | transloco }}</mat-label>
              <mat-select
                [value]="selectedReferenceId()"
                (selectionChange)="selectReference($event.value)"
              >
                @for (visit of pastVisits(); track visit.id) {
                  <mat-option [value]="visit.id">{{ visit.fecha.substring(0, 10) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
        </div>
      }

      <div [hidden]="activeView() !== 'FRONT'">
        <app-facial-diagram-canvas
          #frontCanvas
          [view]="'FRONT'"
          [initialDiagramData]="dataFor('FRONT')"
          [referenceData]="referenceDataFor('FRONT')"
        />
      </div>
      <div [hidden]="activeView() !== 'LEFT_PROFILE'">
        <app-facial-diagram-canvas
          #leftCanvas
          [view]="'LEFT_PROFILE'"
          [initialDiagramData]="dataFor('LEFT_PROFILE')"
          [referenceData]="referenceDataFor('LEFT_PROFILE')"
        />
      </div>
      <div [hidden]="activeView() !== 'RIGHT_PROFILE'">
        <app-facial-diagram-canvas
          #rightCanvas
          [view]="'RIGHT_PROFILE'"
          [initialDiagramData]="dataFor('RIGHT_PROFILE')"
          [referenceData]="referenceDataFor('RIGHT_PROFILE')"
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
      .diagram-reference {
        margin-top: 8px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .diagram-reference-select {
        width: 200px;
      }
    `,
  ],
})
export class FacialDiagramViewsComponent implements OnInit {
  @Input({ required: true }) valoracionId!: string;
  @Input({ required: true }) patientId!: string;
  @Input() diagrams: ValoracionDiagram[] = [];

  private readonly valoracionService = inject(ValoracionService);
  private readonly auth = inject(AuthService);

  protected readonly viewOrder = VIEW_ORDER;
  protected readonly activeView = signal<DiagramView>('FRONT');
  protected readonly saving = signal(false);
  protected canEdit = false;

  protected readonly pastVisits = signal<ValoracionSummary[]>([]);
  protected readonly referenceEnabled = signal(false);
  protected readonly selectedReferenceId = signal<string | null>(null);
  protected readonly referenceDiagrams = signal<ValoracionDiagram[]>([]);

  private readonly frontCanvas = viewChild.required<FacialDiagramCanvasComponent>('frontCanvas');
  private readonly leftCanvas = viewChild.required<FacialDiagramCanvasComponent>('leftCanvas');
  private readonly rightCanvas = viewChild.required<FacialDiagramCanvasComponent>('rightCanvas');

  async ngOnInit(): Promise<void> {
    this.canEdit = this.auth.hasPermission('valoracion', 'edit');
    const visits = await this.valoracionService.list(this.patientId);
    this.pastVisits.set(visits.filter((v) => v.id !== this.valoracionId));
  }

  protected dataFor(view: DiagramView): Record<string, unknown> | null {
    return this.diagrams.find((d) => d.view === view)?.data ?? null;
  }

  protected referenceDataFor(view: DiagramView): Record<string, unknown> | null {
    return this.referenceDiagrams().find((d) => d.view === view)?.data ?? null;
  }

  protected viewLabelKey(view: DiagramView): string {
    return VIEW_LABEL_KEYS[view];
  }

  protected toggleReference(checked: boolean): void {
    this.referenceEnabled.set(checked);
    if (!checked) {
      this.selectedReferenceId.set(null);
      this.referenceDiagrams.set([]);
    }
  }

  protected async selectReference(id: string | null): Promise<void> {
    this.selectedReferenceId.set(id);
    if (!id) {
      this.referenceDiagrams.set([]);
      return;
    }
    const visit = await this.valoracionService.get(id);
    this.referenceDiagrams.set(visit.diagrams);
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

- [ ] **Step 2: Build and verify**

Run: `npx nx build web` — this task alone will NOT succeed in isolation, because
`ValoracionDetailComponent` (unchanged until Task 3) instantiates
`<app-facial-diagram-views [valoracionId]="valoracionId" [diagrams]="diagrams" />` without the new
required `patientId` input, which Angular's template type-checking treats as a compile error.
**This is expected** — Task 2 and Task 3 are tightly coupled by this one required input, so treat
`npx nx build web` failing here (with an error naming the missing `patientId` binding, and nothing
else) as confirmation you've done Step 1 correctly, not as a problem to fix in this task. Do not
add a default/optional fallback to work around it — Task 3 supplies the real wiring immediately
next.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/valoracion/facial-diagram/facial-diagram-views.component.ts
git commit -m "Add reference toggle and past-visit picker to FacialDiagramViewsComponent"
```

---

## Task 3: Wire patientId, add i18n, full verification

**Files:**
- Modify: `apps/web/src/app/valoracion/valoracion-detail.component.ts`
- Modify: `apps/web/src/assets/i18n/es.json`
- Modify: `apps/web/src/assets/i18n/en.json`

**Interfaces:**
- Consumes: `FacialDiagramViewsComponent.patientId` (Task 2).
- Produces: the complete Phase 3 feature and the complete facial diagram tool sub-project — no
  further consumers within this plan or this sub-project.

- [ ] **Step 1: Pass `patientId` from `ValoracionDetailComponent`**

In `apps/web/src/app/valoracion/valoracion-detail.component.ts`'s template, replace:
```html
      <app-facial-diagram-views [valoracionId]="valoracionId" [diagrams]="diagrams" />
```
with:
```html
      <app-facial-diagram-views
        [valoracionId]="valoracionId"
        [patientId]="patient()!.id"
        [diagrams]="diagrams"
      />
```

`patient()!.id` (non-null assertion, not `patient()?.id`) is correct here: this line only renders
inside the `@else` branch, reached only after `ngOnInit` has both finished loading and confirmed
`valoracion.patientId === this.patient()?.id` (the patient-mismatch guard) — which is only possible
if `patient()` is already non-null, so asserting it here matches what the surrounding code already
guarantees rather than silently tolerating a case that can't occur.

- [ ] **Step 2: Add the reference-overlay i18n strings**

In `apps/web/src/assets/i18n/es.json`, inside the existing `"valoracion.diagram"` object, add a
`"reference"` key as a sibling of `"views"`:
```json
      "reference": {
        "toggle": "Mostrar visita anterior de referencia",
        "pick": "Seleccionar visita"
      }
```

In `apps/web/src/assets/i18n/en.json`, the equivalent:
```json
      "reference": {
        "toggle": "Show reference from a past visit",
        "pick": "Select visit"
      }
```

- [ ] **Step 3: Build and manually verify (full checklist)**

Run: `npx nx build web` — must succeed (this is the build that Task 2 deliberately left broken;
confirming it's green now closes that loop). Run: `npx nx test web` — the existing
`fabric-shapes.spec.ts` (3 tests) must still pass.

Serve (`npx nx serve web` + `npx nx dev api`) and manually verify:
- On a patient with only one Valoración, the reference toggle does not appear at all.
- On a patient with two or more Valoraciones, open the most recent one — the toggle appears; the
  picker (hidden until the toggle is checked) lists every *other* Valoración for that patient by
  date, not including the one currently open.
- Draw something on an older Valoración's front view and save it. Open a newer Valoración for the
  same patient, enable the reference toggle, and pick that older visit — its front-view annotations
  appear as a faded, translucent layer on the front canvas. They cannot be clicked, dragged, or
  selected.
- Draw a new stroke or marker on the current (newer) visit's front view — confirm it renders
  visibly on top of the faded reference layer, not hidden behind it.
- Switch to the left-profile view — if the older visit has left-profile data, its reference appears
  there too, immediately, with no extra loading step; if it has none, the left canvas simply shows
  no reference layer.
- Click "Guardar diagrama" and check the network tab — the referenced visit's overlay content is
  NOT present in the PATCH payload (only the current visit's own annotations are sent).
- Use "Clear all" on the current visit's front view — confirm only the current visit's own
  annotations are removed; the reference overlay (if any) remains visible.
- Uncheck the reference toggle — the overlay disappears from all three views immediately.
- Reload the page — the reference toggle is unchecked again (not persisted), matching the design.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/valoracion/valoracion-detail.component.ts apps/web/src/assets/i18n
git commit -m "Wire patientId into facial diagram views, complete Phase 3 reference overlay"
```
