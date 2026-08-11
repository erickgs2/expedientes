import { Component, OnInit, inject, signal } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule, MatSlideToggleChange } from '@angular/material/slide-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslocoModule } from '@jsverse/transloco';
import type { TreatmentType } from '@expedientes/shared-types';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { TreatmentTypesService } from './treatment-types.service';
import { TreatmentTypeFormDialogComponent } from './treatment-type-form-dialog.component';

@Component({
  selector: 'app-treatment-type-list',
  standalone: true,
  imports: [
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatDialogModule,
    TranslocoModule,
    HasPermissionDirective,
  ],
  template: `
    <div class="header">
      <h1>{{ 'treatmentCatalog.title' | transloco }}</h1>
      <button
        *appHasPermission="'treatments:create'"
        mat-flat-button
        color="primary"
        (click)="openCreate()"
      >
        <mat-icon>add</mat-icon> {{ 'treatmentCatalog.new' | transloco }}
      </button>
    </div>
    <!--
      Deliberately not mat-list-item: its matListItemTitle slot is a single line that ellipsises,
      which truncated longer treatment names. This row lets the name wrap and keeps the controls
      on their own line when space runs out.
    -->
    <div class="type-list">
      @for (type of treatmentTypes(); track type.id) {
        <div class="type-row">
          <span class="type-name">{{ type.name }}</span>
          <div class="type-controls">
            <mat-slide-toggle
              *appHasPermission="'treatments:edit'"
              [checked]="type.active"
              (change)="toggleActive(type, $event)"
            >
              {{ 'treatmentCatalog.active' | transloco }}
            </mat-slide-toggle>
            <button
              *appHasPermission="'treatments:edit'"
              mat-icon-button
              (click)="openEdit(type)"
              [attr.aria-label]="'common.edit' | transloco"
            >
              <mat-icon>edit</mat-icon>
            </button>
          </div>
        </div>
      } @empty {
        <div class="empty-state">
          <mat-icon>medical_services</mat-icon>
          <p>{{ 'treatments.empty' | transloco }}</p>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 0 16px;
      }
      .type-list {
        display: flex;
        flex-direction: column;
      }
      .type-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px 16px;
        padding: 12px 4px;
        border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      }
      .type-name {
        flex: 1 1 200px;
        min-width: 0;
        font-weight: 500;
        /* Wrap rather than ellipsise, and break a single very long word instead of overflowing. */
        overflow-wrap: anywhere;
      }
      .type-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
    `,
  ],
})
export class TreatmentTypeListComponent implements OnInit {
  private readonly treatmentTypesService = inject(TreatmentTypesService);
  private readonly dialog = inject(MatDialog);

  protected readonly treatmentTypes = signal<TreatmentType[]>([]);

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    this.treatmentTypes.set(await this.treatmentTypesService.list());
  }

  openCreate(): void {
    const ref = this.dialog.open(TreatmentTypeFormDialogComponent, {
      data: { treatmentType: null },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.refresh();
    });
  }

  openEdit(type: TreatmentType): void {
    const ref = this.dialog.open(TreatmentTypeFormDialogComponent, {
      data: { treatmentType: type },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.refresh();
    });
  }

  async toggleActive(type: TreatmentType, event: MatSlideToggleChange): Promise<void> {
    try {
      await this.treatmentTypesService.update(type.id, { active: event.checked });
      await this.refresh();
    } catch {
      // The signal's stored value for this item never changed on failure, so Angular's
      // one-way [checked] binding won't revert the control on its own — do it explicitly.
      event.source.checked = type.active;
    }
  }
}
