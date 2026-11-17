# Plans and limits

A clinic is on **Free** or **Premium**. What each plan allows is `PLAN_LIMITS` in
`libs/shared/types/src/lib/plan.ts`, shared by the API (which enforces it) and the web (which only
explains it).

| | Free | Premium |
| --- | --- | --- |
| Active users | 1 (the owner) | Unlimited |
| Active treatment types | 5 | Unlimited |
| Photos and documents | 1 GB | 20 GB |
| Patients, PDF export | Unlimited, yes | Unlimited, yes |
| WhatsApp reminders | No | Yes |
| Custom roles | No (only Admin) | Yes |
| PDF without "Generado con MedCloud" | No | Yes |

## Effective plan

`resolveEffectivePlan` (`apps/api/src/lib/plan/effective-plan.ts`) decides the plan from dates when
it is read, so nothing runs when a period ends:

- **Subscription** (paid, phase 5): Premium until `currentPeriodEnd`; after a failed card charge
  (`PAST_DUE`) until `graceEndsAt`.
- **PlanGrant** (manual, from the platform portal): Premium from `startsAt` to `endsAt` unless
  revoked. Grants queued back to back count as one stretch. A grant ends on the same day N months
  later at 23:59:59 in the clinic's time zone, clamped to the month's last day (`grant-dates.ts`).
- Otherwise **Free**. Free never expires.

`Subscription` and `PlanGrant` are platform rows (`PLATFORM_MODELS`): only the payment flow and the
platform portal write them, always through `prismaUnscoped`.

The founder clinic (every clinic that existed when migration `20261117220000_plans` ran) received a
12-month grant, reason "Clínica fundadora". More can be granted by hand from the portal.

## Enforcement

The API answers **402** with code `PLAN_LIMIT` and `details: PlanLimitDetails`; the web opens the
upgrade dialog instead of an error toast.

- `assertCanAddOne('users' | 'treatmentTypes')`: creating or reactivating a user or a treatment type.
  Only active ones count, so a clinic back on Free can deactivate what is over the limit to make room.
- `assertStorageFor(bytes)`: new valoración photos, treatment photos and product photos. Signing a
  consent (digital or paper scan) is never blocked by storage.
- `assertFeature(feature)`: creating or editing roles; turning WhatsApp messages on and sending a
  test message. The reminder sweep and confirmations stop on their own while the plan lacks
  WhatsApp, without touching the clinic's settings.

## Back on Free

Nothing is deleted or deactivated. Members other than the owner cannot sign in (403
`PLAN_MEMBER_INACTIVE`) and come back as soon as the clinic is on Premium again. The owner cannot be
deactivated. Treatment types and files over the limit keep working; only adding more is blocked.

## Storage accounting

`Clinic.storageBytes` is adjusted by file storage on every write and delete (`storage-accounting.ts`).
Clinics with no `storageCountedAt` are recounted from their stored files when the API starts
(`storage-usage.ts`), which also corrects any drift.

## Prices

`PlanPrice` rows are versions, never edited; the current price is the latest whose `effectiveFrom`
has passed. The first is 150 MXN a month and 15% off for a year (1,530 MXN), IVA included. The
platform portal (phase 4) adds new versions; Stripe prices follow in phase 5.
