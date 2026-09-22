# Hosted Resources (experimental, loopback HTTP)

Hosted Resources serves versioned **text**, **INI**, or **JSON** bodies over a
local-only URL that ASA can fetch directly:

```
http://127.0.0.1:<port>/r/<token>
```

It replaces ad-hoc Gist / Pastebin / external-web-server workarounds for settings that
expect an HTTP URL body (for example `AdminListURL`, `BanListURL`). The experiment is
**off by default** and ships behind an **Experimental** chip in the sidebar.

## Lifecycle

- The listener binds **only** to `127.0.0.1`. There is no LAN, WAN, HTTPS, or
  reverse-proxy mode in this experiment.
- URLs stop working the moment YARK exits, even if ASA keeps running. A URL is also
  invalid after a port change or when another process owns the port.
- Disabled resources are never served; only the single saved version of an
  enabled resource is reachable.
- Disabling is immediate, including after a restart, and is reversible — re-enabling
  serves the current version again.

## Operator workflow

1. Open **Hosted Resources** in the sidebar and turn the host on.
2. Set one port (default `8935`) and **Apply port**. If the port is busy, the host
   fails closed and shows an error — YARK never assumes an open port belongs to it.
3. **New resource**: pick a display name, a **type** (Admin list, Ban list, or Dynamic
   config) when the body is for a known ASA setting, and the format that type implies,
   then paste the body and **Create resource**. Add optional operator notes and tags.
   Tags are free-form categorization; the type is what setting selectors match on. The
   editor shows a live UTF-8 size counter and enforces the **512 KB** cap per version.
