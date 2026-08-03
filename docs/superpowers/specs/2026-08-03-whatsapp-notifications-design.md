# Appointment Management — Sub-project 2: WhatsApp Notifications

Status: approved
Date: 2026-08-03

## Purpose

Automatically notify patients about their appointments over WhatsApp: a booking confirmation sent
the moment an appointment is created, and a reminder sent shortly before it starts. This is
sub-project 2 of 2 for the "Appointment management" module (see `2026-08-01-project-overview.md`).
Sub-project 1 (Appointment core) is complete and this builds directly on top of it — no changes to
Appointment core's booking/editing/calendar UI are needed.

## Scope

In scope:
- A booking confirmation message, sent right after an appointment is created.
- A reminder message, sent 2 hours before the appointment's start time.
- Integration with Meta's WhatsApp Cloud API directly (not Twilio or another provider).
- Best-effort, non-blocking delivery: a failed or slow WhatsApp send never fails, delays, or
  changes the response of any appointment API call.
- An audit-log entry for every send attempt (success or failure), for visibility without new UI.

Out of scope (deferred):
- Any provider other than Meta's Cloud API.
- A cancellation notice — cancelling an appointment (`status = CANCELLED`) simply makes it
  permanently ineligible for its reminder; no WhatsApp message is sent about the cancellation
  itself.
- Re-sending a confirmation when an appointment is edited/rescheduled — the reminder scheduler
  always reads the appointment's *current* `startTime`/`status` at send time, so an edited time
  automatically reschedules the reminder for free; no separate "your appointment changed" message.
- Patient opt-out of notifications — every booked appointment gets both messages, matching how the
  rest of this app has no per-patient consent toggles yet.
- Any in-app management of WhatsApp message template content — templates are authored and approved
  entirely in Meta Business Manager (a manual, external process); this app only references their
  names via configuration and supplies the same three parameters (patient name, date, time) to
  either one.
- Any retry-count tracking, backoff schedule, or dead-letter handling for failed sends — retries
  are implicit and self-limiting (see Architecture).

## Architecture

### Configuration

New environment variables (documented in `.env.example`, no in-code defaults, git-ignored `.env`
holds the real values):
- `WHATSAPP_ACCESS_TOKEN` — Meta Cloud API access token (system-user/permanent token).
- `WHATSAPP_PHONE_NUMBER_ID` — the registered sender phone number's Meta-assigned id.
- `WHATSAPP_CONFIRMATION_TEMPLATE` — the approved template name for booking confirmations.
- `WHATSAPP_REMINDER_TEMPLATE` — the approved template name for reminders.
- `WHATSAPP_TEMPLATE_LANGUAGE` — the template's registered language code (e.g. `es_MX`).

If `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` is unset, the feature no-ops: a single
warning is logged the first time a send is attempted, and every subsequent attempt returns
immediately without an HTTP call, an error, or a thrown exception. This lets local development run
normally without real Meta credentials configured.

### WhatsApp client

`apps/api/src/lib/notifications/whatsapp-client.ts` — a thin `fetch`-based wrapper, no SDK
dependency (matching how the rest of this app avoids heavy libraries for simple external HTTP
calls):

```ts
export async function sendTemplateMessage(
  to: string,
  templateName: string,
  parameters: string[]
): Promise<void>
```

Posts to `https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages` with Meta's
standard template-message body shape (`messaging_product: 'whatsapp'`, `type: 'template'`,
`template: { name, language: { code: WHATSAPP_TEMPLATE_LANGUAGE }, components: [{ type: 'body',
parameters: parameters.map(text => ({ type: 'text', text })) }] }`), authorized via
`Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}`. Throws on a non-2xx response or a network error;
callers are responsible for catching.

### Phone normalization

`apps/api/src/lib/notifications/phone.ts`:

```ts
export function toWhatsAppNumber(phone: string): string | null
```

Strips every non-digit character from `Patient.phone`. If the result already looks like it has a
country code (11+ digits), it's used as-is with a leading `+`; otherwise `+52` (Mexico) is
prepended. Returns `null` if what's left has too few digits to plausibly be a phone number (fewer
than 10 digits) — callers skip the send and log this as a failed attempt rather than calling the
API with garbage input.

### Data model

One new field on the existing `Appointment` model:

```prisma
model Appointment {
  // ...existing fields unchanged...
  reminderSentAt DateTime?
}
```

