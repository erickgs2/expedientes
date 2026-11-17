import { prismaUnscoped } from '../prisma/client';
import { ApiProblem } from '../http/api-problem';
import { hashPassword } from './password';
import {
  CODE_TTL_MINUTES,
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  codeMatches,
  decideResend,
  generateCode,
  hashCode,
  isAcceptablePassword,
  normalizeEmail,
} from './email-code';
import { sendEmail } from '../email/send-email';
import { passwordResetCodeEmail } from '../email/templates';

const codeScope = (userId: string) => `reset:${userId}`;

function findUserByEmail(email: string) {
  return prismaUnscoped.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, active: true },
    select: { id: true, email: true },
  });
}

/**
 * Emails a reset code. Answers the same for an unknown or inactive email, so the form cannot tell
 * who has an account.
 */
export async function requestPasswordReset(rawEmail: unknown, now = new Date()): Promise<number> {
  const email = typeof rawEmail === 'string' ? normalizeEmail(rawEmail) : '';
  const user = email ? await findUserByEmail(email) : null;
  if (!user) return 60;
  const existing = await prismaUnscoped.passwordResetCode.findUnique({ where: { userId: user.id } });
  const decision = decideResend(existing, now);
  if (!decision.allowed) return decision.retryAfterSeconds;
  const code = generateCode();
  const data = {
    codeHash: hashCode(code, codeScope(user.id)),
    codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
    attempts: 0,
    sendCount: decision.sendCount,
    sendWindowStart: decision.sendWindowStart,
    lastSentAt: now,
  };
  await prismaUnscoped.passwordResetCode.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  });
  await sendEmail(passwordResetCodeEmail(user.email, code, CODE_TTL_MINUTES));
  return 60;
}

/** Checks the code and sets the new password. Returns the user so the caller can sign them in. */
export async function confirmPasswordReset(
  rawEmail: unknown,
  rawCode: unknown,
  newPassword: unknown,
  now = new Date()
): Promise<{ id: string; email: string }> {
  if (!isAcceptablePassword(newPassword)) {
    throw new ApiProblem('INVALID_INPUT', 'The password must have at least 10 characters', 400, {
      field: 'newPassword',
    });
  }
  const email = typeof rawEmail === 'string' ? normalizeEmail(rawEmail) : '';
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';
  const user = email ? await findUserByEmail(email) : null;
  const reset = user
    ? await prismaUnscoped.passwordResetCode.findUnique({ where: { userId: user.id } })
    : null;
  if (!user || !reset || reset.codeExpiresAt <= now) {
    throw new ApiProblem('CODE_EXPIRED', 'The code expired; request a new one', 400);
  }
  if (reset.attempts >= MAX_CODE_ATTEMPTS) {
    throw new ApiProblem('CODE_LOCKED', 'Too many wrong codes; request a new one', 429);
  }
  if (!codeMatches(code, codeScope(user.id), reset.codeHash)) {
    const attempts = reset.attempts + 1;
    await prismaUnscoped.passwordResetCode.update({ where: { id: reset.id }, data: { attempts } });
    throw new ApiProblem('CODE_INVALID', 'The code is not correct', 400, {
      attemptsLeft: Math.max(0, MAX_CODE_ATTEMPTS - attempts),
    });
  }
  const passwordHash = await hashPassword(newPassword);
  await prismaUnscoped.$transaction([
    prismaUnscoped.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prismaUnscoped.passwordResetCode.delete({ where: { id: reset.id } }),
  ]);
  return user;
}
