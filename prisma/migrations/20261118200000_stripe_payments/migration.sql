-- Payments with Stripe: the clinic's Stripe customer, OXXO renewal reminders, and the log of applied
-- webhook events (by Stripe event id, so a redelivered event is applied once).

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "renewalNotice1SentAt" TIMESTAMP(3),
ADD COLUMN     "renewalNotice7SentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "clinicId" TEXT,
    "amountCents" INTEGER,
    "summary" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_stripeCustomerId_key" ON "Clinic"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "PaymentEvent_clinicId_receivedAt_idx" ON "PaymentEvent"("clinicId", "receivedAt");
