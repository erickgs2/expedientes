import { runReminderSweep } from './appointment-notifications';

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function runSweepSafely(): Promise<void> {
  try {
    await runReminderSweep();
  } catch (error) {
    // A failed sweep (e.g. a transient DB error) must not stop future sweeps from running.
    console.error('Reminder sweep failed', error);
  }
}

/**
 * Starts the in-process reminder-sweep loop. Called once per server process by
 * `instrumentation.ts`'s `register()` hook. This app runs as a single long-lived Docker container
 * (`next start`, `output: 'standalone'`), not serverless, so a plain `setInterval` is the correct,
 * simplest mechanism — no external cron, queue, or Redis dependency is introduced.
 */
export function startReminderScheduler(): void {
  runSweepSafely();
  setInterval(runSweepSafely, SWEEP_INTERVAL_MS);
}
