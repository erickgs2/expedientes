import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type {
  Appointment,
  AppointmentStatus,
  AppointmentSummary,
  PatientSummary,
} from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { PatientsService } from '../patient-drive/patients.service';
import { TreatmentTypesService } from '../treatments/treatment-types.service';
import { AppointmentService } from './appointment.service';

export interface AppointmentFormDialogData {
  appointment: Appointment | null;
  initialPatientId?: string;
  initialPatientName?: string;
  initialStartTime?: Date;
}

interface TreatmentTypeOption {
  id: string;
  name: string;
  checked: boolean;
}

const STATUSES: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

function toDatetimeLocalString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

@Component({
  selector: 'app-appointment-form',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatButtonToggleModule,
    MatIconModule,
    MatCheckboxModule,
    MatSelectModule,
    MatButtonModule,
    TranslocoModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (data.appointment ? 'appointments.form.editTitle' : 'appointments.form.newTitle') | transloco }}
    </h2>
    <mat-dialog-content class="appointment-form">
      <!-- Grouped into who / when / what. Eight controls in one flat stack gave the dialog no
           hierarchy; headings let the eye skip to the part being changed. -->
      <section class="form-section">
        <h3 class="section-title">{{ 'appointments.form.sectionPatient' | transloco }}</h3>

        @if (canCreatePatients && !data.appointment) {
          <mat-button-toggle-group
            class="patient-mode"
            [value]="newPatient() ? 'new' : 'existing'"
            [hideSingleSelectionIndicator]="true"
            [attr.aria-label]="'appointments.form.sectionPatient' | transloco"
          >
            <mat-button-toggle value="existing" (click)="setNewPatient(false)">
              {{ 'appointments.form.existingPatient' | transloco }}
            </mat-button-toggle>
            <mat-button-toggle value="new" (click)="setNewPatient(true)">
              {{ 'appointments.form.newPatient' | transloco }}
            </mat-button-toggle>
          </mat-button-toggle-group>
        }

        @if (newPatient()) {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'appointments.form.newPatientName' | transloco }}</mat-label>
            <input matInput [(ngModel)]="newPatientName" [ngModelOptions]="{ standalone: true }" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'appointments.form.newPatientPhone' | transloco }}</mat-label>
            <input
              matInput
              type="tel"
              autocomplete="tel"
              [(ngModel)]="newPatientPhone"
              [ngModelOptions]="{ standalone: true }"
            />
            <mat-hint>{{ 'appointments.form.newPatientHelp' | transloco }}</mat-hint>
          </mat-form-field>
        } @else {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'appointments.form.patient' | transloco }}</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input
              matInput
              [(ngModel)]="patientQuery"
              [ngModelOptions]="{ standalone: true }"
              (ngModelChange)="onPatientQueryChange($event)"
              [matAutocomplete]="patientAuto"
            />
            <mat-autocomplete
              #patientAuto="matAutocomplete"
              [displayWith]="displayPatientOption"
              (optionSelected)="onPatientSelected($event)"
            >
              @for (patient of patientResults(); track patient.id) {
                <mat-option [value]="patient">
                  <span class="option-name">{{ patient.fullName }}</span>
                  <span class="option-meta">{{ patient.phone }}</span>
                </mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
        }
      </section>

      <section class="form-section">
        <h3 class="section-title">{{ 'appointments.form.sectionWhen' | transloco }}</h3>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'appointments.form.startTime' | transloco }}</mat-label>
          <input
            matInput
            type="datetime-local"
            [(ngModel)]="startTimeLocal"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="onStartTimeChange()"
          />
        </mat-form-field>

        <!-- Presets first, free entry second: almost every appointment is one of these four, and
             typing a number for the common case is needless work. -->
        <div class="duration-row" role="group" [attr.aria-label]="'appointments.form.duration' | transloco">
          @for (preset of durationPresets; track preset) {
            <button
              type="button"
              class="duration-chip"
              [class.selected]="durationMinutes === preset"
              [attr.aria-pressed]="durationMinutes === preset"
              (click)="setDuration(preset)"
            >
              {{ preset }} min
            </button>
          }
          <mat-form-field appearance="outline" class="duration-field">
            <mat-label>{{ 'appointments.form.duration' | transloco }}</mat-label>
            <input
              matInput
              type="number"
              min="5"
              step="5"
              [(ngModel)]="durationMinutes"
              [ngModelOptions]="{ standalone: true }"
              (ngModelChange)="onDurationChange()"
            />
          </mat-form-field>
        </div>

        @if (overlapping().length > 0) {
          <!-- Icon as well as colour: the warning must not depend on colour perception alone. -->
          <p class="overlap-warning" role="alert">
            <mat-icon aria-hidden="true">warning</mat-icon>
            <span>
              {{ 'appointments.form.overlapWarning' | transloco }}:
              {{ overlapping().map((a) => a.patientName).join(', ') }}
            </span>
          </p>
        }
      </section>

      <section class="form-section">
        <h3 class="section-title">{{ 'appointments.form.sectionTreatment' | transloco }}</h3>

        @if (canViewTreatmentTypes) {
          @if (treatmentTypeOptions().length > 0) {
            <div class="treatment-grid">
              @for (option of treatmentTypeOptions(); track option.id) {
                <mat-checkbox
                  [checked]="option.checked"
                  (change)="toggleTreatmentType(option, $event.checked)"
                >
                  {{ option.name }}
                </mat-checkbox>
              }
            </div>
          } @else {
            <!-- Without this the heading sat above an empty gap, which reads as a broken dialog
                 rather than an empty catalog. -->
            <p class="empty-hint">{{ 'appointments.form.noTreatmentTypes' | transloco }}</p>
          }
        }

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'appointments.form.notes' | transloco }}</mat-label>
          <textarea
            matInput
            [(ngModel)]="notes"
            [ngModelOptions]="{ standalone: true }"
            rows="3"
          ></textarea>
        </mat-form-field>

        @if (data.appointment) {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'appointments.form.status' | transloco }}</mat-label>
            <mat-select [(ngModel)]="status" [ngModelOptions]="{ standalone: true }">
              @for (s of statuses; track s) {
                <mat-option [value]="s">{{ ('appointments.status.' + s) | transloco }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
      </section>
    </mat-dialog-content>
    <mat-dialog-actions class="dialog-actions">
      @if (data.appointment && canDelete) {
        <!-- Pushed to the far left, away from Save: a destructive action next to the primary one
             invites the mis-tap it cannot undo. -->
        <button mat-button color="warn" [disabled]="saving()" (click)="delete()">
          <mat-icon>delete_outline</mat-icon>
          {{ 'common.delete' | transloco }}
        </button>
      }
      <span class="actions-spacer"></span>
      <button mat-button [disabled]="saving()" (click)="dialogRef.close()">
        {{ 'common.cancel' | transloco }}
      </button>
      <button mat-flat-button color="primary" [disabled]="!canSave() || saving()" (click)="save()">
        {{ (saving() ? 'appointments.form.saving' : 'common.save') | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      /* 8px rhythm throughout; sections separated by a hairline rather than extra whitespace so
         the dialog stays compact on a phone. */
      .appointment-form {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-top: 8px;
      }
      .form-section {
        display: flex;
        flex-direction: column;
        padding-bottom: 8px;
      }
      .form-section + .form-section {
        border-top: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
        padding-top: 16px;
      }
      .section-title {
        margin: 0 0 12px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--mat-sys-on-surface-variant);
      }
      .full-width {
        width: 100%;
      }
      .patient-mode {
        width: 100%;
        margin-bottom: 16px;
      }
      .patient-mode mat-button-toggle {
        flex: 1;
      }
      .option-name {
        font-weight: 500;
      }
      .option-meta {
        margin-left: 8px;
        color: var(--mat-sys-on-surface-variant);
        font-size: 12px;
      }
      .duration-row {
        display: flex;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 8px;
      }
      /* 44px min height: these are the most-tapped controls in the dialog. */
      .duration-chip {
        min-height: 44px;
        padding: 0 16px;
        border-radius: 22px;
        border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.3));
        background: transparent;
        color: var(--mat-sys-on-surface);
        font: inherit;
        cursor: pointer;
        transition: background-color 150ms ease-out, border-color 150ms ease-out;
      }
      .duration-chip:hover {
        background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.04));
      }
      .duration-chip.selected {
        background: var(--mat-sys-primary);
        border-color: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
      }
      .duration-chip:focus-visible {
        outline: 3px solid var(--mat-sys-primary);
        outline-offset: 2px;
      }
      .duration-field {
        flex: 1;
        min-width: 120px;
      }
      .treatment-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        /* 8px is the minimum gap between adjacent touch targets. */
        gap: 8px 16px;
        margin-bottom: 16px;
      }
      .empty-hint,
      .hint {
        margin: 0 0 16px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .overlap-warning {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 0 0 8px;
        padding: 12px;
        border-radius: 8px;
        background: var(--mat-sys-error-container, #fdecea);
        color: var(--mat-sys-on-error-container, #5f1412);
        font-size: 13px;
      }
      .overlap-warning mat-icon {
        flex: none;
      }
      .dialog-actions {
        gap: 8px;
        padding: 8px 24px 20px;
      }
      .actions-spacer {
        flex: 1;
      }
      @media (prefers-reduced-motion: reduce) {
        .duration-chip {
          transition: none;
        }
      }
    `,
  ],
})
export class AppointmentFormComponent implements OnInit {
  protected readonly dialogRef = inject(MatDialogRef<AppointmentFormComponent>);
  private readonly patientsService = inject(PatientsService);
  private readonly treatmentTypesService = inject(TreatmentTypesService);
  private readonly appointmentService = inject(AppointmentService);
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  // `data` must be a field injected before any field initializer that reads it (`patientQuery`
  // etc. below) — this project's established MAT_DIALOG_DATA field-ordering convention; see
  // RoleFormDialogComponent for the production-build-only TS2729 error this avoids.
  protected readonly data = inject<AppointmentFormDialogData>(MAT_DIALOG_DATA);

  protected readonly statuses = STATUSES;
  /** The four lengths that cover almost every booking; anything else uses the number field. */
  protected readonly durationPresets = [15, 30, 45, 60];
  protected readonly saving = signal(false);
  protected readonly canDelete = this.auth.hasPermission('appointments', 'delete');
  protected readonly canViewTreatmentTypes = this.auth.hasPermission('treatments', 'view');

  protected readonly canCreatePatients = this.auth.hasPermission('patients', 'create');
  /** True while booking for someone not yet registered; the patient is created on save. */
  protected readonly newPatient = signal(false);
  protected newPatientName = '';
  protected newPatientPhone = '';

  protected patientQuery = this.data.appointment?.patientName ?? this.data.initialPatientName ?? '';
  protected readonly patientResults = signal<PatientSummary[]>([]);
  private selectedPatientId: string | null =
    this.data.appointment?.patientId ?? this.data.initialPatientId ?? null;

  protected startTimeLocal = toDatetimeLocalString(
    this.data.appointment
      ? new Date(this.data.appointment.startTime)
      : (this.data.initialStartTime ?? new Date())
  );
  protected durationMinutes = this.data.appointment?.durationMinutes ?? 30;
  protected notes = this.data.appointment?.notes ?? '';
  protected status: AppointmentStatus = this.data.appointment?.status ?? 'SCHEDULED';

  protected readonly treatmentTypeOptions = signal<TreatmentTypeOption[]>([]);
  protected readonly overlapping = signal<AppointmentSummary[]>([]);
  private readonly dayAppointments = signal<AppointmentSummary[]>([]);
  private loadedDay: string | null = null;

  protected setDuration(minutes: number): void {
    this.durationMinutes = minutes;
    this.onDurationChange();
  }

  protected setNewPatient(value: boolean): void {
    this.newPatient.set(value);
  }

  ngOnInit(): void {
    if (this.canViewTreatmentTypes) {
      this.loadTreatmentTypes();
    }
    this.loadDayAppointments();
  }

  private async loadTreatmentTypes(): Promise<void> {
    try {
      const types = await this.treatmentTypesService.list();
      const existingIds = new Set(this.data.appointment?.treatmentTypeIds ?? []);
      this.treatmentTypeOptions.set(
        types
          .filter((t) => t.active || existingIds.has(t.id))
          .map((t) => ({ id: t.id, name: t.name, checked: existingIds.has(t.id) }))
      );
    } catch (error) {
      console.error('Failed to load treatment types', error);
    }
  }

  private async loadDayAppointments(): Promise<void> {
    const start = this.parsedStartTime();
    if (start) {
      const dayKey = start.toDateString();
      if (this.loadedDay !== dayKey) {
        const dayStart = new Date(start);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(start);
        dayEnd.setHours(23, 59, 59, 999);
        try {
          this.dayAppointments.set(await this.appointmentService.list(dayStart, dayEnd));
          this.loadedDay = dayKey;
        } catch (error) {
          console.error('Failed to load day appointments for overlap check', error);
        }
      }
    }
    this.recomputeOverlap();
  }

  private parsedStartTime(): Date | null {
    const parsed = new Date(this.startTimeLocal);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private recomputeOverlap(): void {
    const start = this.parsedStartTime();
    if (!start) {
      this.overlapping.set([]);
      return;
    }
    const end = new Date(start.getTime() + this.durationMinutes * 60000);
    this.overlapping.set(
      this.dayAppointments().filter((a) => {
        if (this.data.appointment && a.id === this.data.appointment.id) return false;
        const aStart = new Date(a.startTime);
        const aEnd = new Date(aStart.getTime() + a.durationMinutes * 60000);
        return aStart < end && start < aEnd;
      })
    );
  }

  protected canSave(): boolean {
    // In new-patient mode there is no id to check yet — the record is created on save — so the
    // name and phone stand in for it. Both are required by the patients endpoint.
    const patientReady = this.newPatient()
      ? !!this.newPatientName.trim() && !!this.newPatientPhone.trim()
      : !!this.selectedPatientId;
    return patientReady && !!this.parsedStartTime() && this.durationMinutes > 0;
  }

  protected async onPatientQueryChange(value: string | PatientSummary): Promise<void> {
    if (typeof value !== 'string') return;
    this.selectedPatientId = null;
    if (!value.trim()) {
      this.patientResults.set([]);
      return;
    }
    try {
      this.patientResults.set(await this.patientsService.search(value));
    } catch (error) {
      console.error('Failed to search patients', error);
      this.patientResults.set([]);
    }
  }

  protected displayPatientOption = (patient: PatientSummary | string | null): string => {
    if (!patient) return '';
    return typeof patient === 'string' ? patient : patient.fullName;
  };

  protected onPatientSelected(event: MatAutocompleteSelectedEvent): void {
    const patient = event.option.value as PatientSummary;
    this.selectedPatientId = patient.id;
    this.patientQuery = patient.fullName;
    this.patientResults.set([]);
  }

  protected onStartTimeChange(): void {
    this.loadDayAppointments();
  }

  protected onDurationChange(): void {
    this.recomputeOverlap();
  }

  protected toggleTreatmentType(option: TreatmentTypeOption, checked: boolean): void {
    this.treatmentTypeOptions.update((options) =>
      options.map((o) => (o.id === option.id ? { ...o, checked } : o))
    );
  }

  async save(): Promise<void> {
    const start = this.parsedStartTime();
    if (!start) return;
    if (this.newPatient()) {
      if (!this.newPatientName.trim() || !this.newPatientPhone.trim()) return;
    } else if (!this.selectedPatientId) {
      return;
    }

    // On a failed save, an exception propagates out of this `try` before `dialogRef.close(true)`
    // runs — the dialog stays open with every field's current value intact, so the user can retry
    // without re-entering anything. The error itself surfaces via the existing global
    // error-interceptor toast.
    this.saving.set(true);
    try {
      const treatmentTypeIds = this.treatmentTypeOptions()
        .filter((o) => o.checked)
        .map((o) => o.id);

      // Registering the patient first, then booking against the new id. Two calls rather than one
      // combined endpoint: if the appointment fails to save, the patient record still exists and
      // the visit can simply be booked again, which is far better than losing the details the
      // receptionist just took over the phone.
      let patientId = this.selectedPatientId;
      if (this.newPatient()) {
        const created = await this.patientsService.create({
          fullName: this.newPatientName.trim(),
          phone: this.newPatientPhone.trim(),
        });
        patientId = created.id;
      }
      if (!patientId) return;

      if (this.data.appointment) {
        await this.appointmentService.update(this.data.appointment.id, {
          patientId,
          startTime: start.toISOString(),
          durationMinutes: this.durationMinutes,
          status: this.status,
          notes: this.notes.trim() || null,
          treatmentTypeIds,
        });
      } else {
        await this.appointmentService.create({
          patientId,
          startTime: start.toISOString(),
          durationMinutes: this.durationMinutes,
          notes: this.notes.trim() || null,
          treatmentTypeIds,
        });
      }
      this.dialogRef.close(true);
    } finally {
      this.saving.set(false);
    }
  }

  async delete(): Promise<void> {
    if (!this.data.appointment) return;
    if (!confirm(this.transloco.translate('appointments.form.confirmDelete'))) return;
    this.saving.set(true);
    try {
      await this.appointmentService.delete(this.data.appointment.id);
      this.dialogRef.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}
