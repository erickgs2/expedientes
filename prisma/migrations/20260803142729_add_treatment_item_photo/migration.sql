-- CreateTable
CREATE TABLE "TreatmentItemPhoto" (
    "id" TEXT NOT NULL,
    "treatmentItemId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tag" "PhotoTag" NOT NULL,
    "filePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentItemPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TreatmentItemPhoto_treatmentItemId_idx" ON "TreatmentItemPhoto"("treatmentItemId");

-- CreateIndex
CREATE INDEX "TreatmentItemPhoto_patientId_idx" ON "TreatmentItemPhoto"("patientId");

-- AddForeignKey
ALTER TABLE "TreatmentItemPhoto" ADD CONSTRAINT "TreatmentItemPhoto_treatmentItemId_fkey" FOREIGN KEY ("treatmentItemId") REFERENCES "TreatmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