`null` until a reminder is successfully sent; never touched by the confirmation path. No new model
is needed — everything else needed to build both messages (patient name, start time) already
exists on `Appointment`/`Patient`.

### Notification functions

`apps/api/src/lib/notifications/appointment-notifications.ts`:

```ts
export async function sendConfirmation(appointment: {
  id: string; patientId: string; startTime: Date;
}): Promise<void>

export async function runReminderSweep(): Promise<void>
```

Both build the same three template parameters — patient's `fullName`, the appointment's date
formatted `es-MX`-style, and its time — and pass them to `sendTemplateMessage` with the
confirmation or reminder template name respectively. Both:
1. Look up the patient's phone via `patientId`, normalize it with `toWhatsAppNumber`; if `null`,
   log a failed audit entry and return without calling the API.
2. Call `sendTemplateMessage`, catching any thrown error.
3. Write a `writeAuditLogSafe` entry regardless of outcome: `entity: 'AppointmentNotification'`,
   `entityId: appointment.id`, `patientId`, `action: 'create'`, `metadata: { kind:
   'confirmation'|'reminder', success: boolean }`.

`sendConfirmation` is called once, synchronously (inside a try/catch that swallows any error), from
`POST /api/appointments`'s route handler, immediately after the Prisma create succeeds and before
the response is returned.

`runReminderSweep` queries:
```ts
prisma.appointment.findMany({
  where: {
    reminderSentAt: null,
    status: { not: 'CANCELLED' },
    startTime: { gt: now, lte: new Date(now.getTime() + 2 * 60 * 60 * 1000) },
  },
})
```
This catches any not-yet-reminded, non-cancelled appointment whose start time is *within* the next
2 hours — not exactly at the 2-hour mark. For an appointment booked well in advance, that means the
reminder goes out close to 2 hours ahead, the first time a sweep notices it's entered the window.
For a last-minute booking made *inside* that window (e.g. booked 40 minutes before it starts), the
very next sweep sends the reminder immediately rather than waiting for a 2-hour mark that's already
passed — a shorter-notice reminder is still more useful than none, and this is the intended
behavior, not an edge case to special-case around.

For each match, calls `sendConfirmation`'s reminder counterpart and — only on a successful send —
sets `reminderSentAt = new Date()`. A failed send leaves `reminderSentAt` null, so the next sweep
retries it; once `startTime` passes, the appointment falls out of the query's `gt: now` bound and
is never retried again. This is the entire retry mechanism — no retry-count field, no backoff.

### Scheduler bootstrap

`apps/api/src/instrumentation.ts` (Next.js's standard server-startup hook — this app deploys as a
single long-lived Docker container via `next start`/`output: 'standalone'`, not serverless, so an
in-process interval is the correct, simplest mechanism; no Redis or job queue is introduced):

```ts
export async function register() {
  const { startReminderScheduler } = await import('./lib/notifications/reminder-scheduler');
  startReminderScheduler();
}
```

`apps/api/src/lib/notifications/reminder-scheduler.ts` exports `startReminderScheduler(): void`,
which calls `runReminderSweep()` immediately once, then every 5 minutes via `setInterval`. Each
sweep run is wrapped in try/catch so one failed sweep (e.g. a transient DB error) doesn't stop
future sweeps from running.

### Permissions

No new permission module. Both notification paths run as part of the existing
`appointments:create`-gated create flow and an unauthenticated background sweep (there is no HTTP
request to gate — the scheduler runs entirely server-side).

## Error Handling

Every WhatsApp send is best-effort: a thrown error from `sendTemplateMessage` is always caught at
the call site, logged to the server console, and recorded in the audit log as a failed attempt.
Nothing about appointment creation, editing, or the reminder sweep's own scheduling can fail
because of a WhatsApp API problem.

## Testing

Same low-effort convention as every prior module: no automated tests, verified by building and
manual/API-level testing. Unlike prior sub-projects, this one has no real Meta sandbox available in
this environment — manual verification is limited to confirming the outbound request shape (URL,
headers, body) is correct and that the reminder sweep's query/eligibility logic behaves as
designed (e.g., an appointment inside the 2-hour window is picked up, a cancelled one is not, one
already marked `reminderSentAt` is not re-sent), not an actual end-to-end WhatsApp delivery.
