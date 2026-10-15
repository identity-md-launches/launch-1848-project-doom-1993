# Independent final security review

Date: 2026-10-15. Reviewer: separate Codex release-review agent, distinct from the implementation agent. This agent reviewed the implementation, reported a new source-level issue, checked its repair, and independently rebuilt and tested the result. It did not edit application code. This is a completed, focused independent review of the identified local release; it is not certification or proof that the historical C engine is memory safe. No public deployment was tested or performed.

## Exact revision and checked scope

The content revision is the SHA-256 of [REVIEWED_FILES.sha256](REVIEWED_FILES.sha256):

`0a502bef64b89a8a34ccb90a3124c5be4c62dce3a94ac27094fd58efb317cf0d`

That manifest binds 42 files: all delivered host source, HTML/CSS/JavaScript/TypeScript, source-page HTML, compiled application files, runtime assets, both WASM modules, the corresponding C archive, hardening patch, package manifest/lockfile, build scripts/configuration, deployment headers, license, and top-level tests/scanner rules. Run `sha256sum -c dist/docs/REVIEWED_FILES.sha256` from the repository root. This is a content-addressed local revision, not a claim of a new Git commit.

The core manifest deliberately excludes README.md, DESIGN.md, dist/docs, the host source archive, review records themselves, scratch evidence and protected/input directories. The separate [final release manifest](../FINAL_REVIEW.sha256), produced after the documentation/archive freeze, binds the final delivered files including this report and both archives. It excludes itself to avoid a circular hash; its paths are relative to the repository root. Final-manifest exclusions are `dist/FINAL_REVIEW.sha256` itself, `test/scratch/`, `.git/`, `.github/`, `.imd/`, `.agents/`, `.codex/`, `.aws/`, and `.env*` files. The core manifest also excludes `.imd-responses.json`; the final manifest includes that response record. Raw scratch logs/tool installations are working evidence and are not bundled into the release.

Important runtime hashes:

| File | SHA-256 |
| --- | --- |
| dist/assets/doom.wasm | `64b9f53b8005b97c3f0c6000c60151e764718afc5fce3d2001e9b10b14d70afa` |
| dist/assets/music.wasm | `7a0a92c727a5e50dd95df0356e7fba70aa26754a942124435a1aafa7f0d12831` |
| dist/source/wasmdoom-source.tar.xz | `13111ee3159e11aa947253ef550a8b3978090822b4770f812bb12dca1e75356d` |

Coverage included a direct host/boundary review, static scanning of every delivered source and bundled JS file, inspection of HTML/CSS/SVG references, dependency resolution, deployment policy and packaging/extraction code. The C archive contains 146 regular files, including 143 C/H files. All C/H files were scanned; manual C review concentrated on parser/renderer interfaces, changed code, event/memory bridges, allocation/formatting leads, music, networking and disabled save/demo paths. This was not a line-by-line proof of every game or OPL routine. Binary images/font/game data were hash-bound; their underlying browser decoders were not audited.

## Findings and disposition

**No confirmed unresolved High or Critical finding remains from this review.** That conclusion applies to the checked scope and does not imply that other legacy-engine defects cannot exist.

