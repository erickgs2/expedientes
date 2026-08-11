# Structured Legal Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text consent with a structured informed-consent document that identifies the clinic, physician (name + cédula), patient and their identification document, states place and date, carries per-treatment sections (procedure, risks, alternatives, aftercare, contraindications) and signature blocks for patient / witness / physician, and prints as its own annex pages in the record export.

**Architecture:** The document is assembled server-side by one pure function, `buildConsentDocument`, which returns an ordered `ConsentBlock[]`. The Angular signing screen renders blocks the API hands it; the PDF renderer maps the same blocks to `@react-pdf/renderer` primitives. Neither consumer decides what the document says. Every printed value is snapshotted onto the `Consent` row at signing time, so later edits to clinic settings or the catalog cannot change a signed consent.

**Tech Stack:** Nx monorepo (npm workspaces), Next.js 16 API routes, Prisma + PostgreSQL, Angular 22 standalone components with Transloco, `@react-pdf/renderer` 4.5.1, Jest for API unit tests.

**Spec:** `docs/superpowers/specs/2026-08-10-consent-legal-document-design.md`

## Global Constraints

- Run every task through nx with npm: `npm exec nx <target> <project>`. Never call `tsc`, `jest` or `next` directly.
- Test command for API unit tests: `npm exec nx test api` — the whole suite runs in about 3 seconds, so always run all of it rather than filtering to one file.
- Typecheck command: `npm exec nx typecheck api` and `npm exec nx build web`.
- The client **never** sends consent document text. The server re-reads `ClinicSettings` and `TreatmentType` and builds every snapshot field itself. This rule already exists at `apps/api/src/app/api/treatment-items/[id]/consent/route.ts:40-42` and must survive this change.
- All signature uploads reuse the existing validation: `content-length` early-out at 10MB, authoritative post-read bounds of 1KB–10MB, and `isJpeg(buffer)` magic-byte verification from `apps/api/src/lib/storage/image-signature.ts`. Do not write a new upload path.
- All user-facing strings go through Transloco with keys added to **both** `apps/web/src/assets/i18n/es.json` and `apps/web/src/assets/i18n/en.json`. PDF strings go in `apps/api/src/lib/export/pdf-labels.ts` under both `es` and `en`.
- Angular components in this repo are standalone, use signals for state, and inject `MAT_DIALOG_DATA` as a field declared **before** any field initializer that reads it (see `RoleFormDialogComponent` — this avoids a production-build-only TS2729 error).
- Detail screens compare the fetched record's `patientId` against `ActivePatientStore` and redirect to `/treatments` on mismatch, keeping the loading state up for the duration of the navigation. Follow the existing pattern in `consent-sign.component.ts:127-148`.
- Commit after every task. Prefix messages with `feat:`, `fix:` or `refactor:`.
- **On the level of detail below:** server-side logic, types and pure functions are given as literal code, because their signatures are contracts between tasks. Angular screens are specified as a list of controls, bindings, validators and permission gates plus the exact existing file to mirror. That is deliberate — this repo has strong per-component conventions (signal state, `mismatched` guard, `canEdit` plain field, Transloco keys) that are better copied from the named neighbour than reinvented from a code block in a plan. If a step names a file to mirror, open it first.

---

### Task 1: Schema, migration and seed

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Create: `prisma/migrations/<timestamp>_structured_consent/migration.sql` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `ClinicSettings`, rewritten `Consent`, and `TreatmentType` with `consentDescription`, `consentRisks`, `consentAlternatives`, `consentAftercare`, `consentContraindications`. Permission rows `clinic-settings:view` and `clinic-settings:edit`.

- [ ] **Step 1: Replace the `Consent` model and extend `TreatmentType` in `prisma/schema.prisma`**

Replace the existing `Consent` model (currently at `prisma/schema.prisma:225-232`) with:

```prisma
model Consent {
  id                        String        @id @default(uuid())
  treatmentItemId           String        @unique
  treatmentItem             TreatmentItem @relation(fields: [treatmentItemId], references: [id])
  place                     String
  patientNameSnapshot       String
  patientIdentification     String
  clinicNameSnapshot        String
  doctorTitleSnapshot       String
  doctorNameSnapshot        String
  doctorLicenseSnapshot     String
  declarationBeforeSnapshot String
  declarationAfterSnapshot  String
  sections                  Json
  patientSignatureImagePath String
  witnessName               String?
  witnessSignatureImagePath String?
  signedAt                  DateTime      @default(now())
}
```

In `model TreatmentType`, replace the `consentTemplate String` line with:

```prisma
  consentDescription       String
  consentRisks             String?
  consentAlternatives      String?
  consentAftercare         String?
  consentContraindications String?
```

Add the new model at the end of the file:

```prisma
model ClinicSettings {
  id                  String   @id @default("singleton")
  clinicName          String
  defaultPlace        String
  doctorTitle         String
  doctorName          String
  doctorLicense       String
  doctorSignaturePath String?
  declarationBefore   String
  declarationAfter    String
  updatedAt           DateTime @updatedAt
}
```

- [ ] **Step 2: Generate the migration**

Run: `npm exec prisma migrate dev --name structured_consent`

Prisma will detect `consentTemplate` → `consentDescription` as a drop + add. **Edit the generated SQL** before it is applied in any environment other than this dev database: replace the `DROP COLUMN "consentTemplate"` / `ADD COLUMN "consentDescription"` pair with

```sql
ALTER TABLE "TreatmentType" RENAME COLUMN "consentTemplate" TO "consentDescription";
```

so existing catalog text survives. The `Consent` table's new non-null columns cannot be back-filled, so let the generated `DELETE FROM "Consent";` (or drop-and-recreate) stand — the spec establishes that no production consents exist.

Expected: migration applies cleanly, `npm exec prisma generate` runs as part of `migrate dev`.

- [ ] **Step 3: Delete the orphaned signature files**

Run: `rm -rf storage/consents`

The migration removes the `Consent` rows but not their images. This is the one-line cleanup the spec calls for.

- [ ] **Step 4: Add the permission rows and the clinic settings seed**

In `prisma/seed.ts`, add to the `PERMISSIONS` array after the `treatments` entries:

```ts
  { module: 'clinic-settings', action: 'view' },
  { module: 'clinic-settings', action: 'edit' },
```

Then add this constant above `main()` and the upsert inside it, after the admin-user upsert:

```ts
const DECLARATION_BEFORE = `YO {{patientName}}, EN MI CALIDAD DE PACIENTE, DECLARO SER MAYOR DE EDAD Y ENCONTRARME EN PLENO USO DE MIS FACULTADES MENTALES, POR LO QUE ES MI DESEO AUTORIZAR A {{doctorTitle}} {{doctorName}} CED {{doctorLicense}} A FIN DE QUE ME REALICE LOS SIGUIENTES PROCEDIMIENTOS:`;

const DECLARATION_AFTER = `MANIFIESTO QUE HE SIDO INFORMADO DEBIDAMENTE POR PARTE DE {{doctorTitle}} {{doctorName}} DE TODOS Y CADA UNO DE LOS POSIBLES RIESGOS Y COMPLICACIONES QUE IMPLICAN DICHO TRATAMIENTO Y PROCEDIMIENTOS A LOS CUALES AUTORIZO SOMETERME.

QUEDANDO ENTERADO DE DICHOS RIESGOS Y COMPLICACIONES, DECLARO ASIMISMO QUE SE ME HAN RESPONDIDO TODAS Y CADA UNA DE LAS DUDAS Y PREGUNTAS ACERCA DEL TRATAMIENTO Y PROCEDIMIENTOS A EFECTUARSE POR PARTE DE MI MEDICO TRATANTE.

ENTIENDO QUE PUEDO REVOCAR ESTE CONSENTIMIENTO EN CUALQUIER MOMENTO ANTES DE LA REALIZACION DEL PROCEDIMIENTO, SIN NECESIDAD DE EXPRESAR CAUSA Y SIN QUE ELLO AFECTE LA ATENCION QUE SE ME BRINDE.

