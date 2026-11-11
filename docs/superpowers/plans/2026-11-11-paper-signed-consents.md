# Cartas de consentimiento firmadas en papel — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir imprimir cada carta de consentimiento sin firmas y registrar un escaneo firmado (varias cartas de la misma visita) como consentimiento `PAPER`, sin tocar la firma digital.

**Architecture:** `Consent` gana `signatureMethod` (`DIGITAL`/`PAPER`) y `scanId`; dos tablas nuevas (`ConsentScan`, `ConsentScanPage`). La lógica de snapshot de la firma digital se extrae a un helper puro compartido. La impresión en blanco reutiliza `ConsentPage` con `signatures={}`. El export incrusta cada escaneo una sola vez.

**Tech Stack:** Next.js 16 route handlers (`apps/api`), Prisma 5 + Postgres, `@react-pdf/renderer`, Angular 22 + Material + Transloco (`apps/web`), Jest, Nx. Gestor de paquetes: **npm** (`npm exec nx ...`).

**Spec:** `docs/superpowers/specs/2026-11-11-paper-signed-consents-design.md`

## Global Constraints

- Comandos siempre vía Nx con prefijo npm: `npm exec nx test api -- <patrón>`, `npm exec nx build web`. Nunca adivinar flags; ante duda, `--help`.
- Solo imágenes JPG/PNG verificadas por magic bytes (`isJpeg`/`isPng`), nunca por content-type. Sin PDF, sin dependencias nuevas.
- Los textos de consentimiento siempre en español (`CONSENT_LABELS.es`); chrome del export sigue el idioma pedido.
- `DIGITAL` ⇒ `patientSignatureImagePath` no nulo y `scanId` nulo; `PAPER` ⇒ `scanId` no nulo y `patientSignatureImagePath` nulo (CHECK en SQL).
- Permisos: imprimir = `treatments:view`; registrar escaneo = `treatments:edit`. Ambos escriben auditoría con `writeAuditLogSafe`.
- Los registros `Consent` existentes quedan `DIGITAL`; la migración no borra datos.
- Un consentimiento firmado (digital o papel) es inmutable y bloquea el ítem, igual que hoy.
- No hacer commits salvo que el usuario lo pida; los pasos "Commit" aplican solo cuando el usuario haya autorizado commitear (hoy la spec está sin commit a petición suya).
- UI en `es` y `en` (`apps/web/src/assets/i18n/{es,en}.json`).

## Review Focus

1. Un mismo `itemId` repetido en la solicitud de escaneo → debe rechazarse (Task 3, test).
2. `signedDate` inválida (`2026-02-30`, texto) o futura → 400 (Task 3, test).
3. Escaneo sin páginas, con >20 páginas, imagen <1 KB o >10 MB, o archivo que no es imagen (p. ej. PDF renombrado `.jpg`) → 400 (Task 3, test).
4. Páginas PNG deben verse en la UI: hoy `/api/files/*` solo sirve JPEG en línea; PNG se descargaría (Task 4, test del helper `inlineImageType`).
5. Borrar un paciente con cartas en papel no debe dejar filas ni archivos huérfanos (Task 4, código + verificación manual en Task 8).
6. Carta en blanco con testigo: debe llevar línea de testigo aunque no haya nombre (Task 5, test).
7. Pie de página de la carta en blanco no debe mostrar un separador vacío por la fecha ausente (Task 5, test).
8. Un escaneo que cubre 3 cartas se incrusta una sola vez en el export (Task 6, test).

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/<ts>_paper_signed_consents/migration.sql` | Modelo + CHECK |
| `libs/shared/types/src/lib/consent.ts` | Tipos compartidos (`signatureMethod`, `scanPages`) |
| `apps/api/src/lib/consent/consent-snapshot.ts` (+spec) | Helper puro: snapshot congelado de una carta |
| `apps/api/src/lib/consent/scan-validation.ts` (+spec) | Validación pura de páginas, fecha e ids |
| `apps/api/src/lib/treatment/consent-scan.ts` | `registerPaperConsents` (transacción + archivos) |
| `apps/api/src/app/api/treatments/[id]/consent-scan/route.ts` | POST registrar escaneo |
| `apps/api/src/lib/export/blank-consent-pdf.tsx` (+spec) | PDF de una carta en blanco |
| `apps/api/src/app/api/treatment-items/[id]/consent/print/route.ts` | GET imprimir sin firma |
| `apps/api/src/lib/export/group-paper-scans.ts` (+spec), `consent-scan-pdf.tsx` | Agrupar/pintar escaneos en el export |
| `apps/web/src/app/shared/pdf/deliver-pdf.util.ts` | `deliverPdf` compartido (extraído de `export.component.ts`) |
| `apps/web/src/app/treatments/consent-scan-dialog.component.ts` | Diálogo de registro de escaneo |

---

### Task 1: Modelo de datos, migración y tipos compartidos

**Files:**
- Modify: `prisma/schema.prisma` (modelo `Consent` ~línea 234; nuevos modelos)
- Create: `prisma/migrations/<timestamp>_paper_signed_consents/migration.sql` (generada)
- Modify: `libs/shared/types/src/lib/consent.ts`

**Interfaces:**
- Produces: enum Prisma `ConsentSignatureMethod { DIGITAL PAPER }`; `Consent.signatureMethod`, `Consent.scanId`, `Consent.patientSignatureImagePath: string | null`; modelos `ConsentScan { id, patientId, signedDate, createdAt, pages, consents }`, `ConsentScanPage { id, scanId, position, filePath }`.
- Produces (tipos): `Consent.signatureMethod: 'DIGITAL' | 'PAPER'`, `Consent.patientSignatureImagePath: string | null`, `Consent.scanPages: string[]` (rutas, vacío si DIGITAL).

- [ ] **Step 1: Editar el schema**

Reemplazar el modelo `Consent` por:

```prisma
enum ConsentSignatureMethod {
  DIGITAL
  PAPER
}

model Consent {
  id                        String                 @id @default(uuid())
  treatmentItemId           String                 @unique
  treatmentItem             TreatmentItem          @relation(fields: [treatmentItemId], references: [id])
  signatureMethod           ConsentSignatureMethod @default(DIGITAL)
  scanId                    String?
  scan                      ConsentScan?           @relation(fields: [scanId], references: [id])
  place                     String
  signedDateSnapshot        String
  patientNameSnapshot       String
  patientIdentification     String
  clinicNameSnapshot        String
  doctorTitleSnapshot       String
  doctorNameSnapshot        String
  doctorLicenseSnapshot     String
  declarationBeforeSnapshot String
  declarationAfterSnapshot  String
  sections                  Json
  patientSignatureImagePath String?
  witnessName               String?
  witnessSignatureImagePath String?
  signedAt                  DateTime               @default(now())

  @@index([scanId])
}

/// One scanned (photographed) set of pages that carries the handwritten signatures of one or more
/// consents signed the same day. `patientId` is a plain column, like TreatmentItemPhoto's.
model ConsentScan {
  id         String            @id @default(uuid())
  patientId  String
  signedDate String
  createdAt  DateTime          @default(now())
  pages      ConsentScanPage[]
  consents   Consent[]

  @@index([patientId])
}

