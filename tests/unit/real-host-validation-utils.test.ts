import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { assertDisposablePath, parseScenarioList, redactEvidence } =
  require("../../scripts/validation/real-host-validation-utils.cjs") as {
    assertDisposablePath: (candidate: string, root: string) => string;
    parseScenarioList: (raw?: string) => string[];
    redactEvidence: <T>(value: T) => T;
  };

describe("real-host validation utilities", () => {
  it("parses and de-duplicates supported scenarios", () => {
    expect(parseScenarioList("lifecycle, backup-restore, lifecycle")).toEqual(["lifecycle", "backup-restore"]);
  });

  it("rejects unknown scenarios", () => {
    expect(() => parseScenarioList("lifecycle,rollback")).toThrow(/Unknown real-host scenario/);
  });

  it("only accepts evidence and install paths below the disposable root", () => {
    const root = path.join("tmp", "asa-validation");
    expect(assertDisposablePath(path.join(root, "evidence.json"), root)).toBe(path.resolve(root, "evidence.json"));
    expect(() => assertDisposablePath(path.join("tmp", "operator", "world.ark"), root)).toThrow(
      /outside the disposable root/,
    );
  });

  it("redacts credentials without changing other evidence", () => {
    expect(
      redactEvidence({
        serverId: "test-server",
        adminPassword: "secret",
        nested: { password: "another-secret" },
      }),
    ).toEqual({
      serverId: "test-server",
      adminPassword: "***",
      nested: { password: "***" },
    });
  });
});
