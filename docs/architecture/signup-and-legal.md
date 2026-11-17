# Sign-up, invitations, password reset and legal documents

## Sign-up (`/registro`)

1. The person enters their name, the clinic's name and phone (10 digits, Mexico), email and a
   password (at least 10 characters, typed twice).
2. They read the privacy notice and terms in force and tick both required boxes; a third, optional
   box covers promotions and surveys. With Turnstile configured, the CAPTCHA must pass.
3. `POST /api/auth/signup` stores a `PendingSignup` and emails a 6-digit code. **Nothing else
   exists yet.** If the email already has an account, the answer is identical and that inbox gets
   an "you already have an account" email instead, so the form never reveals who is registered.
4. `POST /api/auth/signup/verify` checks the code and, in one transaction, creates the user, the
   clinic (settings, Admin role with every permission, owner membership; on Free) and the record of
   the accepted legal versions, then signs the owner in.

Codes (`lib/auth/email-code.ts`): `crypto.randomInt`, stored only as an HMAC bound to the address,
valid 10 minutes, 5 wrong tries, a new one at most once a minute and five times an hour. Public
endpoints are also limited per IP (`lib/auth/public-throttle.ts`). Emails are stored lower-cased;
sign-in matches emails without regard to case.

## Password reset (`/recuperar`)

The same code mechanism (`PasswordResetCode`, one per user). Unknown emails get the same answer and
no email. Confirming sets the new password and signs the user in.

## Invitations

Users join a clinic only by invitation (`POST /api/invitations`); the old "create user with a
password" endpoint is gone, because it let a clinic claim anyone's email. An invitation:

- holds a seat against the plan's user limit while pending (Free, owner only, cannot invite);
- is a link with a random token (only its SHA-256 is stored), valid 7 days; inviting the same email
  again replaces the earlier link;
- is accepted at `/invitacion/:token`: a new person sets name and password, an existing account
  confirms with its password and gains a membership in one more clinic. Both accept the legal
  versions in force.

## Legal documents

`LegalDocument` rows are immutable versions of the privacy notice (`PRIVACY`) and terms (`TERMS`),
written in the Markdown subset of `libs/shared/types/src/lib/legal-markdown.ts` and rendered by the
web without injecting HTML. The version in force is the latest whose `effectiveFrom` has passed.
Public pages: `/privacidad`, `/terminos` (with earlier versions).

`TermsAcceptance` records who accepted which version, when, from which IP and browser, and (for the
privacy notice) the marketing choice. Sign-up and invitations refuse a form whose versions are no
longer in force (`LEGAL_OUTDATED`).

When a version in force has `requiresAcceptance`, every user who has not accepted it sees a blocking
dialog (accept or sign out); `AuthUser.pendingLegal` carries the list. Publishing versions and
notifying users by email belong to the platform portal (phase 4).

Version 1.0 of both documents (`prisma/legal/*.md`, seeded by migration `20261118000000_signup_legal`)
are **drafts pending legal review**: they do not require existing users to accept them, and their
bracketed placeholders must be filled before real clinics sign up.

## Email

`lib/email/send-email.ts` posts to Resend's API with `RESEND_API_KEY` and `MAIL_FROM`; without the
key, emails go to the API log. Templates (`lib/email/templates.ts`) are Spanish, with inline styles
and escaped values. `APP_BASE_URL` sets the links.
