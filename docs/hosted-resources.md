# Hosted Resources (experimental, loopback HTTP)

Hosted Resources publishes versioned **text**, **INI**, or **JSON** bodies over a
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
- Drafts are never served. Only the single published revision of a non-revoked
  resource is reachable.
- Revocation is immediate, including after a restart.

## Operator workflow

1. Open **Hosted Resources** in the sidebar and turn the host on.
2. Set one port (default `8935`) and **Apply port**. If the port is busy, the host
   fails closed and shows an error — YARK never assumes an open port belongs to it.
3. **New resource**: pick a display name and format, paste the body, and publish. The
   editor shows a live UTF-8 size counter and enforces the **512 KB** per-revision cap.
4. Copy the URL and paste it into the server setting or mod config that expects it
   (for example `AdminListURL` in `GameUserSettings.ini`).
5. To change the body, use **Publish new revision**. Previous revisions stay listed and
   can be **restored**; the swap is atomic, so a request always sees exactly one
   revision.

## Diagnostics

**Run diagnostics** performs three independent checks. They are intentionally
separate — none of them proves the game accepted the resource:

| Check | What it proves |
| --- | --- |
| Loopback ownership | A loopback request answered with YARK's marker header, so the port is ours |
| Served bytes | A loopback GET of each resource hashes to the declared SHA-256 |
| Discovered references | A managed server INI contains the exact YARK URL (no guesswork on setting names) |

The panel also shows observed request counts since YARK started. A served match only
means YARK returned those bytes; it does not mean ASA loaded them.

## Known consumers (ASA)

| Consumer | Expected body | Where it is set |
| --- | --- | --- |
| `AdminListURL` | Plain text, one EOS / Ark id per line | `GameUserSettings.ini` |
| `BanListURL` | Plain text ban entries | `GameUserSettings.ini` |
| `BadWordListURL` / `BadWordWhiteListURL` | Plain text word list | `GameUserSettings.ini` |
| `CustomDynamicConfigUrl` (+ `-UseDynamicConfig`) | **INI** — flat `Key=Value` lines | Launch arg or `GameUserSettings.ini` |
| `CustomLiveTuningUrl` | **JSON** | Launch arg or `GameUserSettings.ini` |

`CustomDynamicConfigUrl` only accepts **HTTP** (HTTPS is unsupported), which is exactly
what the loopback host provides. ASA re-reads the dynamic config on world (auto)save or
after `ForceUpdateDynamicConfig`, so the YARK-exit availability caveat applies there too.

Mod settings are a different story: ASA mods read their options from local
`[ModSettings]` / per-mod sections of `GameUserSettings.ini`, and Ark Server API plugins
read a local `config.json`. Neither fetches INI over HTTP, so the loopback host does not
serve mod settings.

## Content validation

- **JSON**: parsed with `JSON.parse`; invalid JSON is rejected.
- **INI**: only requires at least one `Key=Value` line. This is deliberately shallow —
  the official `dynamicconfig.ini` is a flat, section-less file, so requiring a
  `[Section]` would reject the primary ASA consumer.
- **Plain text**: no format to check.
- Size (512 KB, UTF-8 bytes) is enforced for every format.
- **Syntax only**: YARK does not validate ASA's supported-key schema and does not bind
  heuristics to setting names. An unknown key is ignored by ASA, not a YARK error.

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
  is only usable from that machine; still, revoke the resource or change the port if a
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
- Resource bodies are never rendered as HTML or executed: YARK stores them as text,
  serves fixed non-HTML MIME types with `nosniff`, and the UI only shows a body in an
  editable text field. A published `.html`/`.js`/shell text cannot run on this path, so
  there is no script sniffing — content validation is shape (JSON/INI) and size only.
- Request/header timeouts and a connection cap bound slow or abusive clients.
- Bodies, full tokens, admin IDs, and secret-bearing URLs are never logged.

See [`SECURITY.md`](../SECURITY.md) and
[Security & privacy](https://getyark.com/docs/security-privacy/) for the trust-boundary
policy.

## Module map

| Concern | File |
| --- | --- |
| Settings, limits, URL shape | `src/shared/settings/hosted-resources.ts` |
| Persistence (`hosted_resources`, `hosted_resource_revisions`) | `src/backend/infra/db/hosted-resources-repository.ts` |
| Loopback listener, publish/revoke, diagnostics | `src/backend/domains/hosted-resources/hosted-resources-service.ts` |
| IPC handlers | `src/main/ipc-handlers.ts` (`hosted-resources:*`) |
| UI | `src/renderer/src/features/hosted-resources/` |
| Tests | `tests/unit/hosted-resources.test.ts`, `HostedResourcesPage.test.tsx` |
