import { prisma } from '../prisma/client';
import { hashContent, stableStringify } from '../signature/content-hash';

/**
 * NOM-004-SSA3-2012 5.10 for the historia clínica: it is updated over the years instead of being
 * locked, so every save keeps the full content as a numbered revision that is never edited. Signing
 * the historia signs its latest revision, and that signature stays on the revision when the
 * historia changes later.
 *
 * A historia saved before revisions existed gets its revision 1 the first time it is saved again or
 * its history is opened, from the content the app reads at that moment (not in the migration), so
 * it hashes and compares exactly like every later revision.
 */

export interface RevisionSignatureStamp {
  signedById: string;
  signedAt: Date;
  signerName: string;
  signerTitle: string | null;
  signerLicense: string;
}

/** Plain JSON as stored: dates become ISO strings, keys sorted. */
const toJson = (content: unknown) => JSON.parse(stableStringify(content)) as object;

export async function latestRevision(historiaClinicaId: string) {
  return prisma.historiaClinicaRevision.findFirst({
    where: { historiaClinicaId },
    orderBy: { revision: 'desc' },
  });
}

/** Writes revision 1 from the historia's current content when it has no revisions yet. */
export async function ensureBaseRevision(historiaClinicaId: string, content: unknown): Promise<void> {
  if (await latestRevision(historiaClinicaId)) return;
  const h = await prisma.historiaClinica.findUnique({ where: { id: historiaClinicaId } });
  if (!h) return;
  await prisma.historiaClinicaRevision.create({
    data: {
      historiaClinicaId,
      revision: 1,
      content: toJson(content),
      contentHash: hashContent(content),
      changedById: h.createdById,
      changedAt: h.updatedAt,
      legacyRecord: h.legacyRecord,
      signedById: h.signedById,
      signedAt: h.signedAt,
      signerName: h.signerName,
      signerTitle: h.signerTitle,
      signerLicense: h.signerLicense,
    },
  });
}

/**
 * Keeps `content` as a new revision unless it is identical to the latest one (a save that changed
 * nothing). Returns the revision that now holds the historia's current content.
 */
export async function recordRevision(
  historiaClinicaId: string,
  content: unknown,
  changedById: string
): Promise<{ id: string; revision: number; created: boolean }> {
  const contentHash = hashContent(content);
  const latest = await latestRevision(historiaClinicaId);
  if (latest && latest.contentHash === contentHash) {
    return { id: latest.id, revision: latest.revision, created: false };
  }
  const saved = await prisma.historiaClinicaRevision.create({
    data: {
      historiaClinicaId,
      revision: (latest?.revision ?? 0) + 1,
      content: toJson(content),
      contentHash,
      changedById,
    },
  });
  return { id: saved.id, revision: saved.revision, created: true };
}

export async function stampRevisionSignature(revisionId: string, stamp: RevisionSignatureStamp): Promise<void> {
  await prisma.historiaClinicaRevision.update({ where: { id: revisionId }, data: stamp });
}

/** One version of the historia as the history list shows it. */
export interface HistoriaRevisionView {
  revision: number;
  changedAt: string;
  changedByName: string | null;
  legacy: boolean;
  signed: { at: string; name: string; title: string | null; license: string | null } | null;
  /** Fields that differ from the previous revision, with both values; empty for revision 1. */
  changes: { field: string; before: unknown; after: unknown }[];
}

/** Every revision of a historia, newest first, each with what changed since the one before. */
export async function listRevisions(historiaClinicaId: string): Promise<HistoriaRevisionView[]> {
  const rows = await prisma.historiaClinicaRevision.findMany({
    where: { historiaClinicaId },
    orderBy: { revision: 'asc' },
  });
  const userIds = [...new Set(rows.map((r) => r.changedById).filter((v): v is string => !!v))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.fullName]));

  const views = rows.map((row, i) => {
    const prev = i > 0 ? (rows[i - 1].content as Record<string, unknown>) : null;
    const cur = row.content as Record<string, unknown>;
    const changes = prev
      ? [...new Set([...Object.keys(prev), ...Object.keys(cur)])]
          .filter((k) => stableStringify(prev[k]) !== stableStringify(cur[k]))
          .sort()
          .map((field) => ({ field, before: prev[field] ?? null, after: cur[field] ?? null }))
      : [];
    return {
      revision: row.revision,
      changedAt: row.changedAt.toISOString(),
      changedByName: row.changedById ? nameOf.get(row.changedById) ?? null : null,
      legacy: row.legacyRecord,
      signed:
        row.signedAt && row.signerName
          ? { at: row.signedAt.toISOString(), name: row.signerName, title: row.signerTitle, license: row.signerLicense }
          : null,
      changes,
    };
  });
  return views.reverse();
}
