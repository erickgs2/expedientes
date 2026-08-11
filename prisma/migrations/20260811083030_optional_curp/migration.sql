-- AlterTable: the CURP is optional at registration; NULL means "not recorded yet".
ALTER TABLE "Patient" ALTER COLUMN "documentId" DROP NOT NULL;