AUTORIZO LA TOMA DE FOTOGRAFIAS CLINICAS ANTES, DURANTE Y DESPUES DEL PROCEDIMIENTO, PARA SU RESGUARDO EN MI EXPEDIENTE Y PARA EL SEGUIMIENTO DE MI TRATAMIENTO. ESTAS IMAGENES NO SERAN DIVULGADAS NI UTILIZADAS CON FINES DISTINTOS SIN MI AUTORIZACION EXPRESA Y POR ESCRITO.

TRAS CONSIDERAR TODAS Y CADA UNA DE LAS MANIFESTACIONES MENCIONADAS, ENTIENDO Y ACEPTO QUE ES MI DESEO, POR ASI CONVENIR A MIS INTERESES LEGALES Y SIN COACCION ALGUNA, RENUNCIAR A CUALQUIER ACCION JURIDICA CONTRA EL MEDICO TRATANTE.`;
```

```ts
  await prisma.clinicSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      clinicName: '',
      defaultPlace: '',
      doctorTitle: 'DRA.',
      doctorName: '',
      doctorLicense: '',
      declarationBefore: DECLARATION_BEFORE,
      declarationAfter: DECLARATION_AFTER,
    },
  });
```

The identity fields seed **blank** on purpose: blank `doctorName`/`doctorLicense` is the state the signing flow refuses to sign under, so a fresh install cannot silently produce identity-less consents. The `update: {}` means re-running the seed never overwrites edited boilerplate.

- [ ] **Step 5: Run the seed and verify**

Run: `npm exec prisma db seed`

Then verify: `npm exec prisma studio` — confirm one `ClinicSettings` row with id `singleton`, and two new `Permission` rows granted to the Admin role.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts prisma/migrations
git commit -m "feat: add ClinicSettings and structured Consent schema"
```

---

### Task 2: The consent document builder

**Files:**
- Create: `apps/api/src/lib/consent/build-consent-document.ts`
- Create: `apps/api/src/lib/consent/build-consent-document.spec.ts`
- Modify: `libs/shared/types/src/lib/consent.ts`
- Modify: `libs/shared/types/src/index.ts` (only if `consent.ts` is not already re-exported — check first)

**Interfaces:**
- Consumes: nothing (pure function, plain data in and out).
- Produces:
  - `ConsentBlock` union and `ConsentSection` in `@expedientes/shared-types`.
  - `buildConsentDocument(input: ConsentDocumentInput): ConsentBlock[]` and `interpolate(text: string, values: Record<string, string>): string` from `apps/api/src/lib/consent/build-consent-document.ts`.
  - `ConsentDocumentInput` and `ConsentDocumentLabels` types, exported from the same file.

- [ ] **Step 1: Add the block types to shared-types**

Append to `libs/shared/types/src/lib/consent.ts`:

```ts
export type ConsentSectionKey =
  | 'description'
  | 'risks'
  | 'alternatives'
  | 'aftercare'
  | 'contraindications';

export interface ConsentSection {
  key: ConsentSectionKey;
  body: string;
}

export type ConsentSignatureRole = 'patient' | 'witness' | 'doctor';

export type ConsentBlock =
  | { kind: 'title'; text: string }
  | { kind: 'fieldLine'; label: string; value: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'sectionHeading'; text: string }
  | { kind: 'signatureBlock'; role: ConsentSignatureRole; caption: string; subCaption?: string };
```

Confirm `libs/shared/types/src/index.ts` re-exports `./lib/consent.js`; it already exports `Consent`, so it does.

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/lib/consent/build-consent-document.spec.ts`:

```ts
import { buildConsentDocument, interpolate, type ConsentDocumentInput } from './build-consent-document';

const LABELS = {
  title: 'CONSENTIMIENTO INFORMADO',
  place: 'LUGAR',
  date: 'FECHA',
  patient: 'PACIENTE',
  identifiesWith: 'SE IDENTIFICA CON',
  sections: {
    description: 'PROCEDIMIENTO',
    risks: 'RIESGOS Y COMPLICACIONES',
    alternatives: 'ALTERNATIVAS DE TRATAMIENTO',
    aftercare: 'CUIDADOS POSTERIORES',
    contraindications: 'CONTRAINDICACIONES',
  },
  signatures: { patient: 'PACIENTE', witness: 'TESTIGO', doctor: 'MEDICO' },
};

function input(overrides: Partial<ConsentDocumentInput> = {}): ConsentDocumentInput {
  return {
    clinicName: 'Clinica Demo',
    doctorTitle: 'DRA.',
    doctorName: 'MIROSLAVA GARCIA',
    doctorLicense: '11372415',
    patientName: 'JUAN PEREZ',
    patientIdentification: 'INE 1234',
    place: 'Culiacan',
    signedAt: '2026-08-10T15:04:05.000Z',
    declarationBefore: 'YO {{patientName}} AUTORIZO A {{doctorTitle}} {{doctorName}}.',
    declarationAfter: 'DECLARO HABER SIDO INFORMADO.',
    sections: [{ key: 'description', body: 'Aplicacion de toxina botulinica.' }],
    witnessName: null,
    labels: LABELS,
    ...overrides,
  };
}

describe('interpolate', () => {
  it('replaces known placeholders', () => {
    expect(interpolate('Hola {{patientName}}', { patientName: 'ANA' })).toBe('Hola ANA');
  });

  it('leaves an unknown placeholder intact so a typo is visible', () => {
    expect(interpolate('Hola {{nombre}}', { patientName: 'ANA' })).toBe('Hola {{nombre}}');
  });

  it('replaces every occurrence of the same placeholder', () => {
    expect(interpolate('{{a}} y {{a}}', { a: 'X' })).toBe('X y X');
  });
});

describe('buildConsentDocument', () => {
  it('emits the header block order', () => {
    const blocks = buildConsentDocument(input());
    expect(blocks[0]).toEqual({ kind: 'title', text: 'CONSENTIMIENTO INFORMADO' });
    expect(blocks[1]).toEqual({ kind: 'fieldLine', label: 'LUGAR', value: 'Culiacan' });
    expect(blocks[2]).toEqual({ kind: 'fieldLine', label: 'FECHA', value: '2026-08-10' });
    expect(blocks[3]).toEqual({ kind: 'fieldLine', label: 'PACIENTE', value: 'JUAN PEREZ' });
    expect(blocks[4]).toEqual({
      kind: 'fieldLine',
      label: 'SE IDENTIFICA CON',
      value: 'INE 1234',
    });
  });

  it('interpolates the declarations', () => {
    const blocks = buildConsentDocument(input());
    expect(blocks[5]).toEqual({
      kind: 'paragraph',
      text: 'YO JUAN PEREZ AUTORIZO A DRA. MIROSLAVA GARCIA.',
    });
  });

  it('renders each present section as a heading followed by its body', () => {
    const blocks = buildConsentDocument(
      input({
        sections: [
          { key: 'description', body: 'Descripcion.' },
          { key: 'risks', body: 'Riesgos.' },
        ],
      })
    );
    expect(blocks[6]).toEqual({ kind: 'sectionHeading', text: 'PROCEDIMIENTO' });
    expect(blocks[7]).toEqual({ kind: 'paragraph', text: 'Descripcion.' });
    expect(blocks[8]).toEqual({ kind: 'sectionHeading', text: 'RIESGOS Y COMPLICACIONES' });
    expect(blocks[9]).toEqual({ kind: 'paragraph', text: 'Riesgos.' });
  });

  it('omits a section whose body is blank or whitespace', () => {
    const blocks = buildConsentDocument(
      input({
        sections: [
          { key: 'description', body: 'Descripcion.' },
          { key: 'risks', body: '   ' },
        ],
      })
    );
    expect(blocks.some((b) => b.kind === 'sectionHeading' && b.text === 'RIESGOS Y COMPLICACIONES')).toBe(false);
  });

  it('omits the witness signature block when there is no witness', () => {
    const blocks = buildConsentDocument(input());
    const roles = blocks.filter((b) => b.kind === 'signatureBlock').map((b) => b.role);
    expect(roles).toEqual(['patient', 'doctor']);
  });

  it('includes the witness signature block with its name when there is a witness', () => {
    const blocks = buildConsentDocument(input({ witnessName: 'LUIS SOTO' }));
    const witness = blocks.find((b) => b.kind === 'signatureBlock' && b.role === 'witness');
    expect(witness).toEqual({
      kind: 'signatureBlock',
      role: 'witness',
      caption: 'TESTIGO',
      subCaption: 'LUIS SOTO',
    });
  });

  it('captions the doctor block with title, name and licence', () => {
    const blocks = buildConsentDocument(input());
    const doctor = blocks.find((b) => b.kind === 'signatureBlock' && b.role === 'doctor');
    expect(doctor).toEqual({
      kind: 'signatureBlock',
      role: 'doctor',
      caption: 'MEDICO',
      subCaption: 'DRA. MIROSLAVA GARCIA CED 11372415',
    });
  });

  it('ends with the declarationAfter paragraph before the signature blocks', () => {
    const blocks = buildConsentDocument(input());
    const lastParagraph = blocks.filter((b) => b.kind === 'paragraph').at(-1);
    expect(lastParagraph).toEqual({ kind: 'paragraph', text: 'DECLARO HABER SIDO INFORMADO.' });
    const firstSignatureIndex = blocks.findIndex((b) => b.kind === 'signatureBlock');
    const lastParagraphIndex = blocks.lastIndexOf(lastParagraph!);
    expect(lastParagraphIndex).toBeLessThan(firstSignatureIndex);
  });
});
```

