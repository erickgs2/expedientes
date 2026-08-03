import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule, MatButtonToggleChange } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { AppointmentSummary } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { AppointmentService } from './appointment.service';
import { AppointmentFormComponent, type AppointmentFormDialogData } from './appointment-form.component';

type ViewMode = 'day' | 'week' | 'month';

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 21;
const PIXELS_PER_MINUTE = 1;

interface PositionedAppointment {
  appointment: AppointmentSummary;
  top: number;
  height: number;
}

interface DayColumn {
  date: Date;
  label: string;
  items: PositionedAppointment[];
}

interface MonthDay {
  date: Date;
  label: string;
  items: AppointmentSummary[];
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  return addDays(d, diff);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

@Component({
  selector: 'app-appointment-calendar',
  standalone: true,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatDialogModule,
    TranslocoModule,
    HasPermissionDirective,
  ],
  template: `
    <div class="calendar-header">
      <h1>{{ 'appointments.calendarTitle' | transloco }}</h1>
      <div class="controls">
        <button mat-icon-button (click)="goToPrevious()" [attr.aria-label]="'appointments.previous' | transloco">
          <mat-icon>chevron_left</mat-icon>
        </button>
        <button mat-button (click)="goToToday()">{{ 'appointments.today' | transloco }}</button>
        <button mat-icon-button (click)="goToNext()" [attr.aria-label]="'appointments.next' | transloco">
          <mat-icon>chevron_right</mat-icon>
        </button>
        <span class="range-label">{{ rangeLabel() }}</span>
        <mat-button-toggle-group [value]="viewMode()" (change)="onViewModeChange($event)">
          <mat-button-toggle value="day">{{ 'appointments.viewDay' | transloco }}</mat-button-toggle>
          <mat-button-toggle value="week">{{ 'appointments.viewWeek' | transloco }}</mat-button-toggle>
          <mat-button-toggle value="month">{{ 'appointments.viewMonth' | transloco }}</mat-button-toggle>
        </mat-button-toggle-group>
        <button *appHasPermission="'appointments:create'" mat-flat-button color="primary" (click)="openCreate()">
          <mat-icon>add</mat-icon> {{ 'appointments.new' | transloco }}
        </button>
      </div>
    </div>

    @if (viewMode() === 'month') {
      <div class="month-list">
        @for (day of monthDays(); track day.date.getTime()) {
          <div class="month-day-row">
            <div class="month-day-label">
              {{ day.label }}
              @if (auth.hasPermission('appointments', 'create')) {
                <button mat-icon-button (click)="openCreate(monthDefaultTime(day.date))" [attr.aria-label]="'appointments.new' | transloco">
                  <mat-icon>add</mat-icon>
                </button>
              }
            </div>
            <div class="month-day-items">
              @for (appt of day.items; track appt.id) {
                <button
                  type="button"
                  class="appt-chip"
                  [class.status-cancelled]="appt.status === 'CANCELLED'"
                  [class.status-no-show]="appt.status === 'NO_SHOW'"
                  (click)="openEdit(appt.id)"
                >
                  {{ formatTime(appt.startTime) }} — {{ appt.patientName }}
                  @if (appt.treatmentTypeNames.length > 0) {
                    <span class="chip-types">({{ appt.treatmentTypeNames.join(', ') }})</span>
                  }
                </button>
              } @empty {
                <span class="no-appts">{{ 'appointments.noneThisDay' | transloco }}</span>
              }
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="week-header">
        <div class="axis-spacer"></div>
        @for (col of dayColumns(); track col.date.getTime()) {
          <div class="day-header-cell">{{ col.label }}</div>
        }
      </div>
      <div class="time-grid">
        <div class="time-axis" [style.height.px]="gridHeight">
          @for (hour of hourMarks; track hour) {
            <div class="hour-label" [style.top.px]="hourTop(hour)">{{ hour }}:00</div>
          }
        </div>
        <div class="day-columns">
          @for (col of dayColumns(); track col.date.getTime()) {
            <div class="day-column" [style.height.px]="gridHeight" (click)="onColumnClick($event, col.date)">
              @for (positioned of col.items; track positioned.appointment.id) {
                <button
                  type="button"
                  class="appt-block"
                  [class.status-cancelled]="positioned.appointment.status === 'CANCELLED'"
                  [class.status-no-show]="positioned.appointment.status === 'NO_SHOW'"
                  [style.top.px]="positioned.top"
                  [style.height.px]="positioned.height"
                  (click)="onAppointmentClick($event, positioned.appointment)"
                >
                  {{ formatTime(positioned.appointment.startTime) }} {{ positioned.appointment.patientName }}
                </button>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .calendar-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
        flex-wrap: wrap;
        gap: 8px;
      }
      .controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .range-label {
        margin: 0 8px;
        font-weight: 500;
      }
      .month-list {
        padding: 0 16px;
      }
      .month-day-row {
        display: flex;
        gap: 12px;
        padding: 8px 0;
        border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      }
      .month-day-label {
        min-width: 180px;
        font-weight: 500;
        text-transform: capitalize;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .month-day-items {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }
      .appt-chip {
        text-align: left;
        border: none;
        border-radius: 4px;
        padding: 4px 8px;
        background: var(--mat-sys-primary-container, #ffd9dd);
        cursor: pointer;
      }
      .appt-chip.status-cancelled,
      .appt-chip.status-no-show {
        opacity: 0.5;
      }
      .no-appts {
        color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
        font-size: 13px;
      }
      .week-header {
        display: flex;
        padding-left: 56px;
      }
      .day-header-cell {
        flex: 1;
        text-align: center;
        font-weight: 500;
        text-transform: capitalize;
        padding: 4px;
      }
      .time-grid {
        display: flex;
        position: relative;
        overflow-y: auto;
        max-height: 70vh;
      }
      .time-axis {
        width: 56px;
        position: relative;
        flex-shrink: 0;
      }
      .hour-label {
        position: absolute;
        left: 0;
        right: 8px;
        text-align: right;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
        transform: translateY(-50%);
      }
      .day-columns {
        display: flex;
        flex: 1;
        position: relative;
      }
      .day-column {
        flex: 1;
        position: relative;
        border-left: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
        cursor: pointer;
      }
      .appt-block {
        position: absolute;
        left: 2px;
        right: 2px;
        border: none;
        border-radius: 4px;
        background: var(--mat-sys-primary-container, #ffd9dd);
        text-align: left;
        padding: 2px 4px;
        font-size: 12px;
        overflow: hidden;
        cursor: pointer;
      }
      .appt-block.status-cancelled,
      .appt-block.status-no-show {
        opacity: 0.5;
      }
    `,
  ],
})
export class AppointmentCalendarComponent implements OnInit {
  private readonly appointmentService = inject(AppointmentService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  protected readonly auth = inject(AuthService);

  protected readonly viewMode = signal<ViewMode>('week');
  protected readonly referenceDate = signal<Date>(new Date());
  protected readonly appointments = signal<AppointmentSummary[]>([]);

  protected readonly hourMarks = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
    (_, i) => DAY_START_HOUR + i
  );
  protected readonly gridHeight = (DAY_END_HOUR - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE;

  private readonly rangeStart = computed<Date>(() => {
    const ref = this.referenceDate();
    const mode = this.viewMode();
    if (mode === 'day') return startOfDay(ref);
    if (mode === 'week') return startOfWeek(ref);
    return startOfMonth(ref);
  });

  private readonly rangeEnd = computed<Date>(() => {
    const ref = this.referenceDate();
    const mode = this.viewMode();
    if (mode === 'day') {
      const d = startOfDay(ref);
      d.setHours(23, 59, 59, 999);
      return d;
    }
    if (mode === 'week') {
      const d = addDays(startOfWeek(ref), 6);
      d.setHours(23, 59, 59, 999);
      return d;
    }
    return endOfMonth(ref);
  });

  protected readonly dayColumns = computed<DayColumn[]>(() => {
    const mode = this.viewMode();
    const ref = this.referenceDate();
    const dates = mode === 'day' ? [startOfDay(ref)] : this.weekDates(ref);
    const appts = this.appointments();
    return dates.map((date) => ({
      date,
      label: this.formatDayLabel(date),
      items: appts
        .filter((a) => isSameDay(new Date(a.startTime), date))
        .map((a) => this.positionAppointment(a, date)),
    }));
  });

  protected readonly monthDays = computed<MonthDay[]>(() => {
    const ref = this.referenceDate();
    const start = startOfMonth(ref);
    const end = endOfMonth(ref);
    const appts = this.appointments();
    const days: MonthDay[] = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      const date = new Date(d);
      days.push({
        date,
        label: this.formatMonthDayLabel(date),
        items: appts
          .filter((a) => isSameDay(new Date(a.startTime), date))
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      });
    }
    return days;
  });

