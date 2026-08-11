-- AlterTable: WhatsApp notification settings move from environment variables into the clinic
-- settings, so they can be changed without a redeploy.
ALTER TABLE "ClinicSettings" ADD COLUMN "whatsappAccessToken" TEXT;
ALTER TABLE "ClinicSettings" ADD COLUMN "whatsappPhoneNumberId" TEXT;
ALTER TABLE "ClinicSettings" ADD COLUMN "whatsappConfirmationTemplate" TEXT;
ALTER TABLE "ClinicSettings" ADD COLUMN "whatsappReminderTemplate" TEXT;
ALTER TABLE "ClinicSettings" ADD COLUMN "whatsappTemplateLanguage" TEXT;
