import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { assertDisposablePath, parseScenarioList, redactEvidence } =
  require("../../scripts/validation/real-host-validation-utils.cjs") as {
    assertDisposablePath: (candidate: string, root: string) => string;
    parseScenarioList: (raw?: string) => string[];
    redactEvidence: <T>(
      value: T,
      knownSecretProfiles?: Array<{ adminPassword: string; serverPassword: string | null }>,
    ) => T;
  };

describe("real-host validation utilities", () => {
  it("parses and de-duplicates supported scenarios", () => {
    expect(parseScenarioList("lifecycle, backup-restore, lifecycle")).toEqual(["lifecycle", "backup-restore"]);
  });

  it("rejects unknown scenarios", () => {
    expect(() => parseScenarioList("lifecycle,rollback")).toThrow(/Unknown real-host scenario/);
  });

  it("only accepts evidence and install paths below the disposable root", () => {
    const root = fs.mkdtempSync(path.join(process.cwd(), "real-host-validation-"));
    try {
      expect(assertDisposablePath(path.join(root, "evidence.json"), root)).toBe(path.resolve(root, "evidence.json"));
      expect(() => assertDisposablePath(path.join(path.dirname(root), "operator", "world.ark"), root)).toThrow(
        /outside the disposable root/,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects symbolic links in disposable paths", () => {
    const root = fs.mkdtempSync(path.join(process.cwd(), "real-host-validation-"));
    const outside = fs.mkdtempSync(path.join(process.cwd(), "real-host-validation-outside-"));
    const link = path.join(root, "linked");
    try {
      fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
      expect(() => assertDisposablePath(path.join(link, "evidence.json"), root)).toThrow(/reparse point/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
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

  it("redacts credentials embedded in diagnostic messages", () => {
    const evidence = redactEvidence(
      { error: { message: 'RCON failed ServerAdminPassword="top-secret" for top-secret' } },
      [{ adminPassword: "top-secret", serverPassword: null }],
    );

    expect(evidence).toEqual({
      error: { message: 'RCON failed ServerAdminPassword="••••••••" for ••••••••' },
    });
    expect(JSON.stringify(evidence)).not.toContain("top-secret");
  });
});
