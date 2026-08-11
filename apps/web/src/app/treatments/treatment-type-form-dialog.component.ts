import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';
import type { TreatmentType } from '@expedientes/shared-types';
import { CONSENT_SECTION_EXAMPLES } from '@expedientes/shared-types';
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
          <mat-label>{{ 'treatmentCatalog.consentDescription' | transloco }}</mat-label>
          <textarea
            matInput
            formControlName="consentDescription"
            rows="8"
            [placeholder]="examples.description"
          ></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'treatmentCatalog.consentRisks' | transloco }}</mat-label>
          <textarea
            matInput
            formControlName="consentRisks"
            rows="4"
            [placeholder]="examples.risks"
          ></textarea>
          <mat-hint>{{ 'treatmentCatalog.optionalHint' | transloco }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'treatmentCatalog.consentAlternatives' | transloco }}</mat-label>
          <textarea
            matInput
            formControlName="consentAlternatives"
            rows="4"
            [placeholder]="examples.alternatives"
          ></textarea>
          <mat-hint>{{ 'treatmentCatalog.optionalHint' | transloco }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'treatmentCatalog.consentAftercare' | transloco }}</mat-label>
          <textarea
            matInput
            formControlName="consentAftercare"
            rows="4"
            [placeholder]="examples.aftercare"
          ></textarea>
          <mat-hint>{{ 'treatmentCatalog.optionalHint' | transloco }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'treatmentCatalog.consentContraindications' | transloco }}</mat-label>
          <textarea
            matInput
            formControlName="consentContraindications"
            rows="4"
            [placeholder]="examples.contraindications"
          ></textarea>
          <mat-hint>{{ 'treatmentCatalog.optionalHint' | transloco }}</mat-hint>
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

  // Worked examples shown as placeholder text. They are never saved — each section's real content
  // is specific to the procedure — but they show the depth of detail expected, which is what makes
  // the risks and alternatives sections carry legal weight rather than read as boilerplate.
  protected readonly examples = CONSENT_SECTION_EXAMPLES;

  protected readonly form = this.fb.group({
    name: [this.data.treatmentType?.name ?? '', Validators.required],
    consentDescription: [this.data.treatmentType?.consentDescription ?? '', Validators.required],
    consentRisks: [this.data.treatmentType?.consentRisks ?? ''],
    consentAlternatives: [this.data.treatmentType?.consentAlternatives ?? ''],
    consentAftercare: [this.data.treatmentType?.consentAftercare ?? ''],
    consentContraindications: [this.data.treatmentType?.consentContraindications ?? ''],
  });

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      const raw = this.form.value;
      if (this.data.treatmentType) {
        await this.treatmentTypesService.update(this.data.treatmentType.id, {
          name: raw.name ?? undefined,
          consentDescription: raw.consentDescription ?? undefined,
          consentRisks: raw.consentRisks || null,
          consentAlternatives: raw.consentAlternatives || null,
          consentAftercare: raw.consentAftercare || null,
          consentContraindications: raw.consentContraindications || null,
        });
      } else {
        await this.treatmentTypesService.create(raw.name ?? '', {
          consentDescription: raw.consentDescription ?? '',
          consentRisks: raw.consentRisks || null,
          consentAlternatives: raw.consentAlternatives || null,
          consentAftercare: raw.consentAftercare || null,
          consentContraindications: raw.consentContraindications || null,
        });
      }
      this.dialogRef.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}