  protected readonly rangeLabel = computed<string>(() => {
    const mode = this.viewMode();
    const ref = this.referenceDate();
    const lang = this.transloco.getActiveLang();
    if (mode === 'day') {
      return new Intl.DateTimeFormat(lang, { dateStyle: 'full' }).format(ref);
    }
    if (mode === 'week') {
      const start = startOfWeek(ref);
      const end = addDays(start, 6);
      const fmt = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' });
      return `${fmt.format(start)} – ${fmt.format(end)}`;
    }
    return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(ref);
  });

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  private weekDates(ref: Date): Date[] {
    const start = startOfWeek(ref);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  private positionAppointment(appt: AppointmentSummary, date: Date): PositionedAppointment {
    const start = new Date(appt.startTime);
    const dayStart = new Date(date);
    dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
    const minutesFromStart = (start.getTime() - dayStart.getTime()) / 60000;
    const top = Math.max(0, minutesFromStart) * PIXELS_PER_MINUTE;
    const height = Math.max(20, appt.durationMinutes * PIXELS_PER_MINUTE);
    return { appointment: appt, top, height };
  }

  private formatDayLabel(date: Date): string {
    return new Intl.DateTimeFormat(this.transloco.getActiveLang(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(date);
  }

  private formatMonthDayLabel(date: Date): string {
    return new Intl.DateTimeFormat(this.transloco.getActiveLang(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);
  }

  protected formatTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  protected hourTop(hour: number): number {
    return (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE;
  }

  protected monthDefaultTime(date: Date): Date {
    const d = new Date(date);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  private async refresh(): Promise<void> {
    this.appointments.set(await this.appointmentService.list(this.rangeStart(), this.rangeEnd()));
  }

  protected onViewModeChange(event: MatButtonToggleChange): void {
    this.viewMode.set(event.value as ViewMode);
    this.refresh();
  }

  protected goToToday(): void {
    this.referenceDate.set(new Date());
    this.refresh();
  }

  protected goToPrevious(): void {
    this.referenceDate.update((ref) => this.shiftReference(ref, -1));
    this.refresh();
  }

  protected goToNext(): void {
    this.referenceDate.update((ref) => this.shiftReference(ref, 1));
    this.refresh();
  }

  private shiftReference(ref: Date, direction: 1 | -1): Date {
    const mode = this.viewMode();
    if (mode === 'day') return addDays(ref, direction);
    if (mode === 'week') return addDays(ref, direction * 7);
    return new Date(ref.getFullYear(), ref.getMonth() + direction, 1);
  }

  protected onColumnClick(event: MouseEvent, date: Date): void {
    if (!this.auth.hasPermission('appointments', 'create')) return;
    const column = event.currentTarget as HTMLElement;
    const rect = column.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const minutesFromDayStart = Math.max(0, Math.round(offsetY / PIXELS_PER_MINUTE / 15) * 15);
    const startTime = new Date(date);
    startTime.setHours(DAY_START_HOUR, 0, 0, 0);
    startTime.setMinutes(startTime.getMinutes() + minutesFromDayStart);
    this.openCreate(startTime);
  }

  protected onAppointmentClick(event: MouseEvent, appointment: AppointmentSummary): void {
    event.stopPropagation();
    if (!this.auth.hasPermission('appointments', 'edit')) return;
    this.openEdit(appointment.id);
  }

  protected openCreate(startTime?: Date): void {
    const ref = this.dialog.open(AppointmentFormComponent, {
      data: { appointment: null, initialStartTime: startTime ?? new Date() } as AppointmentFormDialogData,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.refresh();
    });
  }

  protected async openEdit(id: string): Promise<void> {
    const appointment = await this.appointmentService.get(id);
    const ref = this.dialog.open(AppointmentFormComponent, {
      data: { appointment } as AppointmentFormDialogData,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.refresh();
    });
  }
}
