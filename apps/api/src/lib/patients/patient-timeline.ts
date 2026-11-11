import type { PatientTimeline, TimelineEvent, TimelinePhoto } from '@expedientes/shared-types';
import { prisma } from '../prisma/client';
import { consentStateOf } from './patient-preview';

export interface TimelineAccess {
  appointments: boolean;
  valoraciones: boolean;
  treatments: boolean;
}

/** Thumbnails per event: enough to recognise the visit without fetching a whole gallery. */
const THUMBS = 4;

/** Keeps at most one "before" and one "after" first, then fills up to `limit`. */
export function pickThumbnails(photos: TimelinePhoto[], limit = THUMBS): TimelinePhoto[] {
  const before = photos.filter((p) => p.tag === 'BEFORE');
  const after = photos.filter((p) => p.tag === 'AFTER');
  const ordered = [...before.slice(0, 1), ...after.slice(0, 1), ...before.slice(1), ...after.slice(1)];
  return ordered.slice(0, limit);
}

/**
 * Upcoming appointments first (soonest at the top), then everything else newest first. A past
 * appointment that went ahead is left out by the caller: its treatment already tells that story.
 */
export function orderTimeline(events: TimelineEvent[], now: Date): TimelineEvent[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const isUpcoming = (e: TimelineEvent) =>
    e.kind === 'appointment' && new Date(e.date).getTime() >= startOfToday.getTime();
  const upcoming = events
    .filter(isUpcoming)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const past = events
    .filter((e) => !isUpcoming(e))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return [...upcoming, ...past];
}

/** Returns `null` for an unknown patient. Kinds the caller may not see are never queried. */
export async function getPatientTimeline(
  patientId: string,
  access: TimelineAccess,
  now: Date = new Date()
): Promise<PatientTimeline | null> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, createdAt: true },
  });
  if (!patient) return null;

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [appointments, valoraciones, treatments] = await Promise.all([
    access.appointments
      ? prisma.appointment.findMany({
          where: {
            patientId,
            OR: [
              // Today and ahead, unless cancelled.
              { startTime: { gte: startOfToday }, status: { not: 'CANCELLED' } },
              // Missed visits stay on the record.
              { startTime: { lt: startOfToday }, status: 'NO_SHOW' },
            ],
          },
          select: {
            id: true,
            startTime: true,
            status: true,
            notes: true,
            treatmentTypes: { select: { treatmentType: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
    access.valoraciones
      ? prisma.valoracion.findMany({
          where: { patientId },
          select: {
            id: true,
            fecha: true,
            notas: true,
            _count: { select: { diagrams: true, photos: true } },
            photos: { orderBy: { createdAt: 'asc' }, select: { filePath: true, tag: true } },
          },
        })
      : Promise.resolve([]),
    access.treatments
      ? prisma.treatment.findMany({
          where: { patientId },
          select: {
            id: true,
            fecha: true,
            items: {
              select: {
                id: true,
                treatmentType: { select: { name: true } },
                consent: { select: { signatureMethod: true } },
                products: {
                  orderBy: { createdAt: 'asc' },
                  select: { brand: true, lotNumber: true, expiryDate: true },
                },
                photos: { orderBy: { createdAt: 'asc' }, select: { filePath: true, tag: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const events: TimelineEvent[] = [
    ...appointments.map(
      (a): TimelineEvent => ({
        kind: 'appointment',
        id: a.id,
        date: a.startTime.toISOString(),
        status: a.status,
        treatmentTypeNames: a.treatmentTypes.map((t) => t.treatmentType.name),
        notes: a.notes,
      })
    ),
    ...valoraciones.map(
      (v): TimelineEvent => ({
        kind: 'valoracion',
        id: v.id,
        date: v.fecha.toISOString(),
        viewCount: v._count.diagrams,
        photoCount: v._count.photos,
        notes: v.notas,
        photos: pickThumbnails(v.photos.map((p) => ({ path: p.filePath, tag: p.tag }))),
      })
    ),
    ...treatments.map(
      (t): TimelineEvent => ({
        kind: 'treatment',
        id: t.id,
        date: t.fecha.toISOString(),
        items: t.items.map((item) => ({
          id: item.id,
          treatmentTypeName: item.treatmentType.name,
          consent: consentStateOf(item.consent),
          products: item.products.map((p) => ({
            brand: p.brand,
            lotNumber: p.lotNumber,
            expiryDate: p.expiryDate?.toISOString() ?? null,
          })),
          photos: pickThumbnails(item.photos.map((p) => ({ path: p.filePath, tag: p.tag })), 2),
        })),
      })
    ),
    { kind: 'created', id: patient.id, date: patient.createdAt.toISOString() },
  ];

  return { events: orderTimeline(events, now), included: access };
}
