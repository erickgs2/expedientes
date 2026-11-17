import { NextRequest, NextResponse } from 'next/server';
import type { LegalDocumentKind, LegalDocumentPage } from '@expedientes/shared-types';
import { prismaUnscoped } from '../../../../lib/prisma/client';
import {
  currentLegalDocument,
  toLegalSummary,
  toLegalView,
} from '../../../../lib/legal/legal-documents';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

const KINDS: Record<string, LegalDocumentKind> = { privacy: 'PRIVACY', terms: 'TERMS' };

/**
 * Public. One legal document for its page (/privacidad, /terminos): the version in force, or
 * `?version=` for an earlier one, plus the list of versions in force so far.
 */
export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ kind: string }> }) => {
    const kind = KINDS[(await params).kind];
    if (!kind) return apiError('NOT_FOUND', 'Document not found', 404);
    const now = new Date();
    const version = request.nextUrl.searchParams.get('version');
    const document = version
      ? await prismaUnscoped.legalDocument.findFirst({
          where: { kind, version, effectiveFrom: { lte: now } },
        })
      : await currentLegalDocument(kind, now);
    if (!document) return apiError('NOT_FOUND', 'Document not found', 404);
    const versions = await prismaUnscoped.legalDocument.findMany({
      where: { kind, effectiveFrom: { lte: now } },
      orderBy: { effectiveFrom: 'desc' },
    });
    const body: LegalDocumentPage = {
      document: toLegalView(document),
      versions: versions.map(toLegalSummary),
    };
    return NextResponse.json(body);
  }
);
