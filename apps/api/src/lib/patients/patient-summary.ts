import { prisma } from '../prisma/client';

export interface PatientSummaryStats {
  valoraciones: { count: number; lastDate: string | null };
  /** Everything the photo timeline shows, so the number matches what opening it reveals. */
  photos: { count: number };
  treatments: { count: number; lastDate: string | null };
  appointments: { upcomingCount: number; nextStartTime: string | null };
}

/** Only these two mean "still going to happen"; a cancelled or completed visit is not upcoming. */
const UPCOMING_STATUSES = ['SCHEDULED', 'CONFIRMED'] as const;

/**
 * The at-a-glance counts shown above the clinical-history screen's shortcuts.
 *
 * `includeTreatmentPhotos` mirrors the photo timeline's own permission split: a user without
 * `treatments:view` sees a valoración-only timeline there, so counting treatment photos for them
 * would advertise images the screen will not show.
 *
 * Every query runs in parallel and only aggregates — no row bodies are fetched — because this runs
 * on the landing screen of every patient record.
 */
export async function getPatientSummaryStats(
  patientId: string,
  { includeTreatmentPhotos }: { includeTreatmentPhotos: boolean }
): Promise<PatientSummaryStats> {
  const now = new Date();

  const [
    valoracionCount,
    lastValoracion,
    valoracionPhotoCount,
    treatmentPhotoCount,
    treatmentCount,
    lastTreatment,
    upcomingCount,
    nextAppointment,
  ] = await Promise.all([
    prisma.valoracion.count({ where: { patientId } }),
    prisma.valoracion.findFirst({
      where: { patientId },
      orderBy: { fecha: 'desc' },
      select: { fecha: true },
    }),
    prisma.photo.count({ where: { patientId } }),
    includeTreatmentPhotos
      ? prisma.treatmentItemPhoto.count({ where: { patientId } })
      : Promise.resolve(0),
    prisma.treatment.count({ where: { patientId } }),
    prisma.treatment.findFirst({
      where: { patientId },
      orderBy: { fecha: 'desc' },
      select: { fecha: true },
    }),
    prisma.appointment.count({
      where: { patientId, startTime: { gte: now }, status: { in: [...UPCOMING_STATUSES] } },
    }),
    prisma.appointment.findFirst({
      where: { patientId, startTime: { gte: now }, status: { in: [...UPCOMING_STATUSES] } },
      orderBy: { startTime: 'asc' },
      select: { startTime: true },
    }),
  ]);

  return {
    valoraciones: {
      count: valoracionCount,
      lastDate: lastValoracion ? lastValoracion.fecha.toISOString() : null,
    },
    photos: { count: valoracionPhotoCount + treatmentPhotoCount },
    treatments: {
      count: treatmentCount,
      lastDate: lastTreatment ? lastTreatment.fecha.toISOString() : null,
    },
    appointments: {
      upcomingCount,
      nextStartTime: nextAppointment ? nextAppointment.startTime.toISOString() : null,
    },
  };
}
