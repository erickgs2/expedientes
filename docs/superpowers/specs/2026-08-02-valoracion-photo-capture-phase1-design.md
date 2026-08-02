# Valoración — Photo Capture, Phase 1: Capture + Per-Visit Gallery

Status: approved
Date: 2026-08-02

## Purpose

Let clinic staff capture reference photos during a Valoración visit directly from the device
camera, with a live oval framing guide for consistent face positioning across sessions, tag each
photo Before or After, and view the current visit's captured photos in a gallery. This is Phase 1
of 2 for the photo capture sub-project (see `2026-08-01-project-overview.md`); the patient-level
progressive timeline across all visits is Phase 2.

## Scope

In scope:
- Live camera capture (rear-facing by default) with an oval framing guide overlay
- Session-wide Before/After mode toggle: photos captured while a mode is active are tagged with
  that mode; switching the toggle re-tags subsequent captures, not past ones
- Retake/Use review step after each capture, before upload
- Multiple photos per capture session, continuous flow (capture → review → back to live view)
- A gallery of the current visit's photos, showing each photo's tag, with delete
- Camera only activates when the user opts in ("Add photos"), not on page load
- Read-only rendering (gallery visible, no capture/delete controls) for `valoracion:view`-only
  users
- Enhancing Foundation's shared file-serving route to render real JPEGs inline instead of forcing
  a download — the first module to need this, explicitly anticipated by that route's own code

Out of scope (Phase 2 / other modules):
- Patient-level progressive timeline across visits
- Any change to Treatments (not yet built)
- Deleting the underlying file from disk when a `Photo` row is deleted (the DB row is removed; the
  file is left in storage — simpler for a first version, revisit if storage growth ever matters)
- A camera-switcher UI (front/rear/external) — rear-facing only for now

## Architecture

**Camera capture:** `getUserMedia` with `facingMode: 'environment'`, rendered into a `<video>`
element with a CSS/SVG oval overlay (dimmed background, clear oval cutout, matching the "near
full-screen" framing-consistency requirement). A live overlay is why this can't be built on the
simpler native `<input type="file" capture>` picker — that picker gives no way to show a guide
before the shot is taken. The stream starts only when the user opts in and stops on close/unmount.

**Capture flow:** tap "Add photos" → live view with the oval guide and the Before/After toggle →
capture button freezes the current frame to a `<canvas>`, scaled down to a maximum dimension
(~1920px on the long edge, to keep upload sizes reasonable) → Retake/Use review step → "Use"
uploads the frame (as a JPEG blob) tagged with whichever mode the toggle currently shows, then
returns to the live view so another photo can be taken immediately.

**Component:** a new `PhotoCaptureComponent` (or similarly named, exact file structure decided in
the implementation plan), embedded in the Valoración detail page — same placement pattern as the
facial diagram tool.

## Data Model

A new table, denormalizing `patientId` directly (not only reachable via `valoracionId`) because
Phase 2's patient-level timeline needs to query a patient's photos across every visit without
joining through each one — the same reason `AuditLog` already denormalizes `patientId`:

```prisma
enum PhotoTag {
  BEFORE
  AFTER
}

model Photo {
  id           String     @id @default(uuid())
  patientId    String
  valoracionId String
  valoracion   Valoracion @relation(fields: [valoracionId], references: [id])
  tag          PhotoTag
  filePath     String
  createdAt    DateTime   @default(now())

  @@index([patientId])
  @@index([valoracionId])
}
```

## API

- **`POST /api/valoracion/[id]/photos`** (multipart body: the JPEG blob + a `tag` field;
  `valoracion:edit`) — validates the uploaded bytes are genuinely a JPEG by checking the real
  magic bytes (never trusts the client's declared content-type — the same discipline established
  during the facial diagram tool's security hardening), stores the file via Foundation's existing
  `saveFile()` under a new `photos` storage category, creates the `Photo` row, audit-logs.
- **`GET /api/valoracion/[id]/photos`** (`valoracion:view`) — lists this visit's photos.
- **`DELETE /api/valoracion/[id]/photos/[photoId]`** (`valoracion:edit`) — removes the `Photo`
  row (file left on disk, per the out-of-scope note above), audit-logs.
- **`GET /api/files/[...path]`** (existing route, `patients:view`, unchanged permission scheme) —
  gains one narrow addition: if the resolved file's actual bytes begin with the JPEG signature, it
  is served as `image/jpeg` with no forced download; every other file keeps today's locked-down
  `application/octet-stream` + `Content-Disposition: attachment` default. This is exactly the
  "later module adds per-file-type handling" this route's own comment already anticipated —
  nothing about its existing permission gating or path-resolution safety changes.

## UI / UX

- "Add photos" button opens the camera view; a close/cancel control stops the stream and returns
  to the gallery without needing to have captured anything.
- Before/After toggle sits alongside the live camera view, defaulting to Before at the start of
  each capture session.
- Capture → freeze-frame review (Retake / Use) → back to live view, repeatable for as many photos
  as needed in one session.
- Gallery: a grid of thumbnails below/alongside the capture control, each labeled with its
  Before/After tag, with a delete action (permission-gated) — behind a confirm, matching the
  diagram tool's "clear all" pattern for destructive actions.
- Entirely hidden capture controls (only the gallery renders) for `valoracion:view`-only users.

## Error Handling

Camera permission denial or no camera available: show an inline message in place of the live view
rather than a blocked/broken page — the rest of the Valoración detail page (form, diagram) stays
fully usable regardless. A failed upload surfaces via the existing global error-interceptor toast
and leaves the captured frame in the review step so the user can retry "Use" without re-capturing.

## Testing

The JPEG magic-byte check is genuinely pure logic (bytes in, boolean out) and gets a cheap unit
test, matching this project's established practice of testing exactly this shape of function (see
the facial diagram tool's `starPoints` and `findDisallowedDiagramType` tests). Everything else —
routes, the capture component, the gallery — follows this project's low-effort convention: no
dedicated tests, verified by building and manual testing (including a real camera on a real
device, since `getUserMedia` behavior can't be meaningfully exercised without one).