- [ ] **Step 2b: Run the test to verify it fails**

Run: `npm exec nx test api`
Expected: FAIL — `Cannot find module './build-consent-document'`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/lib/consent/build-consent-document.ts`:

```ts
import type { ConsentBlock, ConsentSection, ConsentSectionKey } from '@expedientes/shared-types';

export interface ConsentDocumentLabels {
  title: string;
  place: string;
  date: string;
  patient: string;
  identifiesWith: string;
  sections: Record<ConsentSectionKey, string>;
  signatures: { patient: string; witness: string; doctor: string };
}

export interface ConsentDocumentInput {
  clinicName: string;
  doctorTitle: string;
  doctorName: string;
  doctorLicense: string;
  patientName: string;
  patientIdentification: string;
  place: string;
  /** ISO timestamp; only the date part is printed. */
  signedAt: string;
  declarationBefore: string;
  declarationAfter: string;
  sections: ConsentSection[];
  witnessName: string | null;
  labels: ConsentDocumentLabels;
}

/**
 * Order matters: it is the order sections print in, independent of the order they arrive in.
 */
const SECTION_ORDER: ConsentSectionKey[] = [
  'description',
  'risks',
  'alternatives',
  'aftercare',
  'contraindications',
];

/**
 * Replaces `{{key}}` with `values[key]`. An unrecognized placeholder is deliberately left in the
 * output rather than blanked: a typo in an edited boilerplate paragraph should be visible on the
 * page, not silently delete a clause.
 */
export function interpolate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? values[key] : match
  );
}

