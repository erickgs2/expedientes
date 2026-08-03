-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "treatmentItemId" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "signatureImagePath" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Consent_treatmentItemId_key" ON "Consent"("treatmentItemId");

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_treatmentItemId_fkey" FOREIGN KEY ("treatmentItemId") REFERENCES "TreatmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
