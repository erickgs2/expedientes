# Multi-clinic tenancy

MedCloud serves several clinics from one database. Every row that belongs to a clinic carries a
`clinicId`, and the API never lets one clinic read or change another clinic's rows.

## How a request gets its clinic

1. `withApiErrors` opens a request context (AsyncLocalStorage, `lib/tenancy/context.ts`).
2. `authorize()` / `resolveMembership()` (`lib/rbac/permissions.ts`) load the user's **active
   membership** in an **active clinic** from the database on every request. The JWT's `cid` only
   says which clinic the user prefers; it is never trusted on its own.
3. `setCurrentClinic()` fixes the clinic for the rest of the request. Switching it mid-request
   throws.

Background jobs (the WhatsApp reminder sweep) loop over active clinics and run each one inside
`runAsClinic(clinicId, ...)`.

## How queries are scoped

`prisma` (`lib/prisma/client.ts`) is a Prisma client extension that, for every model in
`TENANT_MODELS` (`lib/tenancy/scope.ts`):

- adds `clinicId` to the `where` of every read, update and delete;
- writes `clinicId` into every create, and refuses a create for another clinic;
- refuses any update that would move a row to another clinic.

Calling a tenant model with no clinic in context throws (`NoClinicContextError`) instead of
silently returning every clinic's data.

`prismaUnscoped` skips all of this. Use it only for code that is genuinely cross-clinic: login,
membership lookup, the reminder sweep's clinic list, and (later) the platform portal.

## Rules when writing code

- **Ids from the request body** (a `patientId`, `treatmentTypeIds`, `contactPatientId`, ...) must
  be checked with `assertInClinic(model, ids)` before they are used in a write. The scoping covers
  the row being written, not the foreign keys inside it.
- **Raw SQL** (`$queryRaw`, `$executeRaw`) is not scoped. Filter by `currentClinicId()` yourself.
- **Files** are stored under the clinic's id; `/api/files` answers 404 for a path that belongs to
  another clinic (`lib/storage/file-access.ts`).
- **A new model** must be added to exactly one of `TENANT_MODELS`, `CHILD_MODELS` or
  `GLOBAL_MODELS`. `schema-coverage.spec.ts` fails until you do, and checks that tenant models have
  a required `clinicId`.

## Classification

| Kind | Models | Why |
| --- | --- | --- |
| Tenant | Patient, AuditLog, HistoriaClinica, Allergy, Valoracion, ValoracionDiagram, Photo, TreatmentType, Treatment, TreatmentItem, Consent, ConsentScan, TreatmentItemDiagram, TreatmentItemPhoto, TreatmentItemProduct, Appointment, Role, ClinicSettings, Membership | Own data of one clinic |
| Child | RolePermission, HistoriaClinicaAllergy, AppointmentTreatmentType, ConsentScanPage | Pure link/detail rows reached only through a tenant parent; no `clinicId` of their own |
| Global | Clinic, User, Permission | A user can belong to several clinics; permissions are a fixed catalogue |

A user who belongs to more than one clinic can change their role and active flag per clinic, but
their name, language and password are shared; a clinic admin can only edit those when the user
belongs to no other clinic.

## Database safety net

Each tenant `clinicId` column defaults to `current_setting('app.clinic_id')`. The app always writes
`clinicId` itself, so the default never fires in normal use; an insert that bypasses the app fails
with "unrecognized configuration parameter" rather than creating a row with no clinic.

## Not yet done

Postgres row-level security (RLS) is planned as a second line of defence. It needs the app to
connect as a non-superuser role and to set `app.clinic_id` per transaction, so it is left for a
later step rather than mixed into this change.

## Migration of the existing clinic

`20261117200000_multi_clinic_expand` creates one clinic (named after `ClinicSettings.clinicName`)
only if the database already has data, assigns every existing row to it and turns each user into a
member with their current role; the earliest Admin becomes the owner.
`20261117200100_multi_clinic_contract` then makes `clinicId` required and adds the indexes and
per-clinic unique keys (role and allergy names are now unique per clinic).
