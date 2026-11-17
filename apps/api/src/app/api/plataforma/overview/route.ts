import { NextRequest, NextResponse } from 'next/server';
import type { PlatformOverview } from '@expedientes/shared-types';
import { prismaUnscoped } from '../../../../lib/prisma/client';
import { requirePlatformAdmin } from '../../../../lib/platform/require-admin';
import { loadClinicRows } from '../../../../lib/platform/clinic-rows';
import { currentServerMetrics, serverMetricSeries } from '../../../../lib/platform/server-metrics';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

const DAY = 86_400_000;

/** The portal's front page: clinics at a glance, revenue estimate and the server's load. */
export const GET = withApiErrors(async (request: NextRequest) => {
  await requirePlatformAdmin(request);
  const now = new Date();
  const [rows, subscriptions, server, series] = await Promise.all([
    loadClinicRows(now),
    prismaUnscoped.subscription.findMany({ include: { price: true } }),
    currentServerMetrics().catch(() => null),
    serverMetricSeries(24),
  ]);
  const premium = rows.filter((row) => row.tier === 'PREMIUM');
  const paid = premium.filter((row) => row.source === 'SUBSCRIPTION');
  const paidIds = new Set(paid.map((row) => row.id));
  const mrrCents = subscriptions
    .filter((s) => paidIds.has(s.clinicId) && s.price)
    .reduce(
      (sum, s) => sum + (s.interval === 'YEAR' ? Math.round((s.price?.annualCents ?? 0) / 12) : s.price?.monthlyCents ?? 0),
      0
    );
  const body: PlatformOverview = {
    clinics: {
      total: rows.length,
      active: rows.filter((row) => row.status === 'ACTIVE').length,
      suspended: rows.filter((row) => row.status === 'SUSPENDED').length,
      new7d: rows.filter((row) => now.getTime() - new Date(row.createdAt).getTime() <= 7 * DAY).length,
      new30d: rows.filter((row) => now.getTime() - new Date(row.createdAt).getTime() <= 30 * DAY).length,
      free: rows.length - premium.length,
      premium: premium.length,
      premiumPaid: paid.length,
      premiumGranted: premium.length - paid.length,
    },
    mrrCents,
    paidConversionPercent: rows.length ? Math.round((paid.length / rows.length) * 1000) / 10 : 0,
    server,
    series,
  };
  return NextResponse.json(body);
});
