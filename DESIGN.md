# Design system

## Overview

This is a compact browser game for Doom players, with the viewport and Start game action taking precedence over setup and documentation. The implemented direction is dark, red-accented and deliberately pixel styled: Silkscreen titles, a real Freedoom framebuffer preview and restrained scan lines. Native form controls and plain body text keep the surrounding interface readable. `index.html` defines the patterns; `src/style.css` is their source of truth; `src/main.ts` supplies state changes.

The pinned Better Interface workflow was applied across accessibility, layout, writing, typography, colors and UI, with a rendered design-critic probe and manual screenshot review. This task's explicit retro direction governs the display font and game presentation. Guidance attribution/license is retained in `dist/docs/DESIGN_GUIDANCE_LICENSE.txt`. Coverage and limitations belong in `dist/docs/TEST_REPORT.md`.

## Colors

All tokens are hexadecimal CSS custom properties in `src/style.css:2`.

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#131313` | Page background |
| `--panel` | `#1b1b1b` | Game shell, fields, dialog, keys |
| `--raised` | `#242424` | Neutral buttons |
| `--border` | `#3d3d3d` | Separators and control outlines |
| `--text` | `#f1ede5` | Main text |
| `--muted` | `#b1aaa1` | Supporting text and status |
| `--accent` | `#c7362c` | Primary action and touch Fire |
| `--accent-hover` | `#e54a3e` | Primary hover, identity details |
| `--focus` | `#ffbf69` | Visible keyboard ring and link hover |
| `--danger` | `#ffaca1` | Error message text |

Secondary values are `#343434` for neutral button hover, `#080808` behind the framebuffer, and translucent black in launch/dialog overlays. Color never carries an error or state alone: labels, enabled/disabled controls and text accompany it. The probe measured eligible solid-background contrast pairs; it cannot certify changing canvas/gradient backgrounds. This is a single dark theme using `color-scheme: dark`, not a theme toggle.

## Typography

The five sizes are `--sm:13px`, `--body:16px`, `--lead:20px`, `--section:24px`, and `--display:48px`. Body uses Arial, Helvetica, sans-serif at 400/1.5; body emphasis and standard headings use 700. Silkscreen Regular is a local WOFF2 at `dist/assets/silkscreen.woff2`, bundled to `dist/app/` by Vite, with `font-display:swap` and monospace fallback. It is used at weight 400 for the product title, launch heading and asset number. Its visible uppercase shapes are part of the retro brief, not added small tracked eyebrow text.

The product title is 48px/1.1 with `-.04em` spacing. Its year is 24px, reducing to 20px at 520px. Standard section titles are 20px/1.3 and the About heading is 24px. Launch titles are 24px/1.4, reducing to 20px on phones. Body guidance uses 13px/1.6 and a maximum 65ch measure where applicable. Counts use tabular numbers; filenames wrap anywhere. Local font loading and pixel title appearance were confirmed in browser screenshots and network requests.

## Layout

Shared `.masthead`, `main` and `footer` use a centered maximum width of 1320px and 40px desktop gutters. Spacing is primarily based on 8px with 4px and 12px subdivisions: 8/12px control gaps, 16px padding, 24/32px section gaps and 48px major separation. The `--space:8px` token records the base; existing declarations use literal values.

`.workspace` uses `minmax(0,1fr) 300px` with a 32px gap. The main game remains fluid; setup is an adjacent column. The 320×200 framebuffer is displayed at Doom's intended 4:3 screen aspect with pixelated interpolation. The launch overlay occupies that same screen. Controls and explanatory content follow the playable product.

