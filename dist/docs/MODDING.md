# Local resource packs

This edition runs the original Doom game rules. It accepts a complete Doom-format IWAD and up to four vanilla-format PWAD overlays. All files stay in the tab's memory. There is no upload endpoint, account, filesystem persistence or executable mod loader.

## Load a game and packs

1. Start the included full Freedoom Phase 1 0.13.0, or select a legally obtained `DOOM.WAD` / `DOOM2.WAD` as the base game. The file's map content determines Doom I / Ultimate Doom / Doom II mode; its filename does not.
2. Add `.wad` PWAD files under Resource packs. Toggle their checkboxes to enable/disable, Move up to reorder, or Remove to discard. Later (lower) enabled packs override earlier packs.
3. Start game, or choose Apply changes & restart. Confirming discards the running session. Validation of the combined game happens before the engine starts. Invalid assets produce a recoverable message; reset to Freedoom or remove the offending pack.

Limits: 48 MiB per base IWAD; 16 MiB per PWAD; four packs and 32 MiB of packs total; 16,384 directory entries; combined expanded lump data / assembled WAD at most 80 MiB. No ZIP, PK3, executable, compressed user WAD, external URL, save-file or demo import. Only the pinned built-in Freedoom asset uses LZMA.

## Formats that work

| Asset | Format / rule |
| --- | --- |
| Enemies, weapon frames, HUD | Classic Doom column/post patches using the base palette. Sprite names identify a four-character actor plus frame and rotation, e.g. `TROOA1`. Vanilla frame characters span ASCII A through ] (29 frames); rotations are 0–8. |
| Animations | Replace the existing named frames. The engine's frame order/timing and behavior remain unchanged. Supply all required rotations for new sprite families. |
| Wall textures | Existing named patches, or complete compatible `PNAMES` plus `TEXTURE1` / `TEXTURE2` tables. |
| Floors / ceilings | 4,096-byte palette-indexed 64×64 flats inside `F_START` / `F_END`. |
| Sound effects | `DS*` DMX format 3, unsigned 8-bit mono PCM with a valid sample-rate/count header, 4–48 kHz. |
| Music | `D_*` MUS or standard MIDI type 0/1 with PPQN timing. MIDI is converted in the worker to MUS and synthesized with the base `GENMIDI` OPL instruments. SMPTE MIDI timing, extended controllers and tracks too large for MUS are unsupported. |
| Maps | Complete vanilla Doom binary map blocks: marker, THINGS, LINEDEFS, SIDEDEFS, VERTEXES, SEGS, SSECTORS, NODES, SECTORS, REJECT, BLOCKMAP. E1M1–E4M9 or MAP01–MAP32. |

Keep replacement image dimensions within 1024×255 and texture definitions within 1024×256. Vanilla-format BSP nodes must reference earlier nodes, have depth at most 128 and valid subsectors. Build a full REJECT table and standard BLOCKMAP. Zero-size/extended/compressed nodes and partial map blocks are rejected. Engine capacity checks may stop very complex maps safely even after file validation succeeds.

## Create an enemy appearance pack

Use an established WAD editor such as SLADE to open a **copy** of your permitted assets. Create a PWAD, add `S_START`, import replacement frames using the base palette and the exact original sprite names, then add `S_END`. Preserve the sprites' intended offsets and compatible dimensions. Export as `.wad`, load it, and test from multiple angles. Replacing `TROO` frames changes the corresponding monster's appearance while its health, attacks, AI and collision behavior remain the original engine's. Do not include DEHACKED or scripts.

The manager merges sprites and flats inside the base game's canonical namespaces, so partial sprite appearance packs do not hide the rest of the base sprites. Existing asset names replace matching entries. A map pack replaces a whole ten-lump map block at its marker. New maps may be appended, but the original episode/map menus and progression still apply. Texture definition tables replace the entire named table, so include all definitions needed by the base maps.

Only trust packs from sources you know. Validation reduces malformed-file risk; it cannot establish authorship or legal rights. The worker is terminable, and unhandled legacy engine faults can still end a session.

## Extension points

`src/wad.ts` owns the typed `Lump`/`Wad` model, parsing, merging and validation. `src/main.ts` owns the in-memory ordered pack catalog. `src/engine.worker.ts` owns assembly and the engine boundary. Core engine gameplay does not need changes to add new data packs.

A future visual editor should emit this same `Lump[]` model, export a PWAD, and run the exact validator before preview. It can offer palettes, offsets and animation-frame previews without changing engine code. Future custom enemy behavior needs a separate versioned schema, explicit allowlisted fields and engine validation; arbitrary JavaScript, DEHACKED, ACS, DECORATE and ZScript are deliberately not supported today. There is no visual editor or behavior editor in this release.
