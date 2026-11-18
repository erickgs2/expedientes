import { NextResponse } from 'next/server';
import { clearPlatformCookie } from '../../../../../lib/platform/session';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

export const POST = withApiErrors(async () => {
  const response = NextResponse.json({ ok: true });
  clearPlatformCookie(response);
  return response;
});
