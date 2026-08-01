# Foundation — Design Spec

Status: approved
Date: 2026-08-01
Depends on: `2026-08-01-project-overview.md`

## Purpose

Stand up the monorepo, auth/RBAC, i18n, theming, the Patient Drive shell, audit logging, file
storage, and the self-hosted deployment scaffold that every later module (Historia Clínica,
Valoración, Treatments, Appointments, Exportar) builds on top of. No clinical modules are built in
this phase — only login, user/role/permission management, the empty Patient Drive with working
patient search, and the app shell (nav, theme toggle, language toggle).

## Architecture

### Monorepo layout (Nx)

```
apps/
  api/                  Next.js — route handlers only, no pages
  web/                  Angular + Angular Material, Capacitor added for iOS/Android later
libs/
  shared/types/         TS interfaces/DTOs shared between api and web
  shared/i18n/          Transloco ES/EN translation JSON files
  api/prisma/           Prisma schema, generated client, migrations
  api/auth/             Auth service: login, JWT issuance/verification, password hashing
  api/rbac/             Role/permission CRUD + permission-check middleware
  api/audit/            Audit log write service + interceptor helper
  api/patients/         Patient CRUD + search (used by Patient Drive; clinical modules extend
                         this later)
  api/storage/          Local-disk file save/read helpers, path resolution
  web/auth/             Login page, auth guard, token/session state
  web/rbac-admin/       User management, role builder, permission matrix UI
  web/patient-drive/    Patient search + ActivePatientStore (signal-based) + patient banner
  web/shared-ui/        App shell (nav, theme toggle, language toggle), Material theme
```

### Backend (`apps/api`)

- Next.js route handlers under `app/api/**/route.ts`, each thin — delegates to a service function
  in the matching `libs/api/*` lib
- Prisma client instantiated once (singleton) in `libs/api/prisma`
- Auth: `POST /api/auth/login` verifies credentials (bcrypt-hashed password), issues a JWT set as
  an httpOnly, secure cookie. `POST /api/auth/logout` clears it. No refresh-token flow for v1 —
  short-lived session, re-login when expired (acceptable for a small clinic staff usage pattern)
- RBAC middleware: a helper `requirePermission(module, action)` reads the user from the JWT,
  loads their role's permissions (cached per-request), and 403s if the action isn't granted. Every
  route handler that touches patient data calls this first
- Audit: a `writeAuditLog({ userId, action, entity, entityId, patientId, metadata })` helper called
  explicitly at the point of mutation/sensitive-read inside each service function (not a blanket
  global interceptor, so it can capture meaningful `entity`/`metadata` per action)
- File storage: `saveFile(buffer, category, patientId)` writes to
  `STORAGE_ROOT/<category>/<patientId>/<uuid>.<ext>` and returns the relative path to store in
  Postgres; `GET /api/files/[...path]` route re-checks RBAC + audit-logs the read before streaming
  the file — files are never served as static assets directly

### Frontend (`apps/web`)

- Angular standalone components, Angular Material with a custom rose/red theme defined via
  Material 3 theming tokens; dark mode via a `[data-theme]` attribute toggle on `<html>`,
  respecting `prefers-color-scheme` as the default
- Transloco configured with `es` as default/fallback locale, `en` as the alternative; language
  choice persisted per-user (stored on the User record, applied on login) and overridable via a
  toggle in the app shell for the current session
- Auth: a login page, an `AuthGuard` on all routes except `/login`, and an `AuthInterceptor` that
  attaches credentials and redirects to `/login` on 401
- RBAC in the UI: a `PermissionDirective` (`*appHasPermission="'patients:edit'"`) hides/disables
  actions the current user's role doesn't grant — this is UX only, the API is the real enforcement
  boundary
- `ActivePatientStore`: an injectable service holding an Angular `signal<Patient | null>`, set by
  the Patient Drive search UI (name/phone/ID) or by selecting an appointment (once Appointments
  exists). A persistent patient banner in the app shell shows the active patient and lets the user
  clear/switch it. Later modules (Historia Clínica, Valoración, Treatments) inject this store
  instead of managing their own patient-selection state
- RBAC admin UI: user list + create/edit (set/reset password, assign role, set language
  preference), role list + create/edit with a permission matrix (module × action checkboxes)

### Data model (Prisma, Foundation-scoped)

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  fullName     String
  language     String   @default("es")
  active       Boolean  @default(true)
  roleId       String
  role         Role     @relation(fields: [roleId], references: [id])
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Role {
  id          String       @id @default(uuid())
  name        String       @unique
  users       User[]
  permissions RolePermission[]
}

model Permission {
  id     String @id @default(uuid())
  module String   // e.g. "patients", "historia-clinica", "valoracion", "treatments",
                   //      "appointments", "export", "rbac-admin"
  action String   // "view" | "create" | "edit" | "delete" | "export"
  roles  RolePermission[]

  @@unique([module, action])
}

model RolePermission {
  roleId       String
  permissionId String
  role         Role       @relation(fields: [roleId], references: [id])
  permission   Permission @relation(fields: [permissionId], references: [id])

  @@id([roleId, permissionId])
}

model Patient {
  id             String   @id @default(uuid())
  fullName       String
  phone          String
  documentId     String
  // clinical fields added by later modules (Historia Clínica, etc.)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([fullName])
  @@index([phone])
  @@index([documentId])
}

model AuditLog {
  id        String   @id @default(uuid())
  userId    String
  action    String   // "create" | "update" | "delete" | "view"
  entity    String   // e.g. "Patient", "Consent"
  entityId  String
  patientId String?
  metadata  Json?
  createdAt DateTime @default(now())
}
```

`Patient` here is intentionally minimal — just enough for search/select in the Patient Drive.
Historia Clínica's module spec will extend it with the clinical fields captured in the project
overview doc.

### Deployment

`docker-compose.yml` at the repo root with three services:

- `db` — `postgres:16`, named volume for data
- `api` — built Next.js app, env vars for `DATABASE_URL`, `JWT_SECRET`, `STORAGE_ROOT`,
  WhatsApp API credentials (unused until Appointments phase)
- `web` — Angular production build served by nginx, reverse-proxies `/api/*` to the `api` service

A separate named volume mounted into `api` at `STORAGE_ROOT` holds uploaded files, so it survives
container recreation and can be backed up alongside the `db` volume.

### Error handling

- API: route handlers return structured JSON errors `{ error: { code, message } }` with correct
  HTTP status (400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 500 unexpected);
  a shared `handleApiError` wraps service-layer exceptions
- Web: an `ErrorInterceptor` catches non-2xx responses, shows a Material snackbar with a
  translated message, and redirects to `/login` specifically on 401

### Testing (low effort, per user instruction)

- Unit tests only, no e2e:
  - `libs/api/auth`: password hashing/verification, JWT issuance/verification
  - `libs/api/rbac`: `requirePermission` allow/deny logic
  - `libs/api/patients`: search query building (name/phone/document matching)
- No UI component tests, no integration tests against a real Postgres instance for this phase —
  the user will test manually end-to-end
