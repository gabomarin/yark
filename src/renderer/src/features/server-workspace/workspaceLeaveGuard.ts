export type WorkspaceLeaveMode = "workspace" | "tab";

export type WorkspaceLeaveCopy =
  | { kind: "clean" }
  | { kind: "confirm"; title: string; alertTitle: string; message: string };

/**
 * Copy for the composed workspace leave confirm (#299).
 * `workspace` = shell leave (profile + INI + assistant).
 * `tab` = in-workspace tab change (profile + INI; assistant is not a tab).
 */
export function describeWorkspaceLeave(input: {
  profileDirty: boolean;
  iniDirty: boolean;
  assistantDirty: boolean;
  mode?: WorkspaceLeaveMode;
}): WorkspaceLeaveCopy {
  const mode = input.mode ?? "workspace";
  const profileDirty = input.profileDirty;
  const iniOrAssistant =
    mode === "workspace"
      ? input.iniDirty || input.assistantDirty
      : input.iniDirty;

  if (!profileDirty && !iniOrAssistant) {
    return { kind: "clean" };
  }
  if (profileDirty && iniOrAssistant) {
    return {
      kind: "confirm",
      title: "Unsaved changes",
      alertTitle: "Profile and INI modified",
      message:
        "There are unsaved server profile and INI configuration changes. If you continue, they will be discarded.",
    };
  }
  if (profileDirty) {
    return {
      kind: "confirm",
      title: "Unsaved server changes",
      alertTitle: "Server form modified",
      message:
        "There are unsaved server profile changes. If you continue, they will be discarded.",
    };
  }
  return {
    kind: "confirm",
    title: "Unsaved changes",
    alertTitle: "INI modified",
    message:
      "There are unsaved INI configuration changes. If you continue, they will be discarded.",
  };
}
