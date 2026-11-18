-- NOM-004-SSA3-2012, phase D: the minimum clinical content of 5.9, 6.1 and 6.2, adapted to
-- aesthetic medicine. Every new field is optional: most aesthetic visits have nothing to record in
-- several of them, and an empty one never blocks saving.

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "recordNumber" INTEGER,
ADD COLUMN "birthDate" TIMESTAMP(3),
ADD COLUMN "sex" TEXT;

-- AlterTable
ALTER TABLE "HistoriaClinica" ADD COLUMN "antecedentesPersonalesPatologicos" TEXT,
ADD COLUMN "padecimientoActual" TEXT,
ADD COLUMN "interrogatorioPiel" TEXT,
ADD COLUMN "interrogatorioCardiovascular" TEXT,
ADD COLUMN "interrogatorioEndocrino" TEXT,
ADD COLUMN "interrogatorioNeurologico" TEXT,
ADD COLUMN "interrogatorioOtros" TEXT,
ADD COLUMN "presionSistolica" INTEGER,
ADD COLUMN "presionDiastolica" INTEGER,
ADD COLUMN "frecuenciaCardiaca" INTEGER,
ADD COLUMN "frecuenciaRespiratoria" INTEGER,
ADD COLUMN "temperatura" DOUBLE PRECISION,
ADD COLUMN "peso" DOUBLE PRECISION,
ADD COLUMN "talla" DOUBLE PRECISION,
ADD COLUMN "fototipoFitzpatrick" TEXT,
ADD COLUMN "tipoPiel" TEXT,
ADD COLUMN "exploracionFacial" TEXT,
ADD COLUMN "lesionesCutaneas" TEXT,
ADD COLUMN "resultadosEstudios" TEXT,
ADD COLUMN "diagnostico" TEXT,
ADD COLUMN "pronostico" TEXT,
ADD COLUMN "indicacionTerapeutica" TEXT;

-- AlterTable
ALTER TABLE "Valoracion" ADD COLUMN "evolucion" TEXT,
ADD COLUMN "presionSistolica" INTEGER,
ADD COLUMN "presionDiastolica" INTEGER,
ADD COLUMN "frecuenciaCardiaca" INTEGER,
ADD COLUMN "frecuenciaRespiratoria" INTEGER,
ADD COLUMN "temperatura" DOUBLE PRECISION,
ADD COLUMN "peso" DOUBLE PRECISION,
ADD COLUMN "resultadosEstudios" TEXT,
ADD COLUMN "diagnostico" TEXT,
ADD COLUMN "pronostico" TEXT,
ADD COLUMN "indicaciones" TEXT;

-- AlterTable
ALTER TABLE "Treatment" ADD COLUMN "evolucion" TEXT,
ADD COLUMN "presionSistolica" INTEGER,
ADD COLUMN "presionDiastolica" INTEGER,
ADD COLUMN "frecuenciaCardiaca" INTEGER,
ADD COLUMN "frecuenciaRespiratoria" INTEGER,
ADD COLUMN "temperatura" DOUBLE PRECISION,
ADD COLUMN "peso" DOUBLE PRECISION,
ADD COLUMN "resultadosEstudios" TEXT,
ADD COLUMN "diagnostico" TEXT,
ADD COLUMN "pronostico" TEXT,
ADD COLUMN "indicaciones" TEXT;

-- AlterTable
ALTER TABLE "TreatmentItemProduct" ADD COLUMN "quantity" DOUBLE PRECISION,
ADD COLUMN "unit" TEXT,
ADD COLUMN "route" TEXT,
ADD COLUMN "zone" TEXT,
ADD COLUMN "frequency" TEXT;

-- Record numbers: every existing patient gets one per clinic, in order of registration.
UPDATE "Patient" p SET "recordNumber" = n.rn
FROM (SELECT id, row_number() OVER (PARTITION BY "clinicId" ORDER BY "createdAt", id) AS rn FROM "Patient") n
WHERE p.id = n.id;

-- Birth date and sex move with the patient so every note can show them; copied from the historia.
UPDATE "Patient" p SET "birthDate" = h."fechaNacimiento", "sex" = h."sexo"
FROM "HistoriaClinica" h
WHERE h."patientId" = p.id;

-- CreateIndex
CREATE UNIQUE INDEX "Patient_clinicId_recordNumber_key" ON "Patient"("clinicId", "recordNumber");
