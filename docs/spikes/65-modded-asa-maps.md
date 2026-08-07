# Spike #65: Modded ASA maps beyond `KNOWN_MAPS`

Research spike (not production UX). Branch: `spike/65-modded-maps`.

## Launch contract (current ASA / YARK)

| Concern | Where |
| --- | --- |
| Map load | CLI argv[0] map URL: `"${map}"?SessionName="…"` via `buildMapUrlArg` |
| Mods | CLI `-mods=id1,id2,…` from enabled `profile.mods` |
| ASE `ActiveMapMod` / `ActiveMods` | **Not used** — stripped as `aseLegacy` |
| Obsolete `-MapModID=` | Catalogued **unsupported**; live checklist must confirm map token + `-mods=` is enough |

YARK already accepts any non-empty `profile.map` string in validation. The create/edit UI currently locks the field to `KNOWN_MAPS` only. CurseForge `ModMetadata` has **no** dedicated launch-map field today (`summary`, `categories`, `thumbnailUrl` only — Worker does not return full description HTML).

Prototype helpers (tests only; not wired to UI/DB):

- [`src/shared/map-identity.ts`](../../src/shared/map-identity.ts) — official vs custom, validation, thumb fallback
- [`src/shared/map-token-suggest.ts`](../../src/shared/map-token-suggest.ts) — Maps category + `Map Name` / `Server Name` / `*_WP` heuristics

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

## Ticket questions

| Question | Answer |
| --- | --- |
| Launch token + INI for current ASA map mods? | Map token in argv[0]; Project ID on `-mods=`. Do **not** write `ActiveMapMod`. |
| Is CurseForge Project ID enough to derive the token? | **No.** Same `_WP` can map to free + Premium IDs (Svartalfheim, Forglar). Token comes from author text / operator input. |
| Must the map mod appear in `-mods=`? | **Yes** (observed hoster + author practice). Link via proposed `mapModId` and warn if disabled/missing. |
| Official vs custom identity? | Official = `map ∈ KNOWN_MAPS`. Custom = free-form `map` + optional `mapModId`. |
| Offline vs Mods metadata validation? | Offline: non-empty token, no spaces. Metadata: Maps category + heuristic when description available; thumb from `thumbnailUrl`. |
| Disabled / removed / unresolved map mod? | Keep `map` / `mapModId`; warn on Launch/start; do not auto-clear. |
| Clone / import / export? | Clone should copy `map` + `mapModId` with mods. Config transfer keeps map as **identity** (not copied). |

## Phase 1 product recommendation

1. **Happy path:** enable a Maps-category mod → extract token when possible → confirm dialog (editable) → set `map` + `mapModId`.
2. **Fallback (required):** Server Information → Map → **Custom…** free-text launch token when extract fails or operator declines. (**Shipped on this spike branch** via `ServerFormMapField`.)
3. **Thumb:** bundled art for official; mod logo (`thumbnailUrl`) for custom when `mapModId` is linked.
4. **Failure:** empty/invalid token blocks save/start; missing/disabled `mapModId` warns (soft).
5. Persist `mapModId` in SQLite in the implementation PR (not this spike).

```text
Enable Maps mod → extract? → confirm → map + mapModId
                    └ miss / dismiss → Server Information Custom map name
```

## Live validation (operator-owned Svartalfheim Premium)

Date: 2026-08-07. Install with Premium content; YARK profile on spike branch.

| Step | Result |
| --- | --- |
| Mods: enable `962796` | OK |
| Server Information → Map → **Custom…** → `Svartalfheim_WP` | OK (UI shipped on this branch) |
| Launch preview: map URL + `-mods=…962796…` | OK |
| Dedicated boot | ASA started downloading the map mod (CurseForge content pull) |
| `-MapModID=` | **Not used** — download proceeded with map token + `-mods=` only |
| Final join / world identity | Operator confirming after download completes (not a spike blocker) |

**Finding:** for Svartalfheim Premium, the ASA dedicated path accepts **`Svartalfheim_WP` + `-mods=962796`** without ASE `ActiveMapMod` or `-MapModID=`. That matches the YARK launch contract and unblocks Phase 1 implementation.

## Prototype status

| Deliverable | Status |
| --- | --- |
| Evidence catalog + Q&A | Done (this doc) |
| `map-identity` / `map-token-suggest` + unit tests | Done |
| ServerForm **Custom…** map token | Done on spike branch (covers core of #191) |
| Persist `mapModId`, Mods auto-suggest, thumbs, warnings, Worker description | Follow-up issues below |
| Live boot | Validated through mod download; world confirm optional |

## Implementation plan (Phase 1+)

Recommended order after merging this spike:

1. **[#190](https://github.com/gabomarin/yark/issues/190)** — Persist optional `mapModId`; wire `validateMapIdentity` / clone; keep config-transfer map as identity.
2. **[#191](https://github.com/gabomarin/yark/issues/191)** — Close or slim: Custom Select already landed here; remaining = optional “Map mod Project ID” companion field + polish.
3. **[#192](https://github.com/gabomarin/yark/issues/192)** — Mods enable → extract/confirm (needs #195 for high hit rate); on miss, hint to Custom map.
4. **[#195](https://github.com/gabomarin/yark/issues/195)** — Worker optional description text for `Map Name:` heuristics.
5. **[#193](https://github.com/gabomarin/yark/issues/193)** — Custom map thumb from mod `thumbnailUrl`.
6. **[#194](https://github.com/gabomarin/yark/issues/194)** — Launch/start warnings when `mapModId` disabled/missing.

Do **not** revive `ActiveMapMod` / `-MapModID=` unless a later map fails the token + `-mods=` path.

## Follow-up issues

1. [#190](https://github.com/gabomarin/yark/issues/190) — Persist `mapModId` + official/custom validation
2. [#191](https://github.com/gabomarin/yark/issues/191) — ServerForm Custom map (partially done; remaining companion field)
3. [#192](https://github.com/gabomarin/yark/issues/192) — Mods enable → extract/confirm; on miss, hint to Custom
4. [#193](https://github.com/gabomarin/yark/issues/193) — Mod logo thumbnails for custom maps
5. [#194](https://github.com/gabomarin/yark/issues/194) — Warn when map mod disabled/missing
6. [#195](https://github.com/gabomarin/yark/issues/195) — CurseForge Worker description for heuristics