4. Assign the URL: pick the resource from the setting's selector (see
   [Setting selectors](#typed-resources-and-setting-selectors)), or copy the URL and paste
   it into the setting or mod config that expects it (for example `AdminListURL` in
   `GameUserSettings.ini`).
5. To change the body, use **Edit** and **Save**. Every save keeps the previous version
   listed under **Revisions**, where it can be **restored**. The swap is atomic, so a
   request always sees exactly one version.
6. **Disable** stops serving immediately (reversible); **Delete** removes the resource
   and its versions.

## Diagnostics

**Run diagnostics** performs three independent checks and reports a summary as
**Healthy**, **Attention needed**, or **Unavailable**. They are intentionally
separate — none of them proves the game accepted the resource:

| Check                 | What it proves                                                                   |
| --------------------- | -------------------------------------------------------------------------------- |
| Loopback ownership    | A loopback request answered with YARK's marker header, so the port is ours       |
| Served bytes          | A loopback GET of each resource hashes to the declared SHA-256                   |
| Discovered references | A managed server INI contains a YARK URL, with stale-port and disabled references identified |

Each resource is reported as **Verified**, **Content changed**, **Unreachable**,
**Disabled**, or **Nothing published**. Request counts are external requests since
YARK started; Diagnostics' own verification requests are excluded. A served match
only means YARK returned those bytes; it does not mean ASA loaded them. References
cover YARK-managed `GameUserSettings.ini` files and each server's launch arguments — a
consumer can take its URL from a flag, and a mod may embed one in its own argument.
A URL using a previous serving port is recognized
by its resource token and marked **Previous port**; it still needs to be updated manually.

## Known consumers (ASA)

| Consumer                                         | Expected body                         | Where it is set                        |
| ------------------------------------------------ | ------------------------------------- | -------------------------------------- |
| `AdminListURL`                                   | Plain text, one EOS / Ark id per line | `GameUserSettings.ini` (RCON → Admins) |
| `BanListURL`                                     | Plain text ban entries                | `GameUserSettings.ini`                 |
| `BadWordListURL` / `BadWordWhiteListURL`         | Plain text word list                  | `GameUserSettings.ini`                 |
| `CustomDynamicConfigUrl` (+ `-UseDynamicConfig`) | **INI** — flat `Key=Value` lines      | Launch arg or `GameUserSettings.ini`   |
| `CustomNotificationURL` (`-CustomNotificationURL`) | Plain text / HTML notification page | Launch arg                             |
| `CustomLiveTuningUrl`                            | **JSON**                              | Launch arg or `GameUserSettings.ini`   |

`CustomDynamicConfigUrl` only accepts **HTTP** (HTTPS is unsupported), which is exactly
what the loopback host provides. ASA re-reads the dynamic config on world (auto)save or
after `ForceUpdateDynamicConfig`, so the YARK-exit availability caveat applies there too.

Mod settings are a different story: ASA mods read their options from local
`[ModSettings]` / per-mod sections of `GameUserSettings.ini`, and Ark Server API plugins
read a local `config.json`. Neither fetches INI over HTTP, so the loopback host does not
serve mod settings.

### Typed resources and setting selectors

A resource can carry a **type**: `admin-list`, `ban-list`, `bad-word-list`,
`good-word-list`, `dynamic-config`, `live-tuning`, or `notification-url`. The type
fixes the body format and is what compatibility is based on — tags stay free-form
categorization and never decide what a setting offers.

The **format is chosen when the resource is created and never changes**: the served
`Content-Type`, the validation applied on every save, and the type it can carry all derive
from it. A body in another format is a **new resource** (new URL), not an edit. Clearing the
type keeps the format and simply stops every setting selector from offering the resource.

| Setting                  | Type               | Edited in                          |
| ------------------------ | ------------------ | ---------------------------------- |
| `AdminListURL`           | `admin-list`       | RCON → Admins                      |
| `BanListURL`             | `ban-list`         | INI Files → Visual                 |
| `BadWordListURL`         | `bad-word-list`    | INI Files → Visual                 |
| `BadWordWhiteListURL`    | `good-word-list`   | INI Files → Visual                 |
| `CustomLiveTuningUrl`    | `live-tuning`      | INI Files → Visual                 |
| `CustomDynamicConfigUrl` | `dynamic-config`   | Launch (`-UseDynamicConfig` first) |
| `CustomNotificationURL`  | `notification-url` | Launch                             |

Each of those fields lists enabled, published resources of its own type, still accepts an
arbitrary external http(s) URL, and pre-fills a create flow when empty. Nothing is
rewritten behind the operator: the picked URL lands in the field's own draft, and that
field's existing Save owns persistence (RCON → Admins still warns that a URL change needs
one restart).

A value is matched to a resource by its **token**, not by the whole URL: that is what lets a
stale-port value be recognised as "this resource, wrong port" instead of an unknown URL. The
field warns when its value points at:

- a resource that is **disabled** or has **no published version** — ASA cannot fetch it;
- a resource now served on a **different host port** than the one in the value, which is what
  a port change leaves behind until the field is updated — pick the resource again;
- a resource typed for a **different setting**, or left **untyped** — it still serves, but it
  is not offered for that field;
- a YARK-shaped URL that **no current resource serves** — the resource was deleted.

Resources created before types existed stay **untyped** and are not offered anywhere until
a type is set in the resource editor.

### AdminListURL + loopback mode

When `AdminListURL` points at `127.0.0.1` / `localhost`, YARK classifies it as **loopback**
mode (not `local`): the URL is written to `GameUserSettings.ini` **verbatim** and the
Admins tab shows it and reads `Current ids` by fetching it, exactly like a remote list.
Only blank / `file://` values use the legacy local rewrite. This also means a loopback URL
is **not** clobbered to a `file://` pointer on save or on the before-start pointer refresh.

**`Current ids` is not proof ASA applied the list.** YARK reads whatever the configured
source returns — it never confirms ASA parsed or honored it. In `local` mode (`AdminListURL`
blank or `file://`) `Current ids` reads `ShooterGame/Saved/AllowedCheaterAccountIDs.txt`
from disk, and community reports (Procmon traces) indicate current ASA does not read that
file at all, so a non-empty list there does not mean admins are granted. Prefer a loopback
or remote URL. Whether to keep showing the disk read in `local` mode is tracked in the
follow-up local AdminList work, not here.

