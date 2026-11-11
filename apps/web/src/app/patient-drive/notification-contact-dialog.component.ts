import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';
import type { PatientSummary } from '@expedientes/shared-types';
import { PatientPickerComponent } from './patient-picker.component';
import { PatientsService } from './patients.service';

export interface NotificationContactDialogData {
  patient: PatientSummary;
}

/**
 * Where an existing patient's WhatsApp notices go: their own phone, or a companion's. Closes with
 * the updated patient, or nothing when cancelled. Nothing else about the patient changes.
 */
@Component({
  selector: 'app-notification-contact-dialog',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatDialogModule, MatFormFieldModule, MatInputModule, TranslocoModule, PatientPickerComponent],
  template: `
    <h2 mat-dialog-title>{{ 'companions.dialogTitle' | transloco }}</h2>
    <mat-dialog-content>
      <p class="intro">{{ 'companions.dialogIntro' | transloco: { name: data.patient.fullName } }}</p>

      <mat-button-toggle-group
        class="mode"
        [value]="mode()"
        (change)="mode.set($event.value)"
        [attr.aria-label]="'companions.dialogTitle' | transloco"
        hideSingleSelectionIndicator
      >
        <mat-button-toggle value="own">{{ 'companions.own' | transloco }}</mat-button-toggle>
        <mat-button-toggle value="contact" [disabled]="hasDependents">{{ 'companions.viaContact' | transloco }}</mat-button-toggle>
      </mat-button-toggle-group>
      @if (hasDependents) {
        <p class="note">{{ 'companions.hasDependents' | transloco: { names: dependentNames } }}</p>
      }

      @if (mode() === 'own') {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'patientDrive.phone' | transloco }}</mat-label>
          <input matInput type="tel" autocomplete="tel" [(ngModel)]="phone" />
          <mat-hint>{{ 'patientDrive.phoneHint' | transloco }}</mat-hint>
        </mat-form-field>
      } @else {
        <app-patient-picker
          [excludeId]="data.patient.id"
          [selected]="contact()"
          (selectedChange)="contact.set($event)"
        ></app-patient-picker>
        <p class="note">{{ 'companions.viaContactHelp' | transloco }}</p>
      }
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button color="primary" type="button" [disabled]="!canSave() || saving()" (click)="save()">
        {{ 'common.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .intro {
        margin: 0 0 16px;
        color: var(--mat-sys-on-surface-variant);
      }
      .mode {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        width: 100%;
        margin-bottom: 16px;
      }
      .full-width {
        width: 100%;
      }
      .note {
        margin: 8px 0 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .error {
        margin: 12px 0 0;
        color: var(--mat-sys-error);
      }
    `,
  ],
})
export class NotificationContactDialogComponent {
  protected readonly data = inject<NotificationContactDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<NotificationContactDialogComponent, PatientSummary>>(MatDialogRef);
  private readonly patientsService = inject(PatientsService);

  protected readonly hasDependents = (this.data.patient.dependents?.length ?? 0) > 0;
  protected readonly dependentNames = (this.data.patient.dependents ?? []).map((d) => d.fullName).join(', ');
  protected readonly mode = signal<'own' | 'contact'>(this.data.patient.contactPatientId ? 'contact' : 'own');
  protected readonly contact = signal<PatientSummary | null>(
    this.data.patient.contactPatient
      ? { ...this.data.patient.contactPatient, documentId: null }
      : null
  );
  protected phone = this.data.patient.phone;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected canSave(): boolean {
    return this.mode() === 'own' ? this.phone.trim() !== '' : this.contact() !== null;
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const updated =
        this.mode() === 'own'
          ? await this.patientsService.updateDetails(this.data.patient.id, {
              phone: this.phone.trim(),
              contactPatientId: null,
            })
          : await this.patientsService.updateDetails(this.data.patient.id, {
              contactPatientId: this.contact()!.id,
            });
      this.dialogRef.close(updated);
    } catch (e: unknown) {
      const message = (e as { error?: { error?: { message?: string } } })?.error?.error?.message;
      this.error.set(message ?? null);
    } finally {
      this.saving.set(false);
    }
  }
}
