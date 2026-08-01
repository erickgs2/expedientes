# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Nx monorepo (Next.js API + Angular web app), Prisma/Postgres, JWT auth with a
custom-role RBAC system, bilingual (ES/EN) i18n, an Angular Material rose/red light/dark theme,
audit logging, local file storage, and the Patient Drive shell — the foundation every later
clinical module (Historia Clínica, Valoración, Treatments, Appointments, Exportar) builds on.

**Architecture:** Nx monorepo with two apps (`apps/api` — Next.js route handlers only, `apps/web`
— Angular + Angular Material) and one genuinely shared library (`libs/shared/types`). Backend
service logic lives in `apps/api/src/lib/**` as plain, independently-testable modules (route
handlers stay thin wrappers); this is simpler than generating a separate Nx library per backend
concern and there's only one consumer (the api app) so a hard library boundary buys nothing yet.
Frontend feature code lives in `apps/web/src/app/**` folders for the same reason — `apps/web` is
the only Angular consumer (Capacitor wraps this same app later, it doesn't add a second app).

**Tech Stack:** Nx, Next.js (route handlers), Prisma, PostgreSQL, Angular (standalone components,
signals), Angular Material, Transloco, bcryptjs, jsonwebtoken, Jest.

## Global Constraints

- Default UI language is Spanish (`es`); English (`en`) is available via a runtime toggle. All
  code, identifiers, comments, and commit messages are in English regardless of UI language.
- Testing is low-effort: unit tests only for `apps/api/src/lib/auth`, `apps/api/src/lib/rbac`, and
  `apps/api/src/lib/patients` search-query building. No e2e suite, no UI component tests, no tests
  against a real Postgres instance — the user tests manually end to end.
- Deployment is self-hosted via docker-compose (Postgres + Next.js API + Angular/nginx) on the
  clinic's own server — no managed cloud services.
- Single clinic, single doctor calendar, multiple staff users — no multi-tenancy.
- RBAC is a fully custom role builder: Admin can create arbitrary roles and toggle per-module,
  per-action permissions. No self-registration, no email-based password reset — Admin sets
  passwords directly.
- Angular Material theme uses a custom rose primary palette and a red accent/warn palette, with
  light and dark modes.
- Commit after every task using the working tree state left by that task's steps.
- Next.js dynamic route handlers use async `params` (`{ params }: { params: Promise<{ id: string }> }`,
  destructured via `const { id } = await params;`) — this workspace was scaffolded on Next.js 16,
  where `params` is a Promise, not a plain object. Every `[id]/route.ts` and `[...path]/route.ts`
  handler in this plan uses this form.

---

## Task 1: Nx workspace, Next.js API app, Angular web app

**Files:**
- Create: entire Nx workspace at repo root (generated)
- Create: `apps/api/` (Next.js app, generated + trimmed)
- Create: `apps/web/` (Angular app, generated)
- Create: `.gitignore` additions (generated `node_modules`, `dist`, `.env`)

**Interfaces:**
- Produces: a working `npx nx build api` and `npx nx build web` — later tasks assume these
  commands succeed and that `apps/api/src/app/api/**/route.ts` is where Next.js route handlers go,
  and `apps/web/src/app/**` is where Angular app code goes.

- [ ] **Step 1: Scaffold a throwaway Nx workspace and merge it into this repo**

The repo root already has `docs/` and `.git` from the brainstorming phase, so generate into a
temp directory and merge rather than pointing the generator at a non-empty directory:

```bash
npx create-nx-workspace@latest tmp-workspace --preset=apps --packageManager=npm --nxCloud=skip
rm -rf tmp-workspace/.git
rsync -a tmp-workspace/ ./
rm -rf tmp-workspace
npm pkg set name=expedientes
```

- [ ] **Step 2: Add the Next.js and Angular Nx plugins**

```bash
npm install -D @nx/next @nx/angular
```

- [ ] **Step 3: Generate the API app**

```bash
npx nx g @nx/next:app api --directory=apps/api --e2eTestRunner=none --unitTestRunner=jest
```

Inspect the generated tree with `ls apps/api/src` — recent `@nx/next` versions generate an App
Router app at `apps/api/src/app/`. If instead you see `apps/api/pages`, this repo has an older
`@nx/next` version using the Pages Router; if that happens, stop and re-run
`npm install -D @nx/next@latest` before continuing, since all later API tasks assume App Router
route handlers under `apps/api/src/app/api/**/route.ts`.

- [ ] **Step 4: Generate the web app**

```bash
npx nx g @nx/angular:app web --directory=apps/web --style=scss --standalone=true --routing=false --e2eTestRunner=none
```

- [ ] **Step 5: Verify both apps build**

```bash
npx nx build api
npx nx build web
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Nx workspace with api (Next.js) and web (Angular) apps"
```

---

## Task 2: Postgres (dev), Prisma schema, initial migration

This machine already has a native (non-Docker) PostgreSQL server running locally, so this task
connects to that instead of provisioning a dev Postgres container. `docker-compose.prod.yml`
(Task 18) is unaffected — that targets the production deployment server, which does use
containerized Postgres.

**Files:**
- Create: `.env.example`
- Create: `.env` (gitignored)
- Create: `prisma/schema.prisma`
- Modify: `package.json` (add `prisma` config block, `dependencies`: `@prisma/client`,
  `devDependencies`: `prisma`)

**Interfaces:**
- Produces: `User`, `Role`, `Permission`, `RolePermission`, `Patient`, `AuditLog` Prisma models,
  and a generated `@prisma/client` — every later backend task imports `PrismaClient` from
  `@prisma/client`.

- [ ] **Step 1: Add Prisma**

```bash
npm install @prisma/client
npm install -D prisma tsx
```

- [ ] **Step 2: Point Prisma at the local native Postgres instance**

The controller will give you the exact `DATABASE_URL` connection string for the already-running
local Postgres server (host `localhost`, port `5432`) in the dispatch message — use that exact
value, do not invent credentials. If the `expedientes` database referenced by that URL doesn't
exist yet, create it with `psql` using the same connection's admin user before running the
migration in Step 5, e.g.:

```bash
psql "<connection string without the trailing /expedientes>" -c 'CREATE DATABASE expedientes;'
```

- [ ] **Step 3: Env files**

Create `.env.example` (placeholder values only — never put the real local password in this
committed file):

```
DATABASE_URL="postgresql://username:password@localhost:5432/expedientes"
JWT_SECRET="change-me-in-production"
STORAGE_ROOT="./storage"
SEED_ADMIN_EMAIL="admin@clinic.local"
SEED_ADMIN_PASSWORD="ChangeMe123!"
```

Create `.env` (gitignored — confirm `.env` is in `.gitignore`, add it if the Nx generator didn't
already) with the same keys, using the real `DATABASE_URL` the controller gave you for
`DATABASE_URL` and the same placeholder-equivalent values shown above for the rest.

- [ ] **Step 4: Prisma schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

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
  id          String           @id @default(uuid())
  name        String           @unique
  users       User[]
  permissions RolePermission[]
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
}

model Permission {
  id     String           @id @default(uuid())
  module String
  action String
  roles  RolePermission[]

  @@unique([module, action])
}

model RolePermission {
  roleId       String
  permissionId String
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
}

model Patient {
  id         String   @id @default(uuid())
  fullName   String
  phone      String
  documentId String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([fullName])
  @@index([phone])
  @@index([documentId])
}

model AuditLog {
  id        String   @id @default(uuid())
  userId    String
  action    String
  entity    String
  entityId  String
  patientId String?
  metadata  Json?
  createdAt DateTime @default(now())

  @@index([patientId])
  @@index([userId])
}
```

- [ ] **Step 5: Run the initial migration**

```bash
npx prisma migrate dev --name init
```

Expected: migration applies cleanly, `node_modules/@prisma/client` is generated.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema and initial migration"
```

(`.env` stays untracked; `.env.example` is committed.)

---

## Task 3: Shared types library

**Files:**
- Create: `libs/shared/types/src/index.ts`
- Create: `libs/shared/types/src/lib/permissions.ts`
- Create: `libs/shared/types/src/lib/auth.ts`
- Create: `libs/shared/types/src/lib/patient.ts`
- Create: `libs/shared/types/src/lib/api-error.ts`

**Interfaces:**
- Produces: `PermissionModule`, `PermissionAction`, `AuthUser`, `PatientSummary`, `ApiErrorBody` —
  imported by both `apps/api` and `apps/web` in every later task.

- [ ] **Step 1: Generate the library**

```bash
npx nx g @nx/js:lib types --directory=libs/shared/types --unitTestRunner=none --bundler=none --importPath=@expedientes/shared-types
```

The explicit `--importPath` guarantees the library is importable as `@expedientes/shared-types`
regardless of the workspace's default npm scope — every later frontend task imports from that
exact path.

- [ ] **Step 2: Write the shared types**

`libs/shared/types/src/lib/permissions.ts`:

```typescript
export type PermissionModule =
  | 'patients'
  | 'historia-clinica'
  | 'valoracion'
  | 'treatments'
  | 'appointments'
  | 'export'
  | 'rbac-admin';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

export function permissionKey(module: PermissionModule, action: PermissionAction): string {
  return `${module}:${action}`;
}
```

`libs/shared/types/src/lib/auth.ts`:

```typescript
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  language: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
}
```

`libs/shared/types/src/lib/patient.ts`:

```typescript
export interface PatientSummary {
  id: string;
  fullName: string;
  phone: string;
  documentId: string;
}

export interface CreatePatientRequest {
  fullName: string;
  phone: string;
  documentId: string;
}
```