export function buildConsentDocument(input: ConsentDocumentInput): ConsentBlock[] {
  const l = input.labels;
  const values: Record<string, string> = {
    clinicName: input.clinicName,
    doctorTitle: input.doctorTitle,
    doctorName: input.doctorName,
    doctorLicense: input.doctorLicense,
    patientName: input.patientName,
  };

  const blocks: ConsentBlock[] = [
    { kind: 'title', text: l.title },
    { kind: 'fieldLine', label: l.place, value: input.place },
    { kind: 'fieldLine', label: l.date, value: input.signedAt.substring(0, 10) },
    { kind: 'fieldLine', label: l.patient, value: input.patientName },
    { kind: 'fieldLine', label: l.identifiesWith, value: input.patientIdentification },
    { kind: 'paragraph', text: interpolate(input.declarationBefore, values) },
  ];

  const byKey = new Map(input.sections.map((s) => [s.key, s.body]));
  for (const key of SECTION_ORDER) {
    const body = byKey.get(key);
    if (!body || !body.trim()) continue;
    blocks.push({ kind: 'sectionHeading', text: l.sections[key] });
    blocks.push({ kind: 'paragraph', text: body.trim() });
  }

  blocks.push({ kind: 'paragraph', text: interpolate(input.declarationAfter, values) });

  blocks.push({ kind: 'signatureBlock', role: 'patient', caption: l.signatures.patient });
  if (input.witnessName && input.witnessName.trim()) {
    blocks.push({
      kind: 'signatureBlock',
      role: 'witness',
      caption: l.signatures.witness,
      subCaption: input.witnessName.trim(),
    });
  }
  blocks.push({
    kind: 'signatureBlock',
    role: 'doctor',
    caption: l.signatures.doctor,
    subCaption: `${input.doctorTitle} ${input.doctorName} CED ${input.doctorLicense}`,
  });

  return blocks;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm exec nx test api`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/types/src/lib/consent.ts apps/api/src/lib/consent
git commit -m "feat: add consent document block builder"
```

---

### Task 3: Clinic settings API

**Files:**
- Create: `apps/api/src/lib/clinic/clinic-settings.ts`
- Create: `apps/api/src/app/api/clinic-settings/route.ts`
- Modify: `libs/shared/types/src/lib/permissions.ts` (add `clinic-settings` to `PermissionModule` if that type enumerates modules — check first)
- Create: `libs/shared/types/src/lib/clinic-settings.ts`
- Modify: `libs/shared/types/src/index.ts`

**Interfaces:**
- Consumes: `saveFile` from `apps/api/src/lib/storage/file-storage.ts`, `isJpeg` from `apps/api/src/lib/storage/image-signature.ts`, `requireAuth`, `apiError`, `withApiErrors`, `writeAuditLogSafe`.
- Produces:
  - `getClinicSettings(): Promise<ClinicSettingsRow | null>` and `upsertClinicSettings(data: ClinicSettingsUpdate): Promise<ClinicSettingsRow>` from `apps/api/src/lib/clinic/clinic-settings.ts`, where `ClinicSettingsRow` is the Prisma model type.
  - `CLINIC_SETTINGS_ID = 'singleton'` from the same file.
  - `ClinicSettings` interface in `@expedientes/shared-types` (API shape: all string fields plus `doctorSignaturePath: string | null` and `updatedAt: string`).
  - `GET`/`PUT /api/clinic-settings`.

- [ ] **Step 1: Add the shared type**

Create `libs/shared/types/src/lib/clinic-settings.ts`:

```ts
export interface ClinicSettings {
  clinicName: string;
  defaultPlace: string;
  doctorTitle: string;
  doctorName: string;
  doctorLicense: string;
  doctorSignaturePath: string | null;
  declarationBefore: string;
  declarationAfter: string;
  updatedAt: string;
}

export interface ClinicSettingsInput {
  clinicName: string;
  defaultPlace: string;
  doctorTitle: string;
  doctorName: string;
  doctorLicense: string;
  declarationBefore: string;
  declarationAfter: string;
}
```

Add `export * from './lib/clinic-settings.js';` to `libs/shared/types/src/index.ts`, matching the existing export style in that file.

Open `libs/shared/types/src/lib/permissions.ts`. If it declares a union of module names, add `'clinic-settings'` to it. If it does not enumerate modules, no change is needed.

- [ ] **Step 2: Write the data-access module**

Create `apps/api/src/lib/clinic/clinic-settings.ts`:

```ts
import { prisma } from '../prisma/client';

/**
 * The clinic identity is a single row. Every read and write targets this id, so the application
 * cannot create a second one — the "there is exactly one clinic identity" invariant lives here and
 * in the schema's `@default("singleton")`, not in a uniqueness constraint that could be bypassed.
 */
export const CLINIC_SETTINGS_ID = 'singleton';

export interface ClinicSettingsUpdate {
  clinicName: string;
  defaultPlace: string;
  doctorTitle: string;
  doctorName: string;
  doctorLicense: string;
  declarationBefore: string;
  declarationAfter: string;
  doctorSignaturePath?: string;
}

export function getClinicSettings() {
  return prisma.clinicSettings.findUnique({ where: { id: CLINIC_SETTINGS_ID } });
}

export function upsertClinicSettings(data: ClinicSettingsUpdate) {
  return prisma.clinicSettings.upsert({
    where: { id: CLINIC_SETTINGS_ID },
    update: data,
    create: { id: CLINIC_SETTINGS_ID, ...data },
  });
}

/**
 * A consent must never be signed without the physician's identity — that omission is precisely the
 * defect the structured consent exists to fix, so both the API and the UI gate on this.
 */
export function hasUsableDoctorIdentity(
  settings: { doctorName: string; doctorLicense: string } | null
): boolean {
  return Boolean(settings && settings.doctorName.trim() && settings.doctorLicense.trim());
}
```

- [ ] **Step 3: Write the route**

Create `apps/api/src/app/api/clinic-settings/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  getClinicSettings,
  upsertClinicSettings,
  type ClinicSettingsUpdate,
} from '../../../lib/clinic/clinic-settings';
import { saveFile } from '../../../lib/storage/file-storage';
import { isJpeg } from '../../../lib/storage/image-signature';
import { writeAuditLogSafe } from '../../../lib/audit/audit-log';
import { requireAuth } from '../../../lib/http/require-auth';
import { apiError } from '../../../lib/http/api-error';
import { withApiErrors } from '../../../lib/http/with-api-errors';

const MAX_SIGNATURE_BYTES = 10 * 1024 * 1024;
const MIN_SIGNATURE_BYTES = 1024;
const MAX_FIELD_LENGTH = 200;
const MAX_DECLARATION_LENGTH = 20000;

const TEXT_FIELDS = [
  'clinicName',
  'defaultPlace',
  'doctorTitle',
  'doctorName',
  'doctorLicense',
] as const;

export const GET = withApiErrors(async (request: NextRequest) => {
  await requireAuth(request, 'clinic-settings', 'view');
  const settings = await getClinicSettings();
  return NextResponse.json({ clinicSettings: settings });
});

export const PUT = withApiErrors(async (request: NextRequest) => {
  const userId = await requireAuth(request, 'clinic-settings', 'edit');

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SIGNATURE_BYTES) {
    return apiError('INVALID_INPUT', 'Request is too large', 413);
  }

  const formData = await request.formData();

  const values: Record<string, string> = {};
  for (const field of TEXT_FIELDS) {
    const raw = formData.get(field);
    if (typeof raw !== 'string') return apiError('INVALID_INPUT', `${field} is required`, 400);
    const trimmed = raw.trim();
    if (trimmed.length > MAX_FIELD_LENGTH) {
      return apiError('INVALID_INPUT', `${field} is too long`, 400);
    }
    values[field] = trimmed;
  }
  for (const field of ['declarationBefore', 'declarationAfter'] as const) {
    const raw = formData.get(field);
    if (typeof raw !== 'string' || !raw.trim()) {
      return apiError('INVALID_INPUT', `${field} is required`, 400);
    }
    if (raw.length > MAX_DECLARATION_LENGTH) {
      return apiError('INVALID_INPUT', `${field} is too long`, 400);
    }
    values[field] = raw;
  }

  const data: ClinicSettingsUpdate = {
    clinicName: values.clinicName,
    defaultPlace: values.defaultPlace,
    doctorTitle: values.doctorTitle,
    doctorName: values.doctorName,
    doctorLicense: values.doctorLicense,
    declarationBefore: values.declarationBefore,
    declarationAfter: values.declarationAfter,
  };

  const signature = formData.get('doctorSignature');
  if (signature instanceof Blob) {
    const buffer = Buffer.from(await signature.arrayBuffer());
    if (buffer.length > MAX_SIGNATURE_BYTES || buffer.length < MIN_SIGNATURE_BYTES) {
      return apiError('INVALID_INPUT', 'Signature is too large or too small', 400);
    }
    if (!isJpeg(buffer)) {
      return apiError('INVALID_INPUT', 'doctorSignature must be a JPEG image', 400);
    }
    // `saveFile`'s second and third segments are category and patient id; the clinic signature has
    // no patient, so it lives under a fixed `settings` bucket. Both segments are literals here, so
    // the path-traversal guard inside `saveFile` has nothing user-controlled to reject.
    data.doctorSignaturePath = await saveFile(buffer, 'clinic', 'settings', 'signature.jpg');
  }

  const clinicSettings = await upsertClinicSettings(data);

  await writeAuditLogSafe({
    userId,
    action: 'update',
    entity: 'ClinicSettings',
    entityId: clinicSettings.id,
  });

  return NextResponse.json({ clinicSettings });
});
```

- [ ] **Step 4: Typecheck**

Run: `npm exec nx typecheck api`
Expected: PASS.

- [ ] **Step 5: Verify by hand**

Start the API (`npm exec nx dev api`), log in as the seeded admin, then:
- `GET /api/clinic-settings` returns the seeded row with blank `doctorName`.
- A `PUT` with all seven text fields returns 200 and persists.
- A `PUT` missing `doctorName` returns 400.
- A `PUT` with a non-JPEG `doctorSignature` returns 400.

- [ ] **Step 6: Commit**

```bash
git add libs/shared/types apps/api/src/lib/clinic apps/api/src/app/api/clinic-settings
git commit -m "feat: add clinic settings API"
```

---

### Task 4: Signature pad extraction and the clinic settings screen

**Files:**
- Create: `apps/web/src/app/shared/signature-pad/signature-pad.component.ts`
- Modify: `apps/web/src/app/treatments/consent-sign.component.ts` (use the extracted component)
- Create: `apps/web/src/app/admin/clinic-settings.service.ts`
- Create: `apps/web/src/app/admin/clinic-settings.component.ts`
- Modify: `apps/web/src/app/app.routes.ts`
- Modify: `apps/web/src/assets/i18n/es.json`, `apps/web/src/assets/i18n/en.json`

**Interfaces:**
- Consumes: `ClinicSettings`, `ClinicSettingsInput` from `@expedientes/shared-types`; `AuthService.hasPermission`.
- Produces:
  - `SignaturePadComponent` (selector `app-signature-pad`) with input `disabled: boolean` and public methods `toJpegBlob(): Promise<Blob | null>`, `clear(): void`, and a `hasStrokes` signal exposed as a readonly signal input-free property.
  - `ClinicSettingsService` with `get(): Promise<ClinicSettings | null>` and `save(input: ClinicSettingsInput, signature: Blob | null): Promise<ClinicSettings>`.

- [ ] **Step 1: Extract the signature pad**

Create `apps/web/src/app/shared/signature-pad/signature-pad.component.ts`. Move the canvas logic out of `consent-sign.component.ts:151-224` verbatim — the white-fill-before-first-stroke behaviour and its comment must come across intact, because JPEG has no alpha channel and an unfilled canvas exports transparent pixels as black.

```ts
import { Component, ElementRef, ViewChild, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';

const SIGNATURE_JPEG_QUALITY = 0.9;

@Component({
  selector: 'app-signature-pad',
  standalone: true,
  imports: [MatButtonModule, TranslocoModule],
  template: `
    <canvas
      #canvas
      class="signature-canvas"
      width="600"
      height="200"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp()"
      (pointerleave)="onPointerUp()"
    ></canvas>
    <button mat-button type="button" [disabled]="disabled()" (click)="clear()">
      {{ 'treatments.clearSignature' | transloco }}
    </button>
  `,
  styles: [
    `
      .signature-canvas {
        border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.3));
        touch-action: none;
        max-width: 100%;
        display: block;
      }
    `,
  ],
})
export class SignaturePadComponent {
  readonly disabled = input(false);
  readonly hasStrokes = signal(false);

  @ViewChild('canvas') private canvasRef!: ElementRef<HTMLCanvasElement>;

  private drawing = false;
  private lastX = 0;
  private lastY = 0;
  private canvasInitialized = false;

  // The canvas defaults to a transparent background, but JPEG has no alpha channel — exporting an
  // untouched canvas straight to JPEG renders transparent pixels as black, not white. Filling it
  // opaque white before the first stroke keeps the exported signature on a white background. Only
  // done once per canvas (guarded by `canvasInitialized`), since re-filling on every stroke's
  // pointerdown would erase earlier strokes of a multi-stroke signature.
  private ensureCanvasInitialized(canvas: HTMLCanvasElement): void {
    if (this.canvasInitialized) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    this.canvasInitialized = true;
  }

  protected onPointerDown(event: PointerEvent): void {
    if (this.disabled()) return;
    const canvas = this.canvasRef.nativeElement;
    this.ensureCanvasInitialized(canvas);
    this.drawing = true;
    const rect = canvas.getBoundingClientRect();
    this.lastX = (event.clientX - rect.left) * (canvas.width / rect.width);
    this.lastY = (event.clientY - rect.top) * (canvas.height / rect.height);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.drawing) return;
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.lastX, this.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    this.lastX = x;
    this.lastY = y;
    this.hasStrokes.set(true);
  }

  protected onPointerUp(): void {
    this.drawing = false;
  }

  clear(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.canvasInitialized = true;
    this.hasStrokes.set(false);
  }

  toJpegBlob(): Promise<Blob | null> {
    return new Promise((resolve) =>
      this.canvasRef.nativeElement.toBlob(resolve, 'image/jpeg', SIGNATURE_JPEG_QUALITY)
    );
  }
}
```

