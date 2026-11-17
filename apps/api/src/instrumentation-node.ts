/** Server start-up work, Node.js runtime only (see instrumentation.ts). */
export async function registerNode(): Promise<void> {
  // A process that only renders PDFs (api-pdf on the Mac) must not run the reminder sweep too, or
  // every patient would get each WhatsApp reminder twice.
  if (process.env.DISABLE_REMINDER_SCHEDULER === 'true') return;
  // Clinics that predate storage accounting get their usage measured once, in the background, so
  // starting the API does not wait on reading every stored file.
  void import('./lib/plan/storage-usage')
    .then(({ recountUncountedClinics }) => recountUncountedClinics())
    .catch((error) => console.error('Storage recount failed', error));
  const { startReminderScheduler } = await import('./lib/notifications/reminder-scheduler');
  startReminderScheduler();
}
