import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '../../../../../lib/platform/require-admin';
import { legalBody } from '../../../../../lib/platform/legal-admin';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

/** The text of one version, to start a new one from it or compare against it. */
export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requirePlatformAdmin(request);
    return NextResponse.json({ body: await legalBody((await params).id) });
  }
);