model ConsentScanPage {
  id       String      @id @default(uuid())
  scanId   String
  scan     ConsentScan @relation(fields: [scanId], references: [id], onDelete: Cascade)
  position Int
  filePath String

  @@unique([scanId, position])
}
```

- [ ] **Step 2: Generar la migración sin aplicarla**

Run: `npx prisma migrate dev --name paper_signed_consents --create-only`
Expected: crea `prisma/migrations/<ts>_paper_signed_consents/migration.sql` con `CREATE TYPE "ConsentSignatureMethod"`, las dos tablas, `ALTER TABLE "Consent" ADD COLUMN "signatureMethod" ... DEFAULT 'DIGITAL'`, `ADD COLUMN "scanId"`, `ALTER COLUMN "patientSignatureImagePath" DROP NOT NULL`, índices y FKs. Verificar que **no** contiene `DROP COLUMN` ni `DELETE FROM` sobre `Consent`.

- [ ] **Step 3: Añadir el CHECK al final de la migración generada**

```sql
-- A consent is signed either digitally (signature image, no scan) or on paper (scan, no signature
-- image) — never both, never neither.
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_signature_method_check" CHECK (
  ("signatureMethod" = 'DIGITAL' AND "patientSignatureImagePath" IS NOT NULL AND "scanId" IS NULL)
  OR
  ("signatureMethod" = 'PAPER' AND "patientSignatureImagePath" IS NULL AND "scanId" IS NOT NULL)
);
```

- [ ] **Step 4: Aplicar y regenerar el cliente**

Run: `npx prisma migrate dev` y `npx prisma generate`
Expected: migración aplicada sin error; los `Consent` existentes cumplen el CHECK (todos `DIGITAL` con firma).

- [ ] **Step 5: Actualizar tipos compartidos**

En `libs/shared/types/src/lib/consent.ts`, dentro de `Consent`:

```ts
export type ConsentSignatureMethod = 'DIGITAL' | 'PAPER';

export interface Consent {
  id: string;
  signatureMethod: ConsentSignatureMethod;
  place: string;
  patientIdentification: string;
  witnessName: string | null;
  /** Null for a paper-signed consent — its signatures are on the scan pages instead. */
  patientSignatureImagePath: string | null;
  witnessSignatureImagePath: string | null;
  /** Stored paths of the scanned pages, in order. Empty for a digital consent. */
  scanPages: string[];
  signedDateSnapshot: string;
  signedAt: string;
}
```
(conservar los comentarios existentes de `signedDateSnapshot`).

- [ ] **Step 6: Typecheck para listar los consumidores rotos**

Run: `npm exec nx run-many -t build -p api web`
Expected: FALLA en los sitios que usan `patientSignatureImagePath` como `string` y en construcciones de `Consent` sin los campos nuevos (`treatment/consent.ts`, `consent/route.ts`, `gather-export-data.ts`, `build-pdf.tsx`, `consent-sign.component.ts`). Esa lista guía las Tasks 2, 4, 6 y 7; no corregir aquí.

---

### Task 2: Helper puro de snapshot (extraído de la firma digital)

**Files:**
- Create: `apps/api/src/lib/consent/consent-snapshot.ts`
- Test: `apps/api/src/lib/consent/consent-snapshot.spec.ts`
- Modify: `apps/api/src/lib/treatment/consent.ts` (`signTreatmentItemConsent`, `getTreatmentItemDetail`)

**Interfaces:**
- Produces:
```ts
export interface ConsentSnapshotSettings {
  clinicName: string; doctorTitle: string; doctorName: string; doctorLicense: string;
  declarationBefore: string; declarationAfter: string;
}
export interface ConsentSnapshotInput {
  settings: ConsentSnapshotSettings;
  patientName: string;
  patientIdentification: string;
  place: string;
  signedDate: string;            // YYYY-MM-DD
  witnessName: string | null;
  sections: ConsentSection[];
}
export function buildConsentSnapshot(input: ConsentSnapshotInput): Omit<
  Prisma.ConsentUncheckedCreateInput,
  'treatmentItemId' | 'signatureMethod' | 'scanId' | 'patientSignatureImagePath' | 'witnessSignatureImagePath'
>;
```

- [ ] **Step 1: Escribir el test que falla**

```ts
import { buildConsentSnapshot } from './consent-snapshot';

const settings = {
  clinicName: 'Clinica Demo',
  doctorTitle: 'DRA.',
  doctorName: 'MIROSLAVA GARCIA',
  doctorLicense: '11372415',
  declarationBefore: 'YO {{patientName}} AUTORIZO A {{doctorTitle}} {{doctorName}}.',
  declarationAfter: 'DECLARO HABER SIDO INFORMADO POR {{clinicName}}.',
};

const base = {
  settings,
  patientName: 'JUAN PEREZ',
  patientIdentification: 'INE 1234',
  place: 'Culiacan',
  signedDate: '2026-11-11',
  witnessName: null,
  sections: [{ key: 'description' as const, body: 'Toxina.' }],
};