## Verifying it works

There is **no in-game signal for `AdminListURL`** by itself. Use the strongest signal you
can get, and do not treat "I am admin in game" as proof — that can come from
`ServerAdminPassword` instead of the whitelist.

| Signal                                                             | Where               | Strength                                                |
| ------------------------------------------------------------------ | ------------------- | ------------------------------------------------------- |
| `ForceUpdateDynamicConfig` changes a rate in game (taming/harvest) | In game, admin/RCON | **Unambiguous** — the INI body was applied              |
| RCON cheat-id query returns your EOS id                            | RCON console        | Strong — ASA parsed the fetched body                    |
| Admins tab shows the URL + `Current ids`                           | YARK UI             | Shows YARK read the served body                         |
| Diagnostics request count rising                                   | YARK UI             | ASA is polling your host (not that it applied the list) |

Recommended smoke test:

1. Start the test server once and stop it so `GameUserSettings.ini` exists.
2. Hosted Resources → **Enabled** → **New resource** (Plain text, one EOS id per line) →
   **Create resource** → copy the URL.
3. In the server's RCON → **Admins** tab, paste the URL, set
   `UpdateAllowedCheatersInterval` to **3**, and **Apply**.
4. Start the server, then **Run diagnostics**: a rising request count proves ASA is
   fetching your host.
5. For an unambiguous in-game check, use `CustomDynamicConfigUrl` with an INI resource
   (e.g. `TamingSpeedMultiplier=5.0`) plus `-UseDynamicConfig`, then run
   `ForceUpdateDynamicConfig` and confirm the rate changed. Use `SaveWorld` instead of the
   cheat if you prefer — the dynamic config is re-read on world (auto)save.
6. Edit → Save a new body, then force the update again (or wait for autosave) — ASA does
   not hot-reload on its own.

## Content validation

- **JSON**: parsed with `JSON.parse`; invalid JSON is rejected.
- **INI**: only requires at least one `Key=Value` line. This is deliberately shallow —
  the official `dynamicconfig.ini` is a flat, section-less file, so requiring a
  `[Section]` would reject the primary ASA consumer.
- **Plain text**: no format to check.
- Size (512 KB, UTF-8 bytes) is enforced for every format.
- **Syntax only**: YARK does not validate ASA's supported-key schema and does not bind
  heuristics to setting names. An unknown key is ignored by ASA, not a YARK error.

## Notes and tags

Notes and tags are YARK-only metadata; they never change the body served at the URL.
Tags are normalized to lowercase, deduplicated, and limited to 12 labels of 32
characters each. The editor suggests the ASA URL consumers `admin-list`, `ban-list`,
and `dynamic-config`, and operators can create custom tags for mods, maps, or local
conventions. The **type** described above is the separate, typed field that setting
selectors match on; tags never affect compatibility.

## Port changes and stale URLs

Changing the port does not rewrite server INIs in this iteration. After a port change,
run diagnostics to see which servers still reference the old URL and update them
manually. Never trust a stale URL after a port change or a failed ownership check.

## Internet-exposed and community servers

- **Only the ASA dedicated process fetches these URLs**, never players. Players still
  connect through the game ports (UDP `7777`/`7778`, query `27015`) and never see the
  resource URL. A loopback URL is invisible to the internet, adds no inbound port to an
  exposed host, and needs no firewall rule — it is safer than a public Gist/Pastebin
  URL, not riskier.
- Each host needs its own YARK listener. A server on another machine, or ASA running
  inside a container, cannot read the YARK host's `127.0.0.1`; run YARK (or keep a
  public URL) on each host that serves the list.
- **Availability is the real caveat for 24/7 communities**: if YARK is closed, the URL
  stops answering even though ASA keeps running, and admin grants stop refreshing. Keep
  YARK open (close-to-tray) or keep using a public URL. A helper that outlives YARK is
  out of scope for this experiment.
