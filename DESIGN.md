---
name: MedCloud
description: A facial-mapping chart for clinical records: pearl plate, graphite ink, one rose mark.
colors:
  primary: "#af0641"
  on-primary: "#ffffff"
  primary-dark: "#ffacb6"
  surface: "#faf9f7"
  surface-container-low: "#f4f4f1"
  on-surface: "#1c1c19"
  on-surface-variant: "#42474e"
  ink-blue: "#36485f"
  error: "#b3030c"
typography:
  display:
    fontFamily: "Hanken Grotesk, Helvetica Neue, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Hanken Grotesk, Helvetica Neue, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Hanken Grotesk, Helvetica Neue, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  stat:
    fontFamily: "Hanken Grotesk, Helvetica Neue, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
rounded:
  plate: "10px"
  large: "14px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  shortcut-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.plate}"
    padding: "12px 16px"
    height: "56px"
  patient-banner:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface-variant}"
    padding: "6px 16px"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
---

# Design System: MedCloud

## Overview

**Creative North Star: "The Facial Map"**

The interface is a printed anatomical chart for an aesthetic-medicine practice: a pearl-ivory plate, graphite-blue ink, and a single rose mark, the dot a practitioner places on a face map. Position, selection and action are the only things that earn the mark. Everything else is ink on paper, separated by one hairline.

Navigation and controls stay standard Material 3 components; the world supplies type (Hanken Grotesk, tabular numerals), palette, density, and one signature move: the rose dot. The logo is a lotus rising from a cloud, topped by that same dot, and a small rose dot marks the active page and the hovered shortcut.

**Key Characteristics:**
- Flat paper surfaces with 1px ink hairlines instead of shadows.
- One rose mark for position, selection and action; no second accent.
- 10px corners everywhere on plates; 56px minimum shortcut rows for tablet touch.
- Tabular figures for dates, counts and lot numbers.

## Colors

Pearl neutrals, graphite-blue ink, one deep raspberry-rose. Light and dark both come from the generated M3 palette in `_theme-colors.scss`.

