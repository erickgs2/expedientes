-- Multi-clinic, step 2 of 2: clinicId becomes required and gets its foreign keys and indexes. Any row
-- step 1 left without a clinic makes SET NOT NULL fail, and the whole migration with it, rather than
-- leaving data that belongs to no clinic.
--
-- Role and Allergy names were unique across the whole database; they are now unique per clinic.
-- ClinicSettings is no longer a single 'singleton' row: one row per clinic, keyed by clinicId.
-- User.roleId is superseded by Membership.roleId and only becomes nullable here.
--
-- clinicId defaults to the session setting app.clinic_id. The app always writes clinicId itself;
-- the default only matters for an insert that bypasses it, and since current_setting() raises an
-- error when the setting is absent, such an insert fails instead of creating a row with no clinic.

-- DropIndex
DROP INDEX "Allergy_name_key";

-- DropIndex
DROP INDEX "Role_name_key";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_roleId_fkey";

-- AlterTable
ALTER TABLE "ClinicSettings" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "roleId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Patient" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "HistoriaClinica" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "Allergy" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "Valoracion" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "ValoracionDiagram" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "Photo" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "TreatmentType" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "Treatment" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "TreatmentItem" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "Consent" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "ConsentScan" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "TreatmentItemDiagram" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "TreatmentItemPhoto" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "TreatmentItemProduct" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "Appointment" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- AlterTable
ALTER TABLE "ClinicSettings" ALTER COLUMN "clinicId" SET NOT NULL,
ALTER COLUMN "clinicId" SET DEFAULT current_setting('app.clinic_id'::text);

-- CreateIndex
CREATE INDEX "Membership_clinicId_idx" ON "Membership"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_clinicId_key" ON "Membership"("userId", "clinicId");

-- CreateIndex
CREATE INDEX "AuditLog_clinicId_idx" ON "AuditLog"("clinicId");

-- CreateIndex
CREATE INDEX "HistoriaClinica_clinicId_idx" ON "HistoriaClinica"("clinicId");

-- CreateIndex
CREATE INDEX "Valoracion_clinicId_idx" ON "Valoracion"("clinicId");

-- CreateIndex
CREATE INDEX "ValoracionDiagram_clinicId_idx" ON "ValoracionDiagram"("clinicId");

-- CreateIndex
CREATE INDEX "Photo_clinicId_idx" ON "Photo"("clinicId");

-- CreateIndex
CREATE INDEX "TreatmentType_clinicId_idx" ON "TreatmentType"("clinicId");

-- CreateIndex
CREATE INDEX "Treatment_clinicId_idx" ON "Treatment"("clinicId");

-- CreateIndex
CREATE INDEX "TreatmentItem_clinicId_idx" ON "TreatmentItem"("clinicId");

-- CreateIndex
CREATE INDEX "Consent_clinicId_idx" ON "Consent"("clinicId");

-- CreateIndex
CREATE INDEX "ConsentScan_clinicId_idx" ON "ConsentScan"("clinicId");

-- CreateIndex
CREATE INDEX "TreatmentItemDiagram_clinicId_idx" ON "TreatmentItemDiagram"("clinicId");

-- CreateIndex
CREATE INDEX "TreatmentItemPhoto_clinicId_idx" ON "TreatmentItemPhoto"("clinicId");

-- CreateIndex
CREATE INDEX "TreatmentItemProduct_clinicId_idx" ON "TreatmentItemProduct"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_clinicId_name_key" ON "Role"("clinicId", "name");

-- CreateIndex
CREATE INDEX "Patient_clinicId_fullName_idx" ON "Patient"("clinicId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Allergy_clinicId_name_key" ON "Allergy"("clinicId", "name");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_startTime_idx" ON "Appointment"("clinicId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicSettings_clinicId_key" ON "ClinicSettings"("clinicId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoriaClinica" ADD CONSTRAINT "HistoriaClinica_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allergy" ADD CONSTRAINT "Allergy_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valoracion" ADD CONSTRAINT "Valoracion_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValoracionDiagram" ADD CONSTRAINT "ValoracionDiagram_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentType" ADD CONSTRAINT "TreatmentType_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentScan" ADD CONSTRAINT "ConsentScan_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItemDiagram" ADD CONSTRAINT "TreatmentItemDiagram_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItemPhoto" ADD CONSTRAINT "TreatmentItemPhoto_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItemProduct" ADD CONSTRAINT "TreatmentItemProduct_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicSettings" ADD CONSTRAINT "ClinicSettings_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
