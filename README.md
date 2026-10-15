# DOOM 1993 · made by IMD Swarm

A playable static browser edition of the real id Software Doom engine, built from reviewed and hardened `theMagicalKarp/wasmdoom` C source. Includes the **complete Freedoom Phase 1 0.13.0** (36 maps), effects, OPL music, keyboard/mouse and touch controls, fullscreen, restart, local IWAD loading and an ordered PWAD manager.

The deployable site is **`dist/`**, including its source downloads and license notices. Its URLs are relative and it was tested at `/preview/`. No backend, account, wallet, telemetry or external asset CDN is required. Nothing has been published or deployed by this task.

## Install, preview, rebuild

Use Node 24+, npm and Python 3.12+. Dependency install scripts are unnecessary:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm run preview
```

Open the URL printed by Vite. The production preview uses committed runtime files in `dist/assets/`; `npm run build` regenerates `dist/index.html`, `dist/app/`, documentation and the host source archive while preserving those required runtime assets. **Do not delete `dist/assets/`** before a frontend rebuild. `npm run dev` is for UI development; use the production preview to exercise game assets and hosting behavior.

The implementation intentionally uses TypeScript and native DOM elements instead of a framework, reducing runtime dependencies. Vite, TypeScript and Playwright are pinned in the lockfile. The modified LZMA decoder is audited vendored source, with its MIT notice. The host-source download includes the linked reports and notices under `dist/docs/`. When reconstructing from that download, retain the site’s `dist/assets/` and `dist/source/wasmdoom-source.tar.xz`; the final `dist/FINAL_REVIEW.sha256` is a separate release record, excluded from the archive to avoid circular hashing.

## Rebuild the actual engine

Install the official **Zig 0.16.0** toolchain from [ziglang.org](https://ziglang.org/download/0.16.0/release-notes.html), verifying its published SHA-256. The independent review records the verified compiler and output hashes in `dist/docs/INDEPENDENT_SECURITY_REVIEW.md`. Then:

```sh
npm run build:engine
npm run test:engine
npm run build
```

`IMD_ZIG=/absolute/path/to/zig npm run build:engine` selects an explicit compiler. The build script extracts the full corresponding source from `dist/source/wasmdoom-source.tar.xz` into a temporary directory, builds both no-import WASM modules, and writes `dist/assets/doom.wasm` and `music.wasm`. The source archive contains every C/header file and `build.zig` needed; no submodule, upstream precompiled WASM, toolchain cache, registry mirror or npm archive is needed. `engine/hardening.patch` records changes against upstream commit `dd321b50b89b5085698cfbf2ff01b2f741da8206`.

For engine edits, unpack the archive into an owner-selected working directory, edit/build/test there, then regenerate the archive and update the patch/provenance hashes together. Its compressed form is needed to retain full corresponding source within the assignment's 8 MiB budget.

The original, unmodified Freedoom WAD is compressed once in `dist/assets/freedoom1.wad.lzma`. To reproduce it, obtain the official [0.13.0 release ZIP](https://github.com/freedoom/freedoom/releases/tag/v0.13.0) and run:

```sh
python3 scripts/pack-freedoom.py /path/to/freedoom-0.13.0.zip
```

The script verifies the official ZIP and WAD hashes, extracts only Phase 1, compresses with Python liblzma preset 6 and records the exact uncompressed length. The browser verifies compressed and uncompressed SHA-256 before use. No proprietary Doom assets are distributed.

## Checks

```sh
npm run typecheck
npm test
npm run test:engine
npx playwright install chromium firefox
npm run test:browser
node test/layout.mjs
npm audit
npm run check:budget
```

Browser tests run a temporary local server under `/preview/` and close it afterward. Screenshots/results go only to `test/scratch/`. `IMD_TEST_BROWSERS=chromium` selects one engine; `IMD_PLAYWRIGHT` may point to an externally installed Playwright `index.mjs`. A minimal Linux container may need browser libraries and writable browser application-data directories. The actual commands, versions, repairs and results are recorded in [TEST_REPORT.md](dist/docs/TEST_REPORT.md).

During this task dependencies were installed in temporary directories with lifecycle scripts disabled. Production build and TypeScript checks passed. The final revision passed 11 unit tests, all 36 default-map engine checks, all 13 browser interaction groups in both Chromium and Firefox, and eight filename/fullscreen layout states per browser. The 16-check design probe also passed. Actual commands, failures repaired and remaining limits are in the linked test report, not inferred from the path-only submission verifier. No Git commands or protected paths were modified. No ignore file was changed; generated tooling stayed outside the repository or in discarded scratch. `check:budget` conservatively totals deliverable file bytes, not just compressed Git size.

## Hosting and security

Serve `dist/` over HTTPS on GitHub Pages, Cloudflare Pages or an IPFS gateway with JavaScript, WASM and WOFF2 MIME types. No SPA rewrites, environment secrets, cross-origin isolation or server execution is required. `dist/_headers` supplies extra headers for Cloudflare Pages; other hosts must configure equivalent headers themselves. The HTML CSP works on static hosts; frame-ancestor protection and `nosniff` require real HTTP headers. Relative Open Graph image URLs may need an absolute URL when an owner chooses a final domain.

Review [SECURITY_AUDIT.md](dist/docs/SECURITY_AUDIT.md) before publishing. The reopened revision has a completed [independent final review](dist/docs/INDEPENDENT_SECURITY_REVIEW.md), executable checks and exact [reviewed file hashes](dist/docs/REVIEWED_FILES.sha256). Its confirmed image-validation and flat-lookup findings were repaired and checked before release. It is not a formal proof that legacy C or browsers are free of vulnerabilities. Use trusted WADs. An invalid or overly complex map can still stop the worker; the page offers recovery.

The engine runs in a dedicated worker with bounded WASM memory and no host imports. Uploaded files are read with `File.arrayBuffer()`, never sent over the network, and cleared when the tab closes. Save/load and attract demos are disabled because their legacy serializers/parsers were not safe enough to expose. Changes to base game/difficulty/packs require a fresh session.

See [MODDING.md](dist/docs/MODDING.md), [LICENSE_REPORT.md](dist/docs/LICENSE_REPORT.md), and [DESIGN.md](DESIGN.md). The GPL source and all required third-party notices accompany this submission. Distributors must keep the corresponding source and notices available with the binaries.
