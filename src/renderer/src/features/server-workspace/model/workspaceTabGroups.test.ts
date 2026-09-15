import { describe, expect, it } from "vitest";
import { allWorkspaceTabs, WORKSPACE_TAB_GROUPS } from "./workspaceTabGroups";

describe("workspaceTabGroups", () => {
  it("keeps all nine workspace tabs in one list", () => {
    expect(allWorkspaceTabs().map((tab) => tab.value)).toEqual([
      "server",
      "iniFiles",
      "mods",
      "launch",
      "backups",
      "logs",
      "rcon",
      "maintenance",
      "asaApi",
    ]);
    expect(WORKSPACE_TAB_GROUPS).toHaveLength(3);
  });
});
