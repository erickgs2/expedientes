-- CreateEnum
CREATE TYPE "ConsentSignatureMethod" AS ENUM ('DIGITAL', 'PAPER');

-- AlterTable
ALTER TABLE "Consent" ADD COLUMN     "scanId" TEXT,
ADD COLUMN     "signatureMethod" "ConsentSignatureMethod" NOT NULL DEFAULT 'DIGITAL',
ALTER COLUMN "patientSignatureImagePath" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ConsentScan" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "signedDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentScanPage" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,

    CONSTRAINT "ConsentScanPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentScan_patientId_idx" ON "ConsentScan"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentScanPage_scanId_position_key" ON "ConsentScanPage"("scanId", "position");

-- CreateIndex
CREATE INDEX "Consent_scanId_idx" ON "Consent"("scanId");

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "ConsentScan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentScanPage" ADD CONSTRAINT "ConsentScanPage_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "ConsentScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A consent is signed either digitally (signature image, no scan) or on paper (scan, no signature
-- image) — never both, never neither.
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_signature_method_check" CHECK (
  ("signatureMethod" = 'DIGITAL' AND "patientSignatureImagePath" IS NOT NULL AND "scanId" IS NULL)
  OR
  ("signatureMethod" = 'PAPER' AND "patientSignatureImagePath" IS NULL AND "scanId" IS NOT NULL)
);