`libs/shared/types/src/lib/api-error.ts`:

```typescript
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
```

`libs/shared/types/src/index.ts`:

```typescript
export * from './lib/permissions';
export * from './lib/auth';
export * from './lib/patient';
export * from './lib/api-error';
```

- [ ] **Step 3: Verify it builds and is importable**

```bash
npx nx build types
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add shared types library"
```

---

## Task 4: Prisma client singleton, password hashing, JWT, session helpers (TDD)

**Files:**
- Create: `apps/api/src/lib/prisma/client.ts`
- Create: `apps/api/src/lib/auth/password.ts`
- Create: `apps/api/src/lib/auth/password.spec.ts`
- Create: `apps/api/src/lib/auth/jwt.ts`
- Create: `apps/api/src/lib/auth/jwt.spec.ts`
- Create: `apps/api/src/lib/auth/session.ts`

**Interfaces:**
- Consumes: none (first backend logic task)
- Produces: `prisma` (singleton `PrismaClient`), `hashPassword(plain): Promise<string>`,
  `verifyPassword(plain, hash): Promise<boolean>`, `issueToken(payload: AuthTokenPayload): string`,
  `verifyToken(token: string): AuthTokenPayload`, `AuthTokenPayload { sub: string; email: string }`,
  `getUserIdFromRequest(request: NextRequest): string | null` — all consumed by Task 8 (auth
  routes) and every later protected route.

- [ ] **Step 1: Install auth deps**

```bash
npm install bcryptjs jsonwebtoken
npm install -D @types/bcryptjs @types/jsonwebtoken
```

- [ ] **Step 2: Prisma client singleton**

`apps/api/src/lib/prisma/client.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 3: Write the failing password tests**

`apps/api/src/lib/auth/password.spec.ts`:

```typescript
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    await expect(verifyPassword('Sup3rSecret!', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('produces a hash different from the plain text', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    expect(hash).not.toBe('Sup3rSecret!');
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

```bash
npx nx test api --testFile=password.spec.ts
```

Expected: FAIL — `password.ts` doesn't exist yet.

- [ ] **Step 5: Implement password hashing**

`apps/api/src/lib/auth/password.ts`:

```typescript
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 6: Run again and confirm it passes**

```bash
npx nx test api --testFile=password.spec.ts
```

Expected: PASS (3 tests).

- [ ] **Step 7: Write the failing JWT tests**

`apps/api/src/lib/auth/jwt.spec.ts`:

```typescript
import { issueToken, verifyToken } from './jwt';

describe('jwt', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it('round-trips a payload through issueToken/verifyToken', () => {
    const token = issueToken({ sub: 'user-1', email: 'a@b.com' });
    const decoded = verifyToken(token);
    expect(decoded.sub).toBe('user-1');
    expect(decoded.email).toBe('a@b.com');
  });

  it('throws when verifying a token signed with a different secret', () => {
    const token = issueToken({ sub: 'user-1', email: 'a@b.com' });
    process.env.JWT_SECRET = 'different-secret';
    expect(() => verifyToken(token)).toThrow();
  });

  it('throws if JWT_SECRET is not configured', () => {
    delete process.env.JWT_SECRET;
    expect(() => issueToken({ sub: 'user-1', email: 'a@b.com' })).toThrow(
      'JWT_SECRET is not configured'
    );
  });
});
```

- [ ] **Step 8: Run it and confirm it fails**

```bash
npx nx test api --testFile=jwt.spec.ts
```

Expected: FAIL — `jwt.ts` doesn't exist yet.

- [ ] **Step 9: Implement JWT issue/verify**

`apps/api/src/lib/auth/jwt.ts`:

```typescript
import jwt from 'jsonwebtoken';

export interface AuthTokenPayload {
  sub: string;
  email: string;
}

const TOKEN_EXPIRY = '8h';

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

export function issueToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, getSecret()) as AuthTokenPayload;
}
```

- [ ] **Step 10: Run again and confirm it passes**

```bash
npx nx test api --testFile=jwt.spec.ts
```

Expected: PASS (3 tests).

- [ ] **Step 11: Session helper (no test — trivial wrapper over already-tested `verifyToken`)**

`apps/api/src/lib/auth/session.ts`:

```typescript
import type { NextRequest } from 'next/server';
import { verifyToken } from './jwt';

export const AUTH_COOKIE_NAME = 'auth_token';

export function getUserIdFromRequest(request: NextRequest): string | null {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return verifyToken(token).sub;
  } catch {
    return null;
  }
}
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: add password hashing, JWT, and session helpers"
```

---

## Task 5: RBAC permission logic (TDD)

**Files:**
- Create: `apps/api/src/lib/rbac/permissions.ts`
- Create: `apps/api/src/lib/rbac/permissions.spec.ts`

**Interfaces:**
- Consumes: `prisma` from `apps/api/src/lib/prisma/client.ts` (Task 4)
- Produces: `ForbiddenError`, `checkPermission(granted: string[], module: string, action: string): void`,
  `getUserPermissions(userId: string): Promise<string[]>`,
  `requirePermission(userId: string, module: string, action: string): Promise<void>` — consumed by
  every protected route handler from Task 9 onward.

- [ ] **Step 1: Write the failing tests for the pure permission check**

`apps/api/src/lib/rbac/permissions.spec.ts`:

```typescript
import { checkPermission, ForbiddenError } from './permissions';

