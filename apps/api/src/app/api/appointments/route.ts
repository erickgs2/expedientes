import { NextRequest, NextResponse } from 'next/server';
import { listAppointments, createAppointment } from '../../../lib/appointment/appointment';
import { writeAuditLogSafe } from '../../../lib/audit/audit-log';
import { requireAuth } from '../../../lib/http/require-auth';
import { apiError } from '../../../lib/http/api-error';
import { withApiErrors } from '../../../lib/http/with-api-errors';

export const GET = withApiErrors(async (request: NextRequest) => {
  const userId = await requireAuth(request, 'appointments', 'view');

  const fromParam = request.nextUrl.searchParams.get('from');
  const toParam = request.nextUrl.searchParams.get('to');
  if (!fromParam || !toParam) {
    return apiError('INVALID_INPUT', 'from and to are required', 400);
  }
  const from = new Date(fromParam);
  const to = new Date(toParam);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return apiError('INVALID_INPUT', 'from and to must be valid dates', 400);
  }

  const appointments = await listAppointments(from, to);

  // Spans every patient in range rather than one record, so no single `patientId` is attributed —
  // matches the precedent set by `PatientSearch` audit entries.
  await writeAuditLogSafe({
    userId,
    action: 'view',
    entity: 'AppointmentList',
    entityId: `${fromParam}..${toParam}`,
  });

  return NextResponse.json({ appointments });
});

interface CreateAppointmentBody {
  patientId?: string;
  startTime?: string;
  durationMinutes?: number;
  notes?: string | null;
  treatmentTypeIds?: string[];
}

export const POST = withApiErrors(async (request: NextRequest) => {
  const userId = await requireAuth(request, 'appointments', 'create');

  const body = (await request.json()) as CreateAppointmentBody;
  if (!body.patientId || !body.startTime || !body.durationMinutes) {
    return apiError('INVALID_INPUT', 'patientId, startTime, and durationMinutes are required', 400);
  }
  const startTime = new Date(body.startTime);
  if (Number.isNaN(startTime.getTime())) {
    return apiError('INVALID_INPUT', 'startTime must be a valid date', 400);
  }
  if (body.durationMinutes <= 0) {
    return apiError('INVALID_INPUT', 'durationMinutes must be positive', 400);
  }

  const appointment = await createAppointment({
    patientId: body.patientId,
    startTime,
    durationMinutes: body.durationMinutes,
    notes: body.notes ?? null,
    treatmentTypeIds: body.treatmentTypeIds ?? [],
  });

  await writeAuditLogSafe({
    userId,
    action: 'create',
    entity: 'Appointment',
    entityId: appointment.id,
    patientId: appointment.patientId,
  });

  return NextResponse.json({ appointment }, { status: 201 });
});
