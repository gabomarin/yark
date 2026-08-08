# Spike #65: Modded ASA maps beyond `KNOWN_MAPS`

Research spike and live-validation archive. Branch: `spike/65-modded-maps`.

**Phase 1 status (shipped / in PR):** `mapModId` persistence (#190), Custom… + Map mods
grouped select (#191 / #192), enable toast without overwriting map (#192), Worker
Maps-only description (#195), Launch alert + Start blockers (#194). Operator docs:
website **Mods → Maps / custom worlds**, **Profiles & ports → Map field**, **Start, stop,
restart → Map identity checks**. Engineering SoT: [server-lifecycle.md](../server-lifecycle.md)
(Custom / modded maps). Remaining: optional custom-map thumb (#193); optional companion
Project ID field polish under #191.

## Launch contract (current ASA / YARK)

| Concern | Where |
| --- | --- |
| Map load | CLI argv[0] map URL: `"${map}"?SessionName="…"` via `buildMapUrlArg` |
| Mods | CLI `-mods=id1,id2,…` from enabled `profile.mods` |
| ASE `ActiveMapMod` / `ActiveMods` | **Not used** — stripped as `aseLegacy` |
| Obsolete `-MapModID=` | Catalogued **unsupported**; live checklist must confirm map token + `-mods=` is enough |

YARK accepts any non-empty `profile.map` string in validation. Server Information groups
**Official / Map mods / Custom…**; optional `mapModId` links a custom token to its pack.
Worker returns truncated plain-text `description` for **Maps**-category mods only (not search
rows; not every batch item).

Helpers / UI:

- [`src/shared/map-identity.ts`](../../src/shared/map-identity.ts) — official vs custom, validation, Start blockers
- [`src/shared/map-token-suggest.ts`](../../src/shared/map-token-suggest.ts) — Maps category + `Map Name` / `Server Name` / `*_WP` heuristics (uses `description` when present)
- [`ServerFormMapField`](../../src/renderer/src/features/servers/components/ServerForm/ServerFormMapField.tsx) — grouped Map select

## Evidence catalog

Sources: CurseForge author pages, arkcodes.com mirrors, ArkStatus / BattleMetrics observations (2026-08). Re-verify Project IDs via the CurseForge Worker when implementing Phase 1.

| Mod | CurseForge | Project ID | Launch token | Notes |
| --- | --- | --- | --- | --- |
| **Svartalfheim Premium** (live target) | [svartalfheim-premium](https://www.curseforge.com/ark-survival-ascended/mods/svartalfheim-premium) | `962796` | `Svartalfheim_WP` | Operator-owned; free sibling `893657` shares the same token |
| Amissa | [amissa](https://www.curseforge.com/ark-survival-ascended/mods/amissa) | `965379` | `Amissa_WP` | Classic `Map Name:` + `Mod ID:` block |
| Forglar Premium | [forglar-premium](https://www.curseforge.com/ark-survival-ascended/mods/forglar-premium) | `1009169` | `Forglar_WP` | Premium vs outdated free `935835` |
| Lost City | [lost-city-map](https://www.curseforge.com/ark-survival-ascended/mods/lost-city-map) | `1187557` | `LostCity_WP` | CamelCase token ≠ slug |
| Mythica Premium | [mythica-premium-crossplatform-pc](https://www.curseforge.com/ark-survival-ascended/mods/mythica-premium-crossplatform-pc) | `1313888` | `Mythica_WP` | Confirm on author page; servers show display name “Mythica” |
| Appalachia | [appalachia](https://www.curseforge.com/ark-survival-ascended/mods/appalachia) | `935306` | `Appalachia_Official_WP` | Uses **Server Name:** label |
| Eden Premium (extra) | [eden-crossplatform-pc](https://www.curseforge.com/ark-survival-ascended/mods/eden-crossplatform-pc) | `1149056` | `Eden_WP` | Same author pattern as Eden page |

Unit fixtures for extraction live in `tests/unit/map-token-suggest.test.ts`.

## Description / summary gap

| Source text | Typical content | Heuristic result |
| --- | --- | --- |
| `name` + `slug` + short `summary` | Marketing blurb; no `*_WP` | **Miss** (e.g. Svartalfheim Premium slug ≠ token) |
| Full CurseForge **description** | `Map Name: Foo_WP` / `Server Name: …` | **Hit** for all catalog fixtures above |

**Conclusion:** reliable auto-suggest needs either (a) Worker/`ModMetadata` optional plain-text `description` (or equivalent), or (b) operator-entered custom map in Server Information. Phase 1 must ship **(b)** regardless; **(a)** unlocks high hit-rate Mods-panel prompts. Do **not** scrape CurseForge HTML from the Electron app.

**Phase 1 (#192 / #195) — shipped:** no Project ID catalog. Worker exposes truncated
description for Maps mods; enable toast (no map overwrite); Map Select groups Official /
Map mods / Custom….

## Ticket questions

| Question | Answer |
| --- | --- |
| Launch token + INI for current ASA map mods? | Map token in argv[0]; Project ID on `-mods=`. Do **not** write `ActiveMapMod`. |
| Is CurseForge Project ID enough to derive the token? | **No.** Same `_WP` can map to free + Premium IDs (Svartalfheim, Forglar). Token comes from author text / operator input. |
| Must the map mod appear in `-mods=`? | **Yes — required for a correct custom-map boot.** Custom launch token alone is not enough; the map pack Project ID must be **enabled** on Mods so it appears in `-mods=`. Live-validated with Svartalfheim Premium. |
| Official vs custom identity? | Official = `map ∈ KNOWN_MAPS`. Custom = free-form `map` + linked `mapModId` (recommended). |
| Offline vs Mods metadata validation? | Offline: non-empty token, no spaces. Metadata: Maps category + heuristic when description available; thumb from `thumbnailUrl`. |
| Disabled / removed / unresolved map mod? | Keep `map` / `mapModId`; **alert the operator** on Launch preview and start (inconsistency); do not auto-clear. |
| Clone / import / export? | Clone should copy `map` + `mapModId` with mods. Config transfer keeps map as **identity** (not copied). |

## Consistency rule (spike outcome — must ship in Phase 1)

For a **custom** map, a correct dedicated boot needs **both**:

1. `profile.map` = author launch token (e.g. `Svartalfheim_WP` via Custom…), and  
2. The map’s CurseForge Project ID **enabled** in Mods → present on `-mods=`.

If either side is missing or the linked `mapModId` is disabled / not on the mods list, YARK should **surface an explicit operator alert** (Launch tab + start path). Soft-warn is the minimum; blocking start is acceptable once `mapModId` is persisted (#190 / #194).

`validateMapIdentity` already returns warnings for “not on mods list” / “disabled”; wire those into UI/start in #194.

## Phase 1 product recommendation (as shipped)

1. **Happy path:** enable a Maps-category mod → toast (map unchanged) → operator picks under Map → **Map mods** → sets `map` + `mapModId`. (No confirm dialog; no hardcoded Project ID catalog.)
2. **Fallback:** Server Information → Map → **Custom…** free-text launch token when extract fails.
3. **Consistency alerts:** Launch yellow alert + **Start blocked** when custom map / `mapModId` inconsistent (#194).
4. **Thumb:** bundled art for official; custom mod-logo thumb still [#193](https://github.com/gabomarin/yark/issues/193).
5. **Failure:** empty/invalid token blocks save; missing/disabled/unset map mod blocks Start.
6. Persist `mapModId` in SQLite (#190).

```text
Enable Maps mod → toast (map unchanged) → Map → Map mods | Custom…
```

## Live validation (operator-owned Svartalfheim Premium)

Date: 2026-08-07. Install with Premium content; YARK profile on spike branch.

| Step | Result |
| --- | --- |
| Mods: enable `962796` | OK |
| Server Information → Map → **Custom…** → `Svartalfheim_WP` | OK (UI shipped on this branch) |
| Launch preview: map URL + `-mods=…962796…` | OK |
| Dedicated boot | ASA downloaded + installed mod `962796`, loaded mods, advertised for join |
| Commandline (ASA log) | `"Svartalfheim_WP?SessionName=…"` `-mods=962796` (no `-MapModID`) |
| Join timeout (initial) | **False alarm for the map** — operator had `-exclusivejoin` without whitelist; same timeout on The Island |
| Join after removing exclusivejoin | Unblocked; map path confirmed viable |

**Findings:**

1. Svartalfheim Premium boots with **`Svartalfheim_WP` + enabled `-mods=962796`** only — no `ActiveMapMod` / `-MapModID=`.
2. **Both** custom map token and enabled map mod are required for a correct custom-map server; YARK should alert on inconsistency (#194).
3. Join failures with `-exclusivejoin` and an empty whitelist are operator/config issues, not map-mod failures.

## Prototype / Phase 1 status

| Deliverable | Status |
| --- | --- |
| Evidence catalog + Q&A | Done (this doc) |
| `map-identity` / `map-token-suggest` + unit tests | Done |
| ServerForm Official / Map mods / **Custom…** | Done (#191 / #192) |
| Persist `mapModId` + clone / official clear | Done (#190) |
| Mods enable toast (no map overwrite) | Done (#192) |
| Worker Maps-only description | Done (#195) |
| Launch alert + Start blockers | Done (#194) |
| Custom map thumb from mod logo | Open [#193](https://github.com/gabomarin/yark/issues/193) |
| Live boot | Validated end-to-end (install + advertise); join fixed after removing `-exclusivejoin` |

Do **not** revive `ActiveMapMod` / `-MapModID=` unless a later map fails the token + `-mods=` path.

## Follow-up issues

1. ~~[#190](https://github.com/gabomarin/yark/issues/190) — Persist `mapModId`~~ (shipped)
2. [#191](https://github.com/gabomarin/yark/issues/191) — Optional companion Project ID field / polish (Custom… already shipped)
3. ~~[#192](https://github.com/gabomarin/yark/issues/192) — Mods enable → Map select path~~ (toast + Map mods group; no confirm dialog)
4. [#193](https://github.com/gabomarin/yark/issues/193) — Mod logo thumbnails for custom maps
5. ~~[#194](https://github.com/gabomarin/yark/issues/194) — Launch/start when map mod disabled/missing~~ (shipped)
6. ~~[#195](https://github.com/gabomarin/yark/issues/195) — CurseForge Worker description for heuristics~~ (shipped; Maps-category only on batch)