describe('checkPermission', () => {
  it('passes when the permission is granted', () => {
    expect(() => checkPermission(['patients:view', 'patients:edit'], 'patients', 'view')).not.toThrow();
  });

  it('throws ForbiddenError when the permission is missing', () => {
    expect(() => checkPermission(['patients:view'], 'patients', 'delete')).toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when the granted list is empty', () => {
    expect(() => checkPermission([], 'patients', 'view')).toThrow(ForbiddenError);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx nx test api --testFile=permissions.spec.ts
```

Expected: FAIL — `permissions.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

`apps/api/src/lib/rbac/permissions.ts`:

```typescript
import { prisma } from '../prisma/client';

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export function checkPermission(
  grantedPermissions: string[],
  module: string,
  action: string
): void {
  if (!grantedPermissions.includes(`${module}:${action}`)) {
    throw new ForbiddenError(`Missing permission ${module}:${action}`);
  }
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  return user.role.permissions.map((rp) => `${rp.permission.module}:${rp.permission.action}`);
}

export async function requirePermission(
  userId: string,
  module: string,
  action: string
): Promise<void> {
  const granted = await getUserPermissions(userId);
  checkPermission(granted, module, action);
}
```

- [ ] **Step 4: Run again and confirm it passes**

```bash
npx nx test api --testFile=permissions.spec.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add RBAC permission check logic"
```

---

## Task 6: Patients search service, audit log, file storage helpers

**Files:**
- Create: `apps/api/src/lib/patients/patient-search.ts`
- Create: `apps/api/src/lib/patients/patient-search.spec.ts`
- Create: `apps/api/src/lib/audit/audit-log.ts`
- Create: `apps/api/src/lib/storage/file-storage.ts`

**Interfaces:**
- Consumes: `prisma` (Task 4)
- Produces: `buildPatientSearchWhere(query: string)`, `searchPatients(query: string)`,
  `createPatient(data)`, `getPatientById(id: string)`, `writeAuditLog(input: AuditLogInput)`,
  `saveFile(buffer, category, patientId, originalName): Promise<string>`,
  `resolveFilePath(relativePath: string): string` — consumed by Task 10 (patients + files routes).

- [ ] **Step 1: Write the failing test for the search query builder**

`apps/api/src/lib/patients/patient-search.spec.ts`:

```typescript
import { buildPatientSearchWhere } from './patient-search';

describe('buildPatientSearchWhere', () => {
  it('returns an empty filter for a blank query', () => {
    expect(buildPatientSearchWhere('   ')).toEqual({});
  });

  it('matches on fullName, phone, and documentId with the trimmed query', () => {
    const where = buildPatientSearchWhere('  Maria  ');
    expect(where).toEqual({
      OR: [
        { fullName: { contains: 'Maria', mode: 'insensitive' } },
        { phone: { contains: 'Maria' } },
        { documentId: { contains: 'Maria' } },
      ],
    });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx nx test api --testFile=patient-search.spec.ts
```

Expected: FAIL — `patient-search.ts` doesn't exist yet.

- [ ] **Step 3: Implement the patients service**

`apps/api/src/lib/patients/patient-search.ts`:

```typescript
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

export function buildPatientSearchWhere(query: string): Prisma.PatientWhereInput {
  const trimmed = query.trim();
  if (!trimmed) return {};
  return {
    OR: [
      { fullName: { contains: trimmed, mode: 'insensitive' } },
      { phone: { contains: trimmed } },
      { documentId: { contains: trimmed } },
    ],
  };
}

export async function searchPatients(query: string) {
  return prisma.patient.findMany({
    where: buildPatientSearchWhere(query),
    orderBy: { fullName: 'asc' },
    take: 20,
  });
}

export interface CreatePatientData {
  fullName: string;
  phone: string;
  documentId: string;
}

export async function createPatient(data: CreatePatientData) {
  return prisma.patient.create({ data });
}

export async function getPatientById(id: string) {
  return prisma.patient.findUnique({ where: { id } });
}
```

- [ ] **Step 4: Run again and confirm it passes**

```bash
npx nx test api --testFile=patient-search.spec.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Audit log helper (no test — trivial Prisma wrapper)**

`apps/api/src/lib/audit/audit-log.ts`:

```typescript
import { prisma } from '../prisma/client';

export interface AuditLogInput {
  userId: string;
  action: 'create' | 'update' | 'delete' | 'view';
  entity: string;
  entityId: string;
  patientId?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      patientId: input.patientId,
      metadata: input.metadata,
    },
  });
}
```

- [ ] **Step 6: File storage helper (no test — thin fs wrapper)**

`apps/api/src/lib/storage/file-storage.ts`:

```typescript
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';

function storageRoot(): string {
  return process.env.STORAGE_ROOT ?? './storage';
}

export async function saveFile(
  buffer: Buffer,
  category: string,
  patientId: string,
  originalName: string
): Promise<string> {
  const dir = join(storageRoot(), category, patientId);
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}${extname(originalName)}`;
  await writeFile(join(dir, filename), buffer);
  return join(category, patientId, filename);
}

export class InvalidFilePathError extends Error {}

export function resolveFilePath(relativePath: string): string {
  const root = resolve(storageRoot());
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new InvalidFilePathError(`Path escapes storage root: ${relativePath}`);
  }
  return target;
}
```

`resolveFilePath` resolves both the storage root and the requested path to absolute paths and
rejects anything that normalizes outside the root (e.g. `../../.env` segments smuggled through a
caller like Task 10's file-serving route) — without this check, `join(storageRoot(), relativePath)`
would silently collapse `..` segments and let a caller read arbitrary files on the server,
including `.env`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add patient search service, audit log, and file storage helpers"
```

---

## Task 7: Seed script (permission catalog, Admin role, Admin user)

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (add `"prisma": { "seed": "tsx prisma/seed.ts" }`)

**Interfaces:**
- Consumes: `prisma` (Task 4), `hashPassword` (Task 4)
- Produces: a seeded database with all `Permission` rows, an `Admin` role granted every
  permission, and one active admin `User` — this is what makes the very first login possible
  before any RBAC admin UI exists.

- [ ] **Step 1: Write the seed script**

`prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../apps/api/src/lib/auth/password';

const prisma = new PrismaClient();

const PERMISSIONS: Array<{ module: string; action: string }> = [
  { module: 'patients', action: 'view' },
  { module: 'patients', action: 'create' },
  { module: 'patients', action: 'edit' },
  { module: 'patients', action: 'delete' },
  { module: 'historia-clinica', action: 'view' },
  { module: 'historia-clinica', action: 'create' },
  { module: 'historia-clinica', action: 'edit' },
  { module: 'valoracion', action: 'view' },
  { module: 'valoracion', action: 'create' },
  { module: 'valoracion', action: 'edit' },
  { module: 'treatments', action: 'view' },
  { module: 'treatments', action: 'create' },
  { module: 'treatments', action: 'edit' },
  { module: 'appointments', action: 'view' },
  { module: 'appointments', action: 'create' },
  { module: 'appointments', action: 'edit' },
  { module: 'appointments', action: 'delete' },
  { module: 'export', action: 'view' },
  { module: 'export', action: 'create' },
  { module: 'rbac-admin', action: 'view' },
  { module: 'rbac-admin', action: 'create' },
  { module: 'rbac-admin', action: 'edit' },
  { module: 'rbac-admin', action: 'delete' },
];

async function main() {
  const permissions = await Promise.all(
    PERMISSIONS.map((p) =>
      prisma.permission.upsert({
        where: { module_action: { module: p.module, action: p.action } },
        update: {},
        create: p,
      })
    )
  );

  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: { name: 'Admin' },
  });

  await Promise.all(
    permissions.map((permission) =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
        update: {},
        create: { roleId: adminRole.id, permissionId: permission.id },
      })
    )
  );

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@clinic.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      fullName: 'Administrator',
      language: 'es',
      roleId: adminRole.id,
    },
  });

  console.log(`Seeded ${permissions.length} permissions, Admin role, and admin user ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Wire up the seed command**

In `package.json`, add:

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 3: Run it**

```bash
npx prisma db seed
```

Expected: prints `Seeded 23 permissions, Admin role, and admin user admin@clinic.local`.

- [ ] **Step 4: Verify in the database**

```bash
npx prisma studio
```

Confirm one `User` row, one `Role` row named "Admin", 23 `Permission` rows, and 23
`RolePermission` rows linking them. Close Prisma Studio.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Prisma seed script for permissions, Admin role, and admin user"
```

---

## Task 8: Auth API routes (login/logout)

**Files:**
- Create: `apps/api/src/app/api/auth/login/route.ts`
- Create: `apps/api/src/app/api/auth/logout/route.ts`
- Create: `apps/api/src/app/api/auth/me/route.ts`
- Create: `apps/api/src/lib/http/api-error.ts`

**Interfaces:**
- Consumes: `prisma`, `verifyPassword`, `issueToken`, `AUTH_COOKIE_NAME`, `getUserIdFromRequest`
  (Task 4), `getUserPermissions` (Task 5)
- Produces: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` — consumed by the
  frontend `AuthService` in Task 13. Also produces `apiError(code, message, status)` used by every
  later route handler for consistent error bodies.

- [ ] **Step 1: Shared API error helper**

`apps/api/src/lib/http/api-error.ts`:

```typescript
import { NextResponse } from 'next/server';

export function apiError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
```

- [ ] **Step 2: Login route**

`apps/api/src/app/api/auth/login/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma/client';
import { verifyPassword } from '../../../../lib/auth/password';
import { issueToken } from '../../../../lib/auth/jwt';
import { AUTH_COOKIE_NAME } from '../../../../lib/auth/session';
import { getUserPermissions } from '../../../../lib/rbac/permissions';
import { apiError } from '../../../../lib/http/api-error';

export async function POST(request: NextRequest) {
  const { email, password } = (await request.json()) as { email?: string; password?: string };

  if (!email || !password) {
    return apiError('INVALID_INPUT', 'Email and password are required', 400);
  }

  const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });

  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return apiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  const token = issueToken({ sub: user.id, email: user.email });
  const permissions = await getUserPermissions(user.id);

  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      language: user.language,
      roleId: user.roleId,
      roleName: user.role.name,
      permissions,
    },
  });

  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60,
  });

  return response;
}
```

- [ ] **Step 3: Logout route**

`apps/api/src/app/api/auth/logout/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '../../../../lib/auth/session';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}
```

- [ ] **Step 4: Current-user route**

`apps/api/src/app/api/auth/me/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma/client';
import { getUserIdFromRequest } from '../../../../lib/auth/session';
import { getUserPermissions } from '../../../../lib/rbac/permissions';
import { apiError } from '../../../../lib/http/api-error';

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return apiError('UNAUTHENTICATED', 'Not logged in', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!user || !user.active) {
    return apiError('UNAUTHENTICATED', 'Not logged in', 401);
  }

  const permissions = await getUserPermissions(user.id);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      language: user.language,
      roleId: user.roleId,
      roleName: user.role.name,
      permissions,
    },
  });
}
```

- [ ] **Step 5: Manual verification**

```bash
npx nx serve api
```

In another terminal:

```bash
curl -i -c /tmp/cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@clinic.local","password":"ChangeMe123!"}'

curl -i -b /tmp/cookies.txt http://localhost:3000/api/auth/me
```

Expected: login returns 200 with the admin user + 23 permissions and sets `auth_token` cookie;
`/api/auth/me` returns the same user using that cookie. Stop the dev server (Ctrl+C).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add login, logout, and current-user API routes"
```

---

## Task 9: Users, roles, and permissions API routes (RBAC admin backend)

**Files:**
- Create: `apps/api/src/lib/http/require-auth.ts`
- Create: `apps/api/src/app/api/users/route.ts`
- Create: `apps/api/src/app/api/users/[id]/route.ts`
- Create: `apps/api/src/app/api/roles/route.ts`
- Create: `apps/api/src/app/api/roles/[id]/route.ts`
- Create: `apps/api/src/app/api/permissions/route.ts`

**Interfaces:**
- Consumes: `prisma`, `hashPassword` (Task 4), `requirePermission`, `ForbiddenError` (Task 5),
  `writeAuditLog` (Task 6), `apiError` (Task 8)
- Produces: `requireAuth(request)` helper, and
  `GET/POST /api/users`, `PATCH /api/users/:id`,
  `GET/POST /api/roles`, `PATCH /api/roles/:id`,
  `GET /api/permissions` — consumed by the frontend RBAC admin UI in Tasks 15-16.

- [ ] **Step 1: Shared auth+permission guard for route handlers**

`apps/api/src/lib/http/require-auth.ts`:

```typescript
import type { NextRequest } from 'next/server';
import { getUserIdFromRequest } from '../auth/session';
import { requirePermission, ForbiddenError } from '../rbac/permissions';

export class UnauthenticatedError extends Error {}

export async function requireAuth(
  request: NextRequest,
  module: string,
  action: string
): Promise<string> {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    throw new UnauthenticatedError('Not logged in');
  }
  await requirePermission(userId, module, action);
  return userId;
}

export { ForbiddenError };
```

- [ ] **Step 2: Users list/create route**

