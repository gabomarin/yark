# Default INI templates (source of truth)

These files are the **only source of truth** for:

- new ASA dedicated server configs
- "Reset to defaults" / rewriting a whole INI file in the editor
- editor setting metadata (`description`, `valueType`, inferred `input`) via
  `npm run catalog:ini-meta` → `src/shared/ini-setting-meta.json`

- `GameUserSettings.ini` — `[ServerSettings]` plus
  `[SessionSettings]`, `[/Script/Engine.GameSession]`, and `[MessageOfTheDay]`
- `Game.ini` — `[/script/shootergame.shootergamemode]` gameplay multipliers

They are adapted from [Arkobat/ArkServerSettings](https://github.com/Arkobat/ArkServerSettings)
(`SurvivalAscended/Default/`). See [THIRD_PARTY_NOTICES.md](../../../THIRD_PARTY_NOTICES.md).

Do not put client-only keys here (e.g. `LastJoinedSessionPerCategory`,
graphics / `ShooterGameUserSettings` / `ScalabilityGroups`).

Optional editor control overrides (ranges, etc.) live in
`src/shared/ini-setting-input-overrides.json` and are merged by the meta build.