| Finding | Priority | Final disposition and evidence |
| --- | --- | --- |
| Sector flat lookup could resolve a global name outside the flat namespace before indexing a C cache array. | High | Found by this reviewer through the JS-to-C call path. Repaired in both layers: `validateMap` verifies floor and ceiling names against the final global name resolution inside the unique flat namespace; archived `R_FlatNumForName` rejects indices outside `firstflat..lastflat` and non-4096-byte data before subtraction. Independently inspected the diff and rebuilt it. Five existing regression inputs covering absent, outside-namespace and shadowed references are rejected by both JS and C; default maps still pass. No browser escape or exploitability claim is made. |
| Some UI image families were not covered by patch validation, and empty UI images bypassed checking. | High | Prior independent pass identified this gap. Final validator includes AMMNUM and CWILV, retains the other UI families, and checks empty images. This reviewer inspected the final source and reran all ten retained empty/malformed image regressions; each is rejected before WASM. |
| Previously documented WAD/MUS boundaries, renderer array limits, unsigned BLOCKMAP offset mismatch, duplicate sprites/namespaces, distance calculation and formatter precision. | High in the primary audit | Reviewed the delivered hardening diff and corresponding C/JS paths. Final tests cover header rejection, maps, music, sprite/namespace regressions and unsigned BLOCKMAP acceptance. The primary audit records earlier MUS ASan results; those sanitizer runs were not repeated or treated as comprehensive native coverage. No contrary result was found. |
| Save/load/demo readers and writer retained unsafe historical assumptions. | High in the primary audit | Relevant game actions return before legacy parsing/writing. The browser host exposes no save import or persistence path. Legacy source and some unused exports remain; re-enabling these features requires a new review. |
| Documentation overstated absence of dependency install scripts and referenced unbundled working records. | Informational | Corrected and verified in the frozen documentation. The lockfile has an optional fsevents installation-script flag; packages were installed with scripts disabled. The delivered audit now distinguishes recorded working evidence from bundled reports and acknowledges that script flag. |

The repaired flat-reference issue was source-confirmed; the review did not develop an exploitation recipe. Existing bounded regression tests were used for verification. Scanner matches were triaged as review leads, not automatically labeled vulnerabilities.

## Independent executable checks

| Check run by this reviewer | Result |
| --- | --- |
| `npm test` | 11 tests passed; 0 failures. |
| `npm run typecheck` | Passed with TypeScript 6.0.3. |
| `npm run test:engine` after the final repair | Passed: all 36 Freedoom Phase 1 maps booted and simulated for 50 ticks each; movement, firing/ammo, enemy awareness, sound, fist selection, exit/intermission/next map, MIDI-to-MUS/OPL output, visual sprite replacement and retained parser regressions. OPL peak was 0.44573974609375. This is bounded simulation, not full playthrough coverage. |
| Fresh safe extraction and Zig build of final delivered C archive | All 146 entries were regular files under the intended prefix, without traversal/duplicate names. Compared against the recorded upstream archive: 130 files unchanged, 16 changed; every changed file exactly matches the delivered hardening.patch, with no extra patch entry. Rebuilt game and music WASM into scratch using Zig 0.16.0, ReleaseSmall; both outputs are byte-identical to the delivered modules. The toolchain archive hash `70e49664a74374b48b51e6f3fdfbf437f6395d42509050588bd49abe52ba3d00` matches its recorded official ziglang.org index entry. All 19,546 installed toolchain files were also compared with that archive with zero differences. This verifies the recorded archive, not publisher signing keys or compiler correctness. |
| Independent Vite production build to scratch | All five emitted HTML/JS/CSS/font outputs match the final dist files byte-for-byte. No upstream install/application script was needed for these checks. |
| WASM metadata inspection | Both modules have zero imports and no automatic start section. Game memory maximum: 3,072 pages / 192 MiB; music: 256 pages / 16 MiB; neither memory is shared. |
| Semgrep Core 1.181.0 with delivered custom rules, final rerun | 153 files: 143 C/H, eight source/build/config JS/TS, two bundled JS. 53 copy/format leads, five alloca leads and three expected fetch inventory hits. No process-execution, dynamic-code/HTML-sink or storage-rule match. All scanner invocations completed; four C files had partial-parse warnings (m_menu.c, wd_libc.c, r_segs.c, i_system.c). Their relevant contexts were inspected. Rule coverage is deliberately narrow and is not a complete SAST policy. |
| `npm audit --json --package-lock-only --ignore-scripts` | Zero known vulnerabilities returned. All 43 locked packages are development dependencies with registry.npmjs.org HTTPS resolution and SHA-512 integrity. The optional fsevents script flag is present. No runtime npm dependency loader is delivered. |
| OSV public querybatch, repeated independently | Five empty results for the four recorded source commits and lzma 2.3.2. Two queried repositories were unselected candidates. Empty results reflect OSV indexing and do not establish absence of vulnerable code. |
| Final local production-page checks in Chromium 156.0.8078.4 and Firefox 157.0 | Default game startup and pause passed. Observed requests were same-origin GETs only; no page/resource errors, inline scripts, external resource references, cookies, localStorage/sessionStorage entries or service-worker registrations. The bounded flow does not prove every possible future navigation/network path. |

