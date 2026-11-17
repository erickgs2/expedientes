import { NextRequest, NextResponse } from 'next/server';
import type { CodeSentResponse, SignupStartRequest } from '@expedientes/shared-types';
import { getClientIp } from '../../../../lib/auth/login-throttle';
import { publicLimits, throttled } from '../../../../lib/auth/public-throttle';
import { startSignup, validateSignup } from '../../../../lib/auth/signup';
import { verifyTurnstile } from '../../../../lib/auth/turnstile';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

/**
 * Public. Starts a sign-up and emails a 6-digit code. Nothing is created until the code is
 * confirmed (POST /api/auth/signup/verify). The answer is the same whether or not the email already
 * has an account.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const ip = getClientIp(request);
  const blocked = throttled(publicLimits.emailSends, ip);
  if (blocked) return blocked;

  const body = (await request.json()) as Partial<SignupStartRequest>;
  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    return apiError('CAPTCHA_FAILED', 'The verification did not pass; try again', 400);
  }
  const input = await validateSignup(body);
  publicLimits.emailSends.recordFailure(ip);
  const retryAfterSeconds = await startSignup(input, ip);
  const response: CodeSentResponse = { retryAfterSeconds };
  return NextResponse.json(response);
});
