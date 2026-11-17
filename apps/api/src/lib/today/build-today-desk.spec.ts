import { buildTodayDesk, phaseOf, type DeskAppointmentRow } from './build-today-desk';

const NOW = new Date('2026-11-11T17:40:00Z'); // 11:40 in Mexico City

function row(overrides: Partial<DeskAppointmentRow>): DeskAppointmentRow {
  return {
    id: 'a',
    patientId: 'p',
    patientName: 'Paciente',
    startTime: new Date('2026-11-11T19:00:00Z'),
    durationMinutes: 30,
    status: 'SCHEDULED',
    treatmentTypeNames: [],
    reminderSentAt: null,
    confirmationSentAt: null,
    arrivedAt: null,
    hasHistoria: true,
    allergyCount: 0,
    consentPending: false,
    ...overrides,
  };
}

describe('phaseOf', () => {
  it('maps terminal statuses directly', () => {
    expect(phaseOf(row({ status: 'CANCELLED' }), NOW)).toBe('cancelled');
    expect(phaseOf(row({ status: 'NO_SHOW' }), NOW)).toBe('no_show');
    expect(phaseOf(row({ status: 'COMPLETED' }), NOW)).toBe('done');
  });

  it('is "arrived" before the slot starts and "in_consult" from its start', () => {
    const arrivedAt = new Date('2026-11-11T17:30:00Z');
    expect(phaseOf(row({ arrivedAt, startTime: new Date(NOW.getTime() + 60_000) }), NOW)).toBe('arrived');
    expect(phaseOf(row({ arrivedAt, startTime: NOW }), NOW)).toBe('in_consult');
    expect(phaseOf(row({ arrivedAt, startTime: new Date(NOW.getTime() - 60_000) }), NOW)).toBe('in_consult');
  });

  it('is "upcoming" without a check-in, even past the start time', () => {
    expect(phaseOf(row({ startTime: new Date(NOW.getTime() - 60_000) }), NOW)).toBe('upcoming');
  });
});

describe('buildTodayDesk', () => {
  it('counts an appointment needing several actions only once', () => {
    const { kpis, appointments } = buildTodayDesk(
      [row({ status: 'SCHEDULED', consentPending: true, hasHistoria: false })],
      NOW
    );
    expect(kpis.needsAction).toBe(1);
    expect(appointments[0].needsAction).toBe(true);
    expect(kpis.unconfirmedUpcoming).toBe(1);
    expect(kpis.consentPending).toBe(1);
    expect(kpis.noHistoria).toBe(1);
  });

  it('leaves cancelled appointments out of the totals and actions', () => {
    const { kpis } = buildTodayDesk([row({ status: 'CANCELLED', consentPending: true })], NOW);
    expect(kpis.total).toBe(0);
    expect(kpis.needsAction).toBe(0);
  });

  it('treats confirmed, arrived and completed appointments as confirmed', () => {
    const { kpis } = buildTodayDesk(
      [
        row({ id: '1', status: 'CONFIRMED' }),
        row({ id: '2', status: 'SCHEDULED', arrivedAt: NOW }),
        row({ id: '3', status: 'COMPLETED' }),
        row({ id: '4', status: 'SCHEDULED' }),
      ],
      NOW
    );
    expect(kpis.total).toBe(4);
    expect(kpis.confirmed).toBe(3);
    expect(kpis.done).toBe(1);
  });

  it('does not ask to confirm a slot that has already started', () => {
    const { kpis } = buildTodayDesk([row({ startTime: new Date(NOW.getTime() - 60_000) })], NOW);
    expect(kpis.unconfirmedUpcoming).toBe(0);
  });

  it('reports hidden flags as null rather than false', () => {
    const { appointments } = buildTodayDesk(
      [row({ hasHistoria: null, allergyCount: null, consentPending: null })],
      NOW
    );
    expect(appointments[0].flags).toEqual({ hasAllergies: null, noHistoria: null, consentPending: null });
  });

  it('flags allergies without exposing them', () => {
    const { appointments } = buildTodayDesk([row({ allergyCount: 2 })], NOW);
    expect(appointments[0].flags.hasAllergies).toBe(true);
  });
});
