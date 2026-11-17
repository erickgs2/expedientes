import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { TodayAppointment } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';

export type DeskFilter = 'all' | 'accion' | 'pendientes' | 'terminadas';

export type DeskRowAction = 'remind' | 'arrive' | 'unarrive' | 'edit' | 'reschedule' | 'details';

export interface DeskRowEvent {
  action: DeskRowAction;
  appointment: TodayAppointment;
}

type PrimaryKind = 'remind' | 'arrive' | 'record' | 'historia' | 'reschedule' | null;

const OPEN_PHASES = ['upcoming', 'arrived', 'in_consult'];

/**
 * The day's agenda as a table with one obvious next step per row. Below 840px each row becomes a
 * stacked card (same markup, CSS only) instead of a table that scrolls sideways under a thumb.
 * Status is always words plus an icon, never colour alone.
 */
@Component({
  selector: 'app-desk-agenda',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatMenuModule, TranslocoModule],
  template: `
    <section class="agenda" [attr.aria-label]="'today.agenda' | transloco">
      <header class="agenda-head">
        <h2>{{ 'today.desk.agenda' | transloco }}</h2>
        <nav class="filters" [attr.aria-label]="'today.desk.filter.label' | transloco">
          @for (f of filters; track f.value) {
            <a
              class="filter"
              routerLink="."
              [queryParams]="{ filtro: f.value === 'all' ? null : f.value }"
              [class.is-active]="filter() === f.value"
              [attr.aria-current]="filter() === f.value ? 'true' : null"
            >
              {{ f.label | transloco }} · {{ counts()[f.value] }}
            </a>
          }
        </nav>
      </header>

      @if (visible().length === 0) {
        <div class="empty">
          <mat-icon aria-hidden="true">event_available</mat-icon>
          <p>
            {{ (appointments().length === 0 ? 'today.noAppointments' : 'today.desk.emptyFilter') | transloco }}
          </p>
        </div>
      } @else {
        <table class="desk-table">
          <thead>
            <tr>
              <th scope="col">{{ 'today.desk.col.time' | transloco }}</th>
              <th scope="col">{{ 'today.desk.col.patient' | transloco }}</th>
              <th scope="col">{{ 'today.desk.col.treatment' | transloco }}</th>
              <th scope="col">{{ 'today.desk.col.reminder' | transloco }}</th>
              <th scope="col">{{ 'today.desk.col.status' | transloco }}</th>
              <th scope="col"><span class="visually-hidden">{{ 'today.desk.col.actions' | transloco }}</span></th>
            </tr>
          </thead>
          <tbody>
            @for (appt of visible(); track appt.id) {
              <tr
                [class.is-current]="appt.phase === 'in_consult'"
                [class.is-muted]="appt.phase === 'done' || appt.phase === 'cancelled' || appt.phase === 'no_show'"
              >
                <td class="c-time">{{ time(appt.startTime) }}</td>
                <td class="c-patient">
                  <button type="button" class="name" (click)="act('details', appt)">
                    {{ appt.patientName }}
                  </button>
                  @if (appt.flags.hasAllergies) {
                    <span class="flag is-alert">
                      <mat-icon aria-hidden="true">warning</mat-icon>{{ 'today.desk.flag.allergy' | transloco }}
                    </span>
                  }
                  @if (appt.flags.noHistoria) {
                    <span class="flag">{{ 'today.desk.flag.noHistoria' | transloco }}</span>
                  }
                </td>
                <td class="c-treatment">
                  {{ appt.treatmentTypeNames.join(', ') || ('today.desk.noTreatment' | transloco) }}
                  @if (appt.flags.consentPending) {
                    <span class="flag">{{ 'today.desk.flag.consent' | transloco }}</span>
                  }
                </td>
                <td class="c-reminder">{{ reminderLabel(appt) }}</td>
                <td class="c-status">
                  <span class="status" [class.is-pill]="appt.phase === 'upcoming' && appt.status === 'SCHEDULED'">
                    @switch (appt.phase) {
                      @case ('in_consult') {
                        <span class="dot" aria-hidden="true"></span>
                      }
                      @case ('done') {
                        <mat-icon aria-hidden="true">check</mat-icon>
                      }
                      @case ('arrived') {
                        <mat-icon aria-hidden="true">how_to_reg</mat-icon>
                      }
                    }
                    {{ statusLabel(appt) }}
                  </span>
                </td>
                <td class="c-actions">
                  @switch (primary(appt)) {
                    @case ('remind') {
                      <button
                        mat-stroked-button
                        type="button"
                        [attr.aria-label]="('today.desk.action.remind' | transloco) + ': ' + appt.patientName"
                        (click)="act('remind', appt)"
                      >
                        {{ 'today.desk.action.remind' | transloco }}
                      </button>
                    }
                    @case ('arrive') {
                      <button
                        mat-stroked-button
                        type="button"
                        [attr.aria-label]="('today.desk.action.arrive' | transloco) + ': ' + appt.patientName"
                        (click)="act('arrive', appt)"
                      >
                        {{ 'today.desk.action.arrive' | transloco }}
                      </button>
                    }
                    @case ('record') {
                      <a mat-stroked-button [routerLink]="['/pacientes', appt.patientId, 'resumen']">
                        {{ 'today.desk.action.record' | transloco }}
                      </a>
                    }
                    @case ('historia') {
                      <a mat-stroked-button [routerLink]="['/pacientes', appt.patientId, 'historia-clinica']">
                        {{ 'today.desk.action.startHistoria' | transloco }}
                      </a>
                    }
                    @case ('reschedule') {
                      <button mat-stroked-button type="button" (click)="act('reschedule', appt)">
                        {{ 'today.desk.action.reschedule' | transloco }}
                      </button>
                    }
                  }
                  @if (canEdit) {
                    <button
                      mat-icon-button
                      type="button"
                      [matMenuTriggerFor]="rowMenu"
                      [attr.aria-label]="('today.desk.action.more' | transloco) + ': ' + appt.patientName"
                    >
                      <mat-icon>more_vert</mat-icon>
                    </button>
                    <mat-menu #rowMenu="matMenu">
                      @if (isOpen(appt) && !appt.arrivedAt) {
                        <button mat-menu-item type="button" (click)="act('arrive', appt)">
                          <mat-icon>how_to_reg</mat-icon>{{ 'today.desk.action.arrive' | transloco }}
                        </button>
                      }
                      @if (appt.arrivedAt && appt.phase !== 'done') {
                        <button mat-menu-item type="button" (click)="act('unarrive', appt)">
                          <mat-icon>undo</mat-icon>{{ 'today.desk.action.unarrive' | transloco }}
                        </button>
                      }
                      @if (appt.phase === 'upcoming') {
                        <button mat-menu-item type="button" (click)="act('remind', appt)">
                          <mat-icon>send</mat-icon>{{ 'today.desk.action.remind' | transloco }}
                        </button>
                      }
                      <button mat-menu-item type="button" (click)="act('edit', appt)">
                        <mat-icon>edit_calendar</mat-icon>{{ 'today.desk.action.edit' | transloco }}
                      </button>
                      @if (canViewRecord) {
                        <a mat-menu-item [routerLink]="['/pacientes', appt.patientId, 'resumen']">
                          <mat-icon>folder_open</mat-icon>{{ 'today.desk.action.record' | transloco }}
                        </a>
                      }
                    </mat-menu>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styles: [
    `
      .agenda {
        border: 1px solid var(--plate-line);
        border-radius: 14px;
        background: var(--mat-sys-surface);
        overflow: hidden;
      }
      .agenda-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 20px;
      }
      .agenda-head h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        letter-spacing: -0.015em;
      }
      .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .filter {
        display: inline-flex;
        align-items: center;
        min-height: 40px;
        padding: 0 14px;
        border: 1px solid var(--plate-line-strong);
        border-radius: 20px;
        color: inherit;
        text-decoration: none;
        font-size: 13px;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
      }
      .filter.is-active {
        background: var(--mat-sys-inverse-surface);
        color: var(--mat-sys-inverse-on-surface);
        border-color: transparent;
      }
      .desk-table {
        width: 100%;
        border-collapse: collapse;
      }
      th {
        text-align: left;
        padding: 10px 12px;
        font-size: 12px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--mat-sys-on-surface-variant);
        border-top: 1px solid var(--plate-line);
      }
      td {
        padding: 10px 12px;
        border-top: 1px solid var(--plate-line);
        vertical-align: middle;
      }
      th:first-child,
      td:first-child {
        padding-left: 20px;
      }
      th:last-child,
      td:last-child {
        padding-right: 20px;
      }
      tr.is-current td {
        background: var(--mat-sys-surface-container-low);
      }
      tr.is-current .c-time {
        box-shadow: inset 3px 0 0 var(--plate-mark);
      }
      tr.is-muted td {
        color: var(--mat-sys-on-surface-variant);
      }
      .c-time {
        width: 64px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .name {
        padding: 0;
        border: 0;
        background: none;
        font: inherit;
        font-weight: 600;
        color: inherit;
        text-align: left;
        cursor: pointer;
        min-height: 32px;
      }
      .name:hover {
        text-decoration: underline;
      }
      .flag {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .flag.is-alert {
        color: var(--mat-sys-error);
      }
      .flag mat-icon {
        width: 14px;
        height: 14px;
        font-size: 14px;
      }
      .c-reminder {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
        white-space: nowrap;
      }
      .status mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
      .status.is-pill {
        border: 1px dashed var(--plate-line-strong);
        border-radius: 6px;
        padding: 2px 8px;
      }
      tr.is-current .status {
        color: var(--mat-sys-primary);
        font-weight: 600;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--plate-mark);
      }
      .c-actions {
        text-align: right;
        white-space: nowrap;
      }
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        margin: 0 20px 20px;
        padding: 32px 16px;
        border: 1px dashed var(--plate-line-strong);
        border-radius: var(--plate-radius);
        color: var(--mat-sys-on-surface-variant);
      }
      .empty p {
        margin: 0;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      /* Tablet portrait and phones: each row becomes a card. */
      @media (max-width: 839px) {
        thead {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
        }
        .desk-table,
        tbody {
          display: block;
        }
        tr {
          display: grid;
          grid-template-columns: 56px minmax(0, 1fr) auto;
          grid-template-areas:
            'time patient status'
            'time treatment treatment'
            'time reminder reminder'
            'actions actions actions';
          gap: 2px 12px;
          padding: 12px 16px;
          border-top: 1px solid var(--plate-line);
        }
        td {
          border: 0;
          padding: 0 !important;
        }
        tr.is-current {
          background: var(--mat-sys-surface-container-low);
          box-shadow: inset 3px 0 0 var(--plate-mark);
        }
        tr.is-current td,
        tr.is-current .c-time {
          background: none;
          box-shadow: none;
        }
        .c-time { grid-area: time; }
        .c-patient { grid-area: patient; }
        .c-status { grid-area: status; text-align: right; }
        .c-treatment { grid-area: treatment; font-size: 13px; }
        .c-reminder { grid-area: reminder; }
        .c-actions {
          grid-area: actions;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding-top: 8px !important;
        }
      }
    `,
  ],
})
export class DeskAgendaComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly auth = inject(AuthService);

  readonly appointments = input.required<TodayAppointment[]>();
  readonly whatsappEnabled = input(false);
  readonly filter = input<DeskFilter>('all');
  readonly action = output<DeskRowEvent>();

  protected readonly canEdit = this.auth.hasPermission('appointments', 'edit');
  protected readonly canViewRecord = this.auth.hasPermission('historia-clinica', 'view');

  protected readonly filters: { value: DeskFilter; label: string }[] = [
    { value: 'all', label: 'today.desk.filter.all' },
    { value: 'accion', label: 'today.desk.filter.action' },
    { value: 'pendientes', label: 'today.desk.filter.open' },
    { value: 'terminadas', label: 'today.desk.filter.done' },
  ];

  protected readonly counts = computed(() => {
    const list = this.appointments();
    return {
      all: list.length,
      accion: list.filter((a) => a.needsAction).length,
      pendientes: list.filter((a) => this.isOpen(a)).length,
      terminadas: list.filter((a) => a.phase === 'done').length,
    } satisfies Record<DeskFilter, number>;
  });

  protected readonly visible = computed(() => {
    const list = this.appointments();
    switch (this.filter()) {
      case 'accion':
        return list.filter((a) => a.needsAction);
      case 'pendientes':
        return list.filter((a) => this.isOpen(a));
      case 'terminadas':
        return list.filter((a) => a.phase === 'done');
      default:
        return list;
    }
  });

  protected isOpen(appt: TodayAppointment): boolean {
    return OPEN_PHASES.includes(appt.phase);
  }

  /** The one button the row shows; everything else lives in the row menu. */
  protected primary(appt: TodayAppointment): PrimaryKind {
    if (this.isOpen(appt) && appt.flags.noHistoria && this.canViewRecord) return 'historia';
    switch (appt.phase) {
      case 'upcoming':
        if (!this.canEdit) return this.canViewRecord ? 'record' : null;
        return appt.status === 'SCHEDULED' && this.whatsappEnabled() && !appt.reminderSentAt
          ? 'remind'
          : 'arrive';
      case 'arrived':
      case 'in_consult':
      case 'done':
        return this.canViewRecord ? 'record' : null;
      case 'no_show':
      case 'cancelled':
        return this.canEdit ? 'reschedule' : null;
    }
  }

  protected act(action: DeskRowAction, appointment: TodayAppointment): void {
    this.action.emit({ action, appointment });
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleTimeString(this.transloco.getActiveLang(), {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  protected statusLabel(appt: TodayAppointment): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate(`today.desk.phase.${key}`, params);
    switch (appt.phase) {
      case 'upcoming':
        return t(appt.status === 'CONFIRMED' ? 'confirmed' : 'unconfirmed');
      case 'arrived':
        return t('arrived', { time: appt.arrivedAt ? this.time(appt.arrivedAt) : '' });
      case 'in_consult':
        return t('inConsult');
      case 'done':
        return t('done');
      case 'no_show':
        return t('noShow');
      case 'cancelled':
        return t('cancelled');
    }
  }

  protected reminderLabel(appt: TodayAppointment): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate(`today.desk.reminder.${key}`, params);
    if (appt.reminderSentAt) return t('sent', { time: this.time(appt.reminderSentAt) });
    if (appt.confirmationSentAt) return t('confirmationSent');
    if (!this.whatsappEnabled()) return t('off');
    return t('notSent');
  }
}
