import type {
  AppointmentStatus,
  TodayAppointment,
  TodayKpis,
  TodayPhase,
} from '@expedientes/shared-types';

/** One appointment of the day as loaded from the database, before any front-desk reasoning. */
export interface DeskAppointmentRow {
  id: string;
  patientId: string;
  patientName: string;
  startTime: Date;
  durationMinutes: number;
  status: AppointmentStatus;
  treatmentTypeNames: string[];
  reminderSentAt: Date | null;
  confirmationSentAt: Date | null;
  arrivedAt: Date | null;
  /** `null` when the caller may not see historia-clínica data. */
  hasHistoria: boolean | null;
  allergyCount: number | null;
  /** `null` when the caller may not see treatment data. */
  consentPending: boolean | null;
}

export function phaseOf(
  row: Pick<DeskAppointmentRow, 'status' | 'arrivedAt' | 'startTime'>,
  now: Date
): TodayPhase {
  if (row.status === 'CANCELLED') return 'cancelled';
  if (row.status === 'NO_SHOW') return 'no_show';
  if (row.status === 'COMPLETED') return 'done';
  if (row.arrivedAt) return now.getTime() >= row.startTime.getTime() ? 'in_consult' : 'arrived';
  return 'upcoming';
}

/** Still waiting for a "yes, I'm coming": booked but not confirmed, and not started yet. */
function isUnconfirmedUpcoming(row: DeskAppointmentRow, phase: TodayPhase, now: Date): boolean {
  return (
    phase === 'upcoming' && row.status === 'SCHEDULED' && row.startTime.getTime() > now.getTime()
  );
}

const OPEN_PHASES: TodayPhase[] = ['upcoming', 'arrived', 'in_consult'];

export interface BuiltDesk {
  appointments: TodayAppointment[];
  kpis: Omit<TodayKpis, 'tomorrowTotal' | 'tomorrowUnconfirmed'>;
}

/**
 * The front desk's reasoning over the day's appointments, kept free of I/O so every rule (phases,
 * what counts as needing action, what counts as confirmed) can be tested against a fixed `now`.
 * Input order is preserved; callers pass rows sorted by start time.
 */
export function buildTodayDesk(rows: DeskAppointmentRow[], now: Date): BuiltDesk {
  const kpis: BuiltDesk['kpis'] = {
    total: 0,
    done: 0,
    inConsult: 0,
    confirmed: 0,
    needsAction: 0,
    unconfirmedUpcoming: 0,
    consentPending: 0,
    noHistoria: 0,
  };

  const appointments = rows.map((row): TodayAppointment => {
    const phase = phaseOf(row, now);
    let needsAction = false;
    const noHistoria = row.hasHistoria === null ? null : !row.hasHistoria;
    const hasAllergies = row.allergyCount === null ? null : row.allergyCount > 0;

    if (phase !== 'cancelled') {
      kpis.total += 1;
      if (phase === 'done') kpis.done += 1;
      if (phase === 'in_consult') kpis.inConsult += 1;
      if (row.status === 'CONFIRMED' || phase === 'done' || row.arrivedAt) kpis.confirmed += 1;
    }

    if (OPEN_PHASES.includes(phase)) {
      const unconfirmed = isUnconfirmedUpcoming(row, phase, now);
      if (unconfirmed) kpis.unconfirmedUpcoming += 1;
      if (row.consentPending) kpis.consentPending += 1;
      if (noHistoria) kpis.noHistoria += 1;
      needsAction = Boolean(unconfirmed || row.consentPending || noHistoria);
      if (needsAction) kpis.needsAction += 1;
    }

    return {
      id: row.id,
      patientId: row.patientId,
      patientName: row.patientName,
      startTime: row.startTime.toISOString(),
      durationMinutes: row.durationMinutes,
      status: row.status,
      treatmentTypeNames: row.treatmentTypeNames,
      reminderSentAt: row.reminderSentAt?.toISOString() ?? null,
      confirmationSentAt: row.confirmationSentAt?.toISOString() ?? null,
      arrivedAt: row.arrivedAt?.toISOString() ?? null,
      phase,
      needsAction,
      flags: { hasAllergies, noHistoria, consentPending: row.consentPending },
    };
  });

  return { appointments, kpis };
}