`apps/api/src/app/api/users/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma/client';
import { hashPassword } from '../../../lib/auth/password';
import { writeAuditLog } from '../../../lib/audit/audit-log';
import { requireAuth, ForbiddenError, UnauthenticatedError } from '../../../lib/http/require-auth';
import { apiError } from '../../../lib/http/api-error';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, 'rbac-admin', 'view');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: { fullName: 'asc' },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      language: u.language,
      active: u.active,
      roleId: u.roleId,
      roleName: u.role.name,
    })),
  });
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth(request, 'rbac-admin', 'create');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const body = (await request.json()) as {
    email?: string;
    password?: string;
    fullName?: string;
    roleId?: string;
    language?: string;
  };

  if (!body.email || !body.password || !body.fullName || !body.roleId) {
    return apiError('INVALID_INPUT', 'email, password, fullName, and roleId are required', 400);
  }

  const created = await prisma.user.create({
    data: {
      email: body.email,
      passwordHash: await hashPassword(body.password),
      fullName: body.fullName,
      roleId: body.roleId,
      language: body.language ?? 'es',
    },
  });

  await writeAuditLog({ userId, action: 'create', entity: 'User', entityId: created.id });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
```

- [ ] **Step 3: User update route (role, active, language, password reset)**

`apps/api/src/app/api/users/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma/client';
import { hashPassword } from '../../../../lib/auth/password';
import { writeAuditLog } from '../../../../lib/audit/audit-log';
import { requireAuth, ForbiddenError, UnauthenticatedError } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await requireAuth(request, 'rbac-admin', 'edit');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const { id } = await params;

  const body = (await request.json()) as {
    fullName?: string;
    roleId?: string;
    language?: string;
    active?: boolean;
    newPassword?: string;
  };

  const data: Record<string, unknown> = {};
  if (body.fullName !== undefined) data['fullName'] = body.fullName;
  if (body.roleId !== undefined) data['roleId'] = body.roleId;
  if (body.language !== undefined) data['language'] = body.language;
  if (body.active !== undefined) data['active'] = body.active;
  if (body.newPassword) data['passwordHash'] = await hashPassword(body.newPassword);

  await prisma.user.update({ where: { id }, data });
  await writeAuditLog({ userId, action: 'update', entity: 'User', entityId: id });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Roles list/create route**

`apps/api/src/app/api/roles/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma/client';
import { writeAuditLog } from '../../../lib/audit/audit-log';
import { requireAuth, ForbiddenError, UnauthenticatedError } from '../../../lib/http/require-auth';
import { apiError } from '../../../lib/http/api-error';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, 'rbac-admin', 'view');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } } },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      permissions: r.permissions.map((rp) => `${rp.permission.module}:${rp.permission.action}`),
    })),
  });
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth(request, 'rbac-admin', 'create');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const body = (await request.json()) as { name?: string };
  if (!body.name) return apiError('INVALID_INPUT', 'name is required', 400);

  const created = await prisma.role.create({ data: { name: body.name } });
  await writeAuditLog({ userId, action: 'create', entity: 'Role', entityId: created.id });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
```

- [ ] **Step 5: Role permission-matrix update route**

`apps/api/src/app/api/roles/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma/client';
import { writeAuditLog } from '../../../../lib/audit/audit-log';
import { requireAuth, ForbiddenError, UnauthenticatedError } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await requireAuth(request, 'rbac-admin', 'edit');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const { id } = await params;
  const body = (await request.json()) as { name?: string; permissionIds?: string[] };

  await prisma.$transaction(async (tx) => {
    if (body.name !== undefined) {
      await tx.role.update({ where: { id }, data: { name: body.name } });
    }
    if (body.permissionIds !== undefined) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({
        data: body.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
      });
    }
  });

  await writeAuditLog({ userId, action: 'update', entity: 'Role', entityId: id });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Permissions catalog route (read-only, seeded)**

`apps/api/src/app/api/permissions/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma/client';
import { requireAuth, ForbiddenError, UnauthenticatedError } from '../../../lib/http/require-auth';
import { apiError } from '../../../lib/http/api-error';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, 'rbac-admin', 'view');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const permissions = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });
  return NextResponse.json({ permissions });
}
```

- [ ] **Step 7: Manual verification**

```bash
npx nx serve api
```

```bash
curl -i -c /tmp/cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"admin@clinic.local","password":"ChangeMe123!"}'
curl -i -b /tmp/cookies.txt http://localhost:3000/api/users
curl -i -b /tmp/cookies.txt http://localhost:3000/api/roles
curl -i -b /tmp/cookies.txt http://localhost:3000/api/permissions
```

Expected: all three return 200 with the seeded data. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add users, roles, and permissions API routes"
```

---

## Task 10: Patients and files API routes

**Files:**
- Create: `apps/api/src/app/api/patients/route.ts`
- Create: `apps/api/src/app/api/patients/[id]/route.ts`
- Create: `apps/api/src/app/api/files/[...path]/route.ts`

**Interfaces:**
- Consumes: `searchPatients`, `createPatient`, `getPatientById` (Task 6), `resolveFilePath`
  (Task 6), `requireAuth` (Task 9), `writeAuditLog` (Task 6)
- Produces: `GET /api/patients?q=`, `POST /api/patients`, `GET /api/patients/:id`,
  `GET /api/files/:category/:patientId/:filename` — consumed by the frontend Patient Drive
  (Task 17) and later clinical modules.

- [ ] **Step 1: Patients search/create route**

`apps/api/src/app/api/patients/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { searchPatients, createPatient } from '../../../lib/patients/patient-search';
import { writeAuditLog } from '../../../lib/audit/audit-log';
import { requireAuth, ForbiddenError, UnauthenticatedError } from '../../../lib/http/require-auth';
import { apiError } from '../../../lib/http/api-error';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, 'patients', 'view');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const query = request.nextUrl.searchParams.get('q') ?? '';
  const patients = await searchPatients(query);

  return NextResponse.json({ patients });
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth(request, 'patients', 'create');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const body = (await request.json()) as { fullName?: string; phone?: string; documentId?: string };
  if (!body.fullName || !body.phone || !body.documentId) {
    return apiError('INVALID_INPUT', 'fullName, phone, and documentId are required', 400);
  }

  const patient = await createPatient({
    fullName: body.fullName,
    phone: body.phone,
    documentId: body.documentId,
  });

  await writeAuditLog({ userId, action: 'create', entity: 'Patient', entityId: patient.id, patientId: patient.id });

  return NextResponse.json({ patient }, { status: 201 });
}
```

- [ ] **Step 2: Patient-by-id route**

`apps/api/src/app/api/patients/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getPatientById } from '../../../../lib/patients/patient-search';
import { writeAuditLog } from '../../../../lib/audit/audit-log';
import { requireAuth, ForbiddenError, UnauthenticatedError } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await requireAuth(request, 'patients', 'view');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const { id } = await params;
  const patient = await getPatientById(id);
  if (!patient) return apiError('NOT_FOUND', 'Patient not found', 404);

  await writeAuditLog({ userId, action: 'view', entity: 'Patient', entityId: patient.id, patientId: patient.id });

  return NextResponse.json({ patient });
}
```

- [ ] **Step 3: File-serving route**

`apps/api/src/app/api/files/[...path]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { resolveFilePath } from '../../../../lib/storage/file-storage';
import { writeAuditLog } from '../../../../lib/audit/audit-log';
import { requireAuth, ForbiddenError, UnauthenticatedError } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  let userId: string;
  try {
    userId = await requireAuth(request, 'patients', 'view');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const { path } = await params;
  const relativePath = path.join('/');

  let buffer: Buffer;
  try {
    const absolutePath = resolveFilePath(relativePath);
    buffer = await readFile(absolutePath);
  } catch {
    return apiError('NOT_FOUND', 'File not found', 404);
  }

  const patientId = path[1];
  await writeAuditLog({
    userId,
    action: 'view',
    entity: 'File',
    entityId: relativePath,
    patientId,
  });

  return new NextResponse(buffer);
}
```

- [ ] **Step 4: Manual verification**

```bash
npx nx serve api
```

```bash
curl -i -c /tmp/cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"admin@clinic.local","password":"ChangeMe123!"}'
curl -i -b /tmp/cookies.txt -X POST http://localhost:3000/api/patients \
  -H 'Content-Type: application/json' -d '{"fullName":"Maria Lopez","phone":"555-1234","documentId":"A123"}'
curl -i -b /tmp/cookies.txt "http://localhost:3000/api/patients?q=Maria"
```

Expected: create returns 201, search returns the created patient. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add patients and file-serving API routes"
```

---

## Task 11: Angular app shell, rose/red Material theme, light/dark mode

**Files:**
- Create: `apps/web/src/styles/_palette.scss`
- Modify: `apps/web/src/styles.scss`
- Create: `apps/web/src/app/app.config.ts`
- Create: `apps/web/src/app/app.routes.ts`
- Create: `apps/web/src/app/app.component.ts`
- Create: `apps/web/src/app/shell/theme.service.ts`
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/src/index.html`

**Interfaces:**
- Produces: `ThemeService` (`toggle()`, `mode: Signal<'light' | 'dark'>`), the root `AppComponent`
  with a `<router-outlet>` and a Material toolbar — every later frontend task adds routes to
  `app.routes.ts` and content inside `AppComponent`'s shell.

- [ ] **Step 1: Add Angular Material**

```bash
npx ng add @angular/material --project=web --theme=custom --typography=true --animations=enabled
```

When prompted, decline overwriting `styles.scss` if asked (we replace it manually next) — if it
overwrites anyway, that's fine, Step 3 replaces the content.

- [ ] **Step 2: Custom rose/red palette**

`apps/web/src/styles/_palette.scss`:

```scss
$rose-palette: (
  50: #fdf2f4,
  100: #fce4e8,
  200: #f9c9d1,
  300: #f4a3b1,
  400: #ec7189,
  500: #e11d48,
  600: #c81e45,
  700: #a91b3d,
  800: #8c1937,
  900: #751833,
  A100: #ffc1cf,
  A200: #ff8fa8,
  A400: #ff4d7a,
  A700: #ff1f5e,
  contrast: (
    50: rgba(black, 0.87),
    100: rgba(black, 0.87),
    200: rgba(black, 0.87),
    300: rgba(black, 0.87),
    400: white,
    500: white,
    600: white,
    700: white,
    800: white,
    900: white,
    A100: rgba(black, 0.87),
    A200: white,
    A400: white,
    A700: white,
  ),
);

