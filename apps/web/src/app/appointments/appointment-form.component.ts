import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
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
    MatCheckboxModule,
    MatSelectModule,
    MatButtonModule,
    TranslocoModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (data.appointment ? 'appointments.form.editTitle' : 'appointments.form.newTitle') | transloco }}
    </h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>{{ 'appointments.form.patient' | transloco }}</mat-label>
        <input
          matInput
          [(ngModel)]="patientQuery"
          [ngModelOptions]="{ standalone: true }"
          (ngModelChange)="onPatientQueryChange($event)"
          [matAutocomplete]="patientAuto"
        />
        <mat-autocomplete #patientAuto="matAutocomplete" [displayWith]="displayPatientOption" (optionSelected)="onPatientSelected($event)">
          @for (patient of patientResults(); track patient.id) {
            <mat-option [value]="patient">{{ patient.fullName }} · {{ patient.phone }}</mat-option>
          }
        </mat-autocomplete>
      </mat-form-field>

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

      <mat-form-field appearance="outline" class="full-width">
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

      @if (overlapping().length > 0) {
        <p class="overlap-warning">
          {{ 'appointments.form.overlapWarning' | transloco }}:
          {{ overlapping().map((a) => a.patientName).join(', ') }}
        </p>
      }

      @if (canViewTreatmentTypes) {
        <p class="section-label">{{ 'appointments.form.treatmentTypes' | transloco }}</p>
        @for (option of treatmentTypeOptions(); track option.id) {
          <mat-checkbox [checked]="option.checked" (change)="toggleTreatmentType(option, $event.checked)">
            {{ option.name }}
          </mat-checkbox>
        }
      }

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>{{ 'appointments.form.notes' | transloco }}</mat-label>
        <textarea matInput [(ngModel)]="notes" [ngModelOptions]="{ standalone: true }" rows="3"></textarea>
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
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.appointment && canDelete) {
        <button mat-button color="warn" [disabled]="saving()" (click)="delete()">
          {{ 'common.delete' | transloco }}
        </button>
      }
      <button mat-button (click)="dialogRef.close()">{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button color="primary" [disabled]="!canSave() || saving()" (click)="save()">
        {{ 'common.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
      .section-label {
        font-weight: 500;
        margin: 12px 0 4px;
      }
      .overlap-warning {
        color: var(--mat-sys-error, #b3261e);
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
  protected readonly saving = signal(false);
  protected readonly canDelete = this.auth.hasPermission('appointments', 'delete');
  protected readonly canViewTreatmentTypes = this.auth.hasPermission('treatments', 'view');

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
    return !!this.selectedPatientId && !!this.parsedStartTime() && this.durationMinutes > 0;
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
    if (!this.selectedPatientId || !start) return;

    // On a failed save, an exception propagates out of this `try` before `dialogRef.close(true)`
    // runs — the dialog stays open with every field's current value intact, so the user can retry
    // without re-entering anything. The error itself surfaces via the existing global
    // error-interceptor toast.
    this.saving.set(true);
    try {
      const treatmentTypeIds = this.treatmentTypeOptions()
        .filter((o) => o.checked)
        .map((o) => o.id);

      if (this.data.appointment) {
        await this.appointmentService.update(this.data.appointment.id, {
          patientId: this.selectedPatientId,
          startTime: start.toISOString(),
          durationMinutes: this.durationMinutes,
          status: this.status,
          notes: this.notes.trim() || null,
          treatmentTypeIds,
        });
      } else {
        await this.appointmentService.create({
          patientId: this.selectedPatientId,
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
