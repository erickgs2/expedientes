import { prisma } from '../prisma/client';

/** An id named in a request belongs to no row of the current clinic. Answered as 404. */
export class NotInClinicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotInClinicError';
  }
}

type ScopedDelegate = { count(args: { where: { id: { in: string[] } } }): Promise<number> };

/**
 * Confirms that every id belongs to the current clinic, before it is written into another row.
 *
 * Foreign keys check that a referenced row exists, not whose it is, and ids are global. A request
 * naming another clinic's treatment type, patient or role would otherwise link to it, and later
 * reads that follow the link would show that clinic's data. Call this wherever ids from the request
 * body are stored as references.
 */
export async function assertInClinic(
  model: 'patient' | 'treatmentType' | 'treatment' | 'treatmentItem' | 'valoracion' | 'role' | 'appointment',
  ids: Iterable<string | null | undefined>
): Promise<void> {
  const unique = [...new Set([...ids].filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return;
  const delegate = (prisma as unknown as Record<string, ScopedDelegate>)[model];
  const found = await delegate.count({ where: { id: { in: unique } } });
  if (found !== unique.length) {
    throw new NotInClinicError(`${model} not found`);
  }
}
