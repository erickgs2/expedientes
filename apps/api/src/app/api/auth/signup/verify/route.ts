import { NextRequest } from 'next/server';
import type { SignupVerifyRequest } from '@expedientes/shared-types';
import { getClientIp } from '../../../../../lib/auth/login-throttle';
import { publicLimits, throttled } from '../../../../../lib/auth/public-throttle';
import { verifySignup } from '../../../../../lib/auth/signup';
import { signInAs } from '../../../../../lib/auth/sign-in';
import { ApiProblem } from '../../../../../lib/http/api-problem';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

/**
 * Public. Confirms the emailed code; creates the account and the clinic, and signs the new owner in.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const ip = getClientIp(request);
  const blocked = throttled(publicLimits.wrongGuesses, ip);
  if (blocked) return blocked;
  const body = (await request.json()) as Partial<SignupVerifyRequest>;
  try {
    const account = await verifySignup(body.email, body.code, {
      ip,
      userAgent: request.headers.get('user-agent'),
    });
    return signInAs(account.userId, account.clinicId);
  } catch (error) {
    if (error instanceof ApiProblem && error.code === 'CODE_INVALID') {
      publicLimits.wrongGuesses.recordFailure(ip);
    }
    throw error;
  }
});
