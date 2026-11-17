import { NextRequest, NextResponse } from 'next/server';
import type { CodeSentResponse } from '@expedientes/shared-types';
import { getClientIp } from '../../../../../lib/auth/login-throttle';
import { publicLimits, throttled } from '../../../../../lib/auth/public-throttle';
import { resendSignupCode } from '../../../../../lib/auth/signup';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

/** Public. Sends a new code for a pending sign-up (at most one a minute, five an hour). */
export const POST = withApiErrors(async (request: NextRequest) => {
  const ip = getClientIp(request);
  const blocked = throttled(publicLimits.emailSends, ip);
  if (blocked) return blocked;
  const { email } = (await request.json()) as { email?: string };
  publicLimits.emailSends.recordFailure(ip);
  const response: CodeSentResponse = { retryAfterSeconds: await resendSignupCode(email) };
  return NextResponse.json(response);
});
