-- CreateEnum
CREATE TYPE "PhotoTag" AS ENUM ('BEFORE', 'AFTER');

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "valoracionId" TEXT NOT NULL,
    "tag" "PhotoTag" NOT NULL,
    "filePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Photo_patientId_idx" ON "Photo"("patientId");

-- CreateIndex
CREATE INDEX "Photo_valoracionId_idx" ON "Photo"("valoracionId");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_valoracionId_fkey" FOREIGN KEY ("valoracionId") REFERENCES "Valoracion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
