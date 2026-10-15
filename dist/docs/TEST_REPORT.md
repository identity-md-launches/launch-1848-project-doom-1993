# Test report

Date: 2026-10-15. These checks were executed by the implementation worker against the production export. The assignment's path/byte-only verifier does not independently certify behavior. Tests cover the stated flows, not every browser, WAD, enemy or game state. Nothing was deployed.

## Build and executable checks

Node 24.21.0, npm 11.19.0, TypeScript 6.0.3, Vite 8.3.4, Playwright 1.64.1 and Zig 0.16.0 were used. Dependencies/browsers/compiler caches were installed in temporary storage, with npm lifecycle scripts disabled. No dependency directory, npm registry mirror, submodule or package archive is submitted.

| Check / package script | Actual result |
| --- | --- |
| `npm run typecheck` | Passed (`tsc --noEmit`, strict host TypeScript). Vendored LZMA is JavaScript with separate review, not typechecked internally. |
| `npm test` | 11 groups passed, zero failures; includes 1,000 deterministic malformed-directory mutations, header/range/size/type checks, pack merge/map completeness, truncated MIDI and MUS no-progress rejection. |
| `npm run build:engine` with verified Zig | Both modules built from the delivered C source archive. Two clean builds in different temporary directories matched byte-for-byte after removing build paths from diagnostic strings. |
| `npm run test:engine` | Passed on the final built modules; details below. |
| `npm run build` | Passed; committed-style static export contains relative URLs, required local game assets, report/notice mirrors and corresponding-source downloads. No network asset is required at runtime beyond the serving origin. |
| `npm run test:browser` | Chrome for Testing 156.0.8078.4 and Firefox 157.0, headless actual browser engines. Meaningful flows below passed after repairs. |
| `npm audit --package-lock-only --ignore-scripts --json` | Zero vulnerabilities returned; 43 dependency entries in the complete lockfile including optional platform variants. This is advisory coverage, not source proof. |
| `npm run check:budget` | Passed conservative total-file-byte limit of 8,388,608; no forbidden cache/dependency paths or symlinks. Exact final count is in the completion message/check output. |

Where tools were installed outside the repository, the identical underlying Node/Python entrypoints were invoked directly rather than through npm. Temporary tool locations were supplied through PATH, `IMD_ZIG`, `IMD_PLAYWRIGHT` and `PLAYWRIGHT_BROWSERS_PATH`; these are owner-settable paths, not required machine-specific values. Final commands use the ordinary package scripts documented in README.

## Real engine and data

`test/engine.mjs` compiles both WASM modules and asserts **zero imports**, decompresses and validates the full Freedoom Phase 1 WAD, converts its MIDI tracks, and boots every one of its **36 maps for 50 simulation ticks**. All passed. Tests also verify:

- Forward motion changes player coordinates; firing consumes ammo and emits firing events; enemies become aware and emit sound events. Switching to fist updates the engine's weapon state.
- A small test PWAD changes an existing E1M1 line to the vanilla exit special. Walking across it causes the actual engine exit, intermission and E1M2 load. This uses ordinary engine gameplay, not a simulated screen change.
- MIDI → MUS → OPL generates non-silent stereo PCM, with measured maximum amplitude `0.44573974609375` in the native integration run.
- Malformed raw WAD headers are rejected by C even when the JS validator is bypassed.
- Crafted duplicate-empty-sprite and overlapping namespace cases are rejected. A legal unsigned high BLOCKMAP offset validates and boots after the C signedness repair.
- A PWAD recoloring enemy sprite posts changes rendered pixels while the deterministic player/game snapshot remains identical. This directly exercises appearance-only modding.
- All 29 vanilla sprite-frame identifiers, including the three after Z, validate.

