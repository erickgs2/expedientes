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
    <mat-list>
      @for (type of treatmentTypes(); track type.id) {
        <mat-list-item>
          <span matListItemTitle>{{ type.name }}</span>
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
        </mat-list-item>
      }
    </mat-list>
  `,
  styles: [
    `
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
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
