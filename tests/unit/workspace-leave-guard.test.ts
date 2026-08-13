import { describe, expect, it } from "vitest";
import { describeWorkspaceLeave } from "../../src/renderer/src/features/server-workspace/workspaceLeaveGuard";

describe("describeWorkspaceLeave", () => {
  it("is clean when nothing is dirty", () => {
    expect(
      describeWorkspaceLeave({
        profileDirty: false,
        iniDirty: false,
        assistantDirty: false,
      }),
    ).toEqual({ kind: "clean" });
  });

  it("uses profile copy when only the Server tab is dirty", () => {
    expect(
      describeWorkspaceLeave({
        profileDirty: true,
        iniDirty: false,
        assistantDirty: false,
      }),
    ).toMatchObject({
      kind: "confirm",
      title: "Unsaved server changes",
      alertTitle: "Server form modified",
    });
  });

  it("uses INI copy when only INI or assistant is dirty", () => {
    expect(
      describeWorkspaceLeave({
        profileDirty: false,
        iniDirty: true,
        assistantDirty: false,
      }),
    ).toMatchObject({
      kind: "confirm",
      title: "Unsaved changes",
      alertTitle: "INI modified",
    });
    expect(
      describeWorkspaceLeave({
        profileDirty: false,
        iniDirty: false,
        assistantDirty: true,
      }),
    ).toMatchObject({
      kind: "confirm",
      alertTitle: "INI modified",
    });
  });

  it("uses combined copy when profile and INI are both dirty", () => {
    expect(
      describeWorkspaceLeave({
        profileDirty: true,
        iniDirty: true,
        assistantDirty: false,
      }),
    ).toMatchObject({
      kind: "confirm",
      title: "Unsaved changes",
      alertTitle: "Profile and INI modified",
    });
  });

  it("treats INI dirty on tab change but ignores assistant", () => {
    expect(
      describeWorkspaceLeave({
        profileDirty: false,
        iniDirty: true,
        assistantDirty: true,
        mode: "tab",
      }),
    ).toMatchObject({
      kind: "confirm",
      alertTitle: "INI modified",
    });
    expect(
      describeWorkspaceLeave({
        profileDirty: false,
        iniDirty: false,
        assistantDirty: true,
        mode: "tab",
      }),
    ).toEqual({ kind: "clean" });
  });
});
