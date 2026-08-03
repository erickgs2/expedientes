-- CreateTable
CREATE TABLE "TreatmentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "consentTemplate" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentType_pkey" PRIMARY KEY ("id")
);
