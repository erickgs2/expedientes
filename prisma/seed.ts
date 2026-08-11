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

const DECLARATION_BEFORE = `YO {{patientName}}, EN MI CALIDAD DE PACIENTE, DECLARO SER MAYOR DE EDAD Y ENCONTRARME EN PLENO USO DE MIS FACULTADES MENTALES, POR LO QUE ES MI DESEO AUTORIZAR A {{doctorTitle}} {{doctorName}} CED {{doctorLicense}} A FIN DE QUE ME REALICE LOS SIGUIENTES PROCEDIMIENTOS:`;

const DECLARATION_AFTER = `MANIFIESTO QUE HE SIDO INFORMADO DEBIDAMENTE POR PARTE DE {{doctorTitle}} {{doctorName}} DE TODOS Y CADA UNO DE LOS POSIBLES RIESGOS Y COMPLICACIONES QUE IMPLICAN DICHO TRATAMIENTO Y PROCEDIMIENTOS A LOS CUALES AUTORIZO SOMETERME.

QUEDANDO ENTERADO DE DICHOS RIESGOS Y COMPLICACIONES, DECLARO ASIMISMO QUE SE ME HAN RESPONDIDO TODAS Y CADA UNA DE LAS DUDAS Y PREGUNTAS ACERCA DEL TRATAMIENTO Y PROCEDIMIENTOS A EFECTUARSE POR PARTE DE MI MEDICO TRATANTE.

ENTIENDO QUE PUEDO REVOCAR ESTE CONSENTIMIENTO EN CUALQUIER MOMENTO ANTES DE LA REALIZACION DEL PROCEDIMIENTO, SIN NECESIDAD DE EXPRESAR CAUSA Y SIN QUE ELLO AFECTE LA ATENCION QUE SE ME BRINDE.

AUTORIZO LA TOMA DE FOTOGRAFIAS CLINICAS ANTES, DURANTE Y DESPUES DEL PROCEDIMIENTO, PARA SU RESGUARDO EN MI EXPEDIENTE Y PARA EL SEGUIMIENTO DE MI TRATAMIENTO. ESTAS IMAGENES NO SERAN DIVULGADAS NI UTILIZADAS CON FINES DISTINTOS SIN MI AUTORIZACION EXPRESA Y POR ESCRITO.

TRAS CONSIDERAR TODAS Y CADA UNA DE LAS MANIFESTACIONES MENCIONADAS, ENTIENDO Y ACEPTO QUE ES MI DESEO, POR ASI CONVENIR A MIS INTERESES LEGALES Y SIN COACCION ALGUNA, RENUNCIAR A CUALQUIER ACCION JURIDICA CONTRA EL MEDICO TRATANTE.`;

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

  await prisma.clinicSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      clinicName: '',
      defaultPlace: '',
      doctorTitle: 'DRA.',
      doctorName: '',
      doctorLicense: '',
      declarationBefore: DECLARATION_BEFORE,
      declarationAfter: DECLARATION_AFTER,
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
