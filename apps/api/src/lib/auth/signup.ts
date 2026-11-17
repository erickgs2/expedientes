import type { SignupStartRequest } from '@expedientes/shared-types';
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
  looksLikeEmail,
  normalizeEmail,
} from './email-code';
import { sendEmail } from '../email/send-email';
import { accountExistsEmail, signupCodeEmail } from '../email/templates';
import { areCurrentLegalIds, recordLegalAcceptances } from '../legal/legal-documents';
import { createClinicWithOwner } from '../clinic/create-clinic';
import { createFailureLimiter } from './failure-limiter';

const MAX_NAME_LENGTH = 120;

const codeScope = (email: string) => `signup:${email}`;

/** "Account exists" mails are not stored anywhere, so their resend limit lives here. */
const accountExistsMails = createFailureLimiter({ maxFailures: 3, windowMs: 60 * 60_000 });

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed && trimmed.length <= max ? trimmed : null;
}

/** A Mexican phone: ten digits, optionally with +52 and punctuation. Returns the ten digits. */
export function normalizeMexicanPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2);
  return digits.length === 10 ? digits : null;
}

function invalid(field: string, message: string): ApiProblem {
  return new ApiProblem('INVALID_INPUT', message, 400, { field });
}

export interface ValidSignup {
  email: string;
  password: string;
  fullName: string;
  clinicName: string;
  phone: string;
  privacyDocumentId: string;
  termsDocumentId: string;
  marketingConsent: boolean;
}

export async function validateSignup(body: Partial<SignupStartRequest>): Promise<ValidSignup> {
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
  if (!looksLikeEmail(email)) throw invalid('email', 'A valid email is required');
  if (!isAcceptablePassword(body.password)) {
    throw invalid('password', 'The password must have at least 10 characters');
  }
  const fullName = cleanText(body.fullName, MAX_NAME_LENGTH);
  if (!fullName) throw invalid('fullName', 'Your name is required');
  const clinicName = cleanText(body.clinicName, MAX_NAME_LENGTH);
  if (!clinicName) throw invalid('clinicName', 'The clinic name is required');
  const phone = normalizeMexicanPhone(body.phone);
  if (!phone) throw invalid('phone', 'A 10-digit phone number is required');
  if (!(await areCurrentLegalIds(body.privacyDocumentId, body.termsDocumentId))) {
    // The person must have accepted the versions in force; a stale form reloads them.
    throw new ApiProblem('LEGAL_OUTDATED', 'The privacy notice or terms changed; review them again', 409);
  }
  return {
    email,
    password: body.password,
    fullName,
    clinicName,
    phone,
    privacyDocumentId: body.privacyDocumentId as string,
    termsDocumentId: body.termsDocumentId as string,
    marketingConsent: body.marketingConsent === true,
  };
}

/**
 * Starts a sign-up: stores it as pending and emails a code. Nothing exists yet; the clinic and the
 * account are created when the code is confirmed.
 *
 * Answers identically when the email already has an account (that inbox gets a "you already have
 * an account" message instead), so the form cannot be used to find out who is registered.
 */
