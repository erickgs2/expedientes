export async function register() {
  const { startReminderScheduler } = await import('./lib/notifications/reminder-scheduler');
  startReminderScheduler();
}
