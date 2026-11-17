export async function register() {
  // A process that only renders PDFs (api-pdf on the Mac) must not run the reminder sweep too, or
  // every patient would get each WhatsApp reminder twice.
  if (process.env.DISABLE_REMINDER_SCHEDULER === 'true') return;
  const { startReminderScheduler } = await import('./lib/notifications/reminder-scheduler');
  startReminderScheduler();
}
