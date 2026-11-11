-- Additive only: a nullable column, its index and foreign key. Existing patients keep receiving
-- notices on their own phone (contactPatientId stays NULL); no existing value is changed.

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "contactPatientId" TEXT;

-- CreateIndex
CREATE INDEX "Patient_contactPatientId_idx" ON "Patient"("contactPatientId");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_contactPatientId_fkey" FOREIGN KEY ("contactPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
