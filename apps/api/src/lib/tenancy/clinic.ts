import { prismaUnscoped } from '../prisma/client';
import { currentClinicId } from './context';

/** Used when a clinic has no time zone stored, and as the column's default. */
export const DEFAULT_CLINIC_TIME_ZONE = 'America/Mexico_City';

/**
 * The IANA time zone the current clinic's day runs on: the front desk's "today", reminder dates and
 * times, consent dates.
 */
export async function currentClinicTimeZone(): Promise<string> {
  const clinic = await prismaUnscoped.clinic.findUnique({
    where: { id: currentClinicId() },
    select: { timeZone: true },
  });
  return clinic?.timeZone || DEFAULT_CLINIC_TIME_ZONE;
}
