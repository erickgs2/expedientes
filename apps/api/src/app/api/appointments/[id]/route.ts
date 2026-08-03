import { NextRequest, NextResponse } from 'next/server';
import type { AppointmentStatus } from '@prisma/client';
import {
  getAppointment,
  updateAppointment,
  deleteAppointment,
} from '../../../../lib/appointment/appointment';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

const VALID_STATUSES: AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'appointments', 'view');
    const { id } = await params;

    const appointment = await getAppointment(id);
    if (!appointment) return apiError('NOT_FOUND', 'Appointment not found', 404);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'Appointment',
      entityId: appointment.id,
      patientId: appointment.patientId,
    });

    return NextResponse.json({ appointment });
  }
);

interface UpdateAppointmentBody {
  patientId?: string;
  startTime?: string;
  durationMinutes?: number;
  status?: AppointmentStatus;
  notes?: string | null;
  treatmentTypeIds?: string[];
}

export const PATCH = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'appointments', 'edit');
    const { id } = await params;
    const body = (await request.json()) as UpdateAppointmentBody;

    if (body.startTime !== undefined && Number.isNaN(new Date(body.startTime).getTime())) {
      return apiError('INVALID_INPUT', 'startTime must be a valid date', 400);
    }
    if (body.durationMinutes !== undefined && body.durationMinutes <= 0) {
      return apiError('INVALID_INPUT', 'durationMinutes must be positive', 400);
    }
    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      return apiError('INVALID_INPUT', `Unknown status "${body.status}"`, 400);
    }

    // No existence pre-check needed: `updateAppointment` throws Prisma's P2025 for an unknown id,
    // which `withApiErrors` already maps to a 404.
    const appointment = await updateAppointment(id, {
      patientId: body.patientId,
      startTime: body.startTime !== undefined ? new Date(body.startTime) : undefined,
      durationMinutes: body.durationMinutes,
      status: body.status,
      notes: body.notes,
      treatmentTypeIds: body.treatmentTypeIds,
    });

    await writeAuditLogSafe({
      userId,
      action: 'update',
      entity: 'Appointment',
      entityId: appointment.id,
      patientId: appointment.patientId,
    });

    return NextResponse.json({ appointment });
  }
);

export const DELETE = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'appointments', 'delete');
    const { id } = await params;

    const appointment = await getAppointment(id);
    if (!appointment) return apiError('NOT_FOUND', 'Appointment not found', 404);

    await deleteAppointment(id);

    await writeAuditLogSafe({
      userId,
      action: 'delete',
      entity: 'Appointment',
      entityId: id,
      patientId: appointment.patientId,
    });

    return NextResponse.json({ ok: true });
  }
);
