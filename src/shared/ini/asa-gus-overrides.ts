/**
 * ASA v97+ UE client shell sections that must stay on disk (not stripped as noise).
 * Seed bodies live in `asa-dedicated-gus-shells.ini` / `asa-gus-skeleton.ts`.
 */

/** Sections sanitize must keep; Start/restore seed when empty. */
export const ASA_REQUIRED_GUS_SHELL_SECTIONS = [
  "ScalabilityGroups",
  "/Script/ShooterGame.ShooterGameUserSettings",
  "/Script/Engine.GameUserSettings",
  "Startup",
] as const;

/** True for ASA shell sections that must remain on disk (not stripped as client noise). */
export function isAsaRequiredGusShellSection(section: string): boolean {
  const wanted = section.trim().toLowerCase();
  if (wanted.length === 0) return false;
  return ASA_REQUIRED_GUS_SHELL_SECTIONS.some((name) => name.toLowerCase() === wanted);
}
