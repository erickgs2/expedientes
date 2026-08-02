-- CreateTable
CREATE TABLE "HistoriaClinica" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ocupacion" TEXT,
    "fechaNacimiento" TIMESTAMP(3),
    "sexo" TEXT,
    "queQuiereElPaciente" TEXT,
    "queNecesitaElPaciente" TEXT,
    "atributosEmocionales" TEXT,
    "enfermedadesActuales" TEXT,
    "medicamentosAcne3Meses" TEXT,
    "cirugiasEsteticasAnteriores" TEXT,
    "rutinaCuidadoFacial" TEXT,
    "consumoAlcohol" TEXT,
    "consumoTabaco" TEXT,
    "consumoDrogas" TEXT,
    "tipoFrecuenciaEjercicio" TEXT,
    "vacunas" TEXT,
    "posibilidadEmbarazo" TEXT,
    "antecedentesHeredofamiliares" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoriaClinica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allergy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Allergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoriaClinicaAllergy" (
    "historiaClinicaId" TEXT NOT NULL,
    "allergyId" TEXT NOT NULL,

    CONSTRAINT "HistoriaClinicaAllergy_pkey" PRIMARY KEY ("historiaClinicaId","allergyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "HistoriaClinica_patientId_key" ON "HistoriaClinica"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Allergy_name_key" ON "Allergy"("name");

-- AddForeignKey
ALTER TABLE "HistoriaClinica" ADD CONSTRAINT "HistoriaClinica_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoriaClinicaAllergy" ADD CONSTRAINT "HistoriaClinicaAllergy_historiaClinicaId_fkey" FOREIGN KEY ("historiaClinicaId") REFERENCES "HistoriaClinica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoriaClinicaAllergy" ADD CONSTRAINT "HistoriaClinicaAllergy_allergyId_fkey" FOREIGN KEY ("allergyId") REFERENCES "Allergy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
