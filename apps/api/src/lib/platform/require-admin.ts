import type { NextRequest } from 'next/server';
import type { PlatformAdmin } from '@prisma/client';
import { prismaUnscoped } from '../prisma/client';
import { ApiProblem } from '../http/api-problem';
import { readPlatformSession, type PlatformStage } from './session';

/**
 * The signed-in platform admin, or a 401. Only a full session (password and TOTP) passes, unless the
 * caller is one of the sign-in steps that accepts a pending stage.
 */
export async function requirePlatformAdmin(
  request: NextRequest,
  allowedStages: PlatformStage[] = ['full']
): Promise<{ admin: PlatformAdmin; stage: PlatformStage }> {
  const session = readPlatformSession(request);
  if (!session || !allowedStages.includes(session.stage)) {
    throw new ApiProblem('UNAUTHENTICATED', 'Not signed in to the platform', 401);
  }
  const admin = await prismaUnscoped.platformAdmin.findUnique({ where: { id: session.sub } });
  if (!admin || !admin.active) throw new ApiProblem('UNAUTHENTICATED', 'Not signed in to the platform', 401);
  if (session.stage === 'full' && !admin.totpEnabledAt) {
    throw new ApiProblem('UNAUTHENTICATED', 'Not signed in to the platform', 401);
  }
  return { admin, stage: session.stage };
}