describe('buildConsentSnapshot', () => {
  it('freezes the clinic, doctor, patient, place and date', () => {
    const s = buildConsentSnapshot(base);
    expect(s).toMatchObject({
      place: 'Culiacan',
      signedDateSnapshot: '2026-11-11',
      patientNameSnapshot: 'JUAN PEREZ',
      patientIdentification: 'INE 1234',
      clinicNameSnapshot: 'Clinica Demo',
      doctorTitleSnapshot: 'DRA.',
      doctorNameSnapshot: 'MIROSLAVA GARCIA',
      doctorLicenseSnapshot: '11372415',
      witnessName: null,
    });
  });

  it('interpolates the declarations at snapshot time', () => {
    const s = buildConsentSnapshot(base);
    expect(s.declarationBeforeSnapshot).toBe('YO JUAN PEREZ AUTORIZO A DRA. MIROSLAVA GARCIA.');
    expect(s.declarationAfterSnapshot).toBe('DECLARO HABER SIDO INFORMADO POR Clinica Demo.');
  });

  it('stores the sections as given', () => {
    expect(buildConsentSnapshot(base).sections).toEqual(base.sections);
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `npm exec nx test api -- consent-snapshot`
Expected: FAIL — `Cannot find module './consent-snapshot'`.

- [ ] **Step 3: Implementar**

```ts
import type { Prisma } from '@prisma/client';
import type { ConsentSection } from '@expedientes/shared-types';
import { interpolate } from './build-consent-document';

export interface ConsentSnapshotSettings {
  clinicName: string;
  doctorTitle: string;
  doctorName: string;
  doctorLicense: string;
  declarationBefore: string;
  declarationAfter: string;
}

export interface ConsentSnapshotInput {
  settings: ConsentSnapshotSettings;
  patientName: string;
  patientIdentification: string;
  place: string;
  /** Calendar date in `YYYY-MM-DD`. */
  signedDate: string;
  witnessName: string | null;
  sections: ConsentSection[];
}

/**
 * Every value that prints on a signed consent, frozen at signing time so later edits to the clinic
 * settings or the catalog never alter it. Shared by digital signing and paper-scan registration —
 * the two differ only in how the signature itself is evidenced, never in what the letter says.
 */
export function buildConsentSnapshot(input: ConsentSnapshotInput) {
  const { settings } = input;
  const values = {
    clinicName: settings.clinicName,
    doctorTitle: settings.doctorTitle,
    doctorName: settings.doctorName,
    doctorLicense: settings.doctorLicense,
    patientName: input.patientName,
  };
  return {
    place: input.place,
    signedDateSnapshot: input.signedDate,
    patientNameSnapshot: input.patientName,
    patientIdentification: input.patientIdentification,
    clinicNameSnapshot: settings.clinicName,
    doctorTitleSnapshot: settings.doctorTitle,
    doctorNameSnapshot: settings.doctorName,
    doctorLicenseSnapshot: settings.doctorLicense,
    declarationBeforeSnapshot: interpolate(settings.declarationBefore, values),
    declarationAfterSnapshot: interpolate(settings.declarationAfter, values),
    // `ConsentSection` is `{ key, body }` — plain JSON, safe to hand to a Json column.
    sections: input.sections as unknown as Prisma.InputJsonValue,
    witnessName: input.witnessName,
  } satisfies Omit<
    Prisma.ConsentUncheckedCreateInput,
    | 'treatmentItemId'
    | 'signatureMethod'
    | 'scanId'
    | 'patientSignatureImagePath'
    | 'witnessSignatureImagePath'
  >;
}
```

- [ ] **Step 4: Ver que pasa**

Run: `npm exec nx test api -- consent-snapshot`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor de `signTreatmentItemConsent` para usar el helper (sin cambio de comportamiento)**

En `apps/api/src/lib/treatment/consent.ts`, reemplazar el bloque `const values = {...}` y el `prisma.consent.create({ data: {...} })` por:

```ts
  const consent = await prisma.consent.create({
    data: {
      treatmentItemId,
      signatureMethod: 'DIGITAL',
      ...buildConsentSnapshot({
        settings,
        patientName,
        patientIdentification: input.patientIdentification,
        place: input.place,
        signedDate: localSigningDate(),
        witnessName: input.witnessName,
        sections: sectionsFromTreatmentType(item.treatmentType),
      }),
      patientSignatureImagePath,
      witnessSignatureImagePath,
    },
  });
```
Añadir `import { buildConsentSnapshot } from '../consent/consent-snapshot';`. Quitar el import de `interpolate` si queda sin uso y el `values`.

- [ ] **Step 6: Typecheck y suite**

Run: `npm exec nx test api`
Expected: PASS; `signTreatmentItemConsent` compila (el `Consent` devuelto sigue trayendo `patientSignatureImagePath`).

---

### Task 3: Validaciones puras del escaneo

**Files:**
- Create: `apps/api/src/lib/consent/scan-validation.ts`
- Test: `apps/api/src/lib/consent/scan-validation.spec.ts`

**Interfaces:**
- Produces:
```ts
export const MAX_SCAN_PAGES = 20;
export const MAX_SCAN_PAGE_BYTES = 10 * 1024 * 1024;
export const MIN_SCAN_PAGE_BYTES = 1024;
export type ScanPage = { buffer: Buffer; extension: 'jpg' | 'png' };
export function validateScanPages(buffers: Buffer[]): { ok: true; pages: ScanPage[] } | { ok: false; message: string };
export function validateSignedDate(value: string, today: string): string | null; // mensaje de error o null
export function validateScanItemIds(requested: string[], treatmentItemIds: string[], signedItemIds: string[]):
  | { ok: true } | { ok: false; code: 'INVALID_INPUT' | 'NOT_IN_TREATMENT' | 'ALREADY_SIGNED'; message: string };
```

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import {
  MAX_SCAN_PAGES,
  validateScanItemIds,
  validateScanPages,
  validateSignedDate,
} from './scan-validation';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2000)]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(2000),
]);

describe('validateScanPages', () => {
  it('accepts JPEG and PNG pages and reports the extension by the real bytes', () => {
    const r = validateScanPages([jpeg, png]);
    expect(r).toEqual({
      ok: true,
      pages: [
        { buffer: jpeg, extension: 'jpg' },
        { buffer: png, extension: 'png' },
      ],
    });
  });

  it('rejects no pages', () => {
    expect(validateScanPages([])).toMatchObject({ ok: false });
  });

  it('rejects more than MAX_SCAN_PAGES pages', () => {
    expect(validateScanPages(Array(MAX_SCAN_PAGES + 1).fill(jpeg))).toMatchObject({ ok: false });
  });

  it('rejects a PDF even when it is named like an image', () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(2000)]);
    expect(validateScanPages([pdf])).toMatchObject({ ok: false });
  });

  it('rejects a page that is too small or too large', () => {
    expect(validateScanPages([Buffer.from([0xff, 0xd8, 0xff])])).toMatchObject({ ok: false });
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(10 * 1024 * 1024)]);
    expect(validateScanPages([huge])).toMatchObject({ ok: false });
  });
});

describe('validateSignedDate', () => {
  it('accepts a real past or current date', () => {
    expect(validateSignedDate('2026-11-10', '2026-11-11')).toBeNull();
    expect(validateSignedDate('2026-11-11', '2026-11-11')).toBeNull();
  });

  it.each(['2026-02-30', '2026-13-01', '11/11/2026', '', 'hoy'])('rejects %s', (v) => {
    expect(validateSignedDate(v, '2026-11-11')).not.toBeNull();
  });

  it('rejects a future date', () => {
    expect(validateSignedDate('2026-11-12', '2026-11-11')).not.toBeNull();
  });
});

