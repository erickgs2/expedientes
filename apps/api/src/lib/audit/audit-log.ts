import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

export interface AuditLogInput {
  userId: string;
  action: 'create' | 'update' | 'delete' | 'view';
  entity: string;
  entityId: string;
  patientId?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      patientId: input.patientId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

/**
 * Writes an audit log entry without letting a logging failure fail the caller's request.
 *
 * Route handlers write their audit entry *after* the primary mutation has already committed, so
 * rethrowing here would 500 a request whose write actually succeeded — and a retrying client would
 * then duplicate that write. Availability of the primary operation deliberately does not depend on
 * the audit log succeeding; the failure is logged to the server console instead.
 */
export async function writeAuditLogSafe(input: AuditLogInput): Promise<void> {
  try {
    await writeAuditLog(input);
  } catch (error) {
    console.error('audit log failed', error);
  }
}
