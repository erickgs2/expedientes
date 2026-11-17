import type {
  CurrentLegalDocuments,
  LegalDocumentKind,
  LegalDocumentSummary,
  LegalDocumentView,
} from '@expedientes/shared-types';
import type { LegalDocument, Prisma } from '@prisma/client';
import { prismaUnscoped } from '../prisma/client';

export function toLegalSummary(document: LegalDocument): LegalDocumentSummary {
  return {
    id: document.id,
    kind: document.kind,
    version: document.version,
    effectiveFrom: document.effectiveFrom.toISOString(),
    changeSummary: document.changeSummary,
  };
}

export function toLegalView(document: LegalDocument): LegalDocumentView {
  return { ...toLegalSummary(document), body: document.body };
}

/** The version of a document in force: the latest whose effectiveFrom has passed. */
export function currentLegalDocument(kind: LegalDocumentKind, now = new Date()) {
  return prismaUnscoped.legalDocument.findFirst({
    where: { kind, effectiveFrom: { lte: now } },
    orderBy: { effectiveFrom: 'desc' },
  });
}

export class LegalDocumentsMissingError extends Error {
  constructor() {
    super('No privacy notice or terms are published');
    this.name = 'LegalDocumentsMissingError';
  }
}

export async function currentLegalDocuments(now = new Date()): Promise<CurrentLegalDocuments> {
  const [privacy, terms] = await Promise.all([
    currentLegalDocument('PRIVACY', now),
    currentLegalDocument('TERMS', now),
  ]);
  if (!privacy || !terms) throw new LegalDocumentsMissingError();
  return { privacy: toLegalView(privacy), terms: toLegalView(terms) };
}

/**
 * Whether the ids a form sent are the versions in force. A form opened before a new version was
 * published must not record acceptance of the old one.
 */
export async function areCurrentLegalIds(privacyId: unknown, termsId: unknown): Promise<boolean> {
  const current = await currentLegalDocuments();
  return privacyId === current.privacy.id && termsId === current.terms.id;
}

/** Versions in force that require acceptance and that the user has not accepted. */
export async function pendingLegalFor(userId: string, now = new Date()): Promise<LegalDocumentSummary[]> {
  const [privacy, terms] = await Promise.all([
    currentLegalDocument('PRIVACY', now),
    currentLegalDocument('TERMS', now),
  ]);
  const required = [privacy, terms].filter(
    (doc): doc is LegalDocument => Boolean(doc?.requiresAcceptance)
  );
  if (required.length === 0) return [];
  const accepted = await prismaUnscoped.termsAcceptance.findMany({
    where: { userId, documentId: { in: required.map((doc) => doc.id) } },
    select: { documentId: true },
  });
  const acceptedIds = new Set(accepted.map((row) => row.documentId));
  return required.filter((doc) => !acceptedIds.has(doc.id)).map(toLegalSummary);
}

export interface AcceptanceContext {
  ip?: string;
  userAgent?: string | null;
  marketingConsent?: boolean;
}

/** Records acceptances, inside the caller's transaction. Accepting twice is harmless. */
export async function recordLegalAcceptances(
  tx: Prisma.TransactionClient,
  userId: string,
  documentIds: string[],
  context: AcceptanceContext
): Promise<void> {
  const documents = await tx.legalDocument.findMany({
    where: { id: { in: documentIds } },
    select: { id: true, kind: true },
  });
  for (const document of documents) {
    await tx.termsAcceptance.upsert({
      where: { userId_documentId: { userId, documentId: document.id } },
      update: {},
      create: {
        userId,
        documentId: document.id,
        marketingConsent: document.kind === 'PRIVACY' && Boolean(context.marketingConsent),
        ip: context.ip && context.ip !== 'unknown' ? context.ip : null,
        userAgent: context.userAgent?.slice(0, 300) ?? null,
      },
    });
  }
}
