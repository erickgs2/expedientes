import { Component, Input, OnInit, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoModule } from '@jsverse/transloco';
import type { DiagramView, DiagramViewRecord } from '@expedientes/shared-types';
import { AuthService } from '../../auth/auth.service';
import { FacialDiagramCanvasComponent } from './facial-diagram-canvas.component';
import type { DiagramDataSource, DiagramReferenceOption } from './diagram-data-source';

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

      @if (pastOptions().length > 0) {
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
                @for (option of pastOptions(); track option.id) {
                  <mat-option [value]="option.id">{{ option.label }}</mat-option>
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
          [permissionModule]="permissionModule"
          [initialDiagramData]="dataFor('FRONT')"
          [referenceData]="referenceDataFor('FRONT')"
        />
      </div>
      <div [hidden]="activeView() !== 'LEFT_PROFILE'">
        <app-facial-diagram-canvas
          #leftCanvas
          [view]="'LEFT_PROFILE'"
          [permissionModule]="permissionModule"
          [initialDiagramData]="dataFor('LEFT_PROFILE')"
          [referenceData]="referenceDataFor('LEFT_PROFILE')"
        />
      </div>
      <div [hidden]="activeView() !== 'RIGHT_PROFILE'">
        <app-facial-diagram-canvas
          #rightCanvas
          [view]="'RIGHT_PROFILE'"
          [permissionModule]="permissionModule"
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
  @Input({ required: true }) dataSource!: DiagramDataSource;
  @Input({ required: true }) permissionModule!: string;
  @Input() diagrams: DiagramViewRecord[] = [];

  private readonly auth = inject(AuthService);

  protected readonly viewOrder = VIEW_ORDER;
  protected readonly activeView = signal<DiagramView>('FRONT');
  protected readonly saving = signal(false);
  protected canEdit = false;

  protected readonly pastOptions = signal<DiagramReferenceOption[]>([]);
  protected readonly referenceEnabled = signal(false);
  protected readonly selectedReferenceId = signal<string | null>(null);
  protected readonly referenceDiagrams = signal<DiagramViewRecord[]>([]);

  private readonly frontCanvas = viewChild.required<FacialDiagramCanvasComponent>('frontCanvas');
  private readonly leftCanvas = viewChild.required<FacialDiagramCanvasComponent>('leftCanvas');
  private readonly rightCanvas = viewChild.required<FacialDiagramCanvasComponent>('rightCanvas');

  async ngOnInit(): Promise<void> {
    this.canEdit = this.auth.hasPermission(this.permissionModule, 'edit');
    this.pastOptions.set(await this.dataSource.listReferenceOptions());
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
    // picker already shows the newly-selected option, so leaving the previous option's overlay up
    // would render one owner's annotations under another owner's label. The same clear is what a
    // failed fetch (network error, deleted record) falls back to — the overlay then simply has
    // nothing to show, as if no option were selected, instead of stale data from the wrong owner.
    this.referenceDiagrams.set([]);
    if (!id) return;
    const views = await this.dataSource.getReferenceViews(id);
    // Discard a stale response: if the user picked something else while this request was in
    // flight, `selectedReferenceId()` will no longer match `id`, and applying this response now
    // would silently show the wrong past owner's data as if it were the current selection.
    if (this.selectedReferenceId() !== id) return;
    this.referenceDiagrams.set(views);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      const views: Record<string, Record<string, unknown> | null> = {};
      // Only include a view's data if that view actually finished loading — a view whose canvas
      // is still loading (or failed to load) is omitted entirely rather than sent as `null`, so its
      // existing stored data is left untouched instead of being overwritten by an empty canvas.
      if (this.frontCanvas().loaded()) {
        views['front'] = this.frontCanvas().getSerializedData();
      }
      if (this.leftCanvas().loaded()) {
        views['leftProfile'] = this.leftCanvas().getSerializedData();
      }
      if (this.rightCanvas().loaded()) {
        views['rightProfile'] = this.rightCanvas().getSerializedData();
      }
      await this.dataSource.save(views);
    } finally {
      this.saving.set(false);
    }
  }
}
