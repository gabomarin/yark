# Ark Server API / Version.dll (#243)

Optional **community** server API support (not Wildcard, not CurseForge `-mods=`).

## Operator surface

Workspace tab **Ark Server API** (last tab, after Maintenance):

1. **Install** — downloads the latest release (~25–30 MB) plus Version.dll
   into this server’s Win64 folder, with on-screen progress. Zips are cached under
   YARK app data (`cache/asa-api`, latest + one previous tag) so reinstall /
   multi-server is faster. **Clear download cache** is on the tab; Settings can
   open the folder.
2. **Remove** — deletes API / loader / plugins; game files stay. Stop first.
3. **Load on Start** — off by default; uses Version.dll so Start stays on
   the normal game process.
4. **Use older loader instead** — optional fallback if Version.dll fails.
5. **Plugins** — **Add plugin zip** picks a local `.zip` and installs into
   `ArkApi\Plugins\<Name>` (folder name matches `Name.dll`). Off moves the
   folder to sibling `ArkApi\Disabled_Plugins\`. Trash permanently deletes
   (confirm first; server must be stopped). Legacy `Plugins\Name.disabled` and
   older `Win64\Disabled_Plugins` are migrated on read/toggle.

## Process lifecycle

- **Version.dll (default):** Start = `ArkAscendedServer.exe`. No child adopt.
- **AsaApiLoader:** Start = `AsaApiLoader.exe`; YARK polls for child
  `ArkAscendedServer.exe` and **adopts** that PID for status / Leave /
  readiness. Kill prefers the loader PID with `taskkill /T` so the tree exits.
- While Load on Start is on, Overview / workspace show **Loading Ark Server
  API…** until the server console window appears (or ShooterGame.log starts
  writing). Runtime also shows a short banner and a system line; both clear
  when that boot phase ends.

## Limits

- Windows only.
- ASA patches often break AsaApi until the API is updated — operators re-run
  **Check for API update**.
- SteamCMD sync/move should preserve `Version.dll`, `AsaApiLoader.exe`, and
  `ArkApi\` (verify after update jobs if operators report wipe).
- YARK does not endorse community DLLs.
