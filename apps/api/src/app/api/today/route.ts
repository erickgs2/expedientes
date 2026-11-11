import { NextRequest, NextResponse } from 'next/server';
import { getTodayDesk } from '../../../lib/today/today-desk';
import { clinicDateOf, isIsoDate } from '../../../lib/today/clinic-day';
import { getUserPermissions } from '../../../lib/rbac/permissions';
import { writeAuditLogSafe } from '../../../lib/audit/audit-log';
import { requireAuth } from '../../../lib/http/require-auth';
import { apiError } from '../../../lib/http/api-error';
import { withApiErrors } from '../../../lib/http/with-api-errors';

/**
 * The front desk ("Hoy · Mostrador"). `date` is a clinic-local `YYYY-MM-DD`, defaulting to today
 * on the clinic's clock, so the day boundary never depends on the browser's or server's zone.
 */
export const GET = withApiErrors(async (request: NextRequest) => {
  const userId = await requireAuth(request, 'appointments', 'view');

  const dateParam = request.nextUrl.searchParams.get('date');
  if (dateParam !== null && !isIsoDate(dateParam)) {
    return apiError('INVALID_INPUT', 'date must be YYYY-MM-DD', 400);
  }
  const date = dateParam ?? clinicDateOf(new Date());

  const granted = await getUserPermissions(userId);
  const desk = await getTodayDesk(date, userId, {
    historia: granted.includes('historia-clinica:view'),
    treatments: granted.includes('treatments:view'),
    patients: granted.includes('patients:view'),
  });

  // Spans every patient of the day, so — like `AppointmentList` — no single patient is attributed.
  await writeAuditLogSafe({ userId, action: 'view', entity: 'TodayDesk', entityId: date });

  return NextResponse.json({ desk });
});