- [ ] **Step 2: Add the i18n keys**

In `apps/web/src/assets/i18n/es.json`, add a `clinicSettings` object at the top level:

```json
  "clinicSettings": {
    "title": "Datos de la clínica",
    "clinicName": "Nombre de la clínica",
    "defaultPlace": "Lugar predeterminado",
    "doctorTitle": "Título",
    "doctorName": "Nombre del médico",
    "doctorLicense": "Cédula profesional",
    "declarationBefore": "Declaración inicial",
    "declarationAfter": "Declaración final",
    "doctorSignature": "Firma del médico",
    "currentSignature": "Firma actual",
    "replaceSignature": "Reemplazar firma",
    "placeholderHelp": "Puede usar {{patientName}}, {{doctorTitle}}, {{doctorName}}, {{doctorLicense}} y {{clinicName}}.",
    "saved": "Datos guardados"
  },
```

In `apps/web/src/assets/i18n/en.json`, the same object with English values: `"Clinic details"`, `"Clinic name"`, `"Default place"`, `"Title"`, `"Doctor name"`, `"Licence number"`, `"Opening declaration"`, `"Closing declaration"`, `"Doctor signature"`, `"Current signature"`, `"Replace signature"`, `"You can use {{patientName}}, {{doctorTitle}}, {{doctorName}}, {{doctorLicense}} and {{clinicName}}."`, `"Settings saved"`.

Transloco interpolates `{{…}}` in translation values. Escape the placeholder help string by wrapping the literal braces the way Transloco expects — set `"placeholderHelp"` to a plain sentence without braces if escaping proves awkward: `"Puede usar los marcadores patientName, doctorTitle, doctorName, doctorLicense y clinicName entre llaves dobles."` Prefer this simpler form; it avoids fighting the interpolator for a hint string.

- [ ] **Step 3: Write the service**

Create `apps/web/src/app/admin/clinic-settings.service.ts`:

```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ClinicSettings, ClinicSettingsInput } from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class ClinicSettingsService {
  private readonly http = inject(HttpClient);

  get(): Promise<ClinicSettings | null> {
    return firstValueFrom(
      this.http.get<{ clinicSettings: ClinicSettings | null }>('/api/clinic-settings')
    ).then((r) => r.clinicSettings);
  }

  save(input: ClinicSettingsInput, signature: Blob | null): Promise<ClinicSettings> {
    const formData = new FormData();
    for (const [key, value] of Object.entries(input)) {
      formData.append(key, value);
    }
    if (signature) formData.append('doctorSignature', signature, 'signature.jpg');
    return firstValueFrom(
      this.http.put<{ clinicSettings: ClinicSettings }>('/api/clinic-settings', formData)
    ).then((r) => r.clinicSettings);
  }
}
```

- [ ] **Step 4: Write the screen**

Create `apps/web/src/app/admin/clinic-settings.component.ts`: a standalone component with a `ReactiveFormsModule` form group over the seven text fields (all `Validators.required`), an `<img>` of the current `doctorSignaturePath` when one exists (`/api/files/${path}`), an `<app-signature-pad>` for drawing a replacement, and a save button disabled when `form.invalid || saving() || !canEdit`. `canEdit` is a plain field set once in `ngOnInit` from `auth.hasPermission('clinic-settings', 'edit')` — permissions don't change mid-session, matching the pattern documented in `consent-sign.component.ts:108-111`.

On save, call `signaturePad.hasStrokes() ? await signaturePad.toJpegBlob() : null` and pass it to `ClinicSettingsService.save`. Reload the returned settings into the form so the displayed signature updates.

- [ ] **Step 5: Register the route**

In `apps/web/src/app/app.routes.ts`, add after the `admin/treatments` entry:

```ts
  {
    path: 'admin/clinic',
    canActivate: [authGuard, permissionGuard('clinic-settings', 'view')],
    loadComponent: () =>
      import('./admin/clinic-settings.component').then((m) => m.ClinicSettingsComponent),
  },
```

- [ ] **Step 6: Point the existing consent screen at the extracted pad**

In `apps/web/src/app/treatments/consent-sign.component.ts`, replace the inline `<canvas>` and its handlers with `<app-signature-pad #patientPad>`, delete the moved methods, and get the blob from `patientPad.toJpegBlob()`. The screen is rewritten wholesale in Task 7 — this step only keeps the app compiling and the existing flow working in between.

- [ ] **Step 7: Build**

Run: `npm exec nx build web`
Expected: PASS.

- [ ] **Step 8: Verify by hand**

Log in as admin, open `/admin/clinic`, fill in the clinic name, place, doctor title/name/cédula, draw a signature, save. Reload — the values and the signature image persist.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/shared/signature-pad apps/web/src/app/admin apps/web/src/app/app.routes.ts apps/web/src/app/treatments/consent-sign.component.ts apps/web/src/assets/i18n
git commit -m "feat: add clinic settings screen and extract signature pad"
```

---

### Task 5: Treatment type consent sections

**Files:**
- Modify: `apps/api/src/lib/treatment/treatment-type.ts`
- Modify: `apps/api/src/app/api/treatment-types/route.ts`
- Modify: `apps/api/src/app/api/treatment-types/[id]/route.ts`
- Modify: `libs/shared/types/src/lib/treatment.ts`
- Modify: `apps/web/src/app/treatments/treatment-type-form-dialog.component.ts`
- Modify: `apps/web/src/app/treatments/treatment-types.service.ts`
- Modify: `apps/web/src/assets/i18n/es.json`, `apps/web/src/assets/i18n/en.json`

**Interfaces:**
- Consumes: nothing from earlier tasks beyond the Task 1 schema.
- Produces: `TreatmentType` in `@expedientes/shared-types` gains `consentDescription: string` and `consentRisks | consentAlternatives | consentAftercare | consentContraindications: string | null`. `createTreatmentType(name, sections)` and `updateTreatmentType(id, data)` accept the five section fields.

- [ ] **Step 1: Update the shared type**

In `libs/shared/types/src/lib/treatment.ts`, replace `consentTemplate: string;` on the `TreatmentType` interface with:

```ts
  consentDescription: string;
  consentRisks: string | null;
  consentAlternatives: string | null;
  consentAftercare: string | null;
  consentContraindications: string | null;
```

- [ ] **Step 2: Update the data-access module**

Rewrite `apps/api/src/lib/treatment/treatment-type.ts`:

```ts
import { prisma } from '../prisma/client';

export interface TreatmentTypeSections {
  consentDescription: string;
  consentRisks: string | null;
  consentAlternatives: string | null;
  consentAftercare: string | null;
  consentContraindications: string | null;
}

export interface TreatmentTypeUpdateData extends Partial<TreatmentTypeSections> {
  name?: string;
  active?: boolean;
}

