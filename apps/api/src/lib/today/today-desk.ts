import type { TodayDesk } from '@expedientes/shared-types';
import { prisma } from '../prisma/client';
import { getClinicSettings } from '../clinic/clinic-settings';
import { getRecentPatients } from '../patients/recent-patients';
import { buildTodayDesk, type DeskAppointmentRow } from './build-today-desk';
import { addDays, clinicDayRange } from './clinic-day';

const DAY_MS = 24 * 60 * 60 * 1000;
const AFTER_PHOTO_WINDOW_DAYS = 30;
const NO_SHOW_WINDOW_DAYS = 7;
const RECENT_PATIENTS = 5;

export interface DeskAccess {
  historia: boolean;
  treatments: boolean;
  patients: boolean;
}

/**
 * Everything the front desk shows for one clinic-local day, in one round trip. Blocks the caller
 * may not see come back as `null` — decided here, on the server, not by hiding them in the UI.
 * Every query only aggregates or selects the few columns the desk renders.
 */
export async function getTodayDesk(
  date: string,
  userId: string,
  access: DeskAccess,
  now: Date = new Date()
): Promise<TodayDesk> {
  const { start, end } = clinicDayRange(date);
  const tomorrow = clinicDayRange(addDays(date, 1));

  const [appointments, tomorrowRows, afterPhotosMissing, noShowsThisWeek, recentPatients, settings] =
    await Promise.all([
      prisma.appointment.findMany({
        where: { startTime: { gte: start, lt: end } },
        orderBy: { startTime: 'asc' },
        select: {
          id: true,
          patientId: true,
          startTime: true,
          durationMinutes: true,
          status: true,
          reminderSentAt: true,
          confirmationSentAt: true,
          arrivedAt: true,
          patient: {
            select: {
              fullName: true,
              historiaClinica: { select: { _count: { select: { allergies: true } } } },
            },
          },
          treatmentTypes: { select: { treatmentType: { select: { name: true } } } },
        },
      }),
      prisma.appointment.findMany({
        where: { startTime: { gte: tomorrow.start, lt: tomorrow.end }, status: { not: 'CANCELLED' } },
        select: { status: true },
      }),
      access.treatments
        ? prisma.treatmentItem.count({
            where: {
              treatment: { fecha: { gte: new Date(now.getTime() - AFTER_PHOTO_WINDOW_DAYS * DAY_MS) } },
              photos: { some: { tag: 'BEFORE' }, none: { tag: 'AFTER' } },
            },
          })
        : Promise.resolve(null),
      prisma.appointment.count({
        where: {
          status: 'NO_SHOW',
          startTime: { gte: new Date(now.getTime() - NO_SHOW_WINDOW_DAYS * DAY_MS), lte: now },
        },
      }),
      access.patients ? getRecentPatients(userId, RECENT_PATIENTS) : Promise.resolve(null),
      getClinicSettings(),
    ]);

  // Patients with a treatment item today that still has no consent — one query for the whole day.
  const consentPendingPatients = new Set<string>();
  if (access.treatments && appointments.length > 0) {
    const pending = await prisma.treatmentItem.findMany({
      where: {
        consent: null,
        treatment: {
          fecha: { gte: start, lt: end },
          patientId: { in: [...new Set(appointments.map((a) => a.patientId))] },
        },
      },
      select: { treatment: { select: { patientId: true } } },
    });
    for (const item of pending) consentPendingPatients.add(item.treatment.patientId);
  }

  const rows: DeskAppointmentRow[] = appointments.map((a) => ({
    id: a.id,
    patientId: a.patientId,
    patientName: a.patient.fullName,
    startTime: a.startTime,
    durationMinutes: a.durationMinutes,
    status: a.status,
    treatmentTypeNames: a.treatmentTypes.map((t) => t.treatmentType.name),
    reminderSentAt: a.reminderSentAt,
    confirmationSentAt: a.confirmationSentAt,
    arrivedAt: a.arrivedAt,
    hasHistoria: access.historia ? a.patient.historiaClinica !== null : null,
    allergyCount: access.historia ? (a.patient.historiaClinica?._count.allergies ?? 0) : null,
    consentPending: access.treatments ? consentPendingPatients.has(a.patientId) : null,
  }));

  const built = buildTodayDesk(rows, now);

  return {
    date,
    generatedAt: now.toISOString(),
    whatsappEnabled: Boolean(settings?.whatsappNotificationsEnabled),
    kpis: {
      ...built.kpis,
      tomorrowTotal: tomorrowRows.length,
      tomorrowUnconfirmed: tomorrowRows.filter((r) => r.status === 'SCHEDULED').length,
    },
    appointments: built.appointments,
    pending: { afterPhotosMissing, noShowsThisWeek },
    recentPatients,
  };
}