Evidence from the earlier independent pass was inspected, including scan JSON, OSV/npm results, archive comparison, WASM metadata and browser logs. Its older browser logs referenced earlier bundles and were not used as evidence that the final bundles were exercised. The implementation agent's broader gameplay/layout results are separately documented in [TEST_REPORT.md](TEST_REPORT.md); they are supporting evidence, not mislabeled as this reviewer's own full browser suite.

## Security boundaries checked

- User files stay in memory. Input accepts raw WAD data, not arbitrary archive extraction or remote URLs. UI limits are 48 MiB per IWAD, 16 MiB per PWAD, four packs/32 MiB combined packs. Parsing/serialization enforce entry and expanded-data limits. Full merged-data validation precedes engine initialization in a worker. Names/errors use text nodes, not HTML interpretation.
- Known maps, patch columns, sprite and flat namespaces, texture references, palettes, sounds and music have bounded validation paths. Unsupported extended/scripted formats are rejected. Validation is intentionally restrictive and does not cover every WAD dialect.
- LZMA receives only the bundled compressed stream after exact length/SHA-256 verification. Output storage is capped at 28,795,076 bytes and the decompressed WAD is hash-checked. Uploaded compressed files cannot enter this decoder through the UI.
- The worker's host bridge checks game-memory ranges and event lengths, caps music/sound transfers, and clamps keyboard/mouse inputs. Main-thread startup/heartbeat deadlines can terminate a stalled worker. There are no WASI, filesystem, socket, process or other host imports in either module. Unsafe C can still corrupt objects within its own WASM linear memory; WASM bounds are not C object bounds.
- Only local assets were found in runtime references. Worker asset requests omit credentials, reject redirects and enforce streamed byte limits. There are no selected runtime tracker, wallet, miner-service, upload, persistent-storage or service-worker integrations. Ordinary game/synthesis computation and a finite audit cannot prove the absence of every malicious behavior.
- Pointer lock/fullscreen and audio are user initiated. Blur/visibility handling pauses play and releases input; page controls and Tab support leaving the game surface. No camera, microphone, geolocation, payment or USB capability is requested by application code.
- HTML CSP denies by default and permits local scripts with `wasm-unsafe-eval`, workers, styles, fonts, images and connections. General JavaScript eval is not enabled. The deployment `_headers` file adds framing, referrer, MIME and permission protections. Those server headers were reviewed as configuration, not validated on Cloudflare/GitHub Pages/IPFS; the latter hosts do not automatically apply a Cloudflare `_headers` file.
- Build operations use explicit argument arrays rather than shell interpolation. C source extraction validates entry paths/types; host packaging selects named project paths. No backend, credential, account, deployment automation or external upload endpoint is part of the selected application.

## Remaining limitations

Legacy native code, the JavaScript LZMA algorithm, OPL internals, compilers, npm packages and browsers are not proven free of defects. Comprehensive coverage-guided fuzzing, whole-engine native sanitizer testing, CodeQL, formal verification, publisher-signature verification and public-host penetration tests were not performed. Some C scanner regions only partially parsed. Trusted-origin compromise and browser defects remain outside this containment model.

Malformed or unusually complex local data can still cause unsupported behavior, traps, memory pressure or denial of service; validation and worker termination reduce exposure but do not establish universal compatibility or memory safety. Main-thread copies, decoder buffers and browser audio/graphics allocations exist outside WASM memory caps. Proprietary DOOM/DOOM II IWAD gameplay was not tested because those assets were not supplied. Physical mobile devices, audible audio quality and Safari were not validated by this reviewer; see the test report for actual browser/environment limitations.

Recheck the manifest and rerun relevant checks after any runtime, source, dependency, policy or packaging change. The final manifest binds delivered bytes; it does not authenticate a hosting origin.
