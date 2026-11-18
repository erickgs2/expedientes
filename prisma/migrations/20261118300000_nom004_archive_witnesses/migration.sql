-- NOM-004-SSA3-2012, phase A.
--
-- 5.4 (keep a record at least five years after the last care): patients and clinical photos are
-- archived instead of deleted. Nothing existing changes: every current patient and photo starts
-- active (archivedAt NULL).
--
-- 10.1.1 (two witnesses on an informed consent): a second witness on each consent, and the clinic's
-- usual second witness in its settings. Consents already signed keep the one witness they were
-- signed with (secondWitness* NULL), and print no contingencies clause (contingencyClauseSnapshot
-- NULL): a signed letter is never changed after the fact.

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedById" TEXT,
ADD COLUMN "archiveReason" TEXT;

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedById" TEXT;

-- AlterTable
ALTER TABLE "TreatmentItemPhoto" ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedById" TEXT;

-- AlterTable
ALTER TABLE "Consent" ADD COLUMN "secondWitnessName" TEXT,
ADD COLUMN "secondWitnessSignatureImagePath" TEXT,
ADD COLUMN "contingencyClauseSnapshot" TEXT;

-- AlterTable
ALTER TABLE "ClinicSettings" ADD COLUMN "secondWitnessName" TEXT,
ADD COLUMN "secondWitnessSignaturePath" TEXT;

-- CreateIndex
CREATE INDEX "Patient_clinicId_archivedAt_idx" ON "Patient"("clinicId", "archivedAt");
