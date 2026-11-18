import { NextRequest, NextResponse } from 'next/server';
import type { ClinicListFilter, ClinicListTab } from '@expedientes/shared-types';
import { requirePlatformAdmin } from '../../../../lib/platform/require-admin';
import { listClinics } from '../../../../lib/platform/clinic-rows';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

const TABS: ClinicListTab[] = ['all', 'free', 'premium'];
const FILTERS: ClinicListFilter[] = ['expiring7', 'expiring30', 'pastDue', 'inactive30'];

/** Clinics by plan, with search and follow-up filters. Clinic data only, never patient data. */
export const GET = withApiErrors(async (request: NextRequest) => {
  await requirePlatformAdmin(request);
  const params = request.nextUrl.searchParams;
  const tab = TABS.find((t) => t === params.get('tab')) ?? 'all';
  const filter = FILTERS.find((f) => f === params.get('filter')) ?? null;
  return NextResponse.json(await listClinics({ tab, filter, q: params.get('q') ?? undefined }));
});