export async function listTreatmentTypes() {
  return prisma.treatmentType.findMany({ orderBy: { name: 'asc' } });
}

export async function createTreatmentType(name: string, sections: TreatmentTypeSections) {
  return prisma.treatmentType.create({ data: { name, ...sections } });
}

export async function updateTreatmentType(id: string, data: TreatmentTypeUpdateData) {
  return prisma.treatmentType.update({ where: { id }, data });
}
```

- [ ] **Step 3: Update the routes**

In `apps/api/src/app/api/treatment-types/route.ts`, change the `POST` body type and validation:

```ts
  const body = (await request.json()) as {
    name?: string;
    consentDescription?: string;
    consentRisks?: string | null;
    consentAlternatives?: string | null;
    consentAftercare?: string | null;
    consentContraindications?: string | null;
  };
  if (!body.name) return apiError('INVALID_INPUT', 'name is required', 400);
  if (!body.consentDescription) {
    return apiError('INVALID_INPUT', 'consentDescription is required', 400);
  }

  const treatmentType = await createTreatmentType(body.name, {
    consentDescription: body.consentDescription,
    consentRisks: body.consentRisks ?? null,
    consentAlternatives: body.consentAlternatives ?? null,
    consentAftercare: body.consentAftercare ?? null,
    consentContraindications: body.consentContraindications ?? null,
  });
```

In `apps/api/src/app/api/treatment-types/[id]/route.ts`, replace the `consentTemplate` handling with the same five fields: `consentDescription` rejects an explicitly-empty value (`body.consentDescription !== undefined && !body.consentDescription` → 400), the four optional fields pass through unchanged, and an empty string on an optional field is normalized to `null` so a cleared textarea removes the section rather than emitting a blank heading.

- [ ] **Step 4: Update the catalog dialog**

In `apps/web/src/app/treatments/treatment-type-form-dialog.component.ts`, replace the single `consentTemplate` textarea with five: `consentDescription` (`Validators.required`, 8 rows) and four optional ones (4 rows each) labelled from the new i18n keys. The form group becomes:

```ts
  protected readonly form = this.fb.group({
    name: [this.data.treatmentType?.name ?? '', Validators.required],
    consentDescription: [this.data.treatmentType?.consentDescription ?? '', Validators.required],
    consentRisks: [this.data.treatmentType?.consentRisks ?? ''],
    consentAlternatives: [this.data.treatmentType?.consentAlternatives ?? ''],
    consentAftercare: [this.data.treatmentType?.consentAftercare ?? ''],
    consentContraindications: [this.data.treatmentType?.consentContraindications ?? ''],
  });
```

Update `TreatmentTypesService.create`/`update` signatures to carry the five fields, and update `treatment-type-list.component.ts` if it displays `consentTemplate` anywhere (grep for it before finishing this task).

- [ ] **Step 5: Add the i18n keys**

Under `treatmentCatalog` in both `es.json` and `en.json`, replace `consentTemplate` with:

```json
    "consentDescription": "Descripción del procedimiento",
    "consentRisks": "Riesgos y complicaciones",
    "consentAlternatives": "Alternativas de tratamiento",
    "consentAftercare": "Cuidados posteriores",
    "consentContraindications": "Contraindicaciones",
    "optionalHint": "Opcional — se omite del consentimiento si se deja vacío",
```

English: `"Procedure description"`, `"Risks and complications"`, `"Treatment alternatives"`, `"Aftercare"`, `"Contraindications"`, `"Optional — omitted from the consent when left blank"`.

- [ ] **Step 6: Verify nothing still references the old field**

Run: `grep -rn "consentTemplate" apps libs prisma --include="*.ts" --include="*.tsx" --include="*.json" --include="*.prisma" | grep -v node_modules`
Expected: no results other than inside `prisma/migrations/`.

- [ ] **Step 7: Typecheck and build**

Run: `npm exec nx typecheck api && npm exec nx build web`
Expected: PASS.

- [ ] **Step 8: Verify by hand**

Open `/admin/treatments`, edit a treatment type, fill in a description and risks, leave alternatives blank, save, reopen — values round-trip and the blank field stays blank.

- [ ] **Step 9: Commit**

```bash
git add apps libs
git commit -m "feat: split treatment type consent template into sections"
```

---

### Task 6: Consent detail and signing API

**Files:**
- Modify: `apps/api/src/lib/treatment/consent.ts`
- Modify: `apps/api/src/app/api/treatment-items/[id]/consent/route.ts`
- Modify: `apps/api/src/app/api/treatment-items/[id]/route.ts`
- Modify: `libs/shared/types/src/lib/consent.ts`
- Create: `apps/api/src/lib/consent/consent-labels.ts`

**Interfaces:**
- Consumes: `buildConsentDocument`, `ConsentDocumentInput`, `interpolate` (Task 2); `getClinicSettings`, `hasUsableDoctorIdentity` (Task 3); `TreatmentTypeSections` (Task 5).
- Produces:
  - `CONSENT_LABELS: Record<'es' | 'en', ConsentDocumentLabels>` from `apps/api/src/lib/consent/consent-labels.ts`.
  - `sectionsFromTreatmentType(type): ConsentSection[]` from `apps/api/src/lib/treatment/consent.ts`.
  - `signTreatmentItemConsent(treatmentItemId, input: SignConsentInput)` where `SignConsentInput = { place: string; patientIdentification: string; witnessName: string | null; patientSignature: Buffer; witnessSignature: Buffer | null }`, returning `{ consent, patientId } | null`.
  - `TreatmentItemDetail` in shared-types gains `consentPreview: ConsentBlock[] | null`, `consentDocument: ConsentBlock[] | null`, `settingsUpdatedAt: string | null`, `defaultPlace: string`, `canSign: boolean`, and `patientDocumentId: string`.

- [ ] **Step 1: Add the label bundle**

Create `apps/api/src/lib/consent/consent-labels.ts` exporting `CONSENT_LABELS` typed as `Record<'es' | 'en', ConsentDocumentLabels>`, with the Spanish set exactly matching the paper form — `title: 'CONSENTIMIENTO INFORMADO'`, `place: 'LUGAR'`, `date: 'FECHA'`, `patient: 'PACIENTE'`, `identifiesWith: 'SE IDENTIFICA CON'`, sections `PROCEDIMIENTO` / `RIESGOS Y COMPLICACIONES` / `ALTERNATIVAS DE TRATAMIENTO` / `CUIDADOS POSTERIORES` / `CONTRAINDICACIONES`, signatures `PACIENTE` / `TESTIGO` / `MEDICO` — and the English set as the direct translation.

The API assembles documents in Spanish (`CONSENT_LABELS.es`) for the signing screen, because the consent is signed in Spanish regardless of UI language. The export passes the requested export language, which is why this is a bundle and not a constant.

- [ ] **Step 2: Update the shared detail type**

In `libs/shared/types/src/lib/consent.ts`, replace the `Consent` interface and extend `TreatmentItemDetail`:

```ts
export interface Consent {
  id: string;
  place: string;
  patientIdentification: string;
  witnessName: string | null;
  patientSignatureImagePath: string;
  witnessSignatureImagePath: string | null;
  signedAt: string;
}

