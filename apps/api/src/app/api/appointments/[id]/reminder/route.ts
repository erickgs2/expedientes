import { NextRequest, NextResponse } from 'next/server';
import { sendReminderNow } from '../../../../../lib/notifications/appointment-notifications';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

/**
 * The front desk's "send reminder now". Responds 200 with the send's outcome even when nothing was
 * sent (switched off, no credentials, bad phone), so the screen can say why; 409 only for
 * `too_soon`, which means the click itself was premature. The audit entry is written by
 * `sendReminderNow`, attributed to the user who pressed the button.
 */
export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'appointments', 'edit');
    const { id } = await params;

    const outcome = await sendReminderNow(id, userId);
    if (!outcome) return apiError('NOT_FOUND', 'Appointment not found', 404);

    return NextResponse.json(outcome, { status: outcome.result === 'too_soon' ? 409 : 200 });
  }
);
