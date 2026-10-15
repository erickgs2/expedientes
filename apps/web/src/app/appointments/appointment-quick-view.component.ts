import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { AppointmentSummary } from '@expedientes/shared-types';
import { HasPermissionDirective } from '../auth/has-permission.directive';

/**
 * What a tap on an appointment shows: who, when, for what — and the next step. The calendar used
 * to open the edit form directly, which is the wrong first move: most of the time the doctor is
 * about to see this patient, not reschedule them. Closes with `'edit'` when the user wants the
 * form; every other action navigates away itself.
 */
@Component({
  selector: 'app-appointment-quick-view',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoModule, HasPermissionDirective],
  template: `
    <h2 mat-dialog-title>{{ appointment.patientName }}</h2>
    <mat-dialog-content>
      <p class="when">{{ whenLabel }}</p>
      @if (appointment.treatmentTypeNames.length > 0) {
        <p class="treatments">{{ appointment.treatmentTypeNames.join(', ') }}</p>
      }
      <p class="status">{{ 'appointments.status.' + appointment.status | transloco }}</p>
    </mat-dialog-content>
    <mat-dialog-actions class="actions">
      <button
        *appHasPermission="'historia-clinica:view'"
        mat-flat-button
        color="primary"
        type="button"
        (click)="open('historia-clinica')"
      >
        <mat-icon>folder_open</mat-icon>
        {{ 'appointments.quick.openRecord' | transloco }}
      </button>
      <button
        *appHasPermission="'valoracion:view'"
        mat-stroked-button
        type="button"
        (click)="open('valoracion')"
      >
        {{ 'appointments.quick.valoraciones' | transloco }}
      </button>
      <button
        *appHasPermission="'appointments:edit'"
        mat-button
        type="button"
        (click)="dialogRef.close('edit')"
      >
        {{ 'appointments.quick.edit' | transloco }}
      </button>
      <span class="spacer"></span>
      <button mat-button type="button" mat-dialog-close cdkFocusInitial>
        {{ 'appointments.quick.close' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .when {
        margin: 0 0 4px;
        font-size: 1.125rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .treatments,
      .status {
        margin: 0 0 4px;
        color: var(--mat-sys-on-surface-variant);
      }
      .actions {
        flex-wrap: wrap;
        gap: 8px;
        padding: 8px 24px 20px;
      }
      .spacer {
        flex: 1;
      }
    `,
  ],
})
export class AppointmentQuickViewComponent {
  protected readonly appointment = inject<AppointmentSummary>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(MatDialogRef<AppointmentQuickViewComponent, 'edit'>);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected get whenLabel(): string {
    const start = new Date(this.appointment.startTime);
    const end = new Date(start.getTime() + this.appointment.durationMinutes * 60_000);
    const lang = this.transloco.getActiveLang();
    const day = start.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' });
    const time = (d: Date) => d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
    return `${day} · ${time(start)}–${time(end)}`;
  }

  protected open(section: 'historia-clinica' | 'valoracion'): void {
    this.dialogRef.close();
    void this.router.navigate(['/pacientes', this.appointment.patientId, section]);
  }
}
