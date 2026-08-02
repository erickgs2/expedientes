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
    // The `patientId` check is defense in depth, not deduplication: `list()` is already
    // patient-scoped server-side, so this filter is a no-op today. It exists so the ids that end up
    // in the picker — and therefore the ids handed to the *unscoped* `GET /api/valoracion/:id` in
    // `selectReference` — can never come from another patient, even if a future change repoints
    // this list at an unscoped source. A wrong-patient leak already shipped once in this project.
    this.pastVisits.set(
      visits.filter((v) => v.id !== this.valoracionId && v.patientId === this.patientId)
    );
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
    // Cleared *before* the await, not just on the `!id` path: while the fetch is in flight the
    // picker already shows the newly-selected visit, so leaving the previous visit's overlay up
    // would render one visit's annotations under another visit's label. The same clear is what a
    // failed fetch (network error, deleted record) falls back to — the overlay then simply has
    // nothing to show, as if no visit were selected, instead of stale data from the wrong visit.
    this.referenceDiagrams.set([]);
    if (!id) return;
    const visit = await this.valoracionService.get(id);
    // Discard a stale response: if the user picked something else while this request was in
    // flight, `selectedReferenceId()` will no longer match `id`, and applying this response now
    // would silently show the wrong past visit's data as if it were the current selection.
    if (this.selectedReferenceId() !== id) return;
    // `GET /api/valoracion/:id` is not patient-scoped server-side. The picker only ever offers ids
    // from this patient's own list, so this cannot trigger today — it asserts that invariant rather
    // than trusting it, and on a mismatch shows nothing at all instead of another patient's data.
    if (visit.patientId !== this.patientId) return;
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
