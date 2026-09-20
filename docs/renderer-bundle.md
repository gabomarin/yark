# Renderer bundle and memory baseline

Issue [#147](https://github.com/gabomarin/yark/issues/147) owns the bundle
measurement workflow. Issue [#527](https://github.com/gabomarin/yark/issues/527)
uses its results to decide whether a renderer surface should load lazily.

## Bundle report

Run this from the repository root:

```powershell
npm run build:report
```

It performs the normal production `electron-vite build` and writes an ignored
machine-readable report to `artifacts/renderer-bundle-report.json`. The report
lists each JavaScript chunk's raw and gzip sizes, its static/dynamic imports,
and modules sorted by rendered bytes. The command does not introduce chunking,
change the normal `npm run build`, or ship the report in a release package.

The Electron E2E CI job runs the command and uploads that JSON as the
`renderer-bundle-report` workflow artifact. Compare reports from the same
build configuration; a bundle report shows JavaScript bytes, not renderer RAM.

Module `renderedBytes` / `originalBytes` currently come from Rollup's
`renderedLength` / `originalLength` estimates (JavaScript string lengths,
before final chunk rendering). They are attribution estimates, not exact
UTF-8 byte counts or gzip sizes for each module. Chunk raw/gzip sizes are
computed from the actual emitted JavaScript. Gzip is a comparison metric;
Electron reads local JavaScript from disk.

## Windows working-set baseline

Measure a packaged Windows build on one machine class before and after a
candidate split. Record the commit, app/Electron version, Windows version,
screen state, wait time after startup, and profile count. In Task Manager,
record **working set** separately for YARK's browser/main, renderer, and GPU
processes; do not treat the aggregate as renderer memory.

Use this small matrix after the app has settled on Overview:

| Scenario                           | Purpose                                   |
| ---------------------------------- | ----------------------------------------- |
| `electron-fluent-ui` template idle | Electron/UI reference on the same machine |
| YARK, zero profiles                | Shell and startup graph baseline          |
| YARK, representative profile fleet | Retained fleet-state increment            |
| YARK, INI Files tab open           | Editor/catalog increment                  |

Keep all four runs comparable: packaged production builds, identical GPU
acceleration setting, same window size, and the same post-start delay. The
template is a reference, not a target: YARK legitimately has profile, SQLite,
and operational state that the template may not load.

### OS counter snapshot

With a known main-process PID for an isolated test app, run:

```powershell
./scripts/validation/snapshot-app-memory.ps1 -RootProcessId 12345 `
  -Label "yark-empty-1" -OutputPath artifacts/yark-empty-1.json
```

The script reads the process tree and Windows performance counters without
attaching DevTools. It writes bytes per PID/role and prints MiB.

On locked-down Windows sessions where CIM/WMI is unavailable, it falls back to
`Get-Process` and records aggregate working set/private commit for the root and
same-executable helper processes; role-specific private working set is then
reported as unavailable. Treat that fallback as directional evidence and repeat
the final comparison on a machine with CIM access.

Record:

- Working set: resident pages, including pages shared with other processes.
- Private working set: resident pages belonging only to that process.
- Private commit: committed private virtual memory, which need not all be resident.

Do not compare these metrics interchangeably or sum working sets as unique
physical RAM. For Task Manager comparisons, record the exact column name.
Run three fresh processes per scenario, settle for at least 60 seconds,
keep the window visible and the screen state unchanged, and report medians
with ranges. Restart between runs; record warm disk/browser caches. Also
sample Overview after leaving INI to distinguish first-use growth from
persistent allocations. Avoid builds/tests during memory collection.

## Decision rule

Only lazy-load a surface when the report and the working-set comparison point
to a meaningful, infrequently used cost. Test its loading and import-failure
states, keep chunks local to the packaged app, and repeat the matrix above.
Do not add a Windows memory budget to CI; those readings are too noisy for a
reliable merge gate.

## Investigation results (#527)

Packaged `win-unpacked` build from this worktree; isolated `--user-data-dir`
under `artifacts/mem-bench/` (not installed AppData). Three fresh launches per
scenario, ≥60 s settle, CIM collection via
`scripts/validation/snapshot-app-memory.ps1`. Medians of **renderer** working
set / private working set:

| Scenario                    | Renderer WS (median) | Renderer private WS (median) |
| --------------------------- | -------------------- | ---------------------------- |
| Empty Overview (0 profiles) | ~113 MiB             | ~43 MiB                      |
| Six-profile fleet Overview  | ~133 MiB             | ~60 MiB                      |
| INI Files tab open (fleet)  | ~190 MiB             | ~113 MiB                     |

Main stayed ~137–141 MiB WS across scenarios. Ticket baseline for idle was
~**250 MiB** (aggregate / earlier builds); post-split idle renderer is
materially lower. Hide-to-tray does not drop renderer RAM (window hide keeps
the React tree).

Bundle before the first split: one entry chunk (~4.1 MB raw / ~786 KB gzip),
no dynamic imports. After lazy `WorkspaceTabs` panels: entry ~3.4 MB / ~661 KB
gzip plus five deferred chunks (~692 KB / ~132 KB gzip). Bundle bytes are not
a RAM guarantee.

`WorkspaceTabs` lazy-loads Mods, Launch, Maintenance, Logs, and Ark Server API.
INI, RCON, and Backups stay synchronous for the existing tab contract. Seed a
six-profile fixture with:

```powershell
node scripts/validation/seed-mem-bench-fleet.cjs
```

### Follow-up (not in this change)

- The INI open spike is mostly dense settings rows (no list virtualization),
  not the on-disk `.ini` size. Consider a separate ticket to virtualize INI
  rows if that peak matters for operators who leave the editor open.
- Do not add further lazy boundaries without a new report + working-set
  comparison. Phase 3 CI memory budgets stay out of scope (#147).
