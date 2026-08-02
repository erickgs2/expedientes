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
