import { NextRequest, NextResponse } from 'next/server';
import type { PlatformClinicDetail } from '@expedientes/shared-types';
import { prismaUnscoped } from '../../../../../lib/prisma/client';
import { requirePlatformAdmin } from '../../../../../lib/platform/require-admin';
import { loadClinicRows } from '../../../../../lib/platform/clinic-rows';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

/** One clinic: its row, contact data and the history of manual grants. */
export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requirePlatformAdmin(request);
    const { id } = await params;
    const [rows, clinic, grants, payments] = await Promise.all([
      loadClinicRows(),
      prismaUnscoped.clinic.findUnique({ where: { id }, select: { phone: true, timeZone: true } }),
      prismaUnscoped.planGrant.findMany({ where: { clinicId: id }, orderBy: { createdAt: 'desc' } }),
      prismaUnscoped.paymentEvent.findMany({
        where: { clinicId: id, NOT: { summary: 'Ignorado' } },
        orderBy: { receivedAt: 'desc' },
        take: 50,
      }),
    ]);
    const row = rows.find((r) => r.id === id);
    if (!row || !clinic) return apiError('NOT_FOUND', 'Clinic not found', 404);
    const body: PlatformClinicDetail = {
      ...row,
      phone: clinic.phone,
      timeZone: clinic.timeZone,
      grants: grants.map((g) => ({
        id: g.id,
        months: g.months,
        startsAt: g.startsAt.toISOString(),
        endsAt: g.endsAt.toISOString(),
        reason: g.reason,
        grantedBy: g.grantedBy,
        createdAt: g.createdAt.toISOString(),
        revokedAt: g.revokedAt?.toISOString() ?? null,
        revokedReason: g.revokedReason,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        type: p.type,
        amountCents: p.amountCents,
        summary: p.summary,
        receivedAt: p.receivedAt.toISOString(),
      })),
    };
    return NextResponse.json(body);
  }
);
