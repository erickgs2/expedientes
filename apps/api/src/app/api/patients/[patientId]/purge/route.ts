import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma/client';
import { deletePatient } from '../../../../../lib/patients/patient-delete';
import { lastCareAt, purgeAllowedFrom } from '../../../../../lib/patients/patient-archive';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

async function isOwner(userId: string): Promise<boolean> {
  return (await prisma.membership.count({ where: { userId, isOwner: true } })) > 0;
}

/** When this patient's record could be purged, for the owner's screen. */
export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'patients', 'delete');
    const { patientId } = await params;
    const lastCare = await lastCareAt(patientId);
    if (!lastCare) return apiError('NOT_FOUND', 'Patient not found', 404);
    const allowedFrom = purgeAllowedFrom(lastCare);
    return NextResponse.json({
      lastCareAt: lastCare.toISOString(),
      purgeAllowedFrom: allowedFrom.toISOString(),
      canPurge: (await isOwner(userId)) && allowedFrom <= new Date(),
    });
  }
);

/**
 * Deletes an archived patient's record and files for good. Only the clinic's owner, only for an
 * archived patient, only once five years have passed since the last care (NOM-004-SSA3-2012 5.4),
 * and only when the request repeats the patient's full name. The audit entry outlives the record and
 * keeps the name and dates, so there is always a trace of what was purged and why it was allowed.
 */
export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'patients', 'delete');
    if (!(await isOwner(userId))) {
      return apiError('OWNER_ONLY', 'Only the clinic owner can purge a record', 403);
    }
    const { patientId } = await params;
    const body = (await request.json().catch(() => ({}))) as { confirmName?: unknown };

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { fullName: true, archivedAt: true, createdAt: true },
    });
    if (!patient) return apiError('NOT_FOUND', 'Patient not found', 404);
    if (!patient.archivedAt) return apiError('NOT_ARCHIVED', 'Archive the patient before purging the record', 409);
    if (typeof body.confirmName !== 'string' || body.confirmName.trim() !== patient.fullName.trim()) {
      return apiError('CONFIRMATION_MISMATCH', "confirmName must match the patient's full name", 400);
    }
    const lastCare = (await lastCareAt(patientId)) ?? patient.createdAt;
    const allowedFrom = purgeAllowedFrom(lastCare);
    if (allowedFrom > new Date()) {
      return apiError('RETENTION_PERIOD', 'The record must be kept five years after the last care', 409, {
        purgeAllowedFrom: allowedFrom.toISOString(),
      });
    }

    await deletePatient(patientId);
    await writeAuditLogSafe({
      userId,
      action: 'purge',
      entity: 'Patient',
      entityId: patientId,
      patientId,
      metadata: {
        fullName: patient.fullName,
        archivedAt: patient.archivedAt.toISOString(),
        lastCareAt: lastCare.toISOString(),
      },
    });
    return new NextResponse(null, { status: 204 });
  }
);
