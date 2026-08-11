-- Existing Consent rows cannot be back-filled with the new required snapshot
-- columns (no historical data to snapshot from), so per the approved spec we
-- clear the table. This is the equivalent of the DELETE FROM "Consent" that
-- `prisma migrate dev` would generate for this destructive change.
DELETE FROM "Consent";

-- AlterTable
ALTER TABLE "Consent" DROP COLUMN "consentText",
DROP COLUMN "signatureImagePath",
ADD COLUMN     "clinicNameSnapshot" TEXT NOT NULL,
ADD COLUMN     "declarationAfterSnapshot" TEXT NOT NULL,
ADD COLUMN     "declarationBeforeSnapshot" TEXT NOT NULL,
ADD COLUMN     "doctorLicenseSnapshot" TEXT NOT NULL,
ADD COLUMN     "doctorNameSnapshot" TEXT NOT NULL,
ADD COLUMN     "doctorTitleSnapshot" TEXT NOT NULL,
ADD COLUMN     "patientIdentification" TEXT NOT NULL,
ADD COLUMN     "patientNameSnapshot" TEXT NOT NULL,
ADD COLUMN     "patientSignatureImagePath" TEXT NOT NULL,
ADD COLUMN     "place" TEXT NOT NULL,
ADD COLUMN     "sections" JSONB NOT NULL,
ADD COLUMN     "witnessName" TEXT,
ADD COLUMN     "witnessSignatureImagePath" TEXT;

-- AlterTable
-- Hand-edited: Prisma's diff rendered this as DROP COLUMN "consentTemplate" /
-- ADD COLUMN "consentDescription", which would destroy existing catalog text.
-- Renaming preserves the data (see task-1-brief.md Step 2).
ALTER TABLE "TreatmentType" RENAME COLUMN "consentTemplate" TO "consentDescription";
ALTER TABLE "TreatmentType" ADD COLUMN     "consentAftercare" TEXT,
ADD COLUMN     "consentAlternatives" TEXT,
ADD COLUMN     "consentContraindications" TEXT,
ADD COLUMN     "consentRisks" TEXT;

-- CreateTable
CREATE TABLE "ClinicSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "clinicName" TEXT NOT NULL,
    "defaultPlace" TEXT NOT NULL,
    "doctorTitle" TEXT NOT NULL,
    "doctorName" TEXT NOT NULL,
    "doctorLicense" TEXT NOT NULL,
    "doctorSignaturePath" TEXT,
    "declarationBefore" TEXT NOT NULL,
    "declarationAfter" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicSettings_pkey" PRIMARY KEY ("id")
);
