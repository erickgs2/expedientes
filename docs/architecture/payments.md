# Payments (Stripe)

Premium is sold two ways, both through Stripe Checkout, so card details never reach MedCloud:

| Method | Stripe | Renewal | Notes |
| --- | --- | --- | --- |
| Credit or debit card | Checkout in `subscription` mode | Automatic | Monthly or yearly price of the version in force |
| OXXO | Checkout in `payment` mode, `oxxo` | Manual: one voucher per period | Voucher valid `OXXO_VOUCHER_DAYS` (default 3); confirmed the next business day; no refunds |

Only the clinic's owner can buy (`POST /api/billing/checkout`) or open Stripe's customer portal
(`POST /api/billing/portal`: change card, receipts, cancel). Without `STRIPE_SECRET_KEY` both answer
503 and the Plan screen keeps saying online payment is coming.

## State

Stripe is the source of truth for card subscriptions. The webhook (`POST /api/stripe/webhook`) verifies
the `Stripe-Signature` header (HMAC-SHA256 with `STRIPE_WEBHOOK_SECRET`, 5-minute tolerance) and then,
for every subscription event, **re-reads the subscription from Stripe** and writes it to MedCloud's
`Subscription`, so late or out-of-order events cannot leave an older state:

- `active` / `trialing` → ACTIVE (CANCELED if set to cancel at period end; Premium lasts to then)
- `past_due` / `unpaid` / `incomplete` → PAST_DUE with 7 days of grace, set once
- `canceled` → CANCELED, period closed when it ended

Events handled: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `invoice.paid`, `invoice.payment_failed`,
`customer.subscription.updated`, `customer.subscription.deleted`. Each event id is stored in
`PaymentEvent`; a redelivered event is skipped. A paid OXXO voucher adds 1 or 12 months to whatever is
still prepaid (in the clinic's time zone), in the same transaction that records the event, so it can
never be added twice.

Moving from OXXO to card: the subscription starts with a trial until the prepaid period ends, so the
first card charge comes when the OXXO time runs out.

## Prices

Each `PlanPrice` version gets two Stripe prices (monthly and yearly, MXN, IVA included, under the
product `medcloud_premium`). Saving a new version in the platform portal creates them and archives the
old ones; existing subscriptions keep their price (Stripe never moves them). Checkout also creates any
missing price on demand.

## Emails

Payment received (card and OXXO), card charge failed (with the grace date), and for OXXO a reminder 7
days and 1 day before the prepaid period ends.

## Not yet

- CFDI invoices (after launch; tax details are already stored optionally on the clinic).
- Refunds: OXXO cannot be refunded; any compensation is given as manual Premium from the portal.
- Moving active subscriptions to a new price (they keep theirs).