$red-accent-palette: (
  50: #fef2f2,
  100: #fee2e2,
  200: #fecaca,
  300: #fca5a5,
  400: #f87171,
  500: #ef4444,
  600: #dc2626,
  700: #b91c1c,
  800: #991b1b,
  900: #7f1d1d,
  A100: #ff8a8a,
  A200: #ff5c5c,
  A400: #ff2e2e,
  A700: #ff1a1a,
  contrast: (
    50: rgba(black, 0.87),
    100: rgba(black, 0.87),
    200: rgba(black, 0.87),
    300: rgba(black, 0.87),
    400: white,
    500: white,
    600: white,
    700: white,
    800: white,
    900: white,
    A100: rgba(black, 0.87),
    A200: white,
    A400: white,
    A700: white,
  ),
);
```

- [ ] **Step 3: Theme file**

`apps/web/src/styles.scss`:

```scss
@use '@angular/material' as mat;
@use './styles/palette' as palette;

@include mat.core();

$web-primary: mat.define-palette(palette.$rose-palette);
$web-accent: mat.define-palette(palette.$red-accent-palette);
$web-warn: mat.define-palette(palette.$red-accent-palette, 700);

$web-light-theme: mat.define-light-theme(
  (
    color: (
      primary: $web-primary,
      accent: $web-accent,
      warn: $web-warn,
    ),
    density: 0,
  )
);

$web-dark-theme: mat.define-dark-theme(
  (
    color: (
      primary: $web-primary,
      accent: $web-accent,
      warn: $web-warn,
    ),
  )
);

html {
  @include mat.all-component-themes($web-light-theme);
}

html[data-theme='dark'] {
  @include mat.all-component-themes($web-dark-theme);
}

html:not([data-theme]) {
  @media (prefers-color-scheme: dark) {
    @include mat.all-component-themes($web-dark-theme);
  }
}

body {
  margin: 0;
  font-family: Roboto, 'Helvetica Neue', sans-serif;
}
```

If `npx nx build web` fails with an error like "Undefined mixin" or "Undefined function" pointing
at `mat.define-palette`/`mat.define-light-theme`/`mat.define-dark-theme`, the installed
`@angular/material` version has renamed the legacy M2 theming API with an `m2-` prefix. Replace,
throughout this file: `mat.define-palette` → `mat.m2-define-palette`,
`mat.define-light-theme` → `mat.m2-define-light-theme`,
`mat.define-dark-theme` → `mat.m2-define-dark-theme` (`mat.core` and
`mat.all-component-themes` keep their names either way).

- [ ] **Step 4: Theme service (light/dark toggle)**

`apps/web/src/app/shell/theme.service.ts`:

```typescript
import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'expedientes-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.readInitialMode());

  constructor() {
    this.apply(this.mode());
  }

  toggle(): void {
    const next: ThemeMode = this.mode() === 'light' ? 'dark' : 'light';
    this.mode.set(next);
    this.apply(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  private readInitialMode(): ThemeMode {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : 'light';
  }

  private apply(mode: ThemeMode): void {
    document.documentElement.setAttribute('data-theme', mode);
  }
}
```

- [ ] **Step 5: App config, routes, root component**

`apps/web/src/app/app.routes.ts`:

```typescript
import { Routes } from '@angular/router';

export const appRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent) },
];
```

(The `login` route is filled in by Task 13; leave the import as-is now, it starts resolving once
that file exists.)

`apps/web/src/app/app.config.ts`:

```typescript
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),
    provideAnimations(),
    provideHttpClient(withInterceptors([])),
  ],
};
```

(The interceptors array is filled in by Task 13.)

`apps/web/src/app/app.component.ts`:

```typescript
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ThemeService } from './shell/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MatToolbarModule, MatButtonModule, MatIconModule],
  template: `
    <mat-toolbar color="primary">
      <span>Expedientes</span>
      <span class="spacer"></span>
      <button mat-icon-button (click)="theme.toggle()" aria-label="Toggle theme">
        <mat-icon>{{ theme.mode() === 'light' ? 'dark_mode' : 'light_mode' }}</mat-icon>
      </button>
    </mat-toolbar>
    <router-outlet></router-outlet>
  `,
  styles: [
    `
      .spacer {
        flex: 1 1 auto;
      }
    `,
  ],
})
export class AppComponent {
  protected readonly theme = inject(ThemeService);
}
```

`apps/web/src/main.ts`:

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
```

- [ ] **Step 6: Verify it builds**

Task 13 adds `login.component.ts`; until then the app won't build because of the lazy import in
`app.routes.ts`. Skip the build check here and run it at the end of Task 13 instead — commit this
task as-is.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add app shell, rose/red Material theme, and light/dark toggle"
```

---

## Task 12: Transloco i18n (ES default, EN toggle)

**Files:**
- Create: `apps/web/src/assets/i18n/es.json`
- Create: `apps/web/src/assets/i18n/en.json`
- Create: `apps/web/src/app/shell/transloco-root.module.ts`
- Modify: `apps/web/src/app/app.config.ts`
- Modify: `apps/web/src/app/app.component.ts`

**Interfaces:**
- Consumes: `AppComponent`, `app.config.ts` (Task 11)
- Produces: `TranslocoService` available app-wide (from `@jsverse/transloco`), translation keys
  `shell.title`, `shell.toggleTheme`, `shell.language` — consumed by every later frontend task
  that adds user-facing text.

- [ ] **Step 1: Install Transloco**

```bash
npm install @jsverse/transloco
```

- [ ] **Step 2: Translation files**

`apps/web/src/assets/i18n/es.json`:

```json
{
  "shell": {
    "title": "Expedientes",
    "toggleTheme": "Cambiar tema",
    "language": "Idioma"
  },
  "auth": {
    "email": "Correo electrónico",
    "password": "Contraseña",
    "login": "Iniciar sesión",
    "invalidCredentials": "Correo o contraseña inválidos"
  }
}
```

`apps/web/src/assets/i18n/en.json`:

```json
{
  "shell": {
    "title": "Expedientes",
    "toggleTheme": "Toggle theme",
    "language": "Language"
  },
  "auth": {
    "email": "Email",
    "password": "Password",
    "login": "Log in",
    "invalidCredentials": "Invalid email or password"
  }
}
```

- [ ] **Step 3: Transloco root config**

`apps/web/src/app/shell/transloco-root.module.ts`:

```typescript
import { isDevMode } from '@angular/core';
import { TranslocoHttpLoader } from './transloco-http-loader';
import { provideTransloco } from '@jsverse/transloco';

export const provideAppTransloco = () =>
  provideTransloco({
    config: {
      availableLangs: ['es', 'en'],
      defaultLang: 'es',
      fallbackLang: 'es',
      reRenderOnLangChange: true,
      prodMode: !isDevMode(),
    },
    loader: TranslocoHttpLoader,
  });
```

`apps/web/src/app/shell/transloco-http-loader.ts`:

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  constructor(private http: HttpClient) {}

  getTranslation(lang: string): Promise<Translation> {
    return fetch(`/assets/i18n/${lang}.json`).then((res) => res.json());
  }
}
```

- [ ] **Step 4: Wire into app config and shell**

In `apps/web/src/app/app.config.ts`, add the provider:

```typescript
import { provideAppTransloco } from './shell/transloco-root.module';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),
    provideAnimations(),
    provideHttpClient(withInterceptors([])),
    provideAppTransloco(),
  ],
};
```

In `apps/web/src/app/app.component.ts`, add the `TranslocoModule` and a language toggle:

```typescript
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { ThemeService } from './shell/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule, TranslocoModule],
  template: `
    <mat-toolbar color="primary">
      <span>{{ 'shell.title' | transloco }}</span>
      <span class="spacer"></span>
      <button mat-icon-button [matMenuTriggerFor]="langMenu" aria-label="Language">
        <mat-icon>translate</mat-icon>
      </button>
      <mat-menu #langMenu="matMenu">
        <button mat-menu-item (click)="setLang('es')">Español</button>
        <button mat-menu-item (click)="setLang('en')">English</button>
      </mat-menu>
      <button mat-icon-button (click)="theme.toggle()" [attr.aria-label]="'shell.toggleTheme' | transloco">
        <mat-icon>{{ theme.mode() === 'light' ? 'dark_mode' : 'light_mode' }}</mat-icon>
      </button>
    </mat-toolbar>
    <router-outlet></router-outlet>
  `,
  styles: [
    `
      .spacer {
        flex: 1 1 auto;
      }
    `,
  ],
})
export class AppComponent {
  protected readonly theme = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);

  protected setLang(lang: 'es' | 'en'): void {
    this.transloco.setActiveLang(lang);
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Transloco i18n with Spanish default and English toggle"
```

---

## Task 13: Frontend auth (AuthService, guard, interceptors, login page)

**Files:**
- Create: `apps/web/src/app/auth/auth.service.ts`
- Create: `apps/web/src/app/auth/auth.guard.ts`
- Create: `apps/web/src/app/auth/auth.interceptor.ts`
- Create: `apps/web/src/app/auth/error.interceptor.ts`
- Create: `apps/web/src/app/login/login.component.ts`
- Modify: `apps/web/src/app/app.routes.ts`
- Modify: `apps/web/src/app/app.config.ts`

