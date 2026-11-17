import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoModule } from '@jsverse/transloco';
import type { PatientSummary } from '@expedientes/shared-types';
import { PatientPickerComponent } from './patient-picker.component';
import { PatientsService } from './patients.service';

/** Registers a patient. Closes with the created patient, or nothing when cancelled. */
@Component({
  selector: 'app-new-patient-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSlideToggleModule, TranslocoModule, PatientPickerComponent],
  template: `
    <h2 mat-dialog-title>{{ 'patientDrive.newPatient' | transloco }}</h2>
    <form [formGroup]="form" (ngSubmit)="create()">
      <mat-dialog-content>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'patientDrive.fullName' | transloco }}</mat-label>
          <input matInput formControlName="fullName" autocomplete="off" cdkFocusInitial />
        </mat-form-field>
        <mat-slide-toggle class="companion-toggle" [checked]="useContact()" (change)="setUseContact($event.checked)">
          {{ 'companions.toggle' | transloco }}
        </mat-slide-toggle>
        @if (useContact()) {
          <app-patient-picker [selected]="contact()" (selectedChange)="contact.set($event)"></app-patient-picker>
        }
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ (useContact() ? 'companions.ownPhoneOptional' : 'patientDrive.phone') | transloco }}</mat-label>
          <input matInput type="tel" inputmode="tel" formControlName="phone" autocomplete="off" />
          <mat-hint>{{ (useContact() ? 'companions.ownPhoneHint' : 'patientDrive.phoneHint') | transloco }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'patientDrive.documentId' | transloco }}</mat-label>
          <input matInput formControlName="documentId" autocomplete="off" />
        </mat-form-field>
        @if (failed()) {
          <p class="error" role="alert">{{ 'patientDrive.browse.createFailed' | transloco }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button color="primary" type="submit" [disabled]="!canCreate() || saving()">
          {{ 'patientDrive.create' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
      mat-form-field + mat-form-field {
        margin-top: 4px;
      }
      .companion-toggle {
        display: block;
        margin: 4px 0 16px;
      }
      app-patient-picker {
        display: block;
        margin-bottom: 16px;
      }
      .error {
        margin: 0;
        color: var(--mat-sys-error);
      }
    `,
  ],
})
export class NewPatientDialogComponent {
  private readonly patientsService = inject(PatientsService);
  private readonly dialogRef = inject<MatDialogRef<NewPatientDialogComponent, PatientSummary>>(MatDialogRef);
  private readonly fb = inject(FormBuilder);

  protected readonly saving = signal(false);
  protected readonly useContact = signal(false);
  protected readonly contact = signal<PatientSummary | null>(null);
  protected readonly failed = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', Validators.required],
    phone: ['', Validators.required],
    documentId: [''],
  });

  /** The phone becomes optional when a companion's phone receives the notices. */
  protected setUseContact(value: boolean): void {
    this.useContact.set(value);
    const phone = this.form.controls.phone;
    phone.setValidators(value ? [] : [Validators.required]);
    phone.updateValueAndValidity();
    if (!value) this.contact.set(null);
  }

  protected canCreate(): boolean {
    return this.form.valid && (!this.useContact() || this.contact() !== null);
  }

  protected async create(): Promise<void> {
    if (!this.canCreate() || this.saving()) return;
    this.saving.set(true);
    this.failed.set(false);
    try {
      const value = this.form.getRawValue();
      const patient = await this.patientsService.create({
        fullName: value.fullName.trim(),
        phone: value.phone.trim(),
        documentId: value.documentId.trim() || undefined,
        contactPatientId: this.useContact() ? this.contact()?.id : undefined,
      });
      this.dialogRef.close(patient);
    } catch (error) {
      console.error('Failed to create patient', error);
      this.failed.set(true);
    } finally {
      this.saving.set(false);
    }
  }
}
