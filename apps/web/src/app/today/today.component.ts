import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { AppointmentSummary, PatientSummary } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { AppointmentService } from '../appointments/appointment.service';
import {
  AppointmentFormComponent,
  type AppointmentFormDialogData,
} from '../appointments/appointment-form.component';
import { AppointmentQuickViewComponent } from '../appointments/appointment-quick-view.component';
import { PatientsService } from '../patient-drive/patients.service';

/**
 * Where the working day starts. The doctor's first questions are "who is next?" and "find this
 * patient" — so both are answered here, instead of landing on an empty patient search.
 *
 * Search is first because it is the most frequent action; the agenda sits right under it with the
 * next appointment marked. Every agenda row goes straight to the record.
 */
@Component({
  selector: 'app-today',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoModule,
    HasPermissionDirective,
  ],
  template: `
    <header class="today-header">
      <h1>{{ 'today.title' | transloco }}</h1>
      <p class="today-date">{{ dateLabel() }}</p>
    </header>

    <mat-form-field appearance="outline" class="search">
      <mat-label>{{ 'patientDrive.search' | transloco }}</mat-label>
      <mat-icon matPrefix>search</mat-icon>
      <input
        matInput
        [ngModel]="query()"
        (ngModelChange)="onQueryChange($event)"
        (keydown.enter)="openFirst()"
        autocomplete="off"
      />
    </mat-form-field>

    @if (query().trim()) {
      <ul class="results" [attr.aria-label]="'today.results' | transloco">
        @for (patient of results(); track patient.id) {
          <li>
            <a class="result-row" [routerLink]="['/pacientes', patient.id]">
              <span class="result-name">{{ patient.fullName }}</span>
              <span class="result-meta">
                {{ patient.phone }}{{ patient.documentId ? ' · ' + patient.documentId : '' }}
              </span>
            </a>
          </li>
        } @empty {
          @if (!searching()) {
            <li class="no-results">{{ 'today.noResults' | transloco }}</li>
          }
        }
      </ul>
    }

    <div class="quick-buttons">
      <a mat-stroked-button routerLink="/pacientes">
        <mat-icon>person_add</mat-icon> {{ 'patientDrive.newPatient' | transloco }}
      </a>
      <button
        *appHasPermission="'appointments:create'"
        mat-stroked-button
        type="button"
        (click)="newAppointment()"
      >
        <mat-icon>event_available</mat-icon> {{ 'appointments.new' | transloco }}
      </button>
    </div>

    @if (canSeeAgenda) {
      <section class="agenda" [attr.aria-label]="'today.agenda' | transloco">
        <h2>{{ 'today.agenda' | transloco }}</h2>
        @if (loading()) {
          <p>{{ 'common.loading' | transloco }}</p>
        } @else if (loadFailed()) {
          <p>{{ 'common.loadError' | transloco }}</p>
        } @else {
          <ul class="agenda-list">
            @for (appt of appointments(); track appt.id) {
              <li class="agenda-row" [class.is-next]="appt.id === nextId()">
                <button type="button" class="agenda-main" (click)="openQuickView(appt)">
                  <span class="agenda-time">{{ timeLabel(appt) }}</span>
                  <span class="agenda-who">
                    <span class="agenda-name">{{ appt.patientName }}</span>
                    @if (appt.treatmentTypeNames.length > 0) {
                      <span class="agenda-treatments">{{ appt.treatmentTypeNames.join(', ') }}</span>
                    }
                  </span>
                  @if (appt.id === nextId()) {
                    <span class="next-mark">{{ 'today.next' | transloco }}</span>
                  }
                  @if (appt.status !== 'SCHEDULED') {
                    <span class="agenda-status">{{ 'appointments.status.' + appt.status | transloco }}</span>
                  }
                </button>
                <a
                  *appHasPermission="'historia-clinica:view'"
                  mat-stroked-button
                  class="agenda-open"
                  [routerLink]="['/pacientes', appt.patientId, 'historia-clinica']"
                >
                  {{ 'appointments.quick.openRecord' | transloco }}
                </a>
              </li>
            } @empty {
              <li class="empty-state">
                <mat-icon>event_available</mat-icon>
                <p>{{ 'today.noAppointments' | transloco }}</p>
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
  styles: [
    `
      .today-header {
        margin-bottom: 20px;
      }
      .today-header h1 {
        margin-bottom: 2px;
      }
      .today-date {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .today-date::first-letter {
        text-transform: uppercase;
      }
      .search {
        width: 100%;
      }
      .results {
        list-style: none;
        margin: -8px 0 16px;
        padding: 0;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
      }
      .result-row {
        box-sizing: border-box;
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 4px 12px;
        min-height: 56px;
        padding: 12px 16px;
        color: inherit;
        text-decoration: none;
      }
      .results li + li {
        border-top: 1px solid var(--plate-line);
      }
      .result-row:hover,
      .result-row:focus-visible {
        background: var(--mat-sys-surface-container-low);
      }
      .result-name {
        font-weight: 600;
      }
      .result-meta {
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .no-results {
        padding: 16px;
        color: var(--mat-sys-on-surface-variant);
      }
      .quick-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 8px;
      }
      .agenda-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .agenda-row {
        display: flex;
        align-items: stretch;
        gap: 12px;
        border-bottom: 1px solid var(--plate-line);
      }
      .agenda-main {
        box-sizing: border-box;
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 16px;
        min-height: 64px;
        padding: 12px 8px;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: background-color 150ms ease-out;
      }
      .agenda-main:hover,
      .agenda-main:focus-visible {
        background: var(--mat-sys-surface-container-low);
      }
      .agenda-time {
        flex: none;
        width: 5.5ch;
        font-size: 1.125rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .agenda-who {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .agenda-name {
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      .agenda-treatments {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
      }
      /* The next appointment carries the rose mark: the one point on today's map that matters most. */
      .next-mark {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--mat-sys-primary);
      }
      .next-mark::before {
        content: '';
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--plate-mark);
      }
      .agenda-status {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        border: 1px dashed var(--plate-line-strong);
        border-radius: 6px;
        padding: 2px 8px;
      }
      .agenda-open {
        align-self: center;
        flex: none;
      }
      @media (max-width: 599px) {
        .agenda-row {
          flex-direction: column;
          gap: 0;
          padding-bottom: 8px;
        }
        .agenda-open {
          align-self: stretch;
          margin: 0 8px;
        }
      }
    `,
  ],
})
export class TodayComponent implements OnInit {
  private readonly appointmentService = inject(AppointmentService);
  private readonly patientsService = inject(PatientsService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly auth = inject(AuthService);

  protected readonly canSeeAgenda = this.auth.hasPermission('appointments', 'view');

  protected readonly query = signal('');
  protected readonly results = signal<PatientSummary[]>([]);
  protected readonly searching = signal(false);
  protected readonly appointments = signal<AppointmentSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);

  /** The first appointment that has not started yet (or is still running), among live ones. */
  protected readonly nextId = computed(() => {
    const now = Date.now();
    const upcoming = this.appointments().find(
      (a) =>
        (a.status === 'SCHEDULED' || a.status === 'CONFIRMED') &&
        new Date(a.startTime).getTime() + a.durationMinutes * 60_000 > now
    );
    return upcoming?.id ?? null;
  });

  protected readonly dateLabel = computed(() =>
    new Date().toLocaleDateString(this.transloco.getActiveLang(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  );

  private latestSearch: Promise<void> = Promise.resolve();
  private searchSeq = 0;

  async ngOnInit(): Promise<void> {
    if (this.canSeeAgenda) await this.loadAgenda();
  }

  protected onQueryChange(value: string): void {
    this.query.set(value);
    const seq = ++this.searchSeq;
    if (!value.trim()) {
      this.results.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.latestSearch = this.patientsService
      .search(value)
      .then((patients) => {
        // Only the newest keystroke may write results; an older, slower response must not win.
        if (seq === this.searchSeq) this.results.set(patients);
      })
      .catch(() => {
        if (seq === this.searchSeq) this.results.set([]);
      })
      .finally(() => {
        if (seq === this.searchSeq) this.searching.set(false);
      });
  }

  protected async openFirst(): Promise<void> {
    await this.latestSearch;
    const first = this.results()[0];
    if (first) await this.router.navigate(['/pacientes', first.id]);
  }

  protected timeLabel(appt: AppointmentSummary): string {
    return new Date(appt.startTime).toLocaleTimeString(this.transloco.getActiveLang(), {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected newAppointment(): void {
    this.dialog
      .open(AppointmentFormComponent, {
        data: { appointment: null, initialStartTime: new Date() } as AppointmentFormDialogData,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) void this.loadAgenda();
      });
  }

  protected openQuickView(appt: AppointmentSummary): void {
    this.dialog
      .open<AppointmentQuickViewComponent, AppointmentSummary, 'edit' | undefined>(
        AppointmentQuickViewComponent,
        { data: appt }
      )
      .afterClosed()
      .subscribe(async (result) => {
        if (result !== 'edit') return;
        try {
          const appointment = await this.appointmentService.get(appt.id);
          this.dialog
            .open(AppointmentFormComponent, { data: { appointment } as AppointmentFormDialogData })
            .afterClosed()
            .subscribe((saved) => {
              if (saved) void this.loadAgenda();
            });
        } catch (error) {
          console.error('Failed to load appointment', error);
        }
      });
  }

  private async loadAgenda(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    try {
      const all = await this.appointmentService.list(start, end);
      this.appointments.set(
        [...all].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      );
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