export interface TreatmentItemDetail {
  id: string;
  treatmentId: string;
  treatmentTypeId: string;
  treatmentTypeName: string;
  notes: string | null;
  patientId: string;
  patientDocumentId: string;
  /** Blocks for an unsigned item, built from live settings + catalog. Null once signed. */
  consentPreview: ConsentBlock[] | null;
  /** Blocks rebuilt from the signed snapshot. Null when unsigned. */
  consentDocument: ConsentBlock[] | null;
  consent: Consent | null;
  consentTemplateUpdatedAt: string;
  settingsUpdatedAt: string | null;
  defaultPlace: string;
  /** False when clinic settings are missing or the physician identity is blank. */
  canSign: boolean;
  diagrams: DiagramViewRecord[];
}
```

- [ ] **Step 3: Rewrite `getTreatmentItemDetail`**

In `apps/api/src/lib/treatment/consent.ts`, load the patient alongside the item (`include: { treatmentType: true, treatment: { include: { patient: true } }, consent: true, diagrams: true }`), add:

```ts
export function sectionsFromTreatmentType(type: {
  consentDescription: string;
  consentRisks: string | null;
  consentAlternatives: string | null;
  consentAftercare: string | null;
  consentContraindications: string | null;
}): ConsentSection[] {
  return [
    { key: 'description', body: type.consentDescription },
    { key: 'risks', body: type.consentRisks ?? '' },
    { key: 'alternatives', body: type.consentAlternatives ?? '' },
    { key: 'aftercare', body: type.consentAftercare ?? '' },
    { key: 'contraindications', body: type.consentContraindications ?? '' },
  ].filter((s) => s.body.trim()) as ConsentSection[];
}
```

and build the two block lists:

- `consentPreview` — only when `item.consent` is null and settings are usable. Uses live settings, the catalog sections, `place: settings.defaultPlace`, `signedAt: new Date().toISOString()`, `patientIdentification: patient.documentId`, `witnessName: null`. This is a preview: the real values are re-derived at signing.
- `consentDocument` — only when `item.consent` exists. Built entirely from the snapshot columns, with `sections: item.consent.sections as ConsentSection[]`. Because the declarations were stored already interpolated, pass them through and let `interpolate` find nothing to replace.

Return `canSign: hasUsableDoctorIdentity(settings)`, `settingsUpdatedAt: settings?.updatedAt.toISOString() ?? null`, `defaultPlace: settings?.defaultPlace ?? ''`, and `patientDocumentId: patient.documentId`.

- [ ] **Step 4: Rewrite `signTreatmentItemConsent`**

```ts
export interface SignConsentInput {
  place: string;
  patientIdentification: string;
  witnessName: string | null;
  patientSignature: Buffer;
  witnessSignature: Buffer | null;
}

export async function signTreatmentItemConsent(
  treatmentItemId: string,
  input: SignConsentInput
) {
  const item = await prisma.treatmentItem.findUnique({
    where: { id: treatmentItemId },
    include: { treatmentType: true, treatment: { include: { patient: true } } },
  });
  if (!item) return null;

  const settings = await getClinicSettings();
  if (!hasUsableDoctorIdentity(settings) || !settings) return 'NO_CLINIC_IDENTITY' as const;

  const patientId = item.treatment.patientId;
  const patientName = item.treatment.patient.fullName;
  const values = {
    clinicName: settings.clinicName,
    doctorTitle: settings.doctorTitle,
    doctorName: settings.doctorName,
    doctorLicense: settings.doctorLicense,
    patientName,
  };

  const patientSignatureImagePath = await saveFile(
    input.patientSignature,
    'consents',
    patientId,
    'signature.jpg'
  );
  const witnessSignatureImagePath = input.witnessSignature
    ? await saveFile(input.witnessSignature, 'consents', patientId, 'witness.jpg')
    : null;

  const consent = await prisma.consent.create({
    data: {
      treatmentItemId,
      place: input.place,
      patientNameSnapshot: patientName,
      patientIdentification: input.patientIdentification,
      clinicNameSnapshot: settings.clinicName,
      doctorTitleSnapshot: settings.doctorTitle,
      doctorNameSnapshot: settings.doctorName,
      doctorLicenseSnapshot: settings.doctorLicense,
      declarationBeforeSnapshot: interpolate(settings.declarationBefore, values),
      declarationAfterSnapshot: interpolate(settings.declarationAfter, values),
      sections: sectionsFromTreatmentType(item.treatmentType),
      patientSignatureImagePath,
      witnessName: input.witnessName,
      witnessSignatureImagePath,
    },
  });
  return { consent, patientId };
}
```

Keep and extend the existing docblock: the snapshot rule now covers the clinic identity and declarations too, and the `@unique` on `treatmentItemId` still catches concurrent double-signs via `withApiErrors`'s P2002 handling.

- [ ] **Step 5: Rewrite the signing route**

In `apps/api/src/app/api/treatment-items/[id]/consent/route.ts`, keep the existing structure and add:

- Read `patientSignature` (required Blob), `witnessSignature` (optional Blob), `place`, `patientIdentification`, `witnessName`, `templateUpdatedAt`, `settingsUpdatedAt` from the form data.
- Reject 400 when `place` or `patientIdentification` is missing or blank after trimming, or longer than 200 characters.
- Reject 400 when exactly one of `witnessName` (non-blank) and `witnessSignature` is present: `A witness name requires a witness signature, and vice versa`.
- Validate both blobs with the existing size bounds and `isJpeg`.
- Keep the `templateUpdatedAt` check verbatim. Add the parallel check with its own message: `The clinic settings changed since this page was loaded — please reload and try again`.
- Map a `'NO_CLINIC_IDENTITY'` return to `apiError('CONFLICT', 'Clinic settings are incomplete: set the doctor name and licence number before signing consents', 409)`.
- Return the new consent shape plus the freshly-built `consentDocument` blocks so the screen can render without a refetch.

- [ ] **Step 6: Typecheck**

Run: `npm exec nx typecheck api`
Expected: PASS.

- [ ] **Step 7: Verify by hand**

With clinic settings blank, `POST` to sign returns 409. After filling them in, a valid multipart sign returns 201 and `GET /api/treatment-items/[id]` returns `consentDocument` blocks with the snapshot values. Signing the same item again returns 409.

- [ ] **Step 8: Commit**

```bash
git add apps/api libs/shared/types
git commit -m "feat: sign structured consents with snapshotted clinic identity"
```

---

### Task 7: Signing screen

**Files:**
- Modify: `apps/web/src/app/treatments/consent-sign.component.ts`
- Modify: `apps/web/src/app/treatments/consent.service.ts`
- Create: `apps/web/src/app/shared/consent/consent-blocks.component.ts`
- Modify: `apps/web/src/assets/i18n/es.json`, `apps/web/src/assets/i18n/en.json`

**Interfaces:**
- Consumes: `ConsentBlock`, `TreatmentItemDetail`, `Consent` from shared-types; `SignaturePadComponent` (Task 4).
- Produces: `ConsentBlocksComponent` (selector `app-consent-blocks`) with a required `blocks: ConsentBlock[]` input and an optional `signatureUrls: Partial<Record<ConsentSignatureRole, string>>` input.

- [ ] **Step 1: Write the block renderer**

Create `apps/web/src/app/shared/consent/consent-blocks.component.ts`: a standalone component taking `blocks` and switching on `block.kind` in the template — `title` as an `<h2>`, `fieldLine` as a definition row with an underlined value, `paragraph` as a `<p>` with `white-space: pre-wrap`, `sectionHeading` as an `<h3>`, and `signatureBlock` as a ruled line with the caption and optional sub-caption beneath, showing the signature image when `signatureUrls[block.role]` is set.

- [ ] **Step 2: Update the service**

In `apps/web/src/app/treatments/consent.service.ts`, replace `sign` with:

```ts
  sign(
    itemId: string,
    input: {
      place: string;
      patientIdentification: string;
      witnessName: string | null;
      patientSignature: Blob;
      witnessSignature: Blob | null;
      templateUpdatedAt: string;
      settingsUpdatedAt: string;
    }
  ): Promise<{ consent: Consent; consentDocument: ConsentBlock[] }> {
    const formData = new FormData();
    formData.append('patientSignature', input.patientSignature, 'signature.jpg');
    if (input.witnessSignature) {
      formData.append('witnessSignature', input.witnessSignature, 'witness.jpg');
    }
    formData.append('place', input.place);
    formData.append('patientIdentification', input.patientIdentification);
    if (input.witnessName) formData.append('witnessName', input.witnessName);
    formData.append('templateUpdatedAt', input.templateUpdatedAt);
    formData.append('settingsUpdatedAt', input.settingsUpdatedAt);
    return firstValueFrom(
      this.http.post<{ consent: Consent; consentDocument: ConsentBlock[] }>(
        `/api/treatment-items/${itemId}/consent`,
        formData
      )
    );
  }
