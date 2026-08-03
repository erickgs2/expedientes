import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';
import type { TreatmentType } from '@expedientes/shared-types';
import { TreatmentTypesService } from './treatment-types.service';

export interface TreatmentTypeFormDialogData {
  treatmentType: TreatmentType | null;
}

@Component({
  selector: 'app-treatment-type-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    TranslocoModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{
        (data.treatmentType ? 'treatmentCatalog.form.editTitle' : 'treatmentCatalog.form.newTitle')
          | transloco
      }}
    </h2>
    <mat-dialog-content>
      <form [formGroup]="form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'treatmentCatalog.name' | transloco }}</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'treatmentCatalog.consentTemplate' | transloco }}</mat-label>
          <textarea matInput formControlName="consentTemplate" rows="8"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="save()">
        {{ 'common.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
    `,
  ],
})
export class TreatmentTypeFormDialogComponent {
  protected readonly dialogRef = inject(MatDialogRef<TreatmentTypeFormDialogComponent>);
  private readonly treatmentTypesService = inject(TreatmentTypesService);
  private readonly fb = inject(FormBuilder);
  protected readonly saving = signal(false);

  // `data` must be a field injected before any field initializer that reads it (`form` below) —
  // this project's established MAT_DIALOG_DATA field-ordering convention; see
  // RoleFormDialogComponent for the production-build-only TS2729 error this avoids.
  protected readonly data = inject<TreatmentTypeFormDialogData>(MAT_DIALOG_DATA);

  protected readonly form = this.fb.group({
    name: [this.data.treatmentType?.name ?? '', Validators.required],
    consentTemplate: [this.data.treatmentType?.consentTemplate ?? '', Validators.required],
  });

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      const raw = this.form.value;
      if (this.data.treatmentType) {
        await this.treatmentTypesService.update(this.data.treatmentType.id, {
          name: raw.name ?? undefined,
          consentTemplate: raw.consentTemplate ?? undefined,
        });
      } else {
        await this.treatmentTypesService.create(raw.name ?? '', raw.consentTemplate ?? '');
      }
      this.dialogRef.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}
