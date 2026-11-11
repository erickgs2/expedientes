import type { RecentPatient } from '@expedientes/shared-types';
import { prisma } from '../prisma/client';

/** How many audit rows to scan for distinct recent patients; plenty for a short list. */
const RECENT_SCAN = 80;

/** Keeps the first entry per patient, in order, up to `limit`. */
export function latestDistinctPatients<T extends { patientId: string }>(entries: T[], limit: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of entries) {
    if (seen.has(entry.patientId)) continue;
    seen.add(entry.patientId);
    out.push(entry);
    if (out.length === limit) break;
  }
  return out;
}

/**
 * The patients this user opened most recently, read from their own `view` audit entries — so the
 * list reflects real use without a separate "recents" table to keep in sync. Patients deleted since
 * are left out.
 */
export async function getRecentPatients(userId: string, limit: number): Promise<RecentPatient[]> {
  const audit = await prisma.auditLog.findMany({
    where: { userId, action: 'view', patientId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: RECENT_SCAN,
    select: { patientId: true, entity: true, createdAt: true },
  });
  const latest = latestDistinctPatients(
    audit.map((r) => ({ patientId: r.patientId as string, entity: r.entity, createdAt: r.createdAt })),
    limit
  );
  if (latest.length === 0) return [];
  const patients = await prisma.patient.findMany({
    where: { id: { in: latest.map((l) => l.patientId) } },
    select: { id: true, fullName: true },
  });
  const names = new Map(patients.map((p) => [p.id, p.fullName]));
  return latest
    .filter((l) => names.has(l.patientId))
    .map((l) => ({
      patientId: l.patientId,
      patientName: names.get(l.patientId) as string,
      entity: l.entity,
      viewedAt: l.createdAt.toISOString(),
    }));
}
