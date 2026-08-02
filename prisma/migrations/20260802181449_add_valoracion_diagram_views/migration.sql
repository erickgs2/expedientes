-- CreateEnum
CREATE TYPE "DiagramView" AS ENUM ('FRONT', 'LEFT_PROFILE', 'RIGHT_PROFILE');

-- CreateTable
CREATE TABLE "ValoracionDiagram" (
    "id" TEXT NOT NULL,
    "valoracionId" TEXT NOT NULL,
    "view" "DiagramView" NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValoracionDiagram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ValoracionDiagram_valoracionId_view_key" ON "ValoracionDiagram"("valoracionId", "view");

-- AddForeignKey
ALTER TABLE "ValoracionDiagram" ADD CONSTRAINT "ValoracionDiagram_valoracionId_fkey" FOREIGN KEY ("valoracionId") REFERENCES "Valoracion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: copy any diagram data saved during Phase 1 (a single value on the Valoracion row
-- itself) into a FRONT-view row in the new table, before the source columns are dropped below.
-- Phase 1 only ever had one view, and every save always set diagramUpdatedAt alongside
-- diagramData, so COALESCE is a defensive fallback, not an expected path.
INSERT INTO "ValoracionDiagram" ("id", "valoracionId", "view", "data", "updatedAt")
SELECT gen_random_uuid(), "id", 'FRONT', "diagramData", COALESCE("diagramUpdatedAt", "updatedAt")
FROM "Valoracion"
WHERE "diagramData" IS NOT NULL;

-- AlterTable
ALTER TABLE "Valoracion" DROP COLUMN "diagramData",
DROP COLUMN "diagramUpdatedAt";
