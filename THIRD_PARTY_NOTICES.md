# Third-party notices

YARK server manager includes material from community and open sources. This file
records attribution for **embedded content shipped in the repository and
installer** (not runtime network fetches such as CurseForge thumbnails or
Wildcard’s official-status CDN).

YARK itself is licensed under [GPL-3.0-only](LICENSE). Third-party terms below
apply to the listed portions only.

---

## 1. Default INI templates — [Arkobat/ArkServerSettings](https://github.com/Arkobat/ArkServerSettings)

**Copyright:** Copyright (c) 2025 Arkobat  
**License:** [MIT License](https://github.com/Arkobat/ArkServerSettings/blob/master/LICENSE)

**Upstream path:** `SurvivalAscended/Default/` (`Game.ini`, `GameUserSettings.ini`)

**Used in YARK:**

| Path | Role |
| --- | --- |
| `src/shared/defaults/Game.ini` | Default ASA dedicated `Game.ini` body |
| `src/shared/defaults/GameUserSettings.ini` | Default ASA dedicated `GameUserSettings.ini` body |
| `src/shared/ini-setting-meta.json` | Editor metadata (`description`, `valueType`, defaults) generated from the files above (`npm run catalog:ini-meta`) |
| `src/shared/asa-setting-ui-categories-data.json` | INI editor category groupings derived from `ini-setting-meta.json` |

YARK may reorder sections, normalize placeholder values (e.g. empty `ActiveMods=`),
or edit comments. Game setting names and factual defaults originate from ARK /
community documentation; the **annotated comment blocks** trace to Arkobat’s
ASA template collection.

**MIT condition:** The copyright notice and permission notice above must appear
in copies or substantial portions of the Software (this file satisfies that for
the YARK distribution).

---

## 2. Launch-options catalog — [ark.wiki.gg](https://ark.wiki.gg/)

**Source page:** [Server configuration → Command line options](https://ark.wiki.gg/wiki/Server_configuration#Command_line_options)

**License:** Community wiki content on wiki.gg is typically under
[Creative Commons Attribution-ShareAlike](https://creativecommons.org/licenses/).
Confirm the current license on [ark.wiki.gg](https://ark.wiki.gg/) before release.

**Used in YARK:**

| Path | Role |
| --- | --- |
| `src/shared/asa-launch-options-catalog.json` | Versioned ASA launch-flag metadata (descriptions, ASA/ASE columns, examples) |
| `scripts/build-asa-launch-options-catalog.cjs` | Offline regeneration script (`npm run catalog:launch-options`) |

The wiki is **not** fetched at runtime. Operator-facing copy in the Launch tab
and browse catalog is cleaned YARK prose derived from wiki rows; each entry
retains `sources[]` pointing to the wiki section for audit.

**Attribution:** ARK Wiki contributors — [Server configuration](https://ark.wiki.gg/wiki/Server_configuration#Command_line_options)
(ark.wiki.gg). Adapted and reviewed by YARK.

If ShareAlike applies to the adapted text you ship, downstream redistribution
may need to comply with CC BY-SA (see Creative Commons FAQ).

---

## 3. ASA map thumbnails — Studio Wildcard promotional artwork

**Category:** Game media and promotional key art (map selection previews)

**Owner:** Studio Wildcard / Snail Games USA, Inc.

**License / terms:** Used under fair use and community fan-content guidelines for
non-commercial, illustrative, and informational purposes only. YARK claims no
ownership over this artwork and does not represent Studio Wildcard or Snail Games.

**Used in YARK:** Bundled WebP thumbnails in `src/renderer/src/assets/maps/`
for official ASA maps (`KNOWN_MAPS`). Shown in the server list, workspace header,
server form identity strip, Downloads queue, and app spotlight — not as standalone
merchandise or marketing for YARK itself.

| File | Map (ASA) |
| --- | --- |
| `TheIsland_WP.webp` | The Island |
| `ScorchedEarth_WP.webp` | Scorched Earth |
| `TheCenter_WP.webp` | The Center |
| `Aberration_WP.webp` | Aberration |
| `Extinction_WP.webp` | Extinction |
| `Ragnarok_WP.webp` | Ragnarok |
| `Astraeos_WP.webp` | Astraeos |
| `Genesis_WP.webp` | Genesis |
| `LostColony_WP.webp` | Lost Colony |
| `Valguero_WP.webp` | Valguero |

Each asset is derived from Studio Wildcard’s promotional / key art for the
corresponding ARK: Survival Ascended map, resized for in-app map identification
only. Custom mod maps use CurseForge mod logos at runtime instead (not bundled here).

**Attribution:** ARK: Survival Ascended and map names are trademarks of Studio
Wildcard and related rights holders. See [Trademarks](#trademarks) below.

---

## Trademarks

ARK: Survival Ascended, map names, and related marks are trademarks of their
respective owners. YARK is an independent community project and is not
affiliated with or endorsed by Studio Wildcard. See [README.md](README.md).
