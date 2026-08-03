import type { AppointmentStatus } from '@prisma/client';
import { prisma } from '../prisma/client';

function toDetail(appointment: {
  id: string;
  patientId: string;
  patient: { fullName: string };
  startTime: Date;
  durationMinutes: number;
  status: AppointmentStatus;
  notes: string | null;
  treatmentTypes: { treatmentTypeId: string; treatmentType: { name: string } }[];
}) {
  return {
    id: appointment.id,
    patientId: appointment.patientId,
    patientName: appointment.patient.fullName,
    startTime: appointment.startTime,
    durationMinutes: appointment.durationMinutes,
    status: appointment.status,
    notes: appointment.notes,
    treatmentTypeIds: appointment.treatmentTypes.map((t) => t.treatmentTypeId),
    treatmentTypeNames: appointment.treatmentTypes.map((t) => t.treatmentType.name),
  };
}

export async function listAppointments(from: Date, to: Date) {
  const appointments = await prisma.appointment.findMany({
    where: { startTime: { gte: from, lte: to } },
    orderBy: { startTime: 'asc' },
    include: { patient: true, treatmentTypes: { include: { treatmentType: true } } },
  });
  return appointments.map((a) => ({
    id: a.id,
    patientId: a.patientId,
    patientName: a.patient.fullName,
    startTime: a.startTime,
    durationMinutes: a.durationMinutes,
    status: a.status,
    treatmentTypeNames: a.treatmentTypes.map((t) => t.treatmentType.name),
  }));
}

export interface CreateAppointmentData {
  patientId: string;
  startTime: Date;
  durationMinutes: number;
  notes: string | null;
  treatmentTypeIds: string[];
}

export async function createAppointment(data: CreateAppointmentData) {
  const appointment = await prisma.appointment.create({
    data: {
      patientId: data.patientId,
      startTime: data.startTime,
      durationMinutes: data.durationMinutes,
      notes: data.notes,
      treatmentTypes: {
        create: data.treatmentTypeIds.map((treatmentTypeId) => ({ treatmentTypeId })),
      },
    },
    include: { patient: true, treatmentTypes: { include: { treatmentType: true } } },
  });
  return toDetail(appointment);
}

export async function getAppointment(id: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { patient: true, treatmentTypes: { include: { treatmentType: true } } },
  });
  if (!appointment) return null;
  return toDetail(appointment);
}

export interface UpdateAppointmentData {
  patientId?: string;
  startTime?: Date;
  durationMinutes?: number;
  status?: AppointmentStatus;
  notes?: string | null;
  treatmentTypeIds?: string[];
}

/**
 * Updates the appointment's own fields first — if `id` doesn't exist, Prisma's `update` throws
 * P2025, which `withApiErrors` maps to 404. Only after that succeeds does this touch the join
 * table, so an unknown id can never reach `AppointmentTreatmentType.createMany` and surface as a
 * misleading 400 (FK violation) instead of a 404. `treatmentTypeIds`, when present, replaces the
 * whole set via delete-and-recreate in a transaction — safe here since nothing else references an
 * `AppointmentTreatmentType` row's own id.
 */
export async function updateAppointment(id: string, data: UpdateAppointmentData) {
  const { treatmentTypeIds, ...rest } = data;
  await prisma.appointment.update({
    where: { id },
    data: {
      ...rest,
      // Rescheduling must re-arm the reminder — otherwise an appointment whose reminder already
      // went out for its old time would silently never get one for the new time.
      ...(rest.startTime !== undefined ? { reminderSentAt: null } : {}),
    },
  });

  if (treatmentTypeIds) {
    await prisma.$transaction([
      prisma.appointmentTreatmentType.deleteMany({ where: { appointmentId: id } }),
      ...(treatmentTypeIds.length > 0
        ? [
            prisma.appointmentTreatmentType.createMany({
              data: treatmentTypeIds.map((treatmentTypeId) => ({ appointmentId: id, treatmentTypeId })),
            }),
          ]
        : []),
    ]);
  }

  const updated = await getAppointment(id);
  // Non-null: `id` was confirmed to exist by the update above, and nothing here can delete it.
  return updated!;
}

export async function deleteAppointment(id: string): Promise<void> {
  await prisma.appointment.delete({ where: { id } });
}