**Interfaces:**
- Consumes: `LoginRequest`, `LoginResponse`, `AuthUser` (`libs/shared/types`), Transloco setup
  (Task 12)
- Produces: `AuthService` (`login()`, `logout()`, `currentUser: Signal<AuthUser | null>`,
  `hasPermission(module, action): boolean`), `authGuard`, consumed by `app.routes.ts` for every
  protected route from here on, and by `PermissionDirective` in Task 14.

- [ ] **Step 1: AuthService**

`apps/web/src/app/auth/auth.service.ts`:

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { AuthUser, LoginRequest, LoginResponse } from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly currentUser = signal<AuthUser | null>(null);

  async login(credentials: LoginRequest): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>('/api/auth/login', credentials)
    );
    this.currentUser.set(response.user);
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', {}));
    this.currentUser.set(null);
  }

  async restoreSession(): Promise<void> {
    try {
      const response = await firstValueFrom(this.http.get<LoginResponse>('/api/auth/me'));
      this.currentUser.set(response.user);
    } catch {
      this.currentUser.set(null);
    }
  }

  hasPermission(module: string, action: string): boolean {
    return this.currentUser()?.permissions.includes(`${module}:${action}`) ?? false;
  }
}
```

- [ ] **Step 2: Auth guard**

`apps/web/src/app/auth/auth.guard.ts`:

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.currentUser()) {
    await auth.restoreSession();
  }

  if (auth.currentUser()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
```

- [ ] **Step 3: HTTP interceptors**

`apps/web/src/app/auth/auth.interceptor.ts`:

```typescript
import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req.clone({ withCredentials: true }));
};
```

`apps/web/src/app/auth/error.interceptor.ts`:

```typescript
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);

  return next(req).pipe(
    catchError((error) => {
      if (error.status === 401) {
        router.navigate(['/login']);
      } else {
        const message = error.error?.error?.message ?? 'Unexpected error';
        snackBar.open(message, undefined, { duration: 4000 });
      }
      return throwError(() => error);
    })
  );
};
```

- [ ] **Step 4: Login component**

`apps/web/src/app/login/login.component.ts`:

```typescript
import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@jsverse/transloco';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  template: `
    <div class="login-container">
      <mat-card>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="submit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'auth.email' | transloco }}</mat-label>
              <input matInput type="email" formControlName="email" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'auth.password' | transloco }}</mat-label>
              <input matInput type="password" formControlName="password" />
            </mat-form-field>
            @if (error()) {
              <p class="error">{{ 'auth.invalidCredentials' | transloco }}</p>
            }
            <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || loading()">
              @if (loading()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                {{ 'auth.login' | transloco }}
              }
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .login-container {
        display: flex;
        justify-content: center;
        margin-top: 10vh;
      }
      .full-width {
        width: 100%;
      }
      .error {
        color: var(--mat-sys-error, #b91c1c);
      }
    `,
  ],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(false);
    try {
      await this.auth.login({
        email: this.form.value.email ?? '',
        password: this.form.value.password ?? '',
      });
      await this.router.navigate(['/']);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
```

- [ ] **Step 5: Wire routes and interceptors**

`apps/web/src/app/app.routes.ts`:

```typescript
import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const appRoutes: Routes = [
  { path: 'login', loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent) },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
];
```

Note: `authGuard` is imported now but not yet applied to a protected route — Task 17 adds the
first protected route (Patient Drive) and applies `canActivate: [authGuard]` there.

In `apps/web/src/app/app.config.ts`, register the interceptors:

```typescript
import { authInterceptor } from './auth/auth.interceptor';
import { errorInterceptor } from './auth/error.interceptor';

// inside providers array:
provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
```

- [ ] **Step 6: Verify the app builds and log in manually**

```bash
npx nx build web
npx nx serve api &
npx nx serve web
```

Open `http://localhost:4200`, confirm it redirects to `/login`, log in with
`admin@clinic.local` / `ChangeMe123!`, confirm no console errors and the toolbar renders in the
rose theme. Stop both dev servers.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add frontend auth service, guard, interceptors, and login page"
```

---

## Task 14: Permission directive

**Files:**
- Create: `apps/web/src/app/auth/has-permission.directive.ts`

**Interfaces:**
- Consumes: `AuthService.hasPermission()` (Task 13)
- Produces: `*appHasPermission="'patients:edit'"` structural directive — consumed by Tasks 15-17
  wherever UI needs to hide actions the current user's role doesn't grant.

- [ ] **Step 1: Implement the directive**

`apps/web/src/app/auth/has-permission.directive.ts`:

```typescript
import { Directive, Input, TemplateRef, ViewContainerRef, effect, inject } from '@angular/core';
import { AuthService } from './auth.service';

@Directive({
  selector: '[appHasPermission]',
  standalone: true,
})
export class HasPermissionDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly auth = inject(AuthService);

  private permissionKey = '';
  private rendered = false;

  @Input() set appHasPermission(key: string) {
    this.permissionKey = key;
  }

  constructor() {
    effect(() => {
      const [module, action] = this.permissionKey.split(':');
      const allowed = !!module && !!action && this.auth.hasPermission(module, action);

      if (allowed && !this.rendered) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.rendered = true;
      } else if (!allowed && this.rendered) {
        this.viewContainer.clear();
        this.rendered = false;
      }
    });
  }
}
```

- [ ] **Step 2: Manual verification**

Add `*appHasPermission="'rbac-admin:view'"` around a throwaway `<button>Admin</button>` in
`AppComponent`'s template temporarily, confirm it shows when logged in as the seeded Admin (who
has that permission), then remove the throwaway button — Task 15 adds the real admin nav entry.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add permission-based structural directive"
```

---

## Task 15: RBAC admin UI — user management

**Files:**
- Create: `apps/web/src/app/rbac-admin/users/users.service.ts`
- Create: `apps/web/src/app/rbac-admin/users/user-list.component.ts`
- Create: `apps/web/src/app/rbac-admin/users/user-form-dialog.component.ts`
- Modify: `apps/web/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `AuthService`, `HasPermissionDirective`, `/api/users`, `/api/roles` (Task 9)
- Produces: `route: 'admin/users'` — a working screen to list users, create a user, and edit an
  existing user's role/active flag/language/password.

- [ ] **Step 1: Users service**

`apps/web/src/app/rbac-admin/users/users.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  language: string;
  active: boolean;
  roleId: string;
  roleName: string;
}

export interface AdminRole {
  id: string;
  name: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  roleId: string;
  language: string;
}

