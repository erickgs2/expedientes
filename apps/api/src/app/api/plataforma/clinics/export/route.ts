import { NextRequest, NextResponse } from 'next/server';
import type { ClinicListFilter, ClinicListTab } from '@expedientes/shared-types';
import { requirePlatformAdmin } from '../../../../../lib/platform/require-admin';
import { clinicsCsv, listClinics } from '../../../../../lib/platform/clinic-rows';
import { logPlatformAction } from '../../../../../lib/platform/audit';
import { getClientIp } from '../../../../../lib/auth/login-throttle';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

const TABS: ClinicListTab[] = ['all', 'free', 'premium'];
const FILTERS: ClinicListFilter[] = ['expiring7', 'expiring30', 'pastDue', 'inactive30'];

/** The clinic list as CSV, with the same tab, search and filter as the screen. */
export const GET = withApiErrors(async (request: NextRequest) => {
  const { admin } = await requirePlatformAdmin(request);
  const params = request.nextUrl.searchParams;
  const tab = TABS.find((t) => t === params.get('tab')) ?? 'all';
  const filter = FILTERS.find((f) => f === params.get('filter')) ?? null;
  const { rows } = await listClinics({ tab, filter, q: params.get('q') ?? undefined });
  await logPlatformAction(admin.id, 'clinics.export', {}, { tab, filter, count: rows.length }, getClientIp(request));
  return new NextResponse(clinicsCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="clinicas-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
