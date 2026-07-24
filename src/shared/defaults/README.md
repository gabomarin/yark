# Default INI templates (source of truth)

These files are the **canonical defaults** for new ASA dedicated servers and for
"Reset to defaults" in the INI editor.

- `GameUserSettings.ini` - `[ServerSettings]` plus kept trailing sections
  `[SessionSettings]`, `[/Script/Engine.GameSession]`, and `[MessageOfTheDay]`
  (no `[ModInstaller]`, `[Ragnarok]`, or `[MultiHome]` — ASE/noise for ASA dedicated)
- `Game.ini` - `[/script/shootergame.shootergamemode]` gameplay multipliers
  (no trailing `[ModInstaller]`)

They come from a community ARK settings collection (commented defaults). The app
may append a small set of ASA server keys that are missing from these files but
present in `asa-server-settings-data.json` (wiki-sourced).

Do not put client-only keys here (e.g. `LastJoinedSessionPerCategory`).
