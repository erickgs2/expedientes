import { NextRequest, NextResponse } from 'next/server';
import { getRecentPatients } from '../../../../lib/patients/recent-patients';
import { requireAuth } from '../../../../lib/http/require-auth';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

const LIMIT = 15;

/**
 * The patients the current user opened last. Not audited: it only lists names the same user has
 * already opened, each of which was audited when it was read.
 */
export const GET = withApiErrors(async (request: NextRequest) => {
  const userId = await requireAuth(request, 'patients', 'view');
  const patients = await getRecentPatients(userId, LIMIT);
  return NextResponse.json({ patients });
});
