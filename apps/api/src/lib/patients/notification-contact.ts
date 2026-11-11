import { prisma } from '../prisma/client';

/**
 * The phone a patient's appointment notices go to: their companion's when they have one linked,
 * otherwise their own. Never chains further — a contact never has a contact of their own.
 */
export function resolveNotificationPhone(patient: {
  phone: string;
  contactPatient?: { phone: string } | null;
}): string {
  return patient.contactPatient?.phone?.trim() || patient.phone;
}

export type ContactLinkError =
  | 'CONTACT_NOT_FOUND'
  | 'CONTACT_IS_SELF'
  | 'CONTACT_HAS_CONTACT'
  | 'CONTACT_HAS_NO_PHONE'
  | 'PATIENT_HAS_DEPENDENTS';

export const CONTACT_LINK_MESSAGES: Record<ContactLinkError, string> = {
  CONTACT_NOT_FOUND: 'The contact patient does not exist',
  CONTACT_IS_SELF: 'A patient cannot be their own contact',
  CONTACT_HAS_CONTACT: 'The contact patient already receives notices through someone else',
  CONTACT_HAS_NO_PHONE: 'The contact patient has no phone number',
  PATIENT_HAS_DEPENDENTS: 'This patient receives notices for others, so cannot use a contact',
};

/**
 * Checks that `contactId` may receive the notices of `patientId` (null for a patient not created
 * yet). Links stay one level deep in both directions, so resolving a phone is a single lookup and a
 * loop is impossible.
 */
export async function checkContactLink(
  patientId: string | null,
  contactId: string
): Promise<ContactLinkError | null> {
  if (patientId && patientId === contactId) return 'CONTACT_IS_SELF';
  const contact = await prisma.patient.findUnique({
    where: { id: contactId },
    select: { phone: true, contactPatientId: true },
  });
  if (!contact) return 'CONTACT_NOT_FOUND';
  if (contact.contactPatientId) return 'CONTACT_HAS_CONTACT';
  if (!contact.phone.trim()) return 'CONTACT_HAS_NO_PHONE';
  if (patientId) {
    const dependents = await prisma.patient.count({ where: { contactPatientId: patientId } });
    if (dependents > 0) return 'PATIENT_HAS_DEPENDENTS';
  }
  return null;
}
