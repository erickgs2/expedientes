/**
 * Rewrites Prisma query arguments so they can only reach the current clinic's rows. Pure: the scoped
 * client (lib/prisma/client.ts) calls it for every operation on a model in TENANT_MODELS.
 *
 * Reads, updates and deletes get `clinicId` added to their `where`; creates get it added to their
 * data. A caller-supplied clinicId is overwritten on reads and rejected on writes, so no argument can
 * reach another clinic.
 *
 * Creates must use plain foreign-key columns (`patientId: ...`), as all of this codebase does, not
 * relation `connect` objects: Prisma refuses to mix the two styles, so a `connect` on a tenant model
 * fails loudly instead of slipping past the scope.
 */

/** Models whose rows belong to one clinic: each has a required `clinicId` column. */
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  'Membership',
  'Role',
  'ClinicSettings',
  'AuditLog',
  'Patient',
  'HistoriaClinica',
  'Allergy',
  'Valoracion',
  'ValoracionDiagram',
  'Photo',
  'TreatmentType',
  'Treatment',
  'TreatmentItem',
  'Consent',
  'ConsentScan',
  'TreatmentItemDiagram',
  'TreatmentItemPhoto',
  'TreatmentItemProduct',
  'Appointment',
]);

/**
 * Link tables with no clinicId of their own. Each row ties together rows of a tenant model, so it is
 * only reachable through a parent that is scoped. Code that queries one of these directly must first
 * confirm the parent belongs to the clinic (see assertInClinic).
 */
export const CHILD_MODELS: ReadonlySet<string> = new Set([
  'RolePermission',
  'HistoriaClinicaAllergy',
  'AppointmentTreatmentType',
  'ConsentScanPage',
]);

/** Shared across clinics. */
export const GLOBAL_MODELS: ReadonlySet<string> = new Set(['Clinic', 'User', 'Permission', 'PlanPrice']);

/**
 * Rows keyed by a clinic that the clinic itself never writes: its paid plan and manual Premium grants.
 * Only the payment flow and the platform portal change them, and plan checks read them, all through
 * prismaUnscoped, so they are not scoped (a clinic request must not even be able to read another
 * clinic's grant through a typo in a filter, and it never needs to write its own).
 */
export const PLATFORM_MODELS: ReadonlySet<string> = new Set(['Subscription', 'PlanGrant']);

export class TenancyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenancyViolationError';
  }
}

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

type Args = Record<string, unknown> | undefined;
type Data = Record<string, unknown>;

export function isTenantModel(model: string | undefined): boolean {
  return model !== undefined && TENANT_MODELS.has(model);
}

function withClinic(data: unknown, clinicId: string): Data {
  const record = (data ?? {}) as Data;
  if ('clinic' in record) {
    throw new TenancyViolationError('Use clinicId-free creates; the clinic is set automatically');
  }
  if ('clinicId' in record && record['clinicId'] !== clinicId) {
    throw new TenancyViolationError('Cannot create a row for another clinic');
  }
  return { ...record, clinicId };
}

function assertClinicUnchanged(data: unknown): void {
  const record = (data ?? {}) as Data;
  if ('clinicId' in record || 'clinic' in record) {
    throw new TenancyViolationError('A row cannot be moved to another clinic');
  }
}

export function scopeQueryArgs(operation: string, args: Args, clinicId: string): Args {
  const scoped: Data = { ...(args ?? {}) };

  if (WHERE_OPERATIONS.has(operation)) {
    scoped['where'] = { ...((scoped['where'] as Data | undefined) ?? {}), clinicId };
  }

  switch (operation) {
    case 'create':
      scoped['data'] = withClinic(scoped['data'], clinicId);
      break;
    case 'createMany':
    case 'createManyAndReturn': {
      const data = scoped['data'];
      scoped['data'] = Array.isArray(data)
        ? data.map((row) => withClinic(row, clinicId))
        : withClinic(data, clinicId);
      break;
    }
    case 'upsert':
      scoped['create'] = withClinic(scoped['create'], clinicId);
      assertClinicUnchanged(scoped['update']);
      break;
    case 'update':
    case 'updateMany':
      assertClinicUnchanged(scoped['data']);
      break;
  }

  return scoped;
}
