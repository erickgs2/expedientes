import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../apps/api/src/lib/auth/password';

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

  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: { name: 'Admin' },
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

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@clinic.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      fullName: 'Administrator',
      language: 'es',
      roleId: adminRole.id,
    },
  });

  console.log(`Seeded ${permissions.length} permissions, Admin role, and admin user ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
