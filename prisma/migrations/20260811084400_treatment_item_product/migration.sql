-- CreateTable
CREATE TABLE "TreatmentItemProduct" (
    "id" TEXT NOT NULL,
    "treatmentItemId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "photoPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentItemProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TreatmentItemProduct_treatmentItemId_idx" ON "TreatmentItemProduct"("treatmentItemId");

-- CreateIndex
CREATE INDEX "TreatmentItemProduct_lotNumber_idx" ON "TreatmentItemProduct"("lotNumber");

-- AddForeignKey
ALTER TABLE "TreatmentItemProduct" ADD CONSTRAINT "TreatmentItemProduct_treatmentItemId_fkey" FOREIGN KEY ("treatmentItemId") REFERENCES "TreatmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
