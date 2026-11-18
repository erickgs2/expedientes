-- NOM-004-SSA3-2012, phase C (5.10): signed notes are corrected with signed addenda, and the
-- historia clínica keeps every version. Revision 1 of each existing historia is written by the API
-- the first time the historia is saved or its history is opened (lib/historia-clinica/revisions.ts),
-- from the exact content the app reads, so its hash and field comparison match later revisions.

-- CreateTable
CREATE TABLE "ClinicalAddendum" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL DEFAULT current_setting('app.clinic_id'::text),
    "patientId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "diagrams" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedById" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerTitle" TEXT,
    "signerLicense" TEXT NOT NULL,

    CONSTRAINT "ClinicalAddendum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoriaClinicaRevision" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL DEFAULT current_setting('app.clinic_id'::text),
    "historiaClinicaId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacyRecord" BOOLEAN NOT NULL DEFAULT false,
    "signedById" TEXT,
    "signedAt" TIMESTAMP(3),
    "signerName" TEXT,
    "signerTitle" TEXT,
    "signerLicense" TEXT,

    CONSTRAINT "HistoriaClinicaRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalAddendum_entity_entityId_idx" ON "ClinicalAddendum"("entity", "entityId");

-- CreateIndex
CREATE INDEX "ClinicalAddendum_patientId_idx" ON "ClinicalAddendum"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "HistoriaClinicaRevision_historiaClinicaId_revision_key" ON "HistoriaClinicaRevision"("historiaClinicaId", "revision");

-- AddForeignKey
ALTER TABLE "ClinicalAddendum" ADD CONSTRAINT "ClinicalAddendum_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAddendum" ADD CONSTRAINT "ClinicalAddendum_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoriaClinicaRevision" ADD CONSTRAINT "HistoriaClinicaRevision_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoriaClinicaRevision" ADD CONSTRAINT "HistoriaClinicaRevision_historiaClinicaId_fkey" FOREIGN KEY ("historiaClinicaId") REFERENCES "HistoriaClinica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
