-- CreateTable
CREATE TABLE "TreatmentItemDiagram" (
    "id" TEXT NOT NULL,
    "treatmentItemId" TEXT NOT NULL,
    "view" "DiagramView" NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentItemDiagram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentItemDiagram_treatmentItemId_view_key" ON "TreatmentItemDiagram"("treatmentItemId", "view");

-- AddForeignKey
ALTER TABLE "TreatmentItemDiagram" ADD CONSTRAINT "TreatmentItemDiagram_treatmentItemId_fkey" FOREIGN KEY ("treatmentItemId") REFERENCES "TreatmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
