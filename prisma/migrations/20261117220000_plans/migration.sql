-- Plans: paid subscriptions, manual Premium grants, versioned prices and storage accounting.
--
-- Data steps at the end:
--   * every clinic that exists when this runs (the clinic that used MedCloud before it served
--     several clinics) receives 12 months of Premium as the founder clinic, so turning on the Free
--     limits does not deactivate its users or block its treatment types. More can be granted by hand
--     from the platform portal.
--   * the first Premium price: 150 MXN a month, 15% off for a year (1,530 MXN), IVA included.

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'OXXO');

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "storageBytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "storageCountedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'PREMIUM',
    "status" "SubscriptionStatus" NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "graceEndsAt" TIMESTAMP(3),
    "priceId" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanGrant" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'PREMIUM',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "months" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokedReason" TEXT,

    CONSTRAINT "PlanGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanPrice" (
    "id" TEXT NOT NULL,
    "monthlyCents" INTEGER NOT NULL,
    "annualDiscountPercent" INTEGER NOT NULL,
    "annualCents" INTEGER NOT NULL,
    "stripeMonthlyPriceId" TEXT,
    "stripeAnnualPriceId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_clinicId_key" ON "Subscription"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "PlanGrant_clinicId_endsAt_idx" ON "PlanGrant"("clinicId", "endsAt");

-- CreateIndex
CREATE INDEX "PlanPrice_effectiveFrom_idx" ON "PlanPrice"("effectiveFrom");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "PlanPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanGrant" ADD CONSTRAINT "PlanGrant_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Founder Premium: from now until the same day 12 months later at 23:59:59 in the clinic's own
-- time zone (adding months clamps to the month's last day, as the grant rules require).
INSERT INTO "PlanGrant" ("id", "clinicId", "plan", "startsAt", "endsAt", "months", "reason", "grantedBy")
SELECT gen_random_uuid()::text,
       c."id",
       'PREMIUM',
       CURRENT_TIMESTAMP,
       ((date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE c."timeZone") + interval '12 months' + interval '23:59:59')
          AT TIME ZONE c."timeZone"),
       12,
       'Clínica fundadora',
       'migration'
FROM "Clinic" c;

-- First price: 150.00 MXN a month; 150 × 12 × 0.85 = 1,530.00 MXN a year.
INSERT INTO "PlanPrice" ("id", "monthlyCents", "annualDiscountPercent", "annualCents", "createdBy")
VALUES (gen_random_uuid()::text, 15000, 15, 153000, 'migration');