- The token lives in `GameUserSettings.ini` and in any backup ZIP, so treat exported
  INIs and backups as sensitive. Because the listener is loopback-only, a leaked token
  is only usable from that machine; still, disable the resource or change the port if a
  secret-bearing URL was shared.

## Surviving YARK quit (deferred)

The listener lives in the YARK main process, so it stops when YARK exits. This is not a
file-lock problem: ASA **polls** `AdminListURL` on `UpdateAllowedCheatersInterval`
(default 600s, minimum 3s), so a closed host means failed refreshes and no new admin
grants. Close-to-tray is the supported answer; a helper process that outlives YARK is
explicitly out of scope for the experiment.

A detached host is technically possible, but it is not a trivial child process:

- The packaged build sets the `runAsNode: false` fuse, so a plain Node child cannot be
  spawned from the app binary.
- Packaged installs hold a single-instance lock (`src/main/index.ts`), so a host-only
  relaunch would have to be detected before the lock and skip the window, tray, and
  splash.
- The port has to be handed over on quit and adopted or replaced on the next boot, with
  orphan and crash-loop handling. The child reads the same SQLite file (WAL allows
  multiple readers plus one writer).

Do **not** re-enable the `RunAsNode` fuse to get a lighter child: it turns the signed
`YARK.exe` into a general-purpose Node interpreter (allowlisting / code-signing abuse,
and ASAR integrity does not cover node mode). If the helper is ever built, prefer a
host-only YARK relaunch or a bundled minimal Node runtime. Fuse rationale:
[docs/versioning.md](versioning.md).

## Security posture

- `node:http` only; `GET`/`HEAD`; read-only HTTP. Mutations go through validated IPC.
- Opaque 256-bit tokens resolve through SQLite. Request paths never map to filesystem
  paths, and arbitrary files, symlinks, backups, and credentials are never served.
- Fixed MIME types with `X-Content-Type-Options: nosniff`, no CORS, no cookies, no
  directory listings, and no URL-proxy / import-from-URL path.
- Each **Save** appends an immutable version and makes it the served body atomically.
- Resource bodies are never rendered as HTML or executed: YARK stores them as text,
  serves fixed non-HTML MIME types with `nosniff`, and the UI only shows a body in an
  editable text field. The body crosses main/preload/renderer only to populate that
  plain editor; it is never interpreted, injected into the DOM, or executed. A
  script-like body cannot run on this path, so there is no script sniffing — content
  validation is shape (JSON/INI) and size only.
- Request/header timeouts and a connection cap bound slow or abusive clients.
- Bodies, full tokens, admin IDs, and secret-bearing URLs are never logged.

See [`SECURITY.md`](../SECURITY.md) and
[Security & privacy](https://getyark.com/docs/security-privacy/) for the trust-boundary
policy.

## Module map

| Concern                                                       | File                                                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Settings, limits, URL shape, types                            | `src/shared/settings/hosted-resources.ts`                                                                 |
| Setting → type/format catalog (compatibility)                 | `src/shared/settings/hosted-resource-consumers.ts`                                                        |
| Persistence (`hosted_resources`, `hosted_resource_revisions`) | `src/backend/infra/db/hosted-resources-repository.ts`                                                     |
| Loopback listener, publish/enable/disable, diagnostics        | `src/backend/domains/hosted-resources/hosted-resources-service.ts`                                        |
| IPC handlers                                                  | `src/main/ipc-handlers.ts` (`hosted-resources:*`)                                                         |
| Resource UI                                                   | `src/renderer/src/features/hosted-resources/`                                                             |
| Setting selector + assignment warnings                        | `src/renderer/src/features/hosted-resources/components/HostedResourceSelector/`                           |
| Tests                                                         | `tests/unit/hosted-resources*.test.ts`, `HostedResourcesPage.test.tsx`, `HostedResourceSelector.test.tsx` |
