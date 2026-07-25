# Default INI templates (source of truth)

These files are the **only source of truth** for:

- new ASA dedicated server configs
- "Reset to defaults" / rewriting a whole INI file in the editor

- `GameUserSettings.ini` — `[ServerSettings]` plus
  `[SessionSettings]`, `[/Script/Engine.GameSession]`, and `[MessageOfTheDay]`
- `Game.ini` — `[/script/shootergame.shootergamemode]` gameplay multipliers

They come from a community ARK settings collection (commented defaults).

The ASA wiki catalog (`asa-server-settings-data.json`) is **not** merged into
these files. It only powers editor metadata (descriptions, value types, UI
categories).

Do not put client-only keys here (e.g. `LastJoinedSessionPerCategory`,
graphics / `ShooterGameUserSettings` / `ScalabilityGroups`).
