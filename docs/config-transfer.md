# Configuration transfer (copy between profiles)

One-shot selective configuration copy from a **source** profile to a **stopped
target** (#95). This is **not** synchronization and does not create a persistent
relationship between profiles.

## Intent

Operators reuse known-good settings on test, seasonal, or replacement servers
without cloning identity, paths, ports, saves, or cluster membership.

## Operator workflow

1. Overview → server card → **More options → Copy configuration…**, or
   workspace **Quick actions → Copy configuration** (source is the server you
   opened from).
2. Choose one or more distinct stopped targets (disabled profiles are valid
   while stopped).
3. Opt into categories (INI files, mods, raw launch args, backup policy,
   passwords). Category checkboxes select all items in that category; GUS
   YARK-owned keys stay locked. Merge vs Replace have tooltips explaining
   removals.
4. Build a redacted preview per target (fingerprint). Confirm, then apply to
   each selected target.
5. Review a target workspace when a single copy succeeded; YARK does **not**
   start or restart targets.

Source may be running; the copy always uses the persisted on-disk / profile
snapshot, not live ASA memory.

## Never copied

Profile ID/name, install directory, map, session name, game/query/RCON ports,
cluster ID/directory, enabled/auto-start, runtime state, saves, logs, history.

## Architecture (shared pipeline with #40 / #89 / #90)

| Piece | Location |
| --- | --- |
| Selection model | `src/shared/config-transfer.ts` |
| INI merge/replace compose | `src/backend/domains/config/ini-selection-compose.ts` |
| Preview / commit / fingerprint / rollback | `src/backend/domains/config/config-transfer-service.ts` |
| Owned-key reapply + secret redaction | `ini-compose.ts`, `yark-owned-ini-keys.ts` |
| Diff preview | `ini-preview.ts` + `ClusterIniDiffSummary` |
| Locks | `InstanceLockManager` purpose `config-transfer` |
| Pre-write snapshot | `.yark-pre-copy/<stamp>/` (+ optional catalog INI backup) |
| IPC | `config-transfer:describe` / `preview` / `commit` |

Cluster template apply (#89) remains the full-file template path; #95 adds
granular selection. Whichever feature lands first should keep composing through
shared helpers (`ini-compose`, locks, pre-write snapshots, redacted diffs) so
cluster templates (#40) and bulk apply (#90) can reuse the same engine.

### Commit order

1. Acquire target lock  
2. Assert stopped + fingerprint match  
3. Write `.yark-pre-copy` snapshot (+ optional catalog backup)  
4. INI files after composition + target-owned reapply (before profile update so
   async profile→INI sync cannot clobber copied rates; only selected INI files
   are written)  
5. Profile fields (mods / extraArgs / passwords)  
6. Backup policy schedule/retention (target `backupDir` is preserved)  
7. Emit one auditable event  

On failure after the first write, restore profile/policy/INI from the snapshot.
The source is never mutated.

## UI

`CopyConfigurationWizard` — Mantine `Modal` + `Stepper` (`size="sm"`,
`allowNextStepsSelect={false}`), same family as Create/Add cluster wizards.
Merge/Replace use Mantine `Tooltip`.

INI pickers group settings by the same ASA UI categories as the server
Configuration editor (Rates, Breeding, …), not raw `[Section]` headers.
Selection still maps to section+key for merge/replace compose.

Mods and launch arguments also expose Merge/Replace: merge appends missing
entries; replace overwrites the target list with the source list.

The Targets step lists destinations as checkboxes (select-all + per-server);
the source is fixed to the server that opened the wizard. Preview/commit run
once per selected target.

## Tests

- `tests/unit/ini-selection-compose.test.ts` — merge/replace + owned-key skip
- `tests/unit/ini-ui-category-tree.test.ts` — describe tree matches editor categories
- `tests/unit/copy-configuration-model.test.ts` — category/key selection helpers
- `npm run e2e:copy-configuration` — isolated Electron flow (source settings →
  two targets)
