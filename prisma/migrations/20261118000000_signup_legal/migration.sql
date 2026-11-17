-- Self-service sign-up, password reset, invitations and versioned legal documents.
--
-- Data step at the end: the first version (1.0) of the privacy notice and of the terms, from
-- prisma/legal/*.md. Both are drafts pending legal review, so they do not require existing users to
-- accept them; new sign-ups must accept whatever version is in force. Reviewed versions are
-- published from the platform portal.

-- CreateEnum
CREATE TYPE "LegalDocumentKind" AS ENUM ('PRIVACY', 'TERMS');

-- CreateTable
CREATE TABLE "PendingSignup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "clinicName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "privacyDocumentId" TEXT NOT NULL,
    "termsDocumentId" TEXT NOT NULL,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "codeHash" TEXT NOT NULL,
    "codeExpiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "sendWindowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingSignup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeExpiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "sendWindowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL DEFAULT current_setting('app.clinic_id'::text),
    "email" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "kind" "LegalDocumentKind" NOT NULL,
    "version" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "requiresAcceptance" BOOLEAN NOT NULL DEFAULT false,
    "publishedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermsAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingSignup_email_key" ON "PendingSignup"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetCode_userId_key" ON "PasswordResetCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_clinicId_idx" ON "Invitation"("clinicId");

-- CreateIndex
CREATE INDEX "LegalDocument_kind_effectiveFrom_idx" ON "LegalDocument"("kind", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_kind_version_key" ON "LegalDocument"("kind", "version");

-- CreateIndex
CREATE INDEX "TermsAcceptance_documentId_idx" ON "TermsAcceptance"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "TermsAcceptance_userId_documentId_key" ON "TermsAcceptance"("userId", "documentId");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LegalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- First legal documents (drafts pending legal review; see prisma/legal).
INSERT INTO "LegalDocument" ("id", "kind", "version", "body", "changeSummary", "effectiveFrom", "requiresAcceptance", "publishedBy")
VALUES
  (gen_random_uuid()::text, 'PRIVACY', '1.0', $legal$# Aviso de Privacidad Integral de MedCloud

> **Borrador pendiente de revisión legal.** Lo que aparece entre corchetes es información por completar.

Este aviso cubre los datos que MedCloud trata como responsable: los de las personas que crean una cuenta o usan el sistema en una clínica. Los datos de los pacientes los trata cada clínica como responsable, y MedCloud solo como encargado; cada clínica necesita su propio aviso de privacidad para sus pacientes.

## 1. Identidad y domicilio del responsable

[RAZÓN SOCIAL O NOMBRE DE LA PERSONA FÍSICA CON ACTIVIDAD EMPRESARIAL], que opera el servicio MedCloud (en adelante, "MedCloud" o "nosotros"), con domicilio en [CALLE, NÚMERO, COLONIA, MUNICIPIO O ALCALDÍA, ESTADO, CÓDIGO POSTAL], México, es responsable del tratamiento de los datos personales que usted nos proporciona al crear una cuenta y al usar el servicio, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (la "Ley") y demás normativa aplicable.

Para cualquier asunto relacionado con este aviso o con sus datos personales puede contactarnos en:

- Correo electrónico: [privacidad@DOMINIO]
- Persona o departamento de datos personales: [NOMBRE O ÁREA RESPONSABLE]
- Domicilio: el señalado arriba.

## 2. Datos personales que recabamos

Recabamos sus datos directamente de usted, cuando se registra o cuando el propietario de su clínica lo invita, y de forma automática cuando usa el servicio.

| Categoría | Datos | Cuándo |
| --- | --- | --- |
| Identificación y contacto | Nombre completo, correo electrónico y teléfono | Registro o invitación |
| Datos de la clínica o consultorio | Nombre comercial, teléfono, logotipo, domicilio y, en su caso, datos fiscales (RFC, razón social, régimen fiscal y código postal) | Registro y configuración |
| Datos profesionales del médico | Nombre, título, número de cédula profesional y firma autógrafa digitalizada | Configuración de la clínica |
| Datos de acceso | Contraseña, que se guarda cifrada de forma irreversible, y códigos de verificación | Registro e inicio de sesión |
| Datos de uso y técnicos | Dirección IP, fecha y hora de acceso, navegador o dispositivo, y registro de las acciones realizadas en el sistema | Uso del servicio |
| Datos de pago | Plan contratado, periodo, montos e historial de pagos | Contratación de un plan |

**Datos de tarjetas.** No recabamos ni almacenamos los números de sus tarjetas: los pagos los procesa directamente el proveedor de pagos indicado en la sección 5.

**Datos sensibles.** Para las finalidades de este aviso no recabamos datos personales sensibles de usted como usuario. Los datos de salud de los pacientes que usted registre los tratamos únicamente por cuenta de su clínica, como se explica en la sección 4.

## 3. Finalidades del tratamiento

**Finalidades necesarias para el servicio.** Tratamos sus datos para:

1. Crear y administrar su cuenta y la de su clínica, y verificar su correo electrónico.
2. Permitirle iniciar sesión y proteger su cuenta, incluida la prevención de accesos no autorizados y de fraude.
3. Prestar el servicio de expediente clínico electrónico y sus funciones: citas, recordatorios, consentimientos informados y exportación de documentos.
4. Imprimir el nombre, la cédula profesional y la firma del médico en los consentimientos informados y documentos que la clínica genere.
5. Procesar la contratación, renovación y cancelación de planes de pago y, cuando corresponda, emitir comprobantes fiscales.
6. Enviarle avisos sobre su cuenta, su plan, sus pagos, cambios en este aviso y en los Términos y Condiciones.
7. Brindarle soporte técnico.
8. Llevar un registro de las acciones realizadas en el sistema para seguridad, auditoría y cumplimiento de obligaciones legales.
9. Cumplir obligaciones legales y atender requerimientos de autoridades competentes.

**Finalidades adicionales.** Si usted no se opone, también usaremos sus datos de contacto para:

1. Enviarle información sobre nuevas funciones, promociones y contenido relacionado con el servicio.
2. Invitarle a responder encuestas de satisfacción y de mejora del servicio.
3. Elaborar estadísticas de uso del servicio, que se presentan de forma agregada y sin identificarle.

Puede negarse a estas finalidades adicionales en cualquier momento, sin que ello afecte el servicio, desmarcando la casilla correspondiente al registrarse, con el enlace para cancelar la suscripción que incluye cada correo, o escribiendo a [privacidad@DOMINIO].

## 4. Datos de los pacientes de su clínica

Los datos que su clínica registra sobre sus pacientes (identificación, historia clínica, valoraciones, fotografías, diagramas, tratamientos, productos aplicados, consentimientos y citas) incluyen datos personales sensibles de salud. Respecto de esos datos:

- **La clínica es la responsable.** Le corresponde poner a disposición de sus pacientes su propio aviso de privacidad, obtener su consentimiento y atender sus derechos ARCO.
- **MedCloud actúa como encargado.** Tratamos esos datos solo por cuenta de la clínica y conforme a sus instrucciones, para almacenarlos, mostrarlos y procesarlos dentro del servicio. No los usamos para fines propios, no los vendemos y no los compartimos con terceros distintos de los proveedores de infraestructura indicados en la sección 5.
- **Separación entre clínicas.** Los datos de cada clínica están aislados: ninguna otra clínica puede consultarlos.
- **Acceso de nuestro personal.** Nuestro personal no consulta el contenido de los expedientes. Solo podría hacerlo con autorización expresa de la clínica para atender una solicitud de soporte, o cuando lo ordene una autoridad competente; esos accesos quedan registrados.
- **Al terminar el servicio.** La clínica puede exportar sus datos en cualquier momento. Al cancelar su cuenta, conservamos sus datos durante [PLAZO] y después los eliminamos, salvo que una obligación legal exija conservarlos más tiempo.

Las condiciones de este encargo se establecen en los Términos y Condiciones que acepta el propietario de la clínica.

## 5. Proveedores con los que compartimos datos y transferencias

Para prestar el servicio nos apoyamos en proveedores que tratan datos por nuestra cuenta y bajo nuestras instrucciones (remisiones). Algunos se ubican fuera de México.

| Proveedor | Para qué | Datos que trata | Ubicación |
| --- | --- | --- | --- |
| Servidor propio | Servidor del servicio durante la etapa piloto | Todos los datos del servicio | México |
| [Amazon Web Services] | Servidores y almacenamiento de archivos después del piloto | Todos los datos del servicio, incluidos los de pacientes, cifrados | [REGIÓN: México o Estados Unidos] |
| Cloudflare | Conexión segura entre su dispositivo y nuestros servidores, y verificación contra registros automatizados | Tráfico del servicio en tránsito y datos técnicos del navegador | Estados Unidos y red global |
| Resend | Envío de correos de la cuenta (códigos de verificación, invitaciones y avisos) | Nombre y correo electrónico | Estados Unidos |
| Stripe | Procesamiento de pagos con tarjeta y en OXXO | Nombre, correo, monto y datos del medio de pago | Estados Unidos y México |
| Meta (WhatsApp Business) | Envío de confirmaciones y recordatorios de citas, solo si la clínica lo activa | Nombre y teléfono del paciente, fecha y hora de la cita | Estados Unidos |

**Transferencias.** No transferimos sus datos personales a terceros distintos de los proveedores anteriores, salvo cuando lo exija una ley o lo ordene una autoridad competente, o en los demás casos en que la Ley no requiere su consentimiento.

**Venta de datos.** No vendemos ni rentamos sus datos personales ni los de los pacientes.

## 6. Sus derechos y cómo ejercerlos

Usted tiene derecho a **acceder** a sus datos personales, **rectificarlos** si son inexactos, **cancelarlos** cuando considere que no se requieren para alguna de las finalidades de este aviso, y **oponerse** a su tratamiento para fines específicos (derechos ARCO). También puede **revocar** el consentimiento que nos haya otorgado, aunque es posible que no podamos atender la revocación de inmediato cuando una obligación legal nos exija seguir tratando sus datos; revocar el consentimiento para las finalidades necesarias implica que no podremos seguir prestándole el servicio.

**Cómo presentar una solicitud.** Envíe un correo a [privacidad@DOMINIO] con:

1. Su nombre y el correo de su cuenta, para comunicarle la respuesta.
2. Un documento que acredite su identidad o, en su caso, la de su representante legal.
3. Una descripción clara de los datos y del derecho que desea ejercer.
4. Cualquier documento que facilite localizar sus datos y, si pide una rectificación, el que respalde el cambio.

Le responderemos en un plazo máximo de [PLAZO SEGÚN LA LEY VIGENTE] contado desde que recibamos su solicitud, y, si procede, la haremos efectiva dentro de los [PLAZO] siguientes. La respuesta y el acceso a sus datos son gratuitos; solo podrían cobrarse gastos de envío o reproducción cuando la Ley lo permita.

**Pacientes.** Si usted es paciente de una clínica que usa el servicio, diríjase a esa clínica, que es la responsable de sus datos. Si nos escribe a nosotros, remitiremos su solicitud a la clínica.

**Limitar el uso de sus datos.** Además de lo anterior, puede limitar el uso o la divulgación de sus datos escribiéndonos al mismo correo, y dejar de recibir comunicaciones promocionales con el enlace que incluye cada correo.

## 7. Cookies, seguridad, conservación y cambios

**Cookies y tecnologías similares.** Usamos una cookie de sesión, estrictamente necesaria, para mantenerle identificado mientras usa el servicio, y almacenamiento local del navegador para recordar preferencias como el idioma y el tema. No usamos cookies de publicidad ni de rastreo de terceros.

**Medidas de seguridad.** Aplicamos medidas administrativas, técnicas y físicas para proteger sus datos, entre ellas: conexión cifrada (HTTPS), contraseñas almacenadas de forma irreversible, verificación del correo, límite de intentos de acceso, permisos por rol, aislamiento de los datos de cada clínica, registro de auditoría de las acciones realizadas y respaldos cifrados. Si ocurre una vulneración de seguridad que afecte de forma significativa sus derechos, se lo informaremos sin demora para que pueda tomar medidas.

**Conservación.** Conservamos sus datos mientras su cuenta esté activa y, después, durante el tiempo necesario para cumplir obligaciones legales, fiscales y de atención de reclamaciones: [PLAZO]. Concluido ese plazo, los eliminamos de forma segura.

**Cambios a este aviso.** Podemos modificar este aviso por cambios en la ley, en nuestros servicios o en nuestras prácticas de privacidad. Le avisaremos por correo electrónico y con un mensaje dentro del sistema al iniciar sesión. Cuando el cambio requiera su consentimiento, le pediremos que lo acepte antes de seguir usando el servicio. La versión vigente estará siempre disponible en [https://medcloud.intech-erp.com/privacidad](https://medcloud.intech-erp.com/privacidad), junto con las versiones anteriores.

**Autoridad.** Si considera que su derecho a la protección de datos personales ha sido vulnerado, puede acudir a la Secretaría Anticorrupción y Buen Gobierno, autoridad en la materia conforme a la Ley.

**Aceptación.** Al marcar la casilla de aceptación en el registro, usted reconoce haber leído este aviso y consiente el tratamiento de sus datos en los términos aquí descritos.
$legal$,
   'Primera versión (borrador pendiente de revisión legal).', CURRENT_TIMESTAMP, false, 'migration'),
  (gen_random_uuid()::text, 'TERMS', '1.0', $legal$# Términos y Condiciones de MedCloud

> **Borrador pendiente de revisión legal.** Lo que aparece entre corchetes es información por completar.

Estos Términos regulan el uso de MedCloud, un servicio en línea de expediente clínico electrónico para clínicas y consultorios, que opera [RAZÓN SOCIAL O NOMBRE DE LA PERSONA FÍSICA CON ACTIVIDAD EMPRESARIAL] ("MedCloud" o "nosotros"), con domicilio en [DOMICILIO], México. Al crear una cuenta o usar el servicio, usted acepta estos Términos y el Aviso de Privacidad.

## 1. Cuentas, clínicas y usuarios

- Quien registra una clínica es su **propietario**: contrata y administra el plan y decide quién más usa el servicio en esa clínica.
- Cada usuario tiene una cuenta personal ligada a un correo electrónico verificado. Las credenciales son personales e intransferibles; usted es responsable de lo que se haga con su cuenta y debe avisarnos de inmediato si sospecha un acceso no autorizado.
- El propietario es responsable de que las personas que invita estén autorizadas por la clínica y de retirarles el acceso cuando dejen de estarlo.
- La información que proporcione debe ser verdadera y estar actualizada.

## 2. Planes y pagos

- El plan **Gratis** no tiene costo ni vencimiento, con los límites que se muestran en la pantalla Plan del sistema.
- El plan **Premium** se paga por mes o por año. Los precios se muestran en pesos mexicanos e incluyen IVA. El pago con tarjeta se renueva automáticamente hasta que se cancele; el pago en OXXO cubre un periodo y se renueva generando un nuevo pago.
- Podemos cambiar los precios para contrataciones nuevas. Las suscripciones vigentes conservan su precio hasta el fin del periodo pagado y, si cambia, se avisará con al menos [30] días de anticipación.
- Si un plan pagado vence o se cancela, la clínica vuelve al plan Gratis y **conserva todos sus datos**; solo deja de poder agregar lo que exceda los límites del plan Gratis.
- Los pagos no son reembolsables salvo que la ley disponga otra cosa o que nosotros lo decidamos en un caso concreto. Los pagos en OXXO no admiten reembolso por el mismo medio; cualquier compensación se otorga como crédito en el servicio.
- Podemos otorgar periodos de Premium sin costo (por ejemplo, de cortesía o de prueba). Al terminar, la clínica vuelve al plan Gratis en las mismas condiciones.

## 3. Datos de los pacientes: la clínica es responsable y MedCloud es encargado

- La clínica es la **responsable** de los datos personales de sus pacientes, incluidos los datos sensibles de salud. Le corresponde contar con su propio aviso de privacidad, obtener el consentimiento de sus pacientes, atender sus derechos ARCO y cumplir la normativa sanitaria aplicable, incluida la NOM-004-SSA3-2012 del expediente clínico.
- MedCloud actúa como **encargado**: trata esos datos solo para prestar el servicio a la clínica y conforme a sus instrucciones, no los usa para fines propios, no los vende y solo los comparte con los proveedores de infraestructura indicados en el Aviso de Privacidad, que están sujetos a obligaciones de confidencialidad y seguridad equivalentes.
- Mantenemos medidas de seguridad administrativas, técnicas y físicas, aislamos los datos de cada clínica y avisaremos a la clínica sin demora de cualquier vulneración de seguridad que afecte sus datos.
- Nuestro personal no consulta el contenido de los expedientes, salvo con autorización expresa de la clínica para atender una solicitud de soporte o por orden de autoridad competente.
- Al terminar la relación, la clínica puede exportar sus datos. Los conservaremos durante [PLAZO] y después los eliminaremos, salvo obligación legal de conservarlos.

[VALIDAR: si estas cláusulas bastan como contrato de encargo o se requiere un contrato por separado.]

## 4. Uso aceptable

Usted se compromete a no usar el servicio para fines ilícitos; a no intentar acceder a datos de otras clínicas ni a partes del sistema para las que no tiene permiso; a no interferir con su funcionamiento ni someterlo a cargas automatizadas excesivas; y a no cargar contenido que no tenga derecho a tratar.

## 5. Disponibilidad y soporte

Procuramos que el servicio esté disponible de forma continua, pero puede haber interrupciones por mantenimiento, fallas o causas ajenas a nosotros. Durante la etapa piloto el servicio se presta desde un servidor propio en México. Hacemos respaldos periódicos de la información. El soporte se brinda por correo electrónico en [correo de soporte].

## 6. Responsabilidad

- MedCloud es una herramienta de registro: no presta servicios médicos ni sustituye el criterio profesional. El contenido clínico, los consentimientos y las decisiones médicas son responsabilidad de la clínica y de sus profesionales.
- En la medida permitida por la ley, nuestra responsabilidad total frente a la clínica se limita al monto pagado por ella en los [12] meses anteriores al hecho que la origine.

## 7. Suspensión y cancelación

- La clínica puede dejar de usar el servicio en cualquier momento; la cancelación de un plan pagado surte efecto al final del periodo ya pagado.
- Podemos suspender una cuenta que incumpla estos Términos o ponga en riesgo la seguridad del servicio o de otras clínicas, avisando al propietario salvo que la urgencia lo impida. La suspensión no elimina los datos.

## 8. Cambios a estos Términos

Podemos modificar estos Términos. Le avisaremos por correo electrónico y dentro del sistema; cuando el cambio sea relevante le pediremos que lo acepte para seguir usando el servicio. La versión vigente y las anteriores están disponibles en [https://medcloud.intech-erp.com/terminos](https://medcloud.intech-erp.com/terminos).

## 9. Ley aplicable y jurisdicción

Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos. Para su interpretación y cumplimiento, las partes se someten a los tribunales competentes de [CIUDAD], renunciando a cualquier otro fuero que pudiera corresponderles, sin perjuicio de los derechos que la ley otorgue a los consumidores.
$legal$,
   'Primera versión (borrador pendiente de revisión legal).', CURRENT_TIMESTAMP, false, 'migration');
