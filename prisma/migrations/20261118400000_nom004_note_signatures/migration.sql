-- NOM-004-SSA3-2012, phase B (5.10: every note carries date, time, author's full name and
-- signature). Authors and signatures on valoraciones, treatment visits and the clinical history;
-- professional title, licence and signing PIN on users.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "professionalTitle" TEXT,
ADD COLUMN "professionalLicense" TEXT,
ADD COLUMN "signingPinHash" TEXT;

-- AlterTable
ALTER TABLE "Valoracion" ADD COLUMN "createdById" TEXT,
ADD COLUMN "signedById" TEXT,
ADD COLUMN "signedAt" TIMESTAMP(3),
ADD COLUMN "signedHash" TEXT,
ADD COLUMN "signerName" TEXT,
ADD COLUMN "signerTitle" TEXT,
ADD COLUMN "signerLicense" TEXT,
ADD COLUMN "legacyRecord" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Treatment" ADD COLUMN "createdById" TEXT,
ADD COLUMN "signedById" TEXT,
ADD COLUMN "signedAt" TIMESTAMP(3),
ADD COLUMN "signedHash" TEXT,
ADD COLUMN "signerName" TEXT,
ADD COLUMN "signerTitle" TEXT,
ADD COLUMN "signerLicense" TEXT,
ADD COLUMN "legacyRecord" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "HistoriaClinica" ADD COLUMN "createdById" TEXT,
ADD COLUMN "signedById" TEXT,
ADD COLUMN "signedAt" TIMESTAMP(3),
ADD COLUMN "signedHash" TEXT,
ADD COLUMN "signerName" TEXT,
ADD COLUMN "signerTitle" TEXT,
ADD COLUMN "signerLicense" TEXT,
ADD COLUMN "legacyRecord" BOOLEAN NOT NULL DEFAULT false;

-- Every note that exists now was written before electronic signatures: it is labelled as such and
-- is never signed after the fact.
UPDATE "Valoracion" SET "legacyRecord" = true;
UPDATE "Treatment" SET "legacyRecord" = true;
UPDATE "HistoriaClinica" SET "legacyRecord" = true;

-- The author of an existing note is recovered from the audit log: the user who wrote its "create"
-- entry. Notes with no such entry keep a NULL author (shown as "author not recorded").
UPDATE "Valoracion" AS n SET "createdById" = a."userId"
FROM (
  SELECT DISTINCT ON ("entityId") "entityId", "userId"
  FROM "AuditLog" WHERE "action" = 'create' AND "entity" = 'Valoracion'
  ORDER BY "entityId", "createdAt"
) AS a
WHERE a."entityId" = n."id" AND n."createdById" IS NULL;

UPDATE "Treatment" AS n SET "createdById" = a."userId"
FROM (
  SELECT DISTINCT ON ("entityId") "entityId", "userId"
  FROM "AuditLog" WHERE "action" = 'create' AND "entity" = 'Treatment'
  ORDER BY "entityId", "createdAt"
) AS a
WHERE a."entityId" = n."id" AND n."createdById" IS NULL;

UPDATE "HistoriaClinica" AS n SET "createdById" = a."userId"
FROM (
  SELECT DISTINCT ON ("entityId") "entityId", "userId"
  FROM "AuditLog" WHERE "action" = 'create' AND "entity" = 'HistoriaClinica'
  ORDER BY "entityId", "createdAt"
) AS a
WHERE a."entityId" = n."id" AND n."createdById" IS NULL;

-- CreateIndex
CREATE INDEX "Valoracion_createdById_signedAt_idx" ON "Valoracion"("createdById", "signedAt");
CREATE INDEX "Treatment_createdById_signedAt_idx" ON "Treatment"("createdById", "signedAt");
