-- DropForeignKey
ALTER TABLE "TreatmentItemDiagram" DROP CONSTRAINT "TreatmentItemDiagram_treatmentItemId_fkey";

-- AddForeignKey
ALTER TABLE "TreatmentItemDiagram" ADD CONSTRAINT "TreatmentItemDiagram_treatmentItemId_fkey" FOREIGN KEY ("treatmentItemId") REFERENCES "TreatmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
