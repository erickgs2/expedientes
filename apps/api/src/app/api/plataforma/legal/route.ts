import { NextRequest, NextResponse } from 'next/server';
import type { PublishLegalRequest } from '@expedientes/shared-types';
import { requirePlatformAdmin } from '../../../../lib/platform/require-admin';
import { legalOverview, publishLegal } from '../../../../lib/platform/legal-admin';
import { logPlatformAction } from '../../../../lib/platform/audit';
import { getClientIp } from '../../../../lib/auth/login-throttle';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

/** Every version of the privacy notice and terms, with how many users accepted each. */
export const GET = withApiErrors(async (request: NextRequest) => {
  await requirePlatformAdmin(request);
  return NextResponse.json(await legalOverview());
});

/** Publishes a new version and emails every active user its summary of changes. */
export const POST = withApiErrors(async (request: NextRequest) => {
  const { admin } = await requirePlatformAdmin(request);
  const body = (await request.json()) as Partial<PublishLegalRequest>;
  const { document, recipients } = await publishLegal(body, admin.email);
  await logPlatformAction(
    admin.id,
    'legal.publish',
    { type: 'LegalDocument', id: document.id },
    { kind: document.kind, version: document.version, requiresAcceptance: document.requiresAcceptance, recipients },
    getClientIp(request)
  );
  return NextResponse.json({ recipients }, { status: 201 });
});
