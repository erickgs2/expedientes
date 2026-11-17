import { NextRequest } from 'next/server';
import type { PasswordResetConfirmRequest } from '@expedientes/shared-types';
import { getClientIp } from '../../../../../lib/auth/login-throttle';
import { publicLimits, throttled } from '../../../../../lib/auth/public-throttle';
import { confirmPasswordReset } from '../../../../../lib/auth/password-reset';
import { signInAs } from '../../../../../lib/auth/sign-in';
import { ApiProblem } from '../../../../../lib/http/api-problem';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

/** Public. Checks the code, sets the new password and signs the user in. */
export const POST = withApiErrors(async (request: NextRequest) => {
  const ip = getClientIp(request);
  const blocked = throttled(publicLimits.wrongGuesses, ip);
  if (blocked) return blocked;
  const body = (await request.json()) as Partial<PasswordResetConfirmRequest>;
  try {
    const user = await confirmPasswordReset(body.email, body.code, body.newPassword);
    return signInAs(user.id);
  } catch (error) {
    if (error instanceof ApiProblem && error.code === 'CODE_INVALID') {
      publicLimits.wrongGuesses.recordFailure(ip);
    }
    throw error;
  }
});
