import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../apps/api/src/lib/auth/password';
// The reference wording lives in shared code so the seed's initial values and the "suggested
// text" the clinic settings screen shows can never drift apart.
import {
  DEFAULT_DECLARATION_BEFORE,
  DEFAULT_DECLARATION_AFTER,
} from '../libs/shared/types/src/lib/consent-boilerplate';

const prisma = new PrismaClient();

const PERMISSIONS: Array<{ module: string; action: string }> = [
  { module: 'patients', action: 'view' },
  { module: 'patients', action: 'create' },
  { module: 'patients', action: 'edit' },
  { module: 'patients', action: 'delete' },
  { module: 'historia-clinica', action: 'view' },
  { module: 'historia-clinica', action: 'create' },
  { module: 'historia-clinica', action: 'edit' },
  { module: 'valoracion', action: 'view' },
  { module: 'valoracion', action: 'create' },
  { module: 'valoracion', action: 'edit' },
  { module: 'treatments', action: 'view' },
  { module: 'treatments', action: 'create' },
  { module: 'treatments', action: 'edit' },
  { module: 'clinic-settings', action: 'view' },
  { module: 'clinic-settings', action: 'edit' },
  { module: 'appointments', action: 'view' },
  { module: 'appointments', action: 'create' },
  { module: 'appointments', action: 'edit' },
  { module: 'appointments', action: 'delete' },
  { module: 'export', action: 'view' },
  { module: 'export', action: 'create' },
  { module: 'rbac-admin', action: 'view' },
  { module: 'rbac-admin', action: 'create' },
  { module: 'rbac-admin', action: 'edit' },
  { module: 'rbac-admin', action: 'delete' },
];

/**
 * Idempotent; runs after every migration.
 *
 * - The permission catalog is global and always brought up to date.
 * - A database with no clinic (a fresh install) gets one, named by SEED_CLINIC_NAME, with the admin
 *   from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD as its owner. A migrated database already has its
 *   clinic, users and memberships, and gets no new user.
 * - Every clinic's Admin role holds every permission, so a permission added in a release reaches
 *   existing clinics; every clinic has its settings row.
 */
async function main() {
  const permissions = await Promise.all(
    PERMISSIONS.map((p) =>
      prisma.permission.upsert({
        where: { module_action: { module: p.module, action: p.action } },
        update: {},
        create: p,
      })
    )
  );

  let clinics = await prisma.clinic.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  const freshInstall = clinics.length === 0;
  if (freshInstall) {
    const clinic = await prisma.clinic.create({
      data: { name: process.env.SEED_CLINIC_NAME?.trim() || 'Mi clínica' },
      select: { id: true },
    });
    clinics = [clinic];
  }

  for (const clinic of clinics) {
    const adminRole = await prisma.role.upsert({
      where: { clinicId_name: { clinicId: clinic.id, name: 'Admin' } },
      update: {},
      create: { clinicId: clinic.id, name: 'Admin' },
    });

    await Promise.all(
      permissions.map((permission) =>
        prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
          update: {},
          create: { roleId: adminRole.id, permissionId: permission.id },
        })
      )
    );

    await prisma.clinicSettings.upsert({
      where: { clinicId: clinic.id },
      update: {},
      create: {
        clinicId: clinic.id,
        clinicName: '',
        defaultPlace: '',
        doctorTitle: 'DRA.',
        doctorName: '',
        doctorLicense: '',
        declarationBefore: DEFAULT_DECLARATION_BEFORE,
        declarationAfter: DEFAULT_DECLARATION_AFTER,
      },
    });

    if (freshInstall) {
      const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@clinic.local';
      const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
      const admin = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {},
        create: {
          email: adminEmail,
          passwordHash: await hashPassword(adminPassword),
          fullName: 'Administrator',
          language: 'es',
        },
      });
      await prisma.membership.upsert({
        where: { userId_clinicId: { userId: admin.id, clinicId: clinic.id } },
        update: {},
        create: { userId: admin.id, clinicId: clinic.id, roleId: adminRole.id, isOwner: true },
      });
      console.log(`Created the first clinic with ${adminEmail} as its owner`);
    }
  }

  console.log(`Seeded ${permissions.length} permissions for ${clinics.length} clinic(s)`);

  await seedPlatformAdmin();
}

/**
 * The first platform admin, from PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD, created once
 * and never updated from here (so a password changed later is not reset on the next deploy). The
 * account has no second factor yet: the first sign-in at /plataforma requires enrolling an
 * authenticator app before anything else. Remove the password from the server's .env afterwards.
 */
async function seedPlatformAdmin() {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) return;
  if (password.length < 12) {
    console.warn('PLATFORM_ADMIN_PASSWORD must have at least 12 characters; platform admin not created');
    return;
  }
  await prisma.platformAdmin.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      fullName: process.env.PLATFORM_ADMIN_NAME?.trim() || 'Administrador',
    },
  });
  console.log(`Created platform admin ${email}; enrol an authenticator at /plataforma`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