export async function startSignup(input: ValidSignup, ip: string, now = new Date()): Promise<number> {
  const existing = await prismaUnscoped.user.findFirst({
    where: { email: { equals: input.email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) {
    if (accountExistsMails.check(input.email).allowed) {
      accountExistsMails.recordFailure(input.email);
      await sendEmail(accountExistsEmail(input.email));
    }
    return 60;
  }

  const pending = await prismaUnscoped.pendingSignup.findUnique({ where: { email: input.email } });
  const decision = decideResend(pending, now);
  // Within the cooldown the newest form data is kept, and the code already sent stays valid.
  const passwordHash = await hashPassword(input.password);
  const data = {
    passwordHash,
    fullName: input.fullName,
    clinicName: input.clinicName,
    phone: input.phone,
    privacyDocumentId: input.privacyDocumentId,
    termsDocumentId: input.termsDocumentId,
    marketingConsent: input.marketingConsent,
    ip: ip === 'unknown' ? null : ip,
  };
  if (!decision.allowed) {
    if (pending) await prismaUnscoped.pendingSignup.update({ where: { id: pending.id }, data });
    return decision.retryAfterSeconds;
  }

  const code = generateCode();
  const codeData = {
    codeHash: hashCode(code, codeScope(input.email)),
    codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
    attempts: 0,
    sendCount: decision.sendCount,
    sendWindowStart: decision.sendWindowStart,
    lastSentAt: now,
  };
  await prismaUnscoped.pendingSignup.upsert({
    where: { email: input.email },
    update: { ...data, ...codeData },
    create: { email: input.email, ...data, ...codeData },
  });
  await sendEmail(signupCodeEmail(input.email, code, CODE_TTL_MINUTES));
  return 60;
}

/** Sends a new code for a pending sign-up. Unknown emails get the same answer and no mail. */
export async function resendSignupCode(rawEmail: unknown, now = new Date()): Promise<number> {
  const email = typeof rawEmail === 'string' ? normalizeEmail(rawEmail) : '';
  const pending = email ? await prismaUnscoped.pendingSignup.findUnique({ where: { email } }) : null;
  if (!pending) return 60;
  const decision = decideResend(pending, now);
  if (!decision.allowed) return decision.retryAfterSeconds;
  const code = generateCode();
  await prismaUnscoped.pendingSignup.update({
    where: { id: pending.id },
    data: {
      codeHash: hashCode(code, codeScope(email)),
      codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
      attempts: 0,
      sendCount: decision.sendCount,
      sendWindowStart: decision.sendWindowStart,
      lastSentAt: now,
    },
  });
  await sendEmail(signupCodeEmail(email, code, CODE_TTL_MINUTES));
  return 60;
}

export interface CreatedAccount {
  userId: string;
  email: string;
  clinicId: string;
}

/**
 * Confirms a sign-up code and, in one transaction, creates the account, the clinic (settings, Admin
 * role, owner membership) and the record of what legal versions were accepted.
 */
export async function verifySignup(
  rawEmail: unknown,
  rawCode: unknown,
  context: { ip: string; userAgent: string | null },
  now = new Date()
): Promise<CreatedAccount> {
  const email = typeof rawEmail === 'string' ? normalizeEmail(rawEmail) : '';
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';
  const pending = email ? await prismaUnscoped.pendingSignup.findUnique({ where: { email } }) : null;
  if (!pending || pending.codeExpiresAt <= now) {
    throw new ApiProblem('CODE_EXPIRED', 'The code expired; request a new one', 400);
  }
  if (pending.attempts >= MAX_CODE_ATTEMPTS) {
    throw new ApiProblem('CODE_LOCKED', 'Too many wrong codes; request a new one', 429);
  }
  if (!codeMatches(code, codeScope(email), pending.codeHash)) {
    const attempts = pending.attempts + 1;
    await prismaUnscoped.pendingSignup.update({ where: { id: pending.id }, data: { attempts } });
    throw new ApiProblem('CODE_INVALID', 'The code is not correct', 400, {
      attemptsLeft: Math.max(0, MAX_CODE_ATTEMPTS - attempts),
    });
  }

  return prismaUnscoped.$transaction(async (tx) => {
    // The email may have been registered by an invitation while this code was pending.
    const taken = await tx.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (taken) {
      await tx.pendingSignup.delete({ where: { id: pending.id } });
      throw new ApiProblem('EMAIL_TAKEN', 'This email already has an account; sign in instead', 409);
    }
    const user = await tx.user.create({
      data: { email, passwordHash: pending.passwordHash, fullName: pending.fullName, language: 'es' },
    });
    const { clinicId } = await createClinicWithOwner(tx, {
      clinicName: pending.clinicName,
      phone: pending.phone,
      ownerUserId: user.id,
    });
    await recordLegalAcceptances(tx, user.id, [pending.privacyDocumentId, pending.termsDocumentId], {
      ip: context.ip,
      userAgent: context.userAgent,
      marketingConsent: pending.marketingConsent,
    });
    await tx.pendingSignup.delete({ where: { id: pending.id } });
    return { userId: user.id, email, clinicId };
  });
}
