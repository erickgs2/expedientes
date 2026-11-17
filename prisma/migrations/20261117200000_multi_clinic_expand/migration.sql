-- Multi-clinic, step 1 of 2: the clinic, memberships and a nullable clinicId on every table that
-- holds a clinic's data. Every existing row is then assigned to ONE clinic created from the current
-- clinic settings, so a database with real patients comes out of this exactly as it went in, now
-- owned by "clinic #1". Step 2 (the next migration) makes clinicId required and adds the keys.
--
-- On an empty database (a fresh install) no clinic is created here; the seed creates the first one.

-- CreateEnum
CREATE TYPE "ClinicStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "status" "ClinicStatus" NOT NULL DEFAULT 'ACTIVE',
    "taxId" TEXT,
    "legalName" TEXT,
    "taxRegime" TEXT,
    "taxPostalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "HistoriaClinica" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "Allergy" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "Valoracion" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "ValoracionDiagram" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "TreatmentType" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "Treatment" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "TreatmentItem" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "Consent" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "ConsentScan" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "TreatmentItemDiagram" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "TreatmentItemPhoto" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "TreatmentItemProduct" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN "clinicId" TEXT;

-- AlterTable
ALTER TABLE "ClinicSettings" ADD COLUMN "clinicId" TEXT;

-- Backfill: one clinic for everything that exists today. Its name comes from the clinic settings
-- the app already had (falling back to a placeholder the clinic can rename).
INSERT INTO "Clinic" ("id", "name", "updatedAt")
SELECT gen_random_uuid()::text,
       COALESCE(NULLIF(btrim((SELECT "clinicName" FROM "ClinicSettings" ORDER BY "updatedAt" DESC LIMIT 1)), ''), 'Mi clínica'),
       CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "User")
   OR EXISTS (SELECT 1 FROM "Role")
   OR EXISTS (SELECT 1 FROM "Patient")
   OR EXISTS (SELECT 1 FROM "ClinicSettings");

UPDATE "Patient" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "AuditLog" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "HistoriaClinica" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "Allergy" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "Valoracion" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "ValoracionDiagram" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "Photo" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "TreatmentType" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "Treatment" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "TreatmentItem" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "Consent" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "ConsentScan" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "TreatmentItemDiagram" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "TreatmentItemPhoto" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "TreatmentItemProduct" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "Appointment" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "Role" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;

UPDATE "ClinicSettings" SET "clinicId" = (SELECT "id" FROM "Clinic" LIMIT 1) WHERE "clinicId" IS NULL;


-- Every existing user becomes a member of that clinic with the role they already had. Deactivated
-- users stay deactivated there.
INSERT INTO "Membership" ("id", "userId", "clinicId", "roleId", "isOwner", "active", "updatedAt")
SELECT gen_random_uuid()::text, u."id", c."id", u."roleId", false, u."active", CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN (SELECT "id" FROM "Clinic" LIMIT 1) c;

-- The owner (who will manage the clinic's plan) is the longest-standing user holding the Admin role.
UPDATE "Membership" SET "isOwner" = true
WHERE "userId" = (
    SELECT u."id" FROM "User" u
    JOIN "Role" r ON r."id" = u."roleId"
    WHERE r."name" = 'Admin'
    ORDER BY u."createdAt" ASC
    LIMIT 1
);
