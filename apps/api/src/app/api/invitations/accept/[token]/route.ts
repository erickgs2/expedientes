import { NextRequest, NextResponse } from 'next/server';
import type { AcceptInvitationRequest } from '@expedientes/shared-types';
import { getClientIp } from '../../../../../lib/auth/login-throttle';
import { publicLimits, throttled } from '../../../../../lib/auth/public-throttle';
import { acceptInvitation, previewInvitation } from '../../../../../lib/invitations/invitations';
import { signInAs } from '../../../../../lib/auth/sign-in';
import { ApiProblem } from '../../../../../lib/http/api-problem';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

type Params = { params: Promise<{ token: string }> };

/** Public. What the invitation link offers: clinic, role, and whether the email has an account. */
export const GET = withApiErrors(async (request: NextRequest, { params }: Params) => {
  const ip = getClientIp(request);
  const blocked = throttled(publicLimits.wrongGuesses, ip);
  if (blocked) return blocked;
  try {
    return NextResponse.json(await previewInvitation((await params).token));
  } catch (error) {
    if (error instanceof ApiProblem) publicLimits.wrongGuesses.recordFailure(ip);
    throw error;
  }
});

/** Public. Accepts the invitation and signs the person in to that clinic. */
export const POST = withApiErrors(async (request: NextRequest, { params }: Params) => {
  const ip = getClientIp(request);
  const blocked = throttled(publicLimits.wrongGuesses, ip);
  if (blocked) return blocked;
  const body = (await request.json()) as Partial<AcceptInvitationRequest>;
  try {
    const account = await acceptInvitation((await params).token, body, {
      ip,
      userAgent: request.headers.get('user-agent'),
    });
    return signInAs(account.userId, account.clinicId);
  } catch (error) {
    if (error instanceof ApiProblem && ['INVALID_CREDENTIALS', 'INVITATION_INVALID'].includes(error.code)) {
      publicLimits.wrongGuesses.recordFailure(ip);
    }
    throw error;
  }
});