An additional scratch integration test extracted **Freedoom Phase 2 0.13.0** from the verified official release and validated/booted **all 32 commercial-mode maps for 50 ticks each**. It caught the late-sprite-frame compatibility defect, repaired before final build. Phase 2 is a test input only and is not shipped. Commercial DOOM.WAD/DOOM2.WAD were not supplied, redistributed or directly tested; format support must not be confused with testing those exact commercial data versions.

These are short smoke simulations, not complete playthroughs of 68 levels. Long-session performance, every boss finale, every weapon, every difficulty, multiplayer and save/load are not certified. Saves, loading saved games and attract demos are intentionally disabled.

## Browser interactions and privacy

`test/browser.mjs` serves **dist/** at a non-root `/preview/` path. It launches real Chrome for Testing and Firefox, records page exceptions/resource failures/requests and captures screenshots. Test-only worker instrumentation observes the real engine's output; it is not present in the application bundle.

The passing suite covers 320/390/1440px reflow and first-screen Start, complete default loading, animated framebuffer, held movement/shooting, enemy/SFX events, generated music PCM, mouse capture/turn/fire/release, pause/resume with frozen tick counter, mute/unmute UI, entering/exiting fullscreen, restart cancel/confirm, invalid and oversized WAD errors, valid local IWAD selection, PWAD add/enable/disable/order/remove/apply, filename HTML escaping, actual exit/intermission/E1M2, visible emulated touch controls, and keyboard Tab escape. No page exceptions, missing resources, cross-origin requests or upload methods occurred in the passing flows. Only local GET requests were observed.

Browser screenshots were actually viewed, including the first 390px screen and live desktop gameplay. The bundled title/preview is not the game implementation: Start launches the compiled C engine and produces new frames.

The test records startup-to-60-ticks timing, approximate simulation frequency during held movement, music PCM amplitude and audio-context state. These are local smoke observations, not benchmarks or sustained performance guarantees. In the retained final run, Chrome reached 60 ticks in 9.63 seconds and Firefox in 10.95 seconds; the short movement sample measured about 35.7/35.2 simulation ticks per second respectively. Both produced music peak 0.23827; Chrome audio was running and Firefox suspended. Chrome logged one test-only canvas readback performance warning; neither browser logged a console error. Compact records are retained in `artifacts/VALIDATION_RESULTS.json`. **Audio limitation:** Firefox's headless audio context remained suspended without a usable output device in this container. Non-silent music synthesis, sound events and mute controls passed; physical speaker output and subjective audio quality were not heard. Chrome's audio graph can run here, but no claim of human listening is made.

Physical touch hardware, iOS/Safari/WebKit, assistive technology and an actual public deployment were not tested. The available browser connector could not launch its configured Chrome binary; directly installed Playwright browsers were used instead. Firefox initially lacked GTK/runtime libraries and a writable application-data location; official system-library packages and isolated temporary browser data resolved launch. These were test-machine limitations, not requests for account credentials.

## Failures found and fixed

| Location | Observed issue | Resolution / regression |
| --- | --- | --- |
| C `r_main.c`, in source archive | E2M1 exact geometry reached an invalid slopetable index and trapped WASM. | Widen/saturate delta, zero-distance return and index bound. All 36 maps pass. |
| `src/main.ts:19` startup | Restart left loading overlay hidden and old tick metadata visible. | Reset overlay and ticks before stopping/starting. Browser restart/pack-apply checks pass. |
| `src/main.ts:22` startup | Awaiting audio resume blocked Firefox game launch without an output device. | Start engine independently; audio failure cannot block gameplay. Both browsers load. |
| `src/wad.ts:158` sprite validation | Vanilla arch-vile frame names after Z rejected. | Match C's 29-frame range. Phase 2 all-map test and regression pass. |
| `index.html:57` / `:64`, file input patterns | Visually hidden file inputs could add an invisible keyboard stop. | Remove their tab stops; visible keyboard-accessible Load/Add buttons remain. |
| `src/style.css:3` focus patterns | Pack checkboxes used only browser-default focus. | Include inputs in the explicit focus-visible ring and forced-colors rule. |
| `test/browser.mjs`, file assertions | Tests sometimes checked before asynchronous File.arrayBuffer finished. | Wait for the visible error/selected filename/pack count. No product failure was hidden by this repair. |

Security findings, reproductions and fixes are recorded separately in `SECURITY_AUDIT.md` and `INITIAL_SOURCE_REVIEW.md`. GCC ASan ran the delivered MUS harness against the patched parser: both truncated and zero-delay fixtures exited 0 without sanitizer output. Original source produced the documented overflow/timeout. This is targeted regression testing, not fuzz coverage of all C.

## Better Interface review: six domains

The pinned guide was read and applied while building, then the final source and rendered page were reviewed. This is separate from build/security validation.

| Domain | Without-browser coverage | Rendered coverage, findings and limits |
| --- | --- | --- |
| Accessibility | Native buttons/select/dialog, field labels, status/alert semantics, skip link, explicit focus, pause/release handling, reduced motion, forced-colors, escaped filenames. | Actual Tab escape, modal cancel, keyboard/mouse and control interactions; mobile target probe passed. Hidden file stops/focus-ring findings above fixed. No screen reader, physical touch or full WCAG conformance audit; the original visual game itself is not screen-reader playable. |
| Layout | Fluid minmax viewport, bounded setup column, 1100/800/520 breakpoints, wrapping toolbar/footer/filenames. | 320/390/1440 actual layouts: no horizontal scroll, overlapping text or clipped text in probe. 390 first screen visibly contains product and main action. Dynamic packs and fullscreen checked. Native browser zoom/physical device landscape not exhaustively tested. |
| Writing | Clear Start, local file limits, pack precedence, errors/recovery, restart consequence, unavailable save/demo features, honest legal/mod limits. | First-screen prose 22 words at 390 (probe bar 60); 59 at 1440 (bar 90). No repeated copy, stacked eyebrow text or simulated features. The retro title direction is intentional. |
| Typography | Five-size scale, two families/two weights, local regular Silkscreen, readable system body, bounded line measures. | Probe measured five sizes, Arial/Silkscreen, 400/700. Font request and rendered title verified. No external font host. OS fallback metrics beyond tested platforms remain unverified. |
| Colors | Central tokens, red primary, amber focus, text-plus-color feedback, dark native control theme. | All measurable solid-background text pairs met 4.5:1 (3:1 large). Eight text boxes over canvas/images/gradients were not mechanically measured; screenshots inspected, no universal contrast claim. Gameplay colors/flashes are legacy content. |
| UI | Clear primary action, disabled/loading/empty/error states, native disclosure/modal, reversible pack controls and recoverable worker stops. | Primary and secondary flows exercised, state repairs above confirmed. Buttons are at least 44px; six links/smaller controls meet 24px-or-spacing probe threshold rather than the preferred 44px. No decorative endless motion; reduced-motion probe passed. |

## Pinned design probe

Executed from repository root after the final UI changes:

```sh
IMD_PLAYWRIGHT=/path/to/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers \
node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste --offline
```

**16 of 16 checks passed:** render, layout, targets, contrast, casing, tracking, eyebrows, type sizes, type faces, glyphs, slogans, repetition, copy budget, chrome, motion and share metadata. Title, favicon, description, og:title and local 1200×630 PNG og:image are present. The probe's warnings/measurement gaps above are retained rather than treated as coverage. Its screenshots at 390 and 1440 were inspected. Scratch is discarded by the assignment; retained compact validation summaries record the outcomes.

## Remaining limits

No CodeQL, full taint analysis, coverage-guided whole-engine fuzzing, browser exploit research, long-duration resource soak, physical audio/mobile session or public hosting-header test was performed. The final independent security agent pass was interrupted after three useful findings; a complete independent final sign-off is unavailable. The implementation agent completed remediation, final checks and reporting. Claims are limited accordingly.
