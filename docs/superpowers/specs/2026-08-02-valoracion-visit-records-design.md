# Valoración — Visit Records — Design Spec

Status: approved
Date: 2026-08-02
Depends on: `2026-08-01-project-overview.md`, `2026-08-01-foundation-design.md`,
`2026-08-01-historia-clinica-design.md` (Foundation and Historia Clínica are complete)

## Purpose

The first of three sub-projects that together make up Valoración (facial assessment). This one
builds the container: a per-visit record that later sub-projects (facial diagram drawing tool,
photo capture) attach their content to. Unlike Historia Clínica's single evolving record, a
patient can have many Valoración visits over time — one per assessment.

## Product decisions (settled during brainstorming)

- **No structured clinical fields.** The original brief's "admin-configurable structured fields
  (skin type, symmetry, notable zones)" were only examples, not a firm requirement — the user
  confirmed the facial diagram (built in the next sub-project) covers this entirely via freehand
  drawing and pinned text/handwritten notes. This sub-project ships **no fields beyond a date and
  one general free-text notes box** — there is nothing else to build here.
- **One record per visit**, not a single evolving record. Matches the earlier decision (recorded
  in Historia Clínica's design) that "qué quiere/qué necesita el paciente" gets refined per-visit
  inside Valoración — that only makes sense if each visit is its own record. It also matches the
  diagram tool's planned "previous visits as reference/watermark layers" feature, which requires
  multiple past visits to exist.
- **Navigation:** patient selection keeps auto-navigating to Historia Clínica (unchanged from
  today). Historia Clínica gets a small link to reach this patient's Valoración list. A proper
  patient-workspace tab bar is deferred until more clinical modules exist and the current
  approach starts to strain — noted as a known future revisit, not a problem to solve now.
- **List + detail page, not a dialog.** Unlike Foundation's admin screens (list + edit dialog),
  Valoración's detail is a full page. This sub-project's detail page only holds two fields, but
  the next two sub-projects will add a diagram canvas and a photo gallery to that same page —
  screen space a dialog can't provide.
- **"New visit" creates immediately**, rather than opening an empty form first. Given how little
  there is to fill in before a diagram/photos exist, clicking "Nueva valoración" creates a record
  (today's date, empty notes) right away and navigates into its detail page.

## Architecture

### Data model (Prisma)

```prisma
model Valoracion {
  id        String   @id @default(uuid())
  patientId String
  patient   Patient  @relation(fields: [patientId], references: [id])

  fecha DateTime @default(now())
  notas String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([patientId])
}
```

`patientId` has no `@unique` (unlike `HistoriaClinica`) — this is the one-to-many relationship.
Add the reverse relation `valoraciones Valoracion[]` on `Patient`.

### Backend (`apps/api`)

- `apps/api/src/lib/valoracion/valoracion.ts` — service functions: `listValoraciones(patientId)`
  (ordered `fecha` descending), `createValoracion(patientId)` (no input needed — always starts
  with today's date and empty notes, matching the "create immediately" decision),
  `getValoracion(id)`, `updateValoracion(id, data)`.
- Routes:
  - `GET /api/patients/:patientId/valoracion` — `valoracion:view`. Lists this patient's visits.
  - `POST /api/patients/:patientId/valoracion` — `valoracion:create`. Creates and returns a new
    visit immediately.
  - `GET /api/valoracion/:id` — `valoracion:view`. Fetches one visit (not nested under patientId,
    since the detail page is reached by visit id directly, matching the list's row links).
  - `PATCH /api/valoracion/:id` — `valoracion:edit`. Updates `fecha`/`notas`.
- Audit log: `view` on list/get, `create` on POST, `update` on PATCH — same shape as every other
  module. Uses the existing `withApiErrors` wrapper.

### Frontend (`apps/web`)

- `apps/web/src/app/valoracion/valoracion.service.ts` — `list(patientId)`, `create(patientId)`,
  `get(id)`, `update(id, data)`.
- `apps/web/src/app/valoracion/valoracion-list.component.ts` — route `/valoracion`, guarded by
  `authGuard` + `activePatientGuard` (+ a `permissionGuard('valoracion', 'view')`, matching
  Historia Clínica's post-review fix). Lists the active patient's visits (date, notes preview,
  newest first) with a "Nueva valoración" button that calls `create()` then
  `router.navigate(['/valoracion', newId])`.
- `apps/web/src/app/valoracion/valoracion-detail.component.ts` — route `/valoracion/:id`, same
  guards. Loads the visit, shows date + notes, saves via `update()`. Gate the save action with
  `*appHasPermission="'valoracion:edit'"`, matching Historia Clínica's post-review fix.
- `apps/web/src/app/historia-clinica/historia-clinica-form.component.ts` gets one small addition:
  a link/button to `/valoracion` for the active patient.
- i18n: new Transloco keys under `valoracion.*` in both `es.json`/`en.json`, following the
  established pattern — no hardcoded strings.

### Error handling & Testing

Nothing new — same `withApiErrors`/`errorInterceptor` pattern, same low-effort-testing approach
(no new unit tests; manual verification against the real dev servers and database) established in
Foundation and continued in Historia Clínica.
