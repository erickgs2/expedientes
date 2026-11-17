import { NextResponse } from 'next/server';
import type { SignupConfig } from '@expedientes/shared-types';
import { turnstileSiteKey } from '../../../../../lib/auth/turnstile';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

/** Public: what the sign-up form needs before it renders (the CAPTCHA key, when on). */
export const GET = withApiErrors(async () => {
  const body: SignupConfig = { turnstileSiteKey: turnstileSiteKey() };
  return NextResponse.json(body);
});
