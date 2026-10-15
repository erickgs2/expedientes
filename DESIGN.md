---
name: Expedientes
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

# Design System: Expedientes

## Overview

**Creative North Star: "The Facial Map"**

The interface is a printed anatomical chart for an aesthetic-medicine practice: a pearl-ivory plate, graphite-blue ink, and a single rose mark, the dot a practitioner places on a face map. Position, selection and action are the only things that earn the mark. Everything else is ink on paper, separated by one hairline.

Navigation and controls stay standard Material 3 components; the world supplies type (Hanken Grotesk, tabular numerals), palette, density, and one signature move: the registration mark, a ringed cross with a rose centre used as the logo, and a small rose dot that marks the active page and the hovered shortcut.

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
Sticky pearl bar with hairline, ringed-cross logo and wordmark, text navigation. The active page carries a 5px rose dot under its label.

### Patient banner
Proof Grey strip, 44px link, name in ink, CURP muted.

## Do's and Don'ts

### Do:
- **Do** use `--mat-sys-*` and `--plate-*` tokens for every color.
- **Do** keep touch targets at least 44px.
- **Do** keep the 2px primary `:focus-visible` outline.

### Don't:
- **Don't** add resting shadows or a second accent.
- **Don't** use rose as decoration.
- **Don't** hard-code hex in components.