export interface UpdateUserInput {
  fullName?: string;
  roleId?: string;
  language?: string;
  active?: boolean;
  newPassword?: string;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);

  listUsers(): Promise<AdminUser[]> {
    return firstValueFrom(this.http.get<{ users: AdminUser[] }>('/api/users')).then((r) => r.users);
  }

  listRoles(): Promise<AdminRole[]> {
    return firstValueFrom(this.http.get<{ roles: AdminRole[] }>('/api/roles')).then((r) => r.roles);
  }

  createUser(input: CreateUserInput): Promise<{ id: string }> {
    return firstValueFrom(this.http.post<{ id: string }>('/api/users', input));
  }

  updateUser(id: string, input: UpdateUserInput): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`/api/users/${id}`, input));
  }
}
```

- [ ] **Step 2: User form dialog**

`apps/web/src/app/rbac-admin/users/user-form-dialog.component.ts`:

```typescript
import { Component, Inject, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { AdminRole, AdminUser, UsersService } from './users.service';

export interface UserFormDialogData {
  user: AdminUser | null;
  roles: AdminRole[];
}

@Component({
  selector: 'app-user-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.user ? 'Edit user' : 'New user' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Full name</mat-label>
          <input matInput formControlName="fullName" />
        </mat-form-field>
        @if (!data.user) {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Email</mat-label>
            <input matInput type="email" formControlName="email" />
          </mat-form-field>
        }
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ data.user ? 'New password (optional)' : 'Password' }}</mat-label>
          <input matInput type="password" formControlName="password" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Role</mat-label>
          <mat-select formControlName="roleId">
            @for (role of data.roles; track role.id) {
              <mat-option [value]="role.id">{{ role.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Language</mat-label>
          <mat-select formControlName="language">
            <mat-option value="es">Español</mat-option>
            <mat-option value="en">English</mat-option>
          </mat-select>
        </mat-form-field>
        @if (data.user) {
          <mat-checkbox formControlName="active">Active</mat-checkbox>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="save()">
        Save
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.full-width { width: 100%; display: block; }`],
})
export class UserFormDialogComponent {
  protected readonly dialogRef = inject(MatDialogRef<UserFormDialogComponent>);
  private readonly usersService = inject(UsersService);
  private readonly fb = inject(FormBuilder);

  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    fullName: [this.data.user?.fullName ?? '', Validators.required],
    email: [this.data.user?.email ?? '', this.data.user ? [] : [Validators.required, Validators.email]],
    password: ['', this.data.user ? [] : [Validators.required]],
    roleId: [this.data.user?.roleId ?? this.data.roles[0]?.id ?? '', Validators.required],
    language: [this.data.user?.language ?? 'es', Validators.required],
    active: [this.data.user?.active ?? true],
  });

  constructor(@Inject(MAT_DIALOG_DATA) protected data: UserFormDialogData) {}

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    const value = this.form.value;
    try {
      if (this.data.user) {
        await this.usersService.updateUser(this.data.user.id, {
          fullName: value.fullName ?? undefined,
          roleId: value.roleId ?? undefined,
          language: value.language ?? undefined,
          active: value.active ?? undefined,
          newPassword: value.password || undefined,
        });
      } else {
        await this.usersService.createUser({
          email: value.email ?? '',
          password: value.password ?? '',
          fullName: value.fullName ?? '',
          roleId: value.roleId ?? '',
          language: value.language ?? 'es',
        });
      }
      this.dialogRef.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}
```

- [ ] **Step 3: User list component**

`apps/web/src/app/rbac-admin/users/user-list.component.ts`:

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AdminRole, AdminUser, UsersService } from './users.service';
import { UserFormDialogComponent } from './user-form-dialog.component';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [MatTableModule, MatButtonModule, MatIconModule, MatDialogModule],
  template: `
    <div class="header">
      <h1>Users</h1>
      <button mat-flat-button color="primary" (click)="openCreate()">
        <mat-icon>add</mat-icon> New user
      </button>
    </div>
    <table mat-table [dataSource]="users()" class="mat-elevation-z1">
      <ng-container matColumnDef="fullName">
        <th mat-header-cell *matHeaderCellDef>Name</th>
        <td mat-cell *matCellDef="let u">{{ u.fullName }}</td>
      </ng-container>
      <ng-container matColumnDef="email">
        <th mat-header-cell *matHeaderCellDef>Email</th>
        <td mat-cell *matCellDef="let u">{{ u.email }}</td>
      </ng-container>
      <ng-container matColumnDef="roleName">
        <th mat-header-cell *matHeaderCellDef>Role</th>
        <td mat-cell *matCellDef="let u">{{ u.roleName }}</td>
      </ng-container>
      <ng-container matColumnDef="active">
        <th mat-header-cell *matHeaderCellDef>Active</th>
        <td mat-cell *matCellDef="let u">{{ u.active ? 'Yes' : 'No' }}</td>
      </ng-container>
      <ng-container matColumnDef="edit">
        <th mat-header-cell *matHeaderCellDef></th>
        <td mat-cell *matCellDef="let u">
          <button mat-icon-button (click)="openEdit(u)"><mat-icon>edit</mat-icon></button>
        </td>
      </ng-container>
      <tr mat-header-row *matHeaderRowDef="columns"></tr>
      <tr mat-row *matRowDef="let row; columns: columns"></tr>
    </table>
  `,
  styles: [
    `
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
      }
      table {
        width: 100%;
      }
    `,
  ],
})
export class UserListComponent implements OnInit {
  private readonly usersService = inject(UsersService);
  private readonly dialog = inject(MatDialog);

  protected readonly columns = ['fullName', 'email', 'roleName', 'active', 'edit'];
  protected readonly users = signal<AdminUser[]>([]);
  protected roles: AdminRole[] = [];

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    [this.roles, ] = await Promise.all([this.usersService.listRoles()]);
    this.users.set(await this.usersService.listUsers());
  }

  openCreate(): void {
    const ref = this.dialog.open(UserFormDialogComponent, { data: { user: null, roles: this.roles } });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.refresh();
    });
  }

  openEdit(user: AdminUser): void {
    const ref = this.dialog.open(UserFormDialogComponent, { data: { user, roles: this.roles } });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.refresh();
    });
  }
}
```

- [ ] **Step 4: Route**

In `apps/web/src/app/app.routes.ts`, add:

```typescript
{
  path: 'admin/users',
  canActivate: [authGuard],
  loadComponent: () => import('./rbac-admin/users/user-list.component').then((m) => m.UserListComponent),
},
```

- [ ] **Step 5: Manual verification**

```bash
npx nx serve api &
npx nx serve web
```

Log in as admin, navigate to `http://localhost:4200/admin/users`, create a new user, edit its
role/active flag, confirm the list refreshes. Stop both dev servers.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add RBAC admin user management UI"
```

---

## Task 16: RBAC admin UI — role builder / permission matrix

**Files:**
- Create: `apps/web/src/app/rbac-admin/roles/roles.service.ts`
- Create: `apps/web/src/app/rbac-admin/roles/role-list.component.ts`
- Create: `apps/web/src/app/rbac-admin/roles/role-form-dialog.component.ts`
- Modify: `apps/web/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `/api/roles`, `/api/permissions` (Task 9)
- Produces: `route: 'admin/roles'` — a working screen to create roles and toggle their
  module × action permissions.

- [ ] **Step 1: Roles service**

`apps/web/src/app/rbac-admin/roles/roles.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AdminRoleDetail {
  id: string;
  name: string;
  permissions: string[];
}

export interface AdminPermission {
  id: string;
  module: string;
  action: string;
}

@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly http = inject(HttpClient);

  listRoles(): Promise<AdminRoleDetail[]> {
    return firstValueFrom(this.http.get<{ roles: AdminRoleDetail[] }>('/api/roles')).then((r) => r.roles);
  }

  listPermissions(): Promise<AdminPermission[]> {
    return firstValueFrom(this.http.get<{ permissions: AdminPermission[] }>('/api/permissions')).then(
      (r) => r.permissions
    );
  }

  createRole(name: string): Promise<{ id: string }> {
    return firstValueFrom(this.http.post<{ id: string }>('/api/roles', { name }));
  }

  updateRole(id: string, input: { name?: string; permissionIds?: string[] }): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`/api/roles/${id}`, input));
  }
}
```

- [ ] **Step 2: Role form dialog with permission matrix**

`apps/web/src/app/rbac-admin/roles/role-form-dialog.component.ts`:

```typescript
import { Component, Inject, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { AdminPermission, AdminRoleDetail, RolesService } from './roles.service';

export interface RoleFormDialogData {
  role: AdminRoleDetail | null;
  permissions: AdminPermission[];
}

@Component({
  selector: 'app-role-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatCheckboxModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.role ? 'Edit role' : 'New role' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
      </form>
      <div class="matrix">
        @for (module of modules; track module) {
          <div class="module-row">
            <strong>{{ module }}</strong>
            @for (permission of permissionsByModule(module); track permission.id) {
              <mat-checkbox
                [checked]="selected.has(permission.id)"
                (change)="toggle(permission.id)"
              >
                {{ permission.action }}
              </mat-checkbox>
            }
          </div>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="save()">
        Save
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
      .module-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 4px 0;
      }
    `,
  ],
})
export class RoleFormDialogComponent {
  protected readonly dialogRef = inject(MatDialogRef<RoleFormDialogComponent>);
  private readonly rolesService = inject(RolesService);
  private readonly fb = inject(FormBuilder);

  protected readonly saving = signal(false);
  protected readonly modules: string[];
  protected readonly selected: Set<string>;

  protected readonly form = this.fb.group({
    name: [this.data.role?.name ?? '', Validators.required],
  });

  constructor(@Inject(MAT_DIALOG_DATA) protected data: RoleFormDialogData) {
    this.modules = [...new Set(data.permissions.map((p) => p.module))];
    const grantedKeys = new Set(data.role?.permissions ?? []);
    this.selected = new Set(
      data.permissions.filter((p) => grantedKeys.has(`${p.module}:${p.action}`)).map((p) => p.id)
    );
  }

  protected permissionsByModule(module: string): AdminPermission[] {
    return this.data.permissions.filter((p) => p.module === module);
  }

