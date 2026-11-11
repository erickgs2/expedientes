-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "arrivedAt" TIMESTAMP(3),
ADD COLUMN     "confirmationSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ClinicSettings" ADD COLUMN     "whatsappNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- A clinic that already stored WhatsApp credentials was sending messages before this switch
-- existed; keep it sending so the upgrade does not silently stop its reminders.
UPDATE "ClinicSettings"
SET "whatsappNotificationsEnabled" = true
WHERE COALESCE(TRIM("whatsappAccessToken"), '') <> ''
  AND COALESCE(TRIM("whatsappPhoneNumberId"), '') <> '';
