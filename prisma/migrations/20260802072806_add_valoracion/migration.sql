-- CreateTable
CREATE TABLE "Valoracion" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queQuiereElPaciente" TEXT,
    "queNecesitaElPaciente" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Valoracion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Valoracion_patientId_idx" ON "Valoracion"("patientId");

-- AddForeignKey
ALTER TABLE "Valoracion" ADD CONSTRAINT "Valoracion_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