  protected toggle(permissionId: string): void {
    if (this.selected.has(permissionId)) {
      this.selected.delete(permissionId);
    } else {
      this.selected.add(permissionId);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      const permissionIds = [...this.selected];
      if (this.data.role) {
        await this.rolesService.updateRole(this.data.role.id, {
          name: this.form.value.name ?? undefined,
          permissionIds,
        });
      } else {
        const created = await this.rolesService.createRole(this.form.value.name ?? '');
        await this.rolesService.updateRole(created.id, { permissionIds });
      }
      this.dialogRef.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}
```

- [ ] **Step 3: Role list component**

`apps/web/src/app/rbac-admin/roles/role-list.component.ts`:

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AdminPermission, AdminRoleDetail, RolesService } from './roles.service';
import { RoleFormDialogComponent } from './role-form-dialog.component';

@Component({
  selector: 'app-role-list',
  standalone: true,
  imports: [MatListModule, MatButtonModule, MatIconModule, MatDialogModule],
  template: `
    <div class="header">
      <h1>Roles</h1>
      <button mat-flat-button color="primary" (click)="openCreate()">
        <mat-icon>add</mat-icon> New role
      </button>
    </div>
    <mat-list>
      @for (role of roles(); track role.id) {
        <mat-list-item>
          <span matListItemTitle>{{ role.name }}</span>
          <button mat-icon-button (click)="openEdit(role)"><mat-icon>edit</mat-icon></button>
        </mat-list-item>
      }
    </mat-list>
  `,
  styles: [
    `
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
      }
    `,
  ],
})
export class RoleListComponent implements OnInit {
  private readonly rolesService = inject(RolesService);
  private readonly dialog = inject(MatDialog);

  protected readonly roles = signal<AdminRoleDetail[]>([]);
  protected permissions: AdminPermission[] = [];

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    this.permissions = await this.rolesService.listPermissions();
    this.roles.set(await this.rolesService.listRoles());
  }

  openCreate(): void {
    const ref = this.dialog.open(RoleFormDialogComponent, { data: { role: null, permissions: this.permissions } });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.refresh();
    });
  }

  openEdit(role: AdminRoleDetail): void {
    const ref = this.dialog.open(RoleFormDialogComponent, { data: { role, permissions: this.permissions } });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.refresh();
    });
  }
}
```

- [ ] **Step 4: Route**

In `apps/web/src/app/app.routes.ts`, add:

```typescript
{
  path: 'admin/roles',
  canActivate: [authGuard],
  loadComponent: () => import('./rbac-admin/roles/role-list.component').then((m) => m.RoleListComponent),
},
```

- [ ] **Step 5: Manual verification**

Navigate to `http://localhost:4200/admin/roles`, create a role, toggle a few permission
checkboxes, save, reopen it and confirm the checkboxes reflect what was saved.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add RBAC admin role builder with permission matrix"
```

---

## Task 17: Patient Drive (ActivePatientStore, search/create, banner)

**Files:**
- Create: `apps/web/src/app/patient-drive/active-patient.store.ts`
- Create: `apps/web/src/app/patient-drive/patients.service.ts`
- Create: `apps/web/src/app/patient-drive/patient-search.component.ts`
- Create: `apps/web/src/app/patient-drive/patient-banner.component.ts`
- Modify: `apps/web/src/app/app.routes.ts`
- Modify: `apps/web/src/app/app.component.ts`

**Interfaces:**
- Consumes: `/api/patients` (Task 10), `HasPermissionDirective` (Task 14)
- Produces: `ActivePatientStore` (`patient: Signal<PatientSummary | null>`, `select(patient)`,
  `clear()`) — injected by every later clinical module (Historia Clínica, Valoración, Treatments)
  instead of each module managing its own patient selection.

- [ ] **Step 1: ActivePatientStore**

`apps/web/src/app/patient-drive/active-patient.store.ts`:

```typescript
import { Injectable, signal } from '@angular/core';
import type { PatientSummary } from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class ActivePatientStore {
  readonly patient = signal<PatientSummary | null>(null);

  select(patient: PatientSummary): void {
    this.patient.set(patient);
  }

  clear(): void {
    this.patient.set(null);
  }
}
```

- [ ] **Step 2: Patients service**

`apps/web/src/app/patient-drive/patients.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { CreatePatientRequest, PatientSummary } from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class PatientsService {
  private readonly http = inject(HttpClient);

  search(query: string): Promise<PatientSummary[]> {
    return firstValueFrom(
      this.http.get<{ patients: PatientSummary[] }>('/api/patients', { params: { q: query } })
    ).then((r) => r.patients);
  }

  create(input: CreatePatientRequest): Promise<PatientSummary> {
    return firstValueFrom(
      this.http.post<{ patient: PatientSummary }>('/api/patients', input)
    ).then((r) => r.patient);
  }
}
```

- [ ] **Step 3: Patient search/select/create component**

`apps/web/src/app/patient-drive/patient-search.component.ts`:

```typescript
import { Component, inject, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import type { PatientSummary } from '@expedientes/shared-types';
import { PatientsService } from './patients.service';
import { ActivePatientStore } from './active-patient.store';

@Component({
  selector: 'app-patient-search',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    MatButtonModule,
    MatExpansionModule,
  ],
  template: `
    <h1>Patient Drive</h1>
    <mat-form-field appearance="outline" class="full-width">
      <mat-label>Search by name, phone, or ID</mat-label>
      <input matInput [(ngModel)]="query" (ngModelChange)="onQueryChange($event)" />
    </mat-form-field>

    <mat-list>
      @for (patient of results(); track patient.id) {
        <mat-list-item (click)="selectPatient(patient)" class="clickable">
          <span matListItemTitle>{{ patient.fullName }}</span>
          <span matListItemLine>{{ patient.phone }} · {{ patient.documentId }}</span>
        </mat-list-item>
      }
    </mat-list>

    <mat-expansion-panel>
      <mat-expansion-panel-header>
        <mat-panel-title>New patient</mat-panel-title>
      </mat-expansion-panel-header>
      <form [formGroup]="createForm" (ngSubmit)="createPatient()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Full name</mat-label>
          <input matInput formControlName="fullName" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Phone</mat-label>
          <input matInput formControlName="phone" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Document ID</mat-label>
          <input matInput formControlName="documentId" />
        </mat-form-field>
        <button mat-flat-button color="primary" type="submit" [disabled]="createForm.invalid">
          Create patient
        </button>
      </form>
    </mat-expansion-panel>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
      .clickable {
        cursor: pointer;
      }
    `,
  ],
})
export class PatientSearchComponent {
  private readonly patientsService = inject(PatientsService);
  private readonly activePatient = inject(ActivePatientStore);
  private readonly fb = inject(FormBuilder);

  protected query = '';
  protected readonly results = signal<PatientSummary[]>([]);

  protected readonly createForm = this.fb.group({
    fullName: ['', Validators.required],
    phone: ['', Validators.required],
    documentId: ['', Validators.required],
  });

  async onQueryChange(value: string): Promise<void> {
    this.query = value;
    this.results.set(await this.patientsService.search(value));
  }

  selectPatient(patient: PatientSummary): void {
    this.activePatient.select(patient);
  }

  async createPatient(): Promise<void> {
    if (this.createForm.invalid) return;
    const value = this.createForm.value;
    const patient = await this.patientsService.create({
      fullName: value.fullName ?? '',
      phone: value.phone ?? '',
      documentId: value.documentId ?? '',
    });
    this.activePatient.select(patient);
    this.createForm.reset();
  }
}
```

- [ ] **Step 4: Patient banner**

`apps/web/src/app/patient-drive/patient-banner.component.ts`:

```typescript
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivePatientStore } from './active-patient.store';

@Component({
  selector: 'app-patient-banner',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (activePatient.patient(); as patient) {
      <div class="banner">
        <mat-icon>person</mat-icon>
        <span>{{ patient.fullName }} · {{ patient.documentId }}</span>
        <button mat-icon-button (click)="activePatient.clear()" aria-label="Clear active patient">
          <mat-icon>close</mat-icon>
        </button>
      </div>
    }
  `,
  styles: [
    `
      .banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: var(--mat-sys-surface-variant, #fce4e8);
      }
    `,
  ],
})
export class PatientBannerComponent {
  protected readonly activePatient = inject(ActivePatientStore);
}
```

- [ ] **Step 5: Wire route and shell**

In `apps/web/src/app/app.routes.ts`, add:

```typescript
{
  path: 'patients',
  canActivate: [authGuard],
  loadComponent: () =>
    import('./patient-drive/patient-search.component').then((m) => m.PatientSearchComponent),
},
```

Also change the default redirect from `'login'` to `'patients'` so an authenticated user lands on
the Patient Drive, and let `authGuard` redirect back to `/login` when unauthenticated:

```typescript
{ path: '', pathMatch: 'full', redirectTo: 'patients' },
```

In `apps/web/src/app/app.component.ts`, import `PatientBannerComponent` and add it below the
toolbar:

```typescript
import { PatientBannerComponent } from './patient-drive/patient-banner.component';

@Component({
  // ...
  imports: [
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    TranslocoModule,
    PatientBannerComponent,
  ],
  template: `
    <mat-toolbar color="primary"> <!-- unchanged --> </mat-toolbar>
    <app-patient-banner></app-patient-banner>
    <router-outlet></router-outlet>
  `,
  // ...
})
```

- [ ] **Step 6: Manual verification**

```bash
npx nx serve api &
npx nx serve web
```

Log in, land on `/patients`, search by name/phone/ID (confirm results filter), create a new
patient, confirm the patient banner appears under the toolbar and the "clear" button removes it.
Stop both dev servers.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Patient Drive with active-patient store, search, and banner"
```

---

## Task 18: Production docker-compose

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `apps/web/nginx.conf`
- Create: `docker-compose.prod.yml`

**Interfaces:**
- Consumes: the built `apps/api` and `apps/web` outputs from every prior task
- Produces: `docker compose -f docker-compose.prod.yml up` — a full self-hosted deployment.

- [ ] **Step 1: API Dockerfile**

`apps/api/Dockerfile`:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /workspace
COPY . .
RUN npm ci
RUN npx prisma generate
RUN npx nx build api

FROM node:20-alpine
WORKDIR /app
COPY --from=build /workspace/dist/apps/api ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/prisma ./prisma
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Web Dockerfile + nginx config**

`apps/web/Dockerfile`:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /workspace
COPY . .
RUN npm ci
RUN npx nx build web --configuration=production

FROM nginx:alpine
COPY --from=build /workspace/dist/apps/web/browser /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`apps/web/nginx.conf`:

```nginx
server {
  listen 80;

  location /api/ {
    proxy_pass http://api:3000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_cookie_path / /;
  }

  location / {
    root /usr/share/nginx/html;
    try_files $uri $uri/ /index.html;
  }
}
```

- [ ] **Step 3: Production compose file**

`docker-compose.prod.yml`:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: expedientes
      POSTGRES_PASSWORD: expedientes
      POSTGRES_DB: expedientes
    volumes:
      - db_data:/var/lib/postgresql/data

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: postgresql://expedientes:expedientes@db:5432/expedientes
      JWT_SECRET: ${JWT_SECRET}
      STORAGE_ROOT: /data/storage
    volumes:
      - storage_data:/data/storage
    depends_on:
      - db

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - '80:80'
    depends_on:
      - api

volumes:
  db_data:
  storage_data:
```

- [ ] **Step 4: Manual verification**

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
docker compose -f docker-compose.prod.yml exec api npx prisma db seed
```

Open `http://localhost`, confirm the app loads and login works end to end against the
containerized stack. Then tear down:

```bash
docker compose -f docker-compose.prod.yml down
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add production docker-compose deployment"
```
