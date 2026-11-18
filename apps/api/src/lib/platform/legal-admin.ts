import type {
  LegalDocumentKind,
  PlatformLegalOverview,
  PlatformLegalVersion,
  PublishLegalRequest,
} from '@expedientes/shared-types';
import { prismaUnscoped } from '../prisma/client';
import { ApiProblem } from '../http/api-problem';
import { findLegalPlaceholders } from '../shared/runtime';
import { toLegalSummary } from '../legal/legal-documents';
import { sendEmail } from '../email/send-email';
import { legalChangedEmail } from '../email/templates';

/** Users who would be told about a change: active accounts with an active membership. */
function activeUsersWhere() {
  return { active: true, memberships: { some: { active: true, clinic: { status: 'ACTIVE' as const } } } };
}

export async function legalOverview(now = new Date()): Promise<PlatformLegalOverview> {
  const [documents, counts, activeUsers] = await Promise.all([
    prismaUnscoped.legalDocument.findMany({ orderBy: { effectiveFrom: 'desc' } }),
    prismaUnscoped.termsAcceptance.groupBy({ by: ['documentId'], _count: { _all: true } }),
    prismaUnscoped.user.count({ where: activeUsersWhere() }),
  ]);
  const countBy = new Map(counts.map((row) => [row.documentId, row._count._all]));
  const byKind: Record<LegalDocumentKind, PlatformLegalVersion[]> = { PRIVACY: [], TERMS: [] };
  for (const kind of ['PRIVACY', 'TERMS'] as const) {
    const ofKind = documents.filter((doc) => doc.kind === kind);
    const current = ofKind.find((doc) => doc.effectiveFrom <= now);
    byKind[kind] = ofKind.map((doc) => ({
      ...toLegalSummary(doc),
      requiresAcceptance: doc.requiresAcceptance,
      publishedBy: doc.publishedBy,
      acceptedCount: countBy.get(doc.id) ?? 0,
      current: doc.id === current?.id,
    }));
  }
  return { activeUsers, documents: byKind };
}

export async function legalBody(id: string): Promise<string> {
  const doc = await prismaUnscoped.legalDocument.findUnique({ where: { id }, select: { body: true } });
  if (!doc) throw new ApiProblem('NOT_FOUND', 'Document not found', 404);
  return doc.body;
}

const VERSION_PATTERN = /^\d{1,3}(\.\d{1,3}){0,2}$/;

/**
 * Publishes a new version. Published versions are never edited. A text that still has bracketed
 * placeholders is refused. Every active user is then emailed the summary of changes, in the
 * background and paced for the email provider's rate limit.
 */
export async function publishLegal(input: Partial<PublishLegalRequest>, adminEmail: string, now = new Date()) {
  if (input.kind !== 'PRIVACY' && input.kind !== 'TERMS') {
    throw new ApiProblem('INVALID_INPUT', 'Unknown document kind', 400, { field: 'kind' });
  }
  const version = typeof input.version === 'string' ? input.version.trim() : '';
  if (!VERSION_PATTERN.test(version)) {
    throw new ApiProblem('INVALID_INPUT', 'Use a version like 1.1 or 2.0', 400, { field: 'version' });
  }
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (body.length < 200 || body.length > 200_000) {
    throw new ApiProblem('INVALID_INPUT', 'The text is missing or too long', 400, { field: 'body' });
  }
  const placeholders = findLegalPlaceholders(body);
  if (placeholders.length) {
    throw new ApiProblem('LEGAL_PLACEHOLDERS', 'The text still has placeholders to fill in', 400, { placeholders });
  }
  const changeSummary = typeof input.changeSummary === 'string' ? input.changeSummary.trim() : '';
  if (changeSummary.length < 3 || changeSummary.length > 2000) {
    throw new ApiProblem('INVALID_INPUT', 'Summarize what changes', 400, { field: 'changeSummary' });
  }
  const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : now;
  if (Number.isNaN(effectiveFrom.getTime()) || effectiveFrom.getTime() < now.getTime() - 5 * 60_000) {
    throw new ApiProblem('INVALID_INPUT', 'The effective date cannot be in the past', 400, { field: 'effectiveFrom' });
  }
  const exists = await prismaUnscoped.legalDocument.count({ where: { kind: input.kind, version } });
  if (exists) throw new ApiProblem('CONFLICT', `Version ${version} already exists`, 409, { field: 'version' });

  const document = await prismaUnscoped.legalDocument.create({
    data: {
      kind: input.kind,
      version,
      body,
      changeSummary,
      effectiveFrom,
      requiresAcceptance: input.requiresAcceptance === true,
      publishedBy: adminEmail,
    },
  });

  const recipients = await prismaUnscoped.user.findMany({ where: activeUsersWhere(), select: { email: true } });
  void notifyInBackground(
    recipients.map((user) => user.email),
    (to) =>
      legalChangedEmail(to, {
        kind: document.kind,
        version: document.version,
        changeSummary: document.changeSummary,
        effectiveFrom: document.effectiveFrom,
        requiresAcceptance: document.requiresAcceptance,
      })
  );
  return { document, recipients: recipients.length };
}

/** Sends one email at a time, about two a second, logging failures without stopping. */
async function notifyInBackground(
  addresses: string[],
  build: (to: string) => Parameters<typeof sendEmail>[0]
): Promise<void> {
  for (const to of addresses) {
    try {
      await sendEmail(build(to));
    } catch (error) {
      console.error(`Could not email a legal change to ${to}`, error);
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
}
