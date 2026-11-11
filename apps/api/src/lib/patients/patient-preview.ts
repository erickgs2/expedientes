import type { PatientPreview, PreviewConsentState } from '@expedientes/shared-types';
import { prisma } from '../prisma/client';
import { getPatientSummaryStats } from './patient-summary';

export interface PreviewAccess {
  historia: boolean;
  treatments: boolean;
  appointments: boolean;
}

/** Whole years between `birth` and `now`, counted on calendar dates (UTC). */
export function ageOn(birth: Date, now: Date): number {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function consentStateOf(consent: { signatureMethod: 'DIGITAL' | 'PAPER' } | null): PreviewConsentState {
  if (!consent) return 'missing';
  return consent.signatureMethod === 'PAPER' ? 'paper' : 'digital';
}

/**
 * The patient search's preview pane. Blocks the caller may not see are not even queried, so a
 * missing permission can never leak through a response field. Returns `null` for an unknown id.
 */
export async function getPatientPreview(
  patientId: string,
  access: PreviewAccess,
  now: Date = new Date()
): Promise<PatientPreview | null> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      fullName: true,
      phone: true,
      documentId: true,
      createdAt: true,
      contactPatientId: true,
      contactPatient: { select: { id: true, fullName: true, phone: true } },
    },
  });
  if (!patient) return null;

  const [stats, historia, nextAppointment, lastTreatment] = await Promise.all([
    getPatientSummaryStats(patientId, { includeTreatmentPhotos: access.treatments }),
    access.historia
      ? prisma.historiaClinica.findUnique({
          where: { patientId },
          select: { fechaNacimiento: true, _count: { select: { allergies: true } } },
        })
      : Promise.resolve(undefined),
    access.appointments
      ? prisma.appointment.findFirst({
          where: { patientId, startTime: { gte: now }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
          orderBy: { startTime: 'asc' },
          select: {
            startTime: true,
            treatmentTypes: { select: { treatmentType: { select: { name: true } } } },
          },
        })
      : Promise.resolve(null),
    access.treatments
      ? prisma.treatment.findFirst({
          where: { patientId },
          orderBy: { fecha: 'desc' },
          select: {
            fecha: true,
            items: {
              select: {
                treatmentType: { select: { name: true } },
                consent: { select: { signatureMethod: true } },
                products: {
                  orderBy: { createdAt: 'asc' },
                  select: { brand: true, lotNumber: true, expiryDate: true },
                },
              },
            },
          },
        })
      : Promise.resolve(null),
  ]);

  return {
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      phone: patient.phone,
      documentId: patient.documentId,
      contactPatientId: patient.contactPatientId,
      contactPatient: patient.contactPatient,
      createdAt: patient.createdAt.toISOString(),
    },
    stats,
    age: historia?.fechaNacimiento ? ageOn(historia.fechaNacimiento, now) : null,
    hasHistoria: historia === undefined ? null : historia !== null,
    hasAllergies: historia === undefined ? null : (historia?._count.allergies ?? 0) > 0,
    nextAppointment: nextAppointment
      ? {
          startTime: nextAppointment.startTime.toISOString(),
          treatmentTypeNames: nextAppointment.treatmentTypes.map((t) => t.treatmentType.name),
        }
      : null,
    lastTreatment: lastTreatment
      ? {
          fecha: lastTreatment.fecha.toISOString(),
          items: lastTreatment.items.map((item) => ({
            treatmentTypeName: item.treatmentType.name,
            consent: consentStateOf(item.consent),
            products: item.products.map((p) => ({
              brand: p.brand,
              lotNumber: p.lotNumber,
              expiryDate: p.expiryDate?.toISOString() ?? null,
            })),
          })),
        }
      : null,
  };
}
