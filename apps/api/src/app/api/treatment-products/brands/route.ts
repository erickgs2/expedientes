import { NextRequest, NextResponse } from 'next/server';
import { listBrands } from '../../../../lib/treatment/treatment-product';
import { requireAuth } from '../../../../lib/http/require-auth';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

export const GET = withApiErrors(async (request: NextRequest) => {
  await requireAuth(request, 'treatments', 'view');
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ brands: [] });
  const brands = await listBrands(q);
  return NextResponse.json({ brands });
});