### Primary
- **Mark Rose** (#af0641): primary buttons, links, focus outline, the registration dot. Dark theme uses **Soft Mark** (#ffacb6).

### Neutral
- **Pearl Plate** (#faf9f7): page surface.
- **Proof Grey** (#f4f4f1): banner and hovered rows (`surface-container-low`).
- **Graphite Ink** (#1c1c19): body text.
- **Chart Blue** (#42474e): secondary text and metadata. **Ink Blue** (#36485f) is the secondary hue, used sparingly for non-action emphasis.

### Semantic
- **Alert Red** (#b3030c): errors and destructive actions.

### Named Rules
**The One Mark Rule.** Rose appears only where something is positioned, selected or actionable.
**The Hairline Rule.** Containers are separated by `--plate-line` (14% ink), never by shadow or tint alone.

## Typography

**Font:** Hanken Grotesk (400, 500, 600, 700) with Helvetica Neue, sans-serif. One family; hierarchy comes from weight and size.

### Hierarchy
- **Display** (700, 1.875rem, 1.25, -0.015em): page titles.
- **Title** (600, 1.25rem, 1.3): sections.
- **Body** (400, 0.875rem, 1.5): forms and content.
- **Stat** (600, 1.75rem, tabular numerals): summary counts.

### Named Rules
**The Tabular Rule.** Numbers that line up (counts, dates, lots) use tabular figures.

## Layout

Single column inside a 1120px page with an active-patient banner under a sticky header. Shortcut grids use `repeat(auto-fit, minmax(188px, 1fr))` with 12px gaps; summary widgets share the same tracks so each count sits above its shortcut. Rhythm is 8/12/16/24px.

## Elevation & Depth

Flat. Depth is a 1px hairline and a one-step tonal change on hover. Only Material overlays carry elevation, plus a hairline border.

## Shapes

10px plate corners, 14px for large containers. Dashed hairline for empty states.

## Components

### Buttons
Material 3 flat/stroked in Mark Rose; destructive uses `color="warn"` behind a confirmation dialog with Cancel focused.

### Shortcut rows
56px rows: ink icon, left-aligned label, hairline border. On hover or focus the border strengthens and a 6px rose dot appears at the right edge.

### Header
Sticky pearl bar with hairline, lotus-and-cloud logo and wordmark, text navigation. The active page carries a 5px rose dot under its label.

### Patient banner
Proof Grey strip, 44px link, name in ink, CURP muted.

### Charts
Data marks are the one place the plate admits more hues: `--chart-series-1..3` (blue, orange, aqua; validated for colour-blind separation on the light and dark surfaces, separate dark steps). Lines are 2px on a 0–100 recessive grid, with a legend, direct labels at the line ends, a crosshair tooltip and a table view (aqua sits under 3:1 on the light surface, so a series is never identified by colour alone). Text stays in ink tokens, never in a series colour. One axis per chart.

### Platform portal (`/plataforma`)
The operator's own surface, Operate mode, same world: a Proof Grey side navigation whose current page carries the rose dot, a page title in Display, summary counts in one hairline-divided plate (not a row of cards), and dense hairline tables with tabular numerals. Loading shows skeleton blocks in the shape of the content. Destructive actions (suspend, revoke) confirm in a dialog that asks for the reason and keeps Cancel focused.

### Not found (404)
A blank face-map plate (registration crosses, dashed face with its midline and thirds, "Lám. 404" in tabular numerals) whose rose mark sits off the face, joined by a dotted leader to the empty spot where it belongs. The mark settles in once with an ease-out; nothing moves under reduced motion. Copy says what happened and offers the way back that fits the visitor: Today and Patients when signed in, sign-in otherwise, the portal under `/plataforma`.

### Plan comparison dialog
Opened from "Conoce Premium" in the header (only on Free, only for whoever manages the plan). One hairline table, features as rows and Free/Premium as columns; Premium's column sits on Proof Grey and its differing values are set in 600. Included is an ink check, not included a muted dash, both labelled for screen readers. Prices load as skeletons. It informs and leads to the Plan screen; buying stays there.

### Archived record band
On every screen of an archived patient: a Proof Grey plate behind a strong hairline, the archive icon in quiet ink, "Expediente archivado" in 600 with date and who archived it (tabular), the reason in ink, a one-line read-only note, and Restaurar as a stroked button. No rose in the band itself; only its actions carry the mark. The owner's purge appears beside it as a warn text button only once the five-year retention has passed, behind a dialog that asks for the patient's full name.

### Retired photos
Retiring a photo is not destructive, so its button on the tile is neutral (no error hover). Retired photos fold under the gallery behind "Fotos retiradas: N": a dashed-hairline list of 56px thumbnails with the tag, who retired it and when, and "Devolver a la galería".

### Consent signers
One plate per signer (patient, Testigo 1, Testigo 2), each with its own pad. When the clinic stores a second witness, Testigo 2 offers a two-way segmented choice (stored signature / sign here) in the same inverse-surface style as the patient list tabs.

### Note signature line

The authorship line under a valoración, treatment visit and historia clínica: a hairline band, top and bottom, with "Registró <name> · <date, time>" in secondary ink on the left and the signature state on the right. Unsigned shows the single rose dot, "Sin firmar" and an outlined rose "Firmar" button (only for users who can edit the note). Signed shows a check, the signer's title and name, the timestamp and the licence in secondary ink. Records from before signatures existed read "Registro anterior a la firma electrónica" in secondary ink and offer no button. Tabular numerals for every time.

### Sign-note dialog and profile

The PIN dialog is a plain Material dialog: one lead sentence explaining that editing voids the signature, one 6-digit PIN field, Cancel and Firmar. When the user has no PIN or licence yet, the error line links to /perfil instead of failing silently. /perfil is a single plate with two sections, "Cómo firmas" (title, cédula, a live preview of the signer line) and "PIN de firma" (new PIN, repeat, account password). On Today, "Notas por firmar: n" leads the side column with the rose dot only when the count is above zero.

### Signed notes and addenda

A signed valoración or treatment visit is read-only: its fields show disabled, the save bar and "copiar de la historia" disappear, and diagrams open in view mode. One secondary-ink sentence under the signature line says so ("Nota firmada: ya no se modifica…"). The line itself trades "Firmar" for an outlined "Agregar adenda". Addenda list under the line, in order: a bold tabular heading "Adenda n · fecha, hora", the text in body ink (pre-wrap, 72ch), its diagram thumbnails read-only, and its own signed line in the same style as the note's. Hairline between addenda; no cards, no colored rules. Photos and consents stay open on a signed visit.

The addendum dialog follows the PIN dialog: one lead sentence saying the signed note stays as it is and the addendum cannot be changed, a textarea, a quiet "+ Agregar diagrama" text button that opens the same diagram views inline, the PIN field, Cancel and "Firmar adenda".

### Historia clínica history

The historia's signature line adds a text button "Ver historial". The dialog lists versions newest first: "Versión n" in semibold, "vigente" in small secondary ink on the newest, author and timestamp right-aligned, the signature state in secondary ink, then each changed answer as a two-column row: the label in secondary ink, the old value struck in secondary ink, an arrow, the new value in body ink weight 500. Hairline between versions; on phones the rows stack.

## Do's and Don'ts

### Do:
- **Do** use `--mat-sys-*` and `--plate-*` tokens for every color.
- **Do** keep touch targets at least 44px.
- **Do** keep the 2px primary `:focus-visible` outline.

### Don't:
- **Don't** add resting shadows or a second accent.
- **Don't** use rose as decoration.
- **Don't** hard-code hex in components; chart series colours live in `--chart-series-*` tokens.
