import type {
  ClinicListFilter,
  ClinicListTab,
  PlatformClinicList,
  PlatformClinicRow,
} from '@expedientes/shared-types';
import { prismaUnscoped } from '../prisma/client';
import { resolveEffectivePlan } from '../plan/effective-plan';

const DAY = 86_400_000;

/**
 * One row per clinic for the portal: plan, owner and counts only. Never anything about patients
 * beyond how many there are. Built with a handful of grouped queries rather than one per clinic.
 */
export async function loadClinicRows(now = new Date()): Promise<PlatformClinicRow[]> {
  const [clinics, owners, users, patients, treatmentTypes, consents, activity, subscriptions, grants] =
    await Promise.all([
      prismaUnscoped.clinic.findMany({ orderBy: { createdAt: 'desc' } }),
      prismaUnscoped.membership.findMany({
        where: { isOwner: true },
        select: { clinicId: true, user: { select: { email: true } } },
      }),
      prismaUnscoped.membership.groupBy({ by: ['clinicId'], where: { active: true }, _count: { _all: true } }),
      prismaUnscoped.patient.groupBy({ by: ['clinicId'], _count: { _all: true } }),
      prismaUnscoped.treatmentType.groupBy({ by: ['clinicId'], where: { active: true }, _count: { _all: true } }),
      prismaUnscoped.consent.groupBy({ by: ['clinicId'], _count: { _all: true } }),
      prismaUnscoped.auditLog.groupBy({ by: ['clinicId'], _max: { createdAt: true } }),
      prismaUnscoped.subscription.findMany(),
      prismaUnscoped.planGrant.findMany({ where: { revokedAt: null, endsAt: { gt: now } } }),
    ]);

  const countBy = (rows: Array<{ clinicId: string; _count: { _all: number } }>) =>
    new Map(rows.map((row) => [row.clinicId, row._count._all]));
  const usersBy = countBy(users);
  const patientsBy = countBy(patients);
  const typesBy = countBy(treatmentTypes);
  const consentsBy = countBy(consents);
  const activityBy = new Map(activity.map((row) => [row.clinicId, row._max.createdAt]));
  const ownerBy = new Map(owners.map((row) => [row.clinicId, row.user.email]));
  const subscriptionBy = new Map(subscriptions.map((row) => [row.clinicId, row]));
  const grantsBy = new Map<string, typeof grants>();
  for (const grant of grants) grantsBy.set(grant.clinicId, [...(grantsBy.get(grant.clinicId) ?? []), grant]);

  return clinics.map((clinic) => {
    const subscription = subscriptionBy.get(clinic.id) ?? null;
    const plan = resolveEffectivePlan(subscription, grantsBy.get(clinic.id) ?? [], now);
    const paid = plan.source === 'SUBSCRIPTION';
    return {
      id: clinic.id,
      name: clinic.name,
      status: clinic.status,
      createdAt: clinic.createdAt.toISOString(),
      ownerEmail: ownerBy.get(clinic.id) ?? null,
      tier: plan.tier,
      source: plan.source,
      paymentMethod: paid ? subscription?.method ?? null : null,
      interval: paid ? subscription?.interval ?? null : null,
      premiumUntil: plan.premiumUntil,
      users: usersBy.get(clinic.id) ?? 0,
      patients: patientsBy.get(clinic.id) ?? 0,
      treatmentTypes: typesBy.get(clinic.id) ?? 0,
      consents: consentsBy.get(clinic.id) ?? 0,
      storageBytes: Number(clinic.storageBytes),
      lastActivityAt: activityBy.get(clinic.id)?.toISOString() ?? null,
    };
  });
}

/** Whether Premium ends within `days` without renewing on its own (card subscriptions renew). */
function endsWithin(row: PlatformClinicRow, days: number, now: Date, autoRenewing: Set<string>): boolean {
  if (row.tier !== 'PREMIUM' || !row.premiumUntil || autoRenewing.has(row.id)) return false;
  return new Date(row.premiumUntil).getTime() - now.getTime() <= days * DAY;
}

export async function listClinics(
  options: { tab?: ClinicListTab; q?: string; filter?: ClinicListFilter | null },
  now = new Date()
): Promise<PlatformClinicList> {
  const rows = await loadClinicRows(now);
  const subscriptions = await prismaUnscoped.subscription.findMany({
    select: { clinicId: true, status: true, method: true },
  });
  const autoRenewing = new Set(
    subscriptions.filter((s) => s.status === 'ACTIVE' && s.method === 'CARD').map((s) => s.clinicId)
  );
  const pastDue = new Set(subscriptions.filter((s) => s.status === 'PAST_DUE').map((s) => s.clinicId));

  const q = options.q?.trim().toLowerCase();
  const matching = rows.filter((row) => {
    if (q && !row.name.toLowerCase().includes(q) && !(row.ownerEmail ?? '').toLowerCase().includes(q)) {
      return false;
    }
    switch (options.filter) {
      case 'expiring7':
        return endsWithin(row, 7, now, autoRenewing);
      case 'expiring30':
        return endsWithin(row, 30, now, autoRenewing);
      case 'pastDue':
        return pastDue.has(row.id);
      case 'inactive30':
        return !row.lastActivityAt || now.getTime() - new Date(row.lastActivityAt).getTime() > 30 * DAY;
      default:
        return true;
    }
  });
  const counts = {
    all: matching.length,
    free: matching.filter((row) => row.tier === 'FREE').length,
    premium: matching.filter((row) => row.tier === 'PREMIUM').length,
  };
  const tab = options.tab ?? 'all';
  return {
    rows: tab === 'all' ? matching : matching.filter((row) => row.tier === (tab === 'free' ? 'FREE' : 'PREMIUM')),
    counts,
  };
}

/** CSV of the clinic list, clinic data only. */
export function clinicsCsv(rows: PlatformClinicRow[]): string {
  const header = [
    'clinica', 'estado', 'alta', 'propietario', 'plan', 'origen', 'metodo', 'periodo',
    'vigente_hasta', 'usuarios', 'pacientes', 'tipos_tratamiento', 'consentimientos',
    'almacenamiento_mb', 'ultima_actividad',
  ];
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    // Quote everything and neutralise formulas, so a clinic name cannot run in a spreadsheet.
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = rows.map((row) =>
    [
      row.name, row.status, row.createdAt.slice(0, 10), row.ownerEmail, row.tier, row.source,
      row.paymentMethod, row.interval, row.premiumUntil?.slice(0, 10), row.users, row.patients,
      row.treatmentTypes, row.consents, (row.storageBytes / 1024 / 1024).toFixed(1),
      row.lastActivityAt?.slice(0, 10),
    ].map(cell).join(',')
  );
  return '﻿' + [header.join(','), ...lines].join('\r\n') + '\r\n';
}
