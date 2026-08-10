# Mods (workspace CurseForge load order)

Per-server CurseForge Project ID inventory for ASA dedicated servers: discover /
add by ID or ASA mod URL, enable/disable without dropping IDs, drag load order,
and emit `-mods=` on launch for **enabled** IDs only.

Worker abuse controls and URL ownership:
[curseforge-proxy.md](curseforge-proxy.md). Custom map packs (`mapModId`) and
Start blockers: [server-lifecycle.md](server-lifecycle.md#custom--modded-maps-65-phase-1).
Research archive: [spikes/65-modded-asa-maps.md](spikes/65-modded-asa-maps.md).

## Intent

- Keep mod identity on the **profile** (`mods` / `disabledMods`), not in INI.
  `syncProfileSettingsToIni` never writes mods — ASA receives them via `-mods=`.
- Resolve display metadata through the CurseForge **proxy Worker**. The Electron
  app never holds a CurseForge API key.
- Allow operators to stage mods **disabled** (new adds start disabled) so load
  order can be prepared before a restart.
- Persist Mods and Launch edits as **narrow patches** (`servers:update-patch`) so
  concurrent panel saves merge instead of last-write-wins (#209).

## Module map

| Role | Path |
| --- | --- |
| Metadata client | `src/backend/domains/mods/mods-service.ts` |
| Offline / unit mock catalog | `src/backend/domains/mods/mock-mod-catalog.ts` |
| Add-input parse / batched URL resolve | `src/shared/mod-add-input.ts` |
| Proxy URL normalize + not-configured error | `src/shared/curseforge-proxy-url.ts` |
| Build-time official URL inject | `src/shared/curseforge-proxy-build-url.ts` |
| Launch `-mods=` | `src/backend/domains/instances/launch-args.ts` |
| Map-mod category / token heuristics | `src/shared/map-token-suggest.ts`, `src/shared/map-identity.ts` |
| Profile patch merge | `src/shared/server-profile.ts` |
| Workspace UI | `…/ServerModsPanel/*` (`ServerModsPanel.tsx`, `serverModsModel.ts`, `serverModsListMutations.ts`) |
| Load-order table | `ServerModsTable.tsx` via [YarkDataTable](datatable.md) |
| Enrich on create / full update / patch | `src/main/ipc-handlers.ts` → `ModsService.enrichNewServerMods` |
| IPC | `mods:*` channels in `src/shared/ipc.ts` (+ Zod in `channel-schemas.ts`) |

## Profile fields

| Field | Storage | Meaning |
| --- | --- | --- |
| `mods` | SQLite JSON array | Configured Project IDs in **load order** |
| `disabledMods` | SQLite JSON array | Subset of `mods` omitted from `-mods=` |
| `modMetadataCache` | SQLite JSON object | Last known `ModMetadata` per ID (name, thumb, categories, …) |
| `mapModId` | column (nullable) | Linked Maps pack for custom `map` — **not** managed on the Mods tab; set under Server Information → Map |

`disabledMods` entries that are not in `mods` are stripped on enrich/persist.

## Operator workflows

Workspace → **Mods** has two views (`SegmentedControl`):

### Server (inventory)

1. Rows follow profile load order (`YarkDataTable` + drag handle).
2. **Enable / disable** toggles membership in `disabledMods` (ID stays in `mods`).
3. **Remove** drops the ID from `mods` / `disabledMods` and clears its cache entry
   (confirm dialog).
4. Column sort is **view-only** — clear sort before drag-reorder (drag disabled
   while sorted or while any row mutation / reorder persist is busy).
5. Detail drawer / Open on CurseForge uses cached metadata or
   `mods:get-by-reference`; external open is fail-closed to a validated ASA
   CurseForge mod URL (`mods:open-curseforge`).

### Discover

1. Search calls `mods:search` (Worker `/v1/mods/search`).
2. Add resolves the row through `mods:get-by-reference`, then persists.

### Add by Project ID / URL

Comma-separated Project IDs and/or ASA CurseForge mod URLs
(`parseModAddInput` / `prepareModAddApply`). URLs resolve in batches of
**5** (`MOD_ADD_URL_BATCH_SIZE`) with progress UI; each successful batch
persists immediately so a partial import is not lost.

**New IDs start disabled.** Re-adding an already-configured ID keeps its enable
state and refreshes cache when metadata is returned.

### Maps mods (#192)

Enabling a mod whose metadata categories match `/\bmaps?\b/i` shows a toast:
map is **unchanged**; pick under Server Information → Map → **Map mods** (or
Custom…). If no launch token can be inferred, YARK may re-fetch metadata
(Worker description) to enrich the cache, then still leave map selection to the
operator.

## Launch composition

`buildLaunchArgs` filters `profile.mods` with `disabledMods`:

```text
-mods=<enabledId1>,<enabledId2>,...
```

Order matches the `mods` array. Empty enabled set → no `-mods=` flag.

Example (logical argv fragment):

```text
"TheIsland_WP"?SessionName="MyServer" -port=7777 -ServerPlatform=ALL -mods=929420,947033
```

## Metadata resolution

`ModsService.getBaseUrl()` precedence (no silent fallback to a committed Worker
URL in source):

1. `process.env.YARK_CURSEFORGE_PROXY_URL` (non-empty → normalize or throw)
2. Constructor `baseUrl` (tests / DI)
3. Build-injected `BUILD_CURSEFORGE_PROXY_URL` (release bake; empty in local
   source builds without env)

Malformed non-empty values throw. Missing endpoint →
`MetadataServiceNotConfiguredError` (`METADATA_SERVICE_NOT_CONFIGURED`). Existing
configured IDs still launch; search / refresh / new-ID enrich need an endpoint.

| Method | Worker route | Notes |
| --- | --- | --- |
| `getMod` | `GET /v1/mods/:id` | |
| `getMods` | `POST /v1/mods` | Returns only resolved items; skipped IDs omitted |
| `search` | `GET /v1/mods/search` | |
| `getByReference` | ID → get; ASA URL/slug → search | Rejects non-ASA CurseForge URLs |

`useMockCatalog: true` serves `MOCK_MOD_CATALOG` (unit tests). Production main
leaves this false.

IPC accepts an optional `forceRefresh` boolean on get/get-many; `ModsService`
currently ignores it (Worker Cache-API still applies on the edge).

### Enrich on write

`enrichNewServerMods` runs on create, full `servers:update`, and
`servers:update-patch` (mods group):

- **New** Project IDs must be numeric (no leading zeros) and Worker-resolvable
  as ASA mods; client-supplied cache for new IDs is **not** trusted.
- Existing IDs keep prior cache without re-fetch (offline / legacy edits).
- Cache keys not in the configured list are pruned.

## Persist path (#209)

Mods panel writes:

```ts
window.api.updateServerPatch(serverId, {
  group: "mods",
  mods,
  disabledMods,
  modMetadataCache,
});
```

Main merges the patch onto the latest SQLite profile inside
`instances.withProfileWrite` / `updateWithPrepare`, then re-runs enrich. Launch
panel uses `group: "launch"` the same way so Launch and Mods do not clobber each
other.

## IPC surface

| Channel | Preload API |
| --- | --- |
| `mods:get` | `getModMetadata(modId, forceRefresh?)` |
| `mods:get-many` | `getModsMetadata(modIds, forceRefresh?)` |
| `mods:search` | `searchMods(query, options?)` |
| `mods:get-by-reference` | `getModByReference(ref)` |
| `mods:open-curseforge` | `openCurseForgeMod(url)` |
| `servers:update-patch` | `updateServerPatch(id, patch)` (mods group) |

Args are Zod-validated — [ipc-validation.md](ipc-validation.md).

## Related surfaces

| Topic | Doc / location |
| --- | --- |
| Proxy rate limits, cache, secret rotation | [curseforge-proxy.md](curseforge-proxy.md) |
| Custom map Start blockers / `mapModId` | [server-lifecycle.md](server-lifecycle.md) |
| Copy mods between profiles | [config-transfer.md](config-transfer.md) (mods category; map identity never copied) |
| Cluster compliance hint on mod lists | [clusters.md](clusters.md) |
| Table UX contract | [datatable.md](datatable.md) |
| Public operator guide | website `docs/mods.mdx` |

## Pitfalls

- **No key in the desktop app.** Point local/dev builds at a Worker with
  `YARK_CURSEFORGE_PROXY_URL`; do not embed Overwolf secrets in Electron.
- **New mods are disabled** until the operator enables them — easy to miss when
  checking the Launch command preview.
- **Column sort blocks drag.** Clear sort to edit load order; view sort never
  mutates `mods`.
- **Batch get is partial.** Callers that need every ID must compare result length
  to the request (enrich already fails hard on missing new IDs).
- **Not-configured vs hard errors.** UI treats the not-configured message as a
  warning so inventory stays usable offline; other proxy failures surface as
  errors.
- **Open external is ASA-only.** Non-ASA CurseForge URLs are rejected before
  `shell.openExternal`.
- **Map toast ≠ map change.** Enabling a Maps mod never writes `map` /
  `mapModId`; Start still enforces identity rules on the Server / Launch path.

## Verification

```bash
npm test -- tests/unit/mods-service.test.ts
npm test -- src/renderer/src/features/server-workspace/components/ServerModsPanel
npm run typecheck
```

Also covered by shared patch / map-identity unit tests and workspace panel tests
under `ServerModsPanel/*.test.*`.
