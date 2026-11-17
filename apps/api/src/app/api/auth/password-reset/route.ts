import { NextRequest, NextResponse } from 'next/server';
import type { CodeSentResponse, PasswordResetRequest } from '@expedientes/shared-types';
import { getClientIp } from '../../../../lib/auth/login-throttle';
import { publicLimits, throttled } from '../../../../lib/auth/public-throttle';
import { requestPasswordReset } from '../../../../lib/auth/password-reset';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

/** Public. Emails a code to reset the password; the same answer for unknown emails. */
export const POST = withApiErrors(async (request: NextRequest) => {
  const ip = getClientIp(request);
  const blocked = throttled(publicLimits.emailSends, ip);
  if (blocked) return blocked;
  const { email } = (await request.json()) as Partial<PasswordResetRequest>;
  publicLimits.emailSends.recordFailure(ip);
  const response: CodeSentResponse = { retryAfterSeconds: await requestPasswordReset(email) };
  return NextResponse.json(response);
});
