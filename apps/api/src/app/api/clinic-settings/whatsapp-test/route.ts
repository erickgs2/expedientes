import { NextRequest, NextResponse } from 'next/server';
import type { WhatsAppTestInput } from '@expedientes/shared-types';
import { sendTestMessage } from '../../../../lib/notifications/appointment-notifications';
import { requireAuth } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

const MAX_PHONE_LENGTH = 30;

/**
 * Sends the stored confirmation or reminder template, with sample values, to a phone the user
 * types — so the clinic can check credentials and templates before switching messages on for
 * real patients. Uses the *saved* settings, not unsaved form values. Gated on `clinic-settings:edit`
 * because it spends the clinic's WhatsApp quota.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const userId = await requireAuth(request, 'clinic-settings', 'edit');

  const body = (await request.json()) as Partial<WhatsAppTestInput>;
  if (body.kind !== 'confirmation' && body.kind !== 'reminder') {
    return apiError('INVALID_INPUT', 'kind must be "confirmation" or "reminder"', 400);
  }
  if (typeof body.phone !== 'string' || !body.phone.trim() || body.phone.length > MAX_PHONE_LENGTH) {
    return apiError('INVALID_INPUT', 'phone is required', 400);
  }

  const outcome = await sendTestMessage(body.kind, body.phone, userId);
  return NextResponse.json(outcome);
});
