import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { AppointmentSummary, TodayAppointment, TodayDesk } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { AppointmentService } from '../appointments/appointment.service';
import {
  AppointmentFormComponent,
  type AppointmentFormDialogData,
} from '../appointments/appointment-form.component';
import { AppointmentQuickViewComponent } from '../appointments/appointment-quick-view.component';
import { DeskAgendaComponent, type DeskFilter, type DeskRowEvent } from './desk-agenda.component';
import { DeskKpisComponent } from './desk-kpis.component';
import { DeskSideComponent } from './desk-side.component';
import { PatientQuickSearchComponent } from './patient-quick-search.component';
import { TodayDeskService } from './today-desk.service';

const REFRESH_MS = 60_000;
const FILTERS: DeskFilter[] = ['all', 'accion', 'pendientes', 'terminadas'];

/**
 * "Hoy · Mostrador": where the working day starts. Search first (the most frequent action), then
 * the day in four numbers, then the agenda with one next step per row. Everything below the
 * header comes from `GET /api/today` in one call, refreshed every minute and when the tab regains
 * focus, so phases ("in consult") move on their own while the screen sits open on a tablet.
 */
@Component({
  selector: 'app-today',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    TranslocoModule,
    HasPermissionDirective,
    PatientQuickSearchComponent,
    DeskKpisComponent,
    DeskAgendaComponent,
    DeskSideComponent,
  ],
  template: `
    <header class="desk-header">
      <div class="title">
        <h1>{{ 'today.title' | transloco }}</h1>
        <p class="date">{{ dateLabel() }}</p>
      </div>
      <app-patient-quick-search class="search"></app-patient-quick-search>
      <div class="actions">
        <a mat-stroked-button routerLink="/pacientes">
          <mat-icon>person_add</mat-icon> {{ 'patientDrive.newPatient' | transloco }}
        </a>
        <button
          *appHasPermission="'appointments:create'"
          mat-flat-button
          color="primary"
          type="button"
          (click)="newAppointment()"
        >
          <mat-icon>event_available</mat-icon> {{ 'appointments.new' | transloco }}
        </button>
      </div>
    </header>

    @if (canSeeAgenda) {
      @if (desk(); as d) {
        <app-desk-kpis [kpis]="d.kpis"></app-desk-kpis>
        <div class="desk-body">
          <app-desk-agenda
            class="main"
            [appointments]="d.appointments"
            [whatsappEnabled]="d.whatsappEnabled"
            [filter]="filter()"
            (action)="onRowAction($event)"
          ></app-desk-agenda>
          <app-desk-side class="side" [desk]="d"></app-desk-side>
        </div>
      } @else if (loadFailed()) {
        <div class="state">
          <p>{{ 'common.loadError' | transloco }}</p>
          <button mat-stroked-button type="button" (click)="reload()">
            {{ 'today.desk.retry' | transloco }}
          </button>
        </div>
      } @else {
        <div class="state skeleton" aria-busy="true">
          <p>{{ 'common.loading' | transloco }}</p>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      .desk-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 16px 24px;
      }
      .title {
        flex: 1 1 220px;
      }
      .title h1 {
        margin: 0;
      }
      .date {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .date::first-letter {
        text-transform: uppercase;
      }
      .search {
        flex: 2 1 320px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .desk-body {
        display: flex;
        flex-wrap: wrap;
        gap: 24px;
        align-items: flex-start;
      }
      .main {
        flex: 999 1 600px;
        min-width: 0;
      }
      .side {
        flex: 1 1 280px;
        min-width: 0;
      }
      .state {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
        min-height: 320px;
        padding: 24px;
        border: 1px dashed var(--plate-line-strong);
        border-radius: 14px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class TodayComponent implements OnInit {
  private readonly deskService = inject(TodayDeskService);
  private readonly appointmentService = inject(AppointmentService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly canSeeAgenda = this.auth.hasPermission('appointments', 'view');

  protected readonly desk = signal<TodayDesk | null>(null);
  protected readonly loadFailed = signal(false);
  private readonly now = signal(new Date());

  protected readonly filter = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => {
        const value = params.get('filtro') as DeskFilter | null;
        return value && FILTERS.includes(value) ? value : 'all';
      })
    ),
    { initialValue: 'all' as DeskFilter }
  );

  protected readonly dateLabel = computed(() => {
    const now = this.now();
    const lang = this.transloco.getActiveLang();
    const day = now.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' });
    const time = now.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${day} · ${time}`;
  });

  ngOnInit(): void {
    if (!this.canSeeAgenda) return;
    void this.reload();

    const timer = setInterval(() => {
      this.now.set(new Date());
      void this.reload({ quiet: true });
    }, REFRESH_MS);
    // A tablet left on the desk comes back to a stale screen; refresh as soon as it is looked at.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        this.now.set(new Date());
        void this.reload({ quiet: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  /** `quiet` keeps the current data on screen if a background refresh fails. */
  protected async reload({ quiet = false } = {}): Promise<void> {
    try {
      this.desk.set(await this.deskService.load());
      this.loadFailed.set(false);
    } catch (error) {
      console.error('Failed to load the front desk', error);
      if (!quiet || !this.desk()) {
        this.desk.set(null);
        this.loadFailed.set(true);
      }
    }
  }

  protected async onRowAction({ action, appointment }: DeskRowEvent): Promise<void> {
    switch (action) {
      case 'remind':
        return this.remind(appointment);
      case 'arrive':
      case 'unarrive':
        return this.setArrived(appointment, action === 'arrive');
      case 'edit':
      case 'reschedule':
        return this.editAppointment(appointment.id);
      case 'details':
        return this.openQuickView(appointment);
    }
  }

  private async remind(appt: TodayAppointment): Promise<void> {
    try {
      const outcome = await this.deskService.sendReminder(appt.id);
      this.toast(`today.desk.result.${outcome.result}`, { name: appt.patientName });
      if (outcome.result === 'sent') await this.reload({ quiet: true });
    } catch (error) {
      console.error('Failed to send reminder', error);
      this.toast('today.desk.result.request_failed');
    }
  }

  private async setArrived(appt: TodayAppointment, arrived: boolean): Promise<void> {
    try {
      await this.deskService.setArrived(appt.id, arrived);
      this.toast(arrived ? 'today.desk.result.arrived' : 'today.desk.result.unarrived', {
        name: appt.patientName,
      });
      await this.reload({ quiet: true });
    } catch (error) {
      console.error('Failed to update arrival', error);
      this.toast('today.desk.result.request_failed');
    }
  }

  private toast(key: string, params?: Record<string, unknown>): void {
    this.snackBar.open(this.transloco.translate(key, params), undefined, { duration: 4000 });
  }

  protected newAppointment(): void {
    this.dialog
      .open(AppointmentFormComponent, {
        data: { appointment: null, initialStartTime: new Date() } as AppointmentFormDialogData,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) void this.reload({ quiet: true });
      });
  }

  private async editAppointment(id: string): Promise<void> {
    try {
      const appointment = await this.appointmentService.get(id);
      this.dialog
        .open(AppointmentFormComponent, { data: { appointment } as AppointmentFormDialogData })
        .afterClosed()
        .subscribe((saved) => {
          if (saved) void this.reload({ quiet: true });
        });
    } catch (error) {
      console.error('Failed to load appointment', error);
      this.toast('today.desk.result.request_failed');
    }
  }

  private openQuickView(appt: TodayAppointment): void {
    const summary: AppointmentSummary = {
      id: appt.id,
      patientId: appt.patientId,
      patientName: appt.patientName,
      startTime: appt.startTime,
      durationMinutes: appt.durationMinutes,
      status: appt.status,
      treatmentTypeNames: appt.treatmentTypeNames,
    };
    this.dialog
      .open<AppointmentQuickViewComponent, AppointmentSummary, 'edit' | undefined>(
        AppointmentQuickViewComponent,
        { data: summary }
      )
      .afterClosed()
      .subscribe((result) => {
        if (result === 'edit') void this.editAppointment(appt.id);
      });
  }
}