At 1100px, gutters become 24px, setup 270px and gaps 24px. At 800px, the game and setup stack; setup temporarily uses two columns. At 520px, gutters become 16px, setup becomes one column, controls use two columns and About stacks. Touch controls appear during gameplay below 800px or for a coarse pointer. The toolbar and footer wrap. The game header lets `#game-label` shrink and wrap anywhere without clipping; the session label cannot shrink, so the row grows vertically for long filenames. The fullscreen screen uses size containment and container-relative width to fit an explicit 4:3 canvas with `object-fit:fill`. Header, toolbar, hints and touch controls keep their own space outside the image; remaining space is black letterboxing.

Actual 320, 390 and 1440px browser layouts were inspected/tested without horizontal overflow. At 390px, product, preview, Start game and download note appear in the first 844px viewport. Dynamic pack and base-game filenames wrap. The revision regression loads an actual IWAD with a 61-character name and checks the full filename, header status, page width and 4:3 canvas geometry before and during fullscreen. Physical phone landscape and all intermediate widths were not exhaustively checked.

## Elevation & Depth

The interface is flat: no card shadows or elevated-card grid. One-pixel borders and surface tones separate the viewport, controls and sections. The launch screen darkens the captured game image; a subtle scan-line pseudo-element is noninteractive (`pointer-events:none`). The native dialog uses a translucent black backdrop. The keyboard skip link appears above content when focused.

## Shapes

Buttons, fields and keyboard badges have 3px corners; game shell and dialog have 4px corners. The pixel-style mark and crosshair remain square. There is no pill system. Canvas clipping belongs to `.screen`; filenames are wrapped rather than clipped.

## Components

- **Actions:** native `button`, `.primary`, `.wide`, `.text-button`. Primary red is for Start/Restart and touch Fire. Ordinary actions use the neutral raised surface. Minimum button height is 44px; Start is 52px desktop/48px phone. Disabled controls dim to 45% and remain noninteractive. Hover respects hover-capable input. A 120ms press/color transition is enabled only without reduced-motion preference.
- **Focus and navigation:** `.skip` links to the game; `nav` contains in-page Controls/About links. Focus rings are 3px amber with 3px offset, including pack checkboxes. `Tab` leaves the game canvas. Hidden file inputs have `tabindex=-1`; their visible Load/Add buttons are keyboard reachable. Native dialog semantics provide modal focus behavior. Forced-colors uses system Highlight.
- **Game surface:** `.game-shell`, `.screen`, `#canvas`, `.launch`, `.game-toolbar`. Ready/loading/playing/paused/stopped labels reflect state. Setup is inert during startup. A recoverable failure restores the launch action and retains selected data in memory. Pause releases held input; blur/visibility changes pause. Fullscreen and sound are independently labeled buttons.
- **Setup fields:** labeled difficulty select, `.base-row` for chosen IWAD, visible file selection buttons, adjacent size/local-processing guidance. `#reset-base` restores Freedoom. Changing active settings exposes Apply changes & restart.
- **Pack rows:** `.pack-row`, `.pack-name`, `.pack-actions`. Checkbox enables; Move up changes order; Remove discards that in-memory pack. Last enabled pack wins. Empty state explains the capability. Filenames are text nodes, never markup.
- **Feedback:** `#status` is polite live text; `#error` is an alert with concrete recovery guidance. Errors do not rely solely on red. `#restart-dialog` describes progress loss and offers Keep playing / Restart game.
- **Instructions:** `.keys-grid`, `kbd`, and a native `details/summary` for secondary controls/session limitations. Do not bury primary actions in this disclosure.

## Do's and Don'ts

Reuse the content-width primitive, existing type tokens and native controls for another page. Begin with one clear page title, put the relevant action alongside its content and use `.primary` for that action. Use muted text for context, the danger token for actionable errors and the focus token for keyboard affordances. Keep instructions beside the affected control.

Retain the game as the first-screen product. Do not introduce external fonts/assets, a tall marketing hero, new competing accent colors, small tracked uppercase labels or decorative animated backgrounds. New asset-editor pages should reuse the file/error/pack patterns and retain local-only processing. Do not present unimplemented editors or configuration features as existing UI.
