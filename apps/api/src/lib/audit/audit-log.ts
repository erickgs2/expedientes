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
      metadata: input.metadata,
    },
  });
}
