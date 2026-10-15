# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A doctor and her assistant at an aesthetic medicine clinic, working in the consulting room, mostly on a tablet or phone in front of the patient. They record clinical history, annotate facial diagrams, take photos, and have patients sign consents. Other staff (e.g. reception) may be given narrower access through custom RBAC roles.

## Product Purpose

Electronic patient records for an aesthetic medicine clinic: clinical history, facial assessments (valoración) with annotated diagrams and photography, treatments with product traceability, legally structured informed consents, appointments with WhatsApp reminders, and a PDF export of the whole record. Success: the paper chart is replaced without slowing down the consultation.

## Positioning

Built around one clinic's real workflow rather than a generic EMR: facial-diagram annotation with close-ups, treatment product lot traceability, and consent documents structured as legal instruments.

## Operating Context

- Interface is Spanish-first, with English translations (Transloco).
- Consent documents always print in Spanish regardless of interface language: a signed consent is an archived legal instrument and must reproduce exactly as signed.
- Self-hosted deployment; Mobile is a Capacitor shell (iOS/Android) pointing at the deployed web app, so design language is web.
- Access is gated by custom-role RBAC (module:action permissions, e.g. `patients:delete`), and sensitive actions are audit-logged.

## Capabilities and Constraints

- Angular 22 + Angular Material (M3 `mat.theme()` tokens), Next.js API, PostgreSQL/Prisma.
- Patient data is sensitive health data; irreversible actions (e.g. permanent patient deletion) need explicit confirmation and a dedicated permission.
- Brand identity, visual voice and accessibility standard are not defined yet.

## Brand Commitments

None confirmed. Undecided.

## Evidence on Hand

No testimonials, customers or metrics on hand; do not fabricate any.

## Product Principles

1. Clinical accuracy and data integrity outrank convenience.
2. Usable one-handed on a tablet or phone, mid-consultation.
3. Spanish first; legal documents stay faithful to what was signed.
4. Destructive and sensitive actions are permission-gated, confirmed, and audited.

## Accessibility & Inclusion

No specific standard established.