describe('validateScanItemIds', () => {
  it('accepts unsigned items of the treatment', () => {
    expect(validateScanItemIds(['a', 'b'], ['a', 'b', 'c'], [])).toEqual({ ok: true });
  });

  it('rejects an empty list', () => {
    expect(validateScanItemIds([], ['a'], [])).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('rejects a repeated id', () => {
    expect(validateScanItemIds(['a', 'a'], ['a'], [])).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
  });

  it('rejects an item that belongs to another treatment', () => {
    expect(validateScanItemIds(['x'], ['a'], [])).toMatchObject({
      ok: false,
      code: 'NOT_IN_TREATMENT',
    });
  });

  it('rejects an item that already has a signed consent', () => {
    expect(validateScanItemIds(['a'], ['a'], ['a'])).toMatchObject({
      ok: false,
      code: 'ALREADY_SIGNED',
    });
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `npm exec nx test api -- scan-validation`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
import { isJpeg, isPng } from '../storage/image-signature';

export const MAX_SCAN_PAGES = 20;
export const MAX_SCAN_PAGE_BYTES = 10 * 1024 * 1024;
export const MIN_SCAN_PAGE_BYTES = 1024;

export type ScanPage = { buffer: Buffer; extension: 'jpg' | 'png' };

/** The authoritative check: runs on bytes actually read, never on a client-declared type or size. */
export function validateScanPages(
  buffers: Buffer[]
): { ok: true; pages: ScanPage[] } | { ok: false; message: string } {
  if (buffers.length === 0) return { ok: false, message: 'At least one scan page is required' };
  if (buffers.length > MAX_SCAN_PAGES) {
    return { ok: false, message: `A scan can have at most ${MAX_SCAN_PAGES} pages` };
  }
  const pages: ScanPage[] = [];
  for (const buffer of buffers) {
    if (buffer.length < MIN_SCAN_PAGE_BYTES || buffer.length > MAX_SCAN_PAGE_BYTES) {
      return { ok: false, message: 'A scan page is too large or too small' };
    }
    if (isJpeg(buffer)) pages.push({ buffer, extension: 'jpg' });
    else if (isPng(buffer)) pages.push({ buffer, extension: 'png' });
    else return { ok: false, message: 'Every scan page must be a JPEG or PNG image' };
  }
  return { ok: true, pages };
}

/** `today` is the clinic-local `YYYY-MM-DD` (`localSigningDate()`); ISO dates compare as strings. */
export function validateSignedDate(value: string, today: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 'signedDate must be YYYY-MM-DD';
  const [, y, m, d] = match.map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
    return 'signedDate is not a real calendar date';
  }
  if (value > today) return 'signedDate cannot be in the future';
  return null;
}

export function validateScanItemIds(
  requested: string[],
  treatmentItemIds: string[],
  signedItemIds: string[]
):
  | { ok: true }
  | { ok: false; code: 'INVALID_INPUT' | 'NOT_IN_TREATMENT' | 'ALREADY_SIGNED'; message: string } {
  if (requested.length === 0) {
    return { ok: false, code: 'INVALID_INPUT', message: 'At least one consent is required' };
  }
  if (new Set(requested).size !== requested.length) {
    return { ok: false, code: 'INVALID_INPUT', message: 'itemIds must not repeat' };
  }
  const inTreatment = new Set(treatmentItemIds);
  if (requested.some((id) => !inTreatment.has(id))) {
    return {
      ok: false,
      code: 'NOT_IN_TREATMENT',
      message: 'Every consent must belong to this treatment visit',
    };
  }
  const signed = new Set(signedItemIds);
  if (requested.some((id) => signed.has(id))) {
    return { ok: false, code: 'ALREADY_SIGNED', message: 'A selected consent is already signed' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Ver que pasan**

Run: `npm exec nx test api -- scan-validation`
Expected: PASS.

---

### Task 4: Registro del escaneo (lib + ruta), borrado de paciente y servido de PNG

**Files:**
- Create: `apps/api/src/lib/treatment/consent-scan.ts`
- Create: `apps/api/src/app/api/treatments/[id]/consent-scan/route.ts`
- Modify: `apps/api/src/lib/patients/patient-delete.ts`
- Modify: `apps/api/src/lib/storage/image-signature.ts` (+ `image-signature.spec.ts`)
- Modify: `apps/api/src/app/api/files/[...path]/route.ts`

**Interfaces:**
- Consumes: `buildConsentSnapshot`, `sectionsFromTreatmentType`, `validateScanPages/SignedDate/ItemIds`, `saveFile`, `deleteStoredFile`, `localSigningDate`.
- Produces:
```ts
export type RegisterPaperResult =
  | 'NOT_FOUND' | 'NO_CLINIC_IDENTITY'
  | { error: 'NOT_IN_TREATMENT' | 'ALREADY_SIGNED' | 'INVALID_INPUT'; message: string }
  | { scanId: string; patientId: string; consentIds: string[] };
export async function registerPaperConsents(treatmentId: string, input: {
  itemIds: string[]; signedDate: string; place: string; patientIdentification: string;
  witnessName: string | null; pages: ScanPage[];
}): Promise<RegisterPaperResult>;
export function inlineImageType(buffer: Buffer): 'image/jpeg' | 'image/png' | null;
```

- [ ] **Step 1: Test del helper de servido en línea (falla)**

Añadir a `image-signature.spec.ts`:

```ts
import { inlineImageType } from './image-signature';

describe('inlineImageType', () => {
  it('identifies JPEG and PNG by magic bytes', () => {
    expect(inlineImageType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
    expect(
      inlineImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))
    ).toBe('image/png');
  });
  it('returns null for anything else (served as a forced download)', () => {
    expect(inlineImageType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
  });
});
```
Run: `npm exec nx test api -- image-signature` → FAIL (`inlineImageType` no existe).

- [ ] **Step 2: Implementar `inlineImageType` y usarlo en el servidor de archivos**

En `image-signature.ts` añadir al final:

```ts
/** The only content types `/api/files` will render inline; decided by bytes, never by path or name. */
export function inlineImageType(buffer: Buffer): 'image/jpeg' | 'image/png' | null {
  if (isJpeg(buffer)) return 'image/jpeg';
  if (isPng(buffer)) return 'image/png';
  return null;
}
```
En `files/[...path]/route.ts`: reemplazar `import { isJpeg }` por `import { inlineImageType }`, y el bloque `if (isJpeg(buffer)) {... 'Content-Type': 'image/jpeg' ...}` por:

```ts
    const imageType = inlineImageType(buffer);
    if (imageType) {
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': imageType,
          // ...mantener los mismos headers (nosniff, CSP sandbox, Content-Disposition: inline)
```
Actualizar el comentario ("a real JPEG or PNG"). Run `npm exec nx test api -- image-signature` → PASS.

- [ ] **Step 3: Implementar `registerPaperConsents`**

```ts
import { prisma } from '../prisma/client';
import { saveFile, deleteStoredFile } from '../storage/file-storage';
import { getClinicSettings, hasUsableDoctorIdentity } from '../clinic/clinic-settings';
import { buildConsentSnapshot } from '../consent/consent-snapshot';
import { validateScanItemIds, type ScanPage } from '../consent/scan-validation';
import { sectionsFromTreatmentType } from './consent';

export type RegisterPaperResult =
  | 'NOT_FOUND'
  | 'NO_CLINIC_IDENTITY'
  | { error: 'NOT_IN_TREATMENT' | 'ALREADY_SIGNED' | 'INVALID_INPUT'; message: string }
  | { scanId: string; patientId: string; consentIds: string[] };

export interface RegisterPaperInput {
  itemIds: string[];
  signedDate: string;
  place: string;
  patientIdentification: string;
  witnessName: string | null;
  pages: ScanPage[];
}

/**
 * Registers one scan as the signature evidence of several consents from the same visit. Pages are
 * stored first, then the scan and every `PAPER` consent are created in one transaction; if that
 * transaction fails the just-stored pages are removed so no orphan file outlives a failed request.
 * `Consent.treatmentItemId @unique` still arbitrates a concurrent double registration (P2002 → 409
 * in `withApiErrors`).
 */
export async function registerPaperConsents(
  treatmentId: string,
  input: RegisterPaperInput
): Promise<RegisterPaperResult> {
  const treatment = await prisma.treatment.findUnique({
    where: { id: treatmentId },
    include: { patient: true, items: { include: { treatmentType: true, consent: true } } },
  });
  if (!treatment) return 'NOT_FOUND';

  const settings = await getClinicSettings();
  if (!settings || !hasUsableDoctorIdentity(settings)) return 'NO_CLINIC_IDENTITY';

  const check = validateScanItemIds(
    input.itemIds,
    treatment.items.map((i) => i.id),
    treatment.items.filter((i) => i.consent).map((i) => i.id)
  );
  if (!check.ok) return { error: check.code, message: check.message };

  const patientId = treatment.patientId;
  const storedPaths: string[] = [];
  try {
    for (let i = 0; i < input.pages.length; i++) {
      const page = input.pages[i];
      storedPaths.push(await saveFile(page.buffer, 'consent-scans', patientId, `page-${i + 1}.${page.extension}`));
    }

    return await prisma.$transaction(async (tx) => {
      const scan = await tx.consentScan.create({
        data: {
          patientId,
          signedDate: input.signedDate,
          pages: { create: storedPaths.map((filePath, position) => ({ position, filePath })) },
        },
      });
      const consentIds: string[] = [];
      for (const itemId of input.itemIds) {
        const item = treatment.items.find((i) => i.id === itemId)!;
        const consent = await tx.consent.create({
          data: {
            treatmentItemId: itemId,
            signatureMethod: 'PAPER',
            scanId: scan.id,
            ...buildConsentSnapshot({
              settings,
              patientName: treatment.patient.fullName,
              patientIdentification: input.patientIdentification,
              place: input.place,
              signedDate: input.signedDate,
              witnessName: input.witnessName,
              sections: sectionsFromTreatmentType(item.treatmentType),
            }),
          },
        });
        consentIds.push(consent.id);
      }
      return { scanId: scan.id, patientId, consentIds };
    });
  } catch (error) {
    await Promise.all(
      storedPaths.map((path) =>
        deleteStoredFile(path).catch((e) => console.error('orphan scan page cleanup failed', path, e))
      )
    );
    throw error;
  }
}
```

- [ ] **Step 4: Implementar la ruta**

`apps/api/src/app/api/treatments/[id]/consent-scan/route.ts` (mismo estilo que `treatment-items/[id]/consent/route.ts`):

```ts
import { NextRequest, NextResponse } from 'next/server';
import { registerPaperConsents } from '../../../../../lib/treatment/consent-scan';
import { localSigningDate } from '../../../../../lib/consent/build-consent-document';
import {
  MAX_SCAN_PAGE_BYTES,
  MAX_SCAN_PAGES,
  validateScanPages,
  validateSignedDate,
} from '../../../../../lib/consent/scan-validation';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

const MAX_FIELD_LENGTH = 200;
const MAX_REQUEST_BYTES = MAX_SCAN_PAGE_BYTES * MAX_SCAN_PAGES;

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id } = await params;

    // Cheap early-out only; the authoritative size check runs on the buffers actually read.
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return apiError('INVALID_INPUT', 'Request is too large', 413);
    }

    const formData = await request.formData();
    const itemIds = formData.getAll('itemIds').filter((v): v is string => typeof v === 'string');
    const signedDate = text(formData, 'signedDate');
    const place = text(formData, 'place');
    const patientIdentification = text(formData, 'patientIdentification');
    const witnessName = text(formData, 'witnessName');

    const dateError = validateSignedDate(signedDate, localSigningDate());
    if (dateError) return apiError('INVALID_INPUT', dateError, 400);
    if (!place || place.length > MAX_FIELD_LENGTH) {
      return apiError('INVALID_INPUT', 'place is required and must be short', 400);
    }
    if (!patientIdentification || patientIdentification.length > MAX_FIELD_LENGTH) {
      return apiError('INVALID_INPUT', 'patientIdentification is required and must be short', 400);
    }
    if (witnessName.length > MAX_FIELD_LENGTH) {
      return apiError('INVALID_INPUT', 'witnessName is too long', 400);
    }

    const files = formData.getAll('pages').filter((v): v is File => v instanceof File);
    const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
    const validated = validateScanPages(buffers);
    if (!validated.ok) return apiError('INVALID_INPUT', validated.message, 400);

    const result = await registerPaperConsents(id, {
      itemIds,
      signedDate,
      place,
      patientIdentification,
      witnessName: witnessName || null,
      pages: validated.pages,
    });

    if (result === 'NOT_FOUND') return apiError('NOT_FOUND', 'Treatment not found', 404);
    if (result === 'NO_CLINIC_IDENTITY') {
      return apiError(
        'CONFLICT',
        'Clinic settings are incomplete: set the doctor name and licence number before registering consents',
        409
      );
    }
    if ('error' in result) {
      const status = result.error === 'INVALID_INPUT' ? 400 : result.error === 'ALREADY_SIGNED' ? 409 : 400;
      return apiError(result.error === 'ALREADY_SIGNED' ? 'CONFLICT' : 'INVALID_INPUT', result.message, status);
    }

    await writeAuditLogSafe({
      userId,
      action: 'create',
      entity: 'ConsentScan',
      entityId: result.scanId,
      patientId: result.patientId,
      metadata: { consentIds: result.consentIds, pages: validated.pages.length },
    });

    return NextResponse.json({ scanId: result.scanId, consentIds: result.consentIds }, { status: 201 });
  }
);
```

- [ ] **Step 5: Borrado de paciente — escaneos y archivos**

En `patient-delete.ts`, dentro de la transacción:
1. En el `Promise.all` de lectura añadir `tx.consentScanPage.findMany({ where: { scan: { patientId } }, select: { filePath: true } })` como `scanPages`.
2. Reemplazar `await tx.consent.deleteMany({ where: itemWhere });` por el mismo `deleteMany` seguido de `await tx.consentScan.deleteMany({ where: { patientId } });` (las páginas caen por `onDelete: Cascade`; el orden importa: consents primero porque referencian al scan).
3. Al armar el arreglo devuelto, añadir `...scanPages.map((p) => p.filePath)`, y cambiar `consents.flatMap(...)` — `patientSignatureImagePath` ahora es nullable; el `.filter((path): path is string => !!path)` final ya lo cubre.
4. Actualizar el docblock ("…and consent scans").

- [ ] **Step 6: Typecheck y suite**

Run: `npm exec nx test api` y `npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: tests PASS. Quedan errores de tipo solo en `getTreatmentItemDetail`, `consent/route.ts` (respuesta con `patientSignatureImagePath`), export y web — se resuelven en Tasks 6–7 (anotar la lista, no parchear aquí salvo `consent/route.ts`: añadir `signatureMethod: result.consent.signatureMethod` y `scanPages: []` en su JSON de respuesta para mantener el contrato `Consent`).

---

### Task 5: Imprimir carta sin firma

**Files:**
- Create: `apps/api/src/lib/export/blank-consent-pdf.tsx`
- Test: `apps/api/src/lib/export/blank-consent-pdf.spec.tsx`
- Modify: `apps/api/src/lib/export/consent-document-pdf.tsx` (pie de página)
- Create: `apps/api/src/app/api/treatment-items/[id]/consent/print/route.ts`

**Interfaces:**
- Consumes: `getTreatmentItemDetail(id).consentPreview/consent/canSign/patientId/treatmentTypeName`, `ConsentPage`, `CONSENT_LABELS.es`, `readStoredFile`, `getClinicSettings().clinicName/clinicLogoPath`.
- Produces:
```ts
export function withBlankWitness(blocks: ConsentBlock[]): ConsentBlock[];
export async function buildBlankConsentPdf(input: {
  blocks: ConsentBlock[]; clinicName: string; patientName: string; treatmentTypeName: string;
  logo?: Buffer; logoFormat?: 'png' | 'jpg';
}): Promise<Buffer>;
```

- [ ] **Step 1: Tests que fallan**

`blank-consent-pdf.spec.tsx` (con docblock `@jest-environment node` para que react-pdf corra):

```tsx
/** @jest-environment node */
import type { ConsentBlock } from '@expedientes/shared-types';
import { buildBlankConsentPdf, withBlankWitness } from './blank-consent-pdf';

const blocks: ConsentBlock[] = [
  { kind: 'title', text: 'CONSENTIMIENTO INFORMADO' },
  { kind: 'fieldLine', label: 'FECHA', value: '' },
  { kind: 'signatureBlock', role: 'patient', caption: 'PACIENTE' },
  { kind: 'signatureBlock', role: 'doctor', caption: 'MEDICO', subCaption: 'DRA. X CED 1' },
];

describe('withBlankWitness', () => {
  it('inserts a witness line between patient and doctor when none exists', () => {
    const roles = withBlankWitness(blocks)
      .filter((b) => b.kind === 'signatureBlock')
      .map((b) => (b as { role: string }).role);
    expect(roles).toEqual(['patient', 'witness', 'doctor']);
  });

  it('does not duplicate an existing witness line', () => {
    const once = withBlankWitness(blocks);
    expect(withBlankWitness(once)).toEqual(once);
  });
});

describe('buildBlankConsentPdf', () => {
  it('renders a PDF', async () => {
    const pdf = await buildBlankConsentPdf({
      blocks: withBlankWitness(blocks),
      clinicName: 'Clinica Demo',
      patientName: 'JUAN PEREZ',
      treatmentTypeName: 'Toxina',
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
```
Run: `npm exec nx test api -- blank-consent-pdf` → FAIL (módulo inexistente). Si `renderToBuffer` falla por el entorno de Jest (ESM de react-pdf), probar `transformIgnorePatterns` en `apps/api/jest.config.cts` o, como último recurso, dejar solo los tests de `withBlankWitness` y cubrir el PDF con la verificación manual de Task 8, anotándolo en el reporte.

- [ ] **Step 2: Implementar**

```tsx
import { Document, renderToBuffer } from '@react-pdf/renderer';
import type { ConsentBlock } from '@expedientes/shared-types';
import { ConsentPage } from './consent-document-pdf';
import { CONSENT_LABELS } from '../consent/consent-labels';

/**
 * A printed paper letter always has room for a witness: whether one is needed is decided at the
 * signing table, not at print time. Inserts the witness line before the physician's when absent.
 */
export function withBlankWitness(blocks: ConsentBlock[]): ConsentBlock[] {
  if (blocks.some((b) => b.kind === 'signatureBlock' && b.role === 'witness')) return blocks;
  const doctorAt = blocks.findIndex((b) => b.kind === 'signatureBlock' && b.role === 'doctor');
  const witness: ConsentBlock = {
    kind: 'signatureBlock',
    role: 'witness',
    caption: CONSENT_LABELS.es.signatures.witness,
  };
  if (doctorAt === -1) return [...blocks, witness];
  return [...blocks.slice(0, doctorAt), witness, ...blocks.slice(doctorAt)];
}

export interface BlankConsentInput {
  blocks: ConsentBlock[];
  clinicName: string;
  patientName: string;
  treatmentTypeName: string;
  logo?: Buffer;
  logoFormat?: 'png' | 'jpg';
}

/** One letter, no signature images anywhere — `ConsentPage` draws a ruled line where none is given. */
export async function buildBlankConsentPdf(input: BlankConsentInput): Promise<Buffer> {
  return renderToBuffer(
    <Document>
      <ConsentPage
        blocks={input.blocks}
        header={{
          clinicName: input.clinicName,
          logo: input.logo,
          logoFormat: input.logoFormat,
          title: CONSENT_LABELS.es.title,
          treatmentTypeName: input.treatmentTypeName,
        }}
        footer={{
          patientName: input.patientName,
          signedOn: '',
          pageLabel: (n, total) => `Página ${n} de ${total}`,
        }}
        signatures={{}}
      />
    </Document>
  );
}
```

- [ ] **Step 3: Pie sin separador vacío (test + cambio)**

Extraer en `consent-document-pdf.tsx` y exportar:

```tsx
export function consentFooterText(footer: ConsentPageFooter, n: number, total: number): string {
  return [footer.patientName, footer.signedOn, footer.pageLabel(n, total)]
    .filter((part) => part)
    .join(' — ');
}
```
y usarlo en el `render` del `<Text style={styles.footer}>`: `render={({ subPageNumber, subPageTotalPages }) => consentFooterText(footer, subPageNumber, subPageTotalPages)}`. Añadir a `blank-consent-pdf.spec.tsx`:

```tsx
import { consentFooterText } from './consent-document-pdf';
it('omits the date segment when the letter is unsigned', () => {
  const footer = { patientName: 'ANA', signedOn: '', pageLabel: (n: number, t: number) => `P ${n}/${t}` };
  expect(consentFooterText(footer, 1, 2)).toBe('ANA — P 1/2');
});
it('keeps the date segment for a signed letter (unchanged behaviour)', () => {
  const footer = { patientName: 'ANA', signedOn: '2026-11-11', pageLabel: (n: number, t: number) => `P ${n}/${t}` };
  expect(consentFooterText(footer, 1, 2)).toBe('ANA — 2026-11-11 — P 1/2');
});
```
Run: `npm exec nx test api -- blank-consent-pdf` → PASS.

- [ ] **Step 4: Ruta de impresión**

`apps/api/src/app/api/treatment-items/[id]/consent/print/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getTreatmentItemDetail } from '../../../../../../lib/treatment/consent';
import { getClinicSettings } from '../../../../../../lib/clinic/clinic-settings';
import { buildBlankConsentPdf, withBlankWitness } from '../../../../../../lib/export/blank-consent-pdf';
import { CONSENT_LABELS } from '../../../../../../lib/consent/consent-labels';
import { readStoredFile } from '../../../../../../lib/storage/file-storage';
import { isPng } from '../../../../../../lib/storage/image-signature';
import { writeAuditLogSafe } from '../../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../../lib/http/require-auth';
import { apiError } from '../../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../../lib/http/with-api-errors';

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'view');
    const { id } = await params;

    const item = await getTreatmentItemDetail(id);
    if (!item) return apiError('NOT_FOUND', 'Treatment item not found', 404);
    if (item.consent) {
      return apiError('CONFLICT', 'This treatment item already has a signed consent', 409);
    }
    if (!item.consentPreview) {
      return apiError(
        'CONFLICT',
        'Clinic settings are incomplete: set the doctor name and licence number before printing consents',
        409
      );
    }

    const settings = await getClinicSettings();
    let logo: Buffer | undefined;
    if (settings?.clinicLogoPath) {
      try {
        logo = await readStoredFile(settings.clinicLogoPath);
      } catch (error) {
        console.error('Failed to read the clinic logo', error);
      }
    }

    // The preview carries today's date; the paper copy's date is written by hand, so blank it.
    const blocks = withBlankWitness(
      item.consentPreview.map((b) =>
        b.kind === 'fieldLine' && b.label === CONSENT_LABELS.es.date ? { ...b, value: '' } : b
      )
    );

    const pdf = await buildBlankConsentPdf({
      blocks,
      clinicName: settings?.clinicName ?? '',
      patientName: item.patientName,
      treatmentTypeName: item.treatmentTypeName,
      logo,
      logoFormat: logo && isPng(logo) ? 'png' : 'jpg',
    });

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'ConsentPrint',
      entityId: item.id,
      patientId: item.patientId,
    });

    const safeName = item.treatmentTypeName.replace(/[^a-zA-Z0-9]+/g, '-') || 'consentimiento';
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="consentimiento-${safeName}.pdf"`,
      },
    });
  }
);
```
`item.patientName` lo añade `getTreatmentItemDetail` en el Step 1 de la Task 6; hasta entonces esta ruta no compila, así que implementar ese campo (y el tipo `TreatmentItemDetail.patientName`) junto con este paso.

- [ ] **Step 5: Verificar**

Run: `npm exec nx test api` y `npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: PASS; sin errores nuevos en estos archivos.

---

### Task 6: Detalle del ítem y exportación con escaneos

**Files:**
- Modify: `apps/api/src/lib/treatment/consent.ts` (`getTreatmentItemDetail`: `patientName`, `consent.signatureMethod`, `consent.scanPages`)
- Modify: `libs/shared/types/src/lib/consent.ts` (`TreatmentItemDetail.patientName`)
- Modify: `apps/api/src/lib/export/gather-export-data.ts`
- Create: `apps/api/src/lib/export/group-paper-scans.ts`, `group-paper-scans.spec.ts`
- Create: `apps/api/src/lib/export/consent-scan-pdf.tsx`
- Modify: `apps/api/src/lib/export/build-pdf.tsx`, `pdf-labels.ts`

**Interfaces:**
- Produces (`gather-export-data.ts`): `ExportTreatmentItem.consent` pasa a
```ts
{ blocks: ConsentBlock[]; signedDate: string; method: 'DIGITAL' | 'PAPER';
  patientSignatureImagePath: string | null; witnessSignatureImagePath: string | null;
  scanId: string | null; scanPagePaths: string[] } | null
```
- Produces (`group-paper-scans.ts`):
```ts
export interface PaperScanGroup { scanId: string; signedDate: string; treatmentTypeNames: string[]; pagePaths: string[] }
export function groupPaperScans(consents: ExportConsent[]): Map<string, PaperScanGroup>;
```
- Produces (`pdf-labels.ts`): `treatments.consentScan: { title: string; covers: string; signedOn: string; pageOf: string }`.

- [ ] **Step 1: Detalle del ítem**

En `getTreatmentItemDetail`: cargar `consent: { include: { scan: { include: { pages: { orderBy: { position: 'asc' } } } } } }`; en el objeto `consent` devuelto añadir `signatureMethod: item.consent.signatureMethod` y `scanPages: item.consent.scan?.pages.map((p) => p.filePath) ?? []`; añadir `patientName: patient.fullName` al nivel raíz. Reflejar `patientName: string` en `TreatmentItemDetail`. En `consent/route.ts` (respuesta de firma digital) el `scanPages: []` ya añadido en Task 4.

- [ ] **Step 2: Test de agrupación (falla)**

`group-paper-scans.spec.ts`:

```ts
import { groupPaperScans } from './group-paper-scans';
import type { ExportConsent } from './gather-export-data';

const consent = (over: Partial<ExportConsent['consent']>, id: string, name: string): ExportConsent => ({
  treatmentItemId: id,
  treatmentTypeName: name,
  consent: {
    blocks: [],
    signedDate: '2026-11-11',
    method: 'PAPER',
    patientSignatureImagePath: null,
    witnessSignatureImagePath: null,
    scanId: 's1',
    scanPagePaths: ['p1.jpg', 'p2.jpg'],
    ...over,
  },
});

describe('groupPaperScans', () => {
  it('lists one group per scan with every letter it covers', () => {
    const groups = groupPaperScans([consent({}, 'a', 'Toxina'), consent({}, 'b', 'Relleno')]);
    expect(groups.size).toBe(1);
    expect(groups.get('s1')).toEqual({
      scanId: 's1',
      signedDate: '2026-11-11',
      treatmentTypeNames: ['Toxina', 'Relleno'],
      pagePaths: ['p1.jpg', 'p2.jpg'],
    });
  });

  it('ignores digital consents', () => {
    const digital = consent({ method: 'DIGITAL', scanId: null, scanPagePaths: [] }, 'c', 'Peeling');
    expect(groupPaperScans([digital]).size).toBe(0);
  });
});
```
Run: `npm exec nx test api -- group-paper-scans` → FAIL.

- [ ] **Step 3: Implementar la agrupación**

```ts
import type { ExportConsent } from './gather-export-data';

export interface PaperScanGroup {
  scanId: string;
  signedDate: string;
  treatmentTypeNames: string[];
  pagePaths: string[];
}

/** One entry per distinct scan, so a scan covering several letters is printed once, not per letter. */
export function groupPaperScans(consents: ExportConsent[]): Map<string, PaperScanGroup> {
  const groups = new Map<string, PaperScanGroup>();
  for (const { treatmentTypeName, consent } of consents) {
    if (consent.method !== 'PAPER' || !consent.scanId) continue;
    const group = groups.get(consent.scanId);
    if (group) group.treatmentTypeNames.push(treatmentTypeName);
    else {
      groups.set(consent.scanId, {
        scanId: consent.scanId,
        signedDate: consent.signedDate,
        treatmentTypeNames: [treatmentTypeName],
        pagePaths: consent.scanPagePaths,
      });
    }
  }
  return groups;
}
```
Run → PASS (tras el Step 4, que define el tipo).

- [ ] **Step 4: `gather-export-data.ts`**

Ampliar el tipo `ExportTreatmentItem.consent` como en **Interfaces** y poblarlo en `gatherTreatments` desde `detail.consent`: `method: detail.consent.signatureMethod`, `patientSignatureImagePath`, `witnessSignatureImagePath`, `scanId: detail.consent.scanId`… (añadir `scanId` al objeto `consent` de `getTreatmentItemDetail`), `scanPagePaths: detail.consent.scanPages`.

- [ ] **Step 5: Etiquetas del export**

En `pdf-labels.ts` añadir a `PdfLabels.treatments`: `consentScan: { title: string; covers: string; signedOn: string; pageOf: string }` y valores:
- es: `{ title: 'Consentimiento firmado en papel', covers: 'Cartas que ampara', signedOn: 'Firmado el', pageOf: 'Página {{n}} de {{total}}' }`
- en: `{ title: 'Consent signed on paper', covers: 'Letters covered', signedOn: 'Signed on', pageOf: 'Page {{n}} of {{total}}' }`

- [ ] **Step 6: Páginas de escaneo**

`consent-scan-pdf.tsx`:

```tsx
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica' },
  heading: { fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  meta: { fontSize: 9, color: '#555555', marginBottom: 8 },
  image: { width: '100%', objectFit: 'contain' },
});

export interface ConsentScanPagesProps {
  title: string;
  coversLabel: string;
  signedOnLabel: string;
  signedDate: string;
  treatmentTypeNames: string[];
  /** Already-read page images, in order; an unreadable page is simply absent. */
  images: Array<{ data: Buffer; format: 'jpg' | 'png' }>;
}

/** One A4 sheet per scanned page; the first carries the title and the letters the scan covers. */
export function ConsentScanPages(props: ConsentScanPagesProps) {
  return (
    <>
      {props.images.map((img, i) => (
        <Page key={i} size="A4" style={styles.page}>
          {i === 0 ? (
            <View>
              <Text style={styles.heading}>{props.title}</Text>
              <Text style={styles.meta}>
                {props.signedOnLabel} {props.signedDate} — {props.coversLabel}:{' '}
                {props.treatmentTypeNames.join(', ')}
              </Text>
            </View>
          ) : null}
          <Image style={styles.image} src={{ data: img.data, format: img.format }} />
        </Page>
      ))}
    </>
  );
}
```

- [ ] **Step 7: `build-pdf.tsx`**

1. En el bucle de lectura de firmas, saltar las `PAPER`: `if (entry.consent.method !== 'DIGITAL' || !entry.consent.patientSignatureImagePath) continue;` (y usar `patientSignatureImagePath` ya no nulo).
2. Antes de `consentPages`: `const paperGroups = groupPaperScans(data.consents ?? []);` y leer cada grupo una vez en un `Map<scanId, Array<{data, format}>>` con `try/catch` por página (`isPng(buf) ? 'png' : 'jpg'`), igual que las firmas.
3. Convertir `consentPages` en recorrido en orden original: para `DIGITAL` → `<ConsentPage …/>` como hoy; para `PAPER` → si `scanId` aún no emitido (`Set<string>`), emitir `<ConsentScanPages key={…} {...labels.treatments.consentScan} … />` con el grupo; si ya emitido, nada.
4. `annexIncluded={consentPages.length > 0}` sigue válido (el arreglo sigue siendo no vacío si hay cartas).

- [ ] **Step 8: Verificar**

Run: `npm exec nx test api` y `npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: PASS; el API compila completo (todos los consumidores de `Consent` resueltos).

---

### Task 7: Web — imprimir, registrar escaneo y ver carta en papel

**Files:**
- Create: `apps/web/src/app/shared/pdf/deliver-pdf.util.ts`
- Modify: `apps/web/src/app/export/export.component.ts` (usar la util; borrar `isDesktopBrowser`/`deliverPdf` privados)
- Modify: `apps/web/src/app/treatments/consent.service.ts`
- Create: `apps/web/src/app/treatments/consent-scan-dialog.component.ts`
- Modify: `apps/web/src/app/treatments/treatment-detail.component.ts`
- Modify: `apps/web/src/app/treatments/consent-sign.component.ts`
- Modify: `apps/web/src/assets/i18n/es.json`, `en.json`

**Interfaces:**
- Produces: `export async function deliverPdf(blob: Blob, fileName: string): Promise<void>` (mismo comportamiento que el método actual, recibiendo el nombre de archivo ya armado).
- Produces (`ConsentService`): `printBlank(itemId: string): Promise<Blob>` (`GET /api/treatment-items/${id}/consent/print`, `responseType: 'blob'`) y
  `registerScan(treatmentId: string, input: { itemIds: string[]; signedDate: string; place: string; patientIdentification: string; witnessName: string | null; pages: File[] }): Promise<{ scanId: string; consentIds: string[] }>` (multipart a `/api/treatments/${id}/consent-scan`, campos `itemIds` repetido y `pages` repetido).

- [ ] **Step 1: Extraer `deliverPdf`**

Mover el cuerpo de `isDesktopBrowser()` y `deliverPdf()` de `export.component.ts` (incluidos sus comentarios) a `deliver-pdf.util.ts` como funciones exportadas; en el componente, `await deliverPdf(blob, fileName)` calculando `fileName` con la misma fórmula (`<paciente>-<fecha>.pdf`). Run `npm exec nx build web` → compila; comportamiento de exportación sin cambios.

- [ ] **Step 2: `ConsentService`**

Agregar `printBlank` y `registerScan` como en **Interfaces** (usando `HttpClient`/`firstValueFrom`, igual que `sign`).

- [ ] **Step 3: Diálogo de escaneo**

`consent-scan-dialog.component.ts` — componente standalone con `MatDialog` data `{ treatmentId, pending: { itemId: string; name: string }[], defaultPlace: string, patientDocumentId: string }`. Formulario reactivo: lista de `mat-checkbox` (todas marcadas), `signedDate` (`input type="date"`, valor inicial = hoy local, `max` = hoy), `place`, `patientIdentification`, `witnessName` opcional, y `<input type="file" accept="image/jpeg,image/png" multiple capture="environment">` con la lista de archivos elegidos en orden y botón quitar. Botón "Registrar" deshabilitado si: ninguna carta marcada, sin archivos, formulario inválido o `saving()`. Al enviar llama `consentService.registerScan(...)`; en éxito `dialogRef.close(markedItemIds)`; en error muestra `treatments.scanRegisterFailed` en un `<p role="alert">`.

- [ ] **Step 4: `treatment-detail.component.ts`**

- Para cada ítem sin consentimiento con `item.itemId`: junto a "Firmar consentimiento" añadir enlace/botón `item-action` "Imprimir sin firma" (icono `print`) que llama `printBlank(item.itemId)` y `deliverPdf(blob, 'consentimiento-<nombre>.pdf')`; deshabilitar mientras imprime; error → mensaje `treatments.printBlankFailed`.
- Bajo la lista de ítems, si `canEdit` y existe al menos un ítem pendiente: botón "Registrar escaneo firmado" (icono `document_scanner`) que abre el diálogo con los pendientes; al cerrar con ids, marcar `hasConsent: true` en esos ítems del signal `items`.
- Para obtener `defaultPlace`/`patientDocumentId`, llamar `consentService.getItem(primerPendiente.itemId)` justo antes de abrir el diálogo.

- [ ] **Step 5: `consent-sign.component.ts`**

- En la rama "no firmada y `canSign` y `canEdit`" (y en la de solo lectura con preview), añadir botón "Imprimir sin firma" (misma llamada) al lado de los botones de firma.
- `signatureUrls()`: devolver `{}` si `consent.signatureMethod === 'PAPER'`; si es `DIGITAL`, `patientSignatureImagePath` es no nulo (guard `if (consent.patientSignatureImagePath)`).
- En la rama firmada: si `signedConsent().signatureMethod === 'PAPER'`, mostrar bajo el documento un bloque "Firmada en papel — escaneo" con `@for (p of consent.scanPages) { <img [src]="'/api/files/' + p" [alt]="'treatments.scanPageAlt' | transloco"> }`, y no usar las líneas de firma digital.

- [ ] **Step 6: i18n**

Añadir en `treatments` (es / en):
- `printBlank`: "Imprimir sin firma" / "Print unsigned"
- `printBlankFailed`: "No se pudo generar la carta para imprimir." / "The letter could not be generated."
- `registerScan`: "Registrar escaneo firmado" / "Register signed scan"
- `scanDialogTitle`: "Registrar escaneo firmado" / "Register signed scan"
- `scanCovers`: "Cartas que cubre este escaneo" / "Letters covered by this scan"
- `scanSignedDate`: "Fecha de firma" / "Signing date"
- `scanPages`: "Páginas escaneadas (JPG o PNG)" / "Scanned pages (JPG or PNG)"
- `scanRegisterFailed`: "No se pudo registrar el escaneo." / "The scan could not be registered."
- `scanSignedOnPaper`: "Firmada en papel" / "Signed on paper"
- `scanPageAlt`: "Página del escaneo firmado" / "Signed scan page"
- `scanRegister`: "Registrar" / "Register"

- [ ] **Step 7: Verificar**

Run: `npm exec nx build web` y `npm exec nx lint web`
Expected: sin errores. (El proyecto web solo tiene specs de diagrama; la UI se verifica manualmente en Task 8.)

---

### Task 8: Verificación integral

**Files:** ninguno nuevo.

- [ ] **Step 1: Suite y builds**

Run: `npm exec nx run-many -t test lint build -p api web`
Expected: todo en verde. Si alguno falla, arreglar en la task dueña, no aquí.

- [ ] **Step 2: Prueba manual en la app (DB de desarrollo, migración aplicada)**

Seguir el skill `run` para levantar la app. Con un paciente de prueba con una visita de 2–3 tratamientos con carta pendiente y datos de clínica completos:
1. "Imprimir sin firma" en un ítem → PDF de una carta: fecha vacía, tres líneas en blanco (paciente, testigo, médico), pie sin separador doble.
2. Firmar digitalmente otro ítem → sigue funcionando igual (regresión).
3. "Registrar escaneo firmado" con 2 pendientes y 2 imágenes (una JPG, una PNG) → ambos ítems pasan a "Firmado"; abrir la carta → se ven las 2 páginas (también la PNG).
4. Reintentar el registro con una de ellas → error de conflicto; con un PDF renombrado `.jpg` → error de validación; con fecha futura → rechazada.
5. Exportar expediente con "Consentimientos" marcado → el anexo trae la carta digital y el escaneo **una sola vez**, con el título y las dos cartas listadas.
6. Borrar un paciente de prueba que tenga cartas en papel → sin error y, en `storage/`, no quedan `consent-scans/<patientId>/`.

- [ ] **Step 3: Reporte**

Informar resultados de cada punto, cualquier prueba PDF que haya tenido que degradarse (Task 5 Step 1) y el riesgo aceptado (el snapshot se toma al registrar, no al imprimir). No commitear salvo autorización del usuario.
