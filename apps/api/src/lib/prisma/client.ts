import { PrismaClient } from '@prisma/client';
import { currentClinicId } from '../tenancy/context';
import { isTenantModel, scopeQueryArgs } from '../tenancy/scope';

const globalForPrisma = globalThis as unknown as { prismaUnscoped?: PrismaClient };

/**
 * The raw client, which sees every clinic. Only for code that must work across clinics or before a
 * clinic is known: login and membership lookups, the reminder sweep listing clinics, seeds. Anything
 * that serves a clinic's own data uses `prisma` below.
 */
export const prismaUnscoped = globalForPrisma.prismaUnscoped ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaUnscoped = prismaUnscoped;
}

/**
 * The client the app uses. Every operation on a clinic's data (see TENANT_MODELS) is limited to the
 * clinic of the current request: reads and writes get `clinicId` added, and a query with no clinic
 * set throws instead of running unfiltered. Global models (Clinic, User, Permission) pass through.
 *
 * Raw SQL ($queryRaw, $executeRaw) is NOT scoped: it must filter by currentClinicId() itself.
 */
export const prisma = prismaUnscoped.$extends({
  name: 'clinic-scope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!isTenantModel(model)) return query(args);
        const scoped = scopeQueryArgs(operation, args as Record<string, unknown>, currentClinicId());
        return query(scoped as typeof args);
      },
    },
  },
});

export type ScopedPrismaClient = typeof prisma;
