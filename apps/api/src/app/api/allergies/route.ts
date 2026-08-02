import { NextRequest, NextResponse } from 'next/server';
import { searchAllergies } from '../../../lib/historia-clinica/historia-clinica';
import { requireAuth } from '../../../lib/http/require-auth';
import { withApiErrors } from '../../../lib/http/with-api-errors';

export const GET = withApiErrors(async (request: NextRequest) => {
  await requireAuth(request, 'historia-clinica', 'view');

  const query = request.nextUrl.searchParams.get('q') ?? '';
  const allergies = await searchAllergies(query);

  return NextResponse.json({ allergies });
});