```

- [ ] **Step 3: Rewrite the screen**

`ConsentSignComponent` keeps its existing load-and-guard `ngOnInit` verbatim (patient-mismatch redirect, `mismatched` flag, `finally`). The template becomes:

- When `item()!.canSign === false` and unsigned: a message from `treatments.clinicSettingsIncomplete` and a `routerLink` to `/admin/clinic`. No form.
- When signed: `<app-consent-blocks [blocks]="item()!.consentDocument!" [signatureUrls]="signatureUrls()" />` plus the signed-at line.
- When unsigned and signable: three `mat-form-field` inputs bound to a form group — `place` (pre-filled `defaultPlace`, required), `patientIdentification` (pre-filled `patientDocumentId`, required), `witnessName` (optional) — then `<app-consent-blocks [blocks]="item()!.consentPreview!" />`, then the patient `<app-signature-pad #patientPad>`, then, rendered only when `witnessName` is non-blank, `<app-signature-pad #witnessPad>`, then the sign button.

The sign button is disabled unless `form.valid && patientPad.hasStrokes() && (!witnessName || witnessPad?.hasStrokes())`. On click it collects both blobs, calls the service, and sets the returned `consent` and `consentDocument` into signals. On failure the interceptor toast fires and nothing is cleared — the drawn signatures and typed fields stay on screen.

- [ ] **Step 4: Add the i18n keys**

Under `treatments` in both files, add: `place`, `patientIdentification`, `witnessName`, `witnessSignature`, `patientSignature`, `clinicSettingsIncomplete`, `goToClinicSettings`. Spanish: `"Lugar"`, `"Se identifica con"`, `"Testigo (opcional)"`, `"Firma del testigo"`, `"Firma del paciente"`, `"Antes de firmar consentimientos, complete el nombre y la cédula del médico en los datos de la clínica."`, `"Ir a datos de la clínica"`. English equivalents.

- [ ] **Step 5: Build**

Run: `npm exec nx build web`
Expected: PASS.

- [ ] **Step 6: Verify by hand**

Blank the doctor name in `/admin/clinic` — the signing screen blocks with the message and link. Restore it; sign a consent without a witness and confirm the signed view shows LUGAR, FECHA, PACIENTE, SE IDENTIFICA CON, the sections, and two signature blocks. Sign another with a witness and confirm three.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat: capture place, identification and witness when signing consents"
```

---

### Task 8: PDF annex pages

**Files:**
- Create: `apps/api/src/lib/export/consent-document-pdf.tsx`
- Modify: `apps/api/src/lib/export/build-pdf.tsx`
- Modify: `apps/api/src/lib/export/gather-export-data.ts`
- Modify: `apps/api/src/lib/export/pdf-labels.ts`

**Interfaces:**
- Consumes: `ConsentBlock` from shared-types; `CONSENT_LABELS` and `buildConsentDocument` (Tasks 2 and 6); `getClinicSettings` (Task 3).
- Produces: `<ConsentPage>` from `consent-document-pdf.tsx`, with props `{ blocks: ConsentBlock[]; header: { clinicName: string; title: string; treatmentTypeName: string }; footer: { patientName: string; signedOn: string; pageLabel: (n: number, total: number) => string }; signatures: Partial<Record<ConsentSignatureRole, Buffer>> }`.

- [ ] **Step 1: Extend the export data shape**

In `apps/api/src/lib/export/gather-export-data.ts`, replace the `consent` field on `ExportTreatmentItem`:

```ts
  consent: {
    blocks: ConsentBlock[];
    signedAt: string;
    patientSignatureImagePath: string;
    witnessSignatureImagePath: string | null;
  } | null;
```

Populate `blocks` from the detail's `consentDocument` (already assembled in Spanish from the snapshot — pass it through unchanged, do not rebuild it), and add `clinicName: string` and `doctorSignaturePath: string | null` to `ExportData`, read once via `getClinicSettings()` in `gatherExportData`. The clinic name and physician signature are the only two live-read values in the export; every word of the consent body comes from the snapshot.

- [ ] **Step 2: Add the PDF labels**

In `apps/api/src/lib/export/pdf-labels.ts`, extend the `treatments` label group in the `PdfLabels` interface and both language objects with `consentSignedOn: string`, `consentAnnexRef: string` and `consentPageOf: string`. Spanish: `'Consentimiento firmado el'`, `'ver anexo'`, `'Página {{n}} de {{total}}'`. English: `'Consent signed on'`, `'see annex'`, `'Page {{n}} of {{total}}'`.

**Do not add a consent-body label group here.** The blocks arriving from `getTreatmentItemDetail` were built with `CONSENT_LABELS.es` in Task 6, and that is correct: a signed consent is an archived legal instrument and must print exactly as it was signed, in the language it was signed in, regardless of which language the surrounding record export was requested in. The export language governs only the record chrome — the header, the footer and the one-line annex reference.

- [ ] **Step 3: Write the consent page renderer**

Create `apps/api/src/lib/export/consent-document-pdf.tsx`. Its own `StyleSheet` (do not reuse `build-pdf.tsx`'s, which is tuned for the record page): `page` with `padding: 48, paddingTop: 72, paddingBottom: 64, fontSize: 10`, a `fixed` header `View` at `position: 'absolute', top: 24, left: 48, right: 48`, a `fixed` footer at `bottom: 24`, `title` at `fontSize: 16, textAlign: 'center', marginBottom: 16`, `paragraph` with `textAlign: 'justify', marginBottom: 8, lineHeight: 1.4`, `sectionHeading` bold uppercase `fontSize: 11, marginTop: 10, marginBottom: 4`, and `signatureRow` as a `flexDirection: 'row'` grid.

The footer uses the render prop for true per-consent numbering:

```tsx
<Text
  style={styles.footer}
  fixed
  render={({ subPageNumber, subPageTotalPages }) =>
    `${footer.patientName} — ${footer.signedOn} — ${footer.pageLabel(subPageNumber, subPageTotalPages)}`
  }
/>
```

`subPageNumber`/`subPageTotalPages` reset per `<Page>` element (verified against `@react-pdf/renderer` 4.5.1's `react-pdf.d.ts:248-250`), which is what makes a per-consent counter possible inside a single `<Document>`.

Wrap the signature blocks in `<View wrap={false}>` so signatures are never orphaned onto a sheet with no consent text above them.

- [ ] **Step 4: Wire the pages into the document**

In `apps/api/src/lib/export/buildExportPdf`, extend the pre-render image loading: read each consent's patient and witness signatures into a `Map<string, Buffer>` keyed `${itemId}:patient` / `${itemId}:witness`, and read the clinic's `doctorSignaturePath` once into a single `Buffer | null`. Keep every read in a `try/catch` that logs and continues — one unreadable file must not fail the export.

Then, after the existing `<Page>`, emit one `<ConsentPage>` per signed item across all treatments, in visit order.

Replace the inline consent block in `TreatmentItemBlock` (currently `build-pdf.tsx:181-189`) with a single `<Field label={l.consentSignedOn} value={...}>` line ending in `l.consentAnnexRef`.

- [ ] **Step 5: Typecheck**

Run: `npm exec nx typecheck api`
Expected: PASS.

- [ ] **Step 6: Verify by hand**

Sign two consents for one patient, one with a witness and one without, then export the record with treatments included. Confirm: the treatment history shows the one-line reference; each consent starts on its own sheet; a consent long enough to wrap shows `Página 1 de 2` then `Página 2 de 2` rather than continuing the record's numbering; the header and footer repeat on every sheet; signature blocks are never alone at the top of a page; and the physician's signature appears on both consents even though it was uploaded once.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/export
git commit -m "feat: render consents as annex pages in the record export"
```

---

## Verification

After Task 8, run the full gate before declaring the feature done:

```bash
npm exec nx test api
npm exec nx typecheck api
npm exec nx build web
npm exec nx lint api && npm exec nx lint web
```

Then walk the end-to-end path: configure clinic settings with a drawn physician signature → add consent sections to a treatment type → create a treatment with that type → sign its consent with a witness → export the patient record → open the PDF and check the annex.
