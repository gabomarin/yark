import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildUpdateLogPath,
  confineCancelledUpdateLogPath,
  computePreUpdateBackupProgressPercent,
  formatPreUpdateBackupKindLabel,
  formatUpdateLogContent,
  isPreUpdateBackupEvidenceComplete,
  planDuplicateRecoveredUpdateJob,
  planInterruptedUpdateJobRecovery,
  queuedFilesJobProgressLabel,
  resolveCancelledUpdateLogPath,
  resolveUpdateWasRunning,
  startedAtFromUpdateLogPath,
  shouldBlockUpdateWhileServerRunning,
  shouldRestartServerAfterPreSteamCmdAbort,
  shouldResumeFromPreUpdateBackup,
  updateInstallMayHaveChanged,
} from "@backend/domains/updates/update-server-jobs";

describe("shouldBlockUpdateWhileServerRunning", () => {
  it("blocks when a durable job starts while the server is running without wasRunning intent", () => {
    expect(
      shouldBlockUpdateWhileServerRunning({
        isCurrentlyRunning: true,
        hasDurableJob: true,
        jobWasRunning: false,
      }),
    ).toBe(true);
    expect(
      shouldBlockUpdateWhileServerRunning({
        isCurrentlyRunning: true,
        hasDurableJob: true,
        jobWasRunning: true,
      }),
    ).toBe(false);
    expect(
      shouldBlockUpdateWhileServerRunning({
        isCurrentlyRunning: true,
        hasDurableJob: false,
        jobWasRunning: false,
      }),
    ).toBe(false);
  });
});

describe("pre-update backup helpers", () => {
  it("detects resume and evidence completeness", () => {
    expect(shouldResumeFromPreUpdateBackup(undefined)).toBe(false);
    expect(shouldResumeFromPreUpdateBackup(["bu-world"])).toBe(true);
    expect(isPreUpdateBackupEvidenceComplete(["bu-world"], 1, 1)).toBe(true);
    expect(isPreUpdateBackupEvidenceComplete(["bu-world", "bu-players", "bu-ini"], 1, 1)).toBe(true);
    expect(isPreUpdateBackupEvidenceComplete([], 0, 1)).toBe(false);
    expect(isPreUpdateBackupEvidenceComplete(["bu-world"], 0, 1)).toBe(false);
  });

  it("formats labels and progress percent", () => {
    expect(formatPreUpdateBackupKindLabel("world")).toBe("world save");
    expect(formatPreUpdateBackupKindLabel("ini")).toBe("INI files");
    expect(formatPreUpdateBackupKindLabel("players")).toBe("player profiles");
    expect(computePreUpdateBackupProgressPercent(0, 2)).toBe(10);
    expect(computePreUpdateBackupProgressPercent(1, 2)).toBe(20);
  });
});

describe("updateInstallMayHaveChanged", () => {
  it("detects post-SteamCMD phases and persisted evidence", () => {
    expect(updateInstallMayHaveChanged({ phase: "validated" })).toBe(false);
    expect(updateInstallMayHaveChanged({ phase: "applying-files" })).toBe(true);
    expect(updateInstallMayHaveChanged({ phase: "validated", steamCmdExitCode: 0 })).toBe(true);
    expect(updateInstallMayHaveChanged({ phase: "validated", appliedBuildId: "123" })).toBe(true);
  });
});

describe("shouldRestartServerAfterPreSteamCmdAbort", () => {
  it("restarts only when the server was running before SteamCMD touched files", () => {
    expect(
      shouldRestartServerAfterPreSteamCmdAbort({
        wasRunning: true,
        installMayHaveChanged: false,
        serverIsActive: false,
      }),
    ).toBe(true);
    expect(
      shouldRestartServerAfterPreSteamCmdAbort({
        wasRunning: true,
        installMayHaveChanged: true,
        serverIsActive: false,
      }),
    ).toBe(false);
  });
});

describe("resolveUpdateWasRunning", () => {
  it("prefers persisted job intent over the live probe", () => {
    expect(resolveUpdateWasRunning(undefined, true)).toBe(true);
    expect(resolveUpdateWasRunning(false, true)).toBe(false);
  });
});

describe("buildUpdateLogPath", () => {
  it("uses a filesystem-safe timestamp", () => {
    const startedAt = new Date("2026-01-01T12:30:45.123Z");
    expect(buildUpdateLogPath("C:/logs", "srv-1", startedAt)).toBe(
      join("C:/logs", "srv-1-2026-01-01T12-30-45-123Z.log"),
    );
  });

  it("keeps a persisted cancel path inside the update-logs folder", () => {
    const startedAt = new Date("2026-01-01T12:30:45.123Z");
    const inside = join("C:/logs", "srv-1-existing.log");
    expect(resolveCancelledUpdateLogPath("C:/logs", "srv-1", startedAt, inside)).toBe(resolve(inside));
  });

  it("mints a new file when the persisted path leaves the update-logs folder", () => {
    const startedAt = new Date("2026-01-01T12:30:45.123Z");
    expect(resolveCancelledUpdateLogPath("C:/logs", "srv-1", startedAt, join("C:/Windows", "evil.log"))).toBe(
      buildUpdateLogPath("C:/logs", "srv-1", startedAt),
    );
  });

  it("reads the run start encoded in the log file name", () => {
    const startedAt = new Date("2026-01-01T12:30:45.123Z");
    const logPath = buildUpdateLogPath("C:/logs", "srv-1", startedAt);
    expect(startedAtFromUpdateLogPath("srv-1", logPath)?.toISOString()).toBe("2026-01-01T12:30:45.123Z");
    expect(startedAtFromUpdateLogPath("srv-1", join("C:/logs", "srv-1-paused.log"))).toBeNull();
  });

  it("does not follow a symlink inside the update-logs folder", () => {
    const root = mkdtempSync(join(tmpdir(), "yark-log-link-"));
    const logs = join(root, "logs");
    mkdirSync(logs);
    const outside = join(root, "outside.txt");
    writeFileSync(outside, "secret");
    const link = join(logs, "srv-1-link.log");
    try {
      symlinkSync(outside, link);
    } catch {
      return;
    }
    const startedAt = new Date("2026-01-01T12:30:45.123Z");
    const chosen = confineCancelledUpdateLogPath(logs, "srv-1", startedAt, link);
    expect(chosen).not.toBeNull();
    expect(basename(chosen!)).toBe(basename(buildUpdateLogPath(logs, "srv-1", startedAt)));
    expect(basename(chosen!)).not.toBe("srv-1-link.log");
  });
});

describe("formatUpdateLogContent", () => {
  it("joins stdout/stderr sections", () => {
    const content = formatUpdateLogContent({
      serverName: "Island",
      installDir: "C:/ARK",
      exitCode: 0,
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      durationMs: 1000,
      stdout: "ok",
      stderr: "",
    });
    expect(content).toContain("server=Island");
    expect(content).toContain("exitCode=0");
    expect(content).toContain("--- stdout ---");
    expect(content).toContain("ok");
    expect(content).not.toContain("outcome=");
  });

  it("records an operator cancel without a SteamCMD exit code", () => {
    const content = formatUpdateLogContent({
      serverName: "Island",
      installDir: "C:/ARK",
      exitCode: null,
      outcome: "cancelled",
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      durationMs: 1000,
      stdout: "Operation cancelled by the user.",
      stderr: "",
    });
    expect(content).toContain("outcome=cancelled");
    expect(content).not.toMatch(/^exitCode=/m);
    expect(content).toContain("Operation cancelled by the user.");
  });
});

describe("queuedFilesJobProgressLabel", () => {
  it("maps job types to queue labels", () => {
    expect(queuedFilesJobProgressLabel("install-files")).toContain("install");
    expect(queuedFilesJobProgressLabel("verify-files")).toContain("verify");
    expect(queuedFilesJobProgressLabel("update")).toContain("update");
  });
});

describe("planInterruptedUpdateJobRecovery", () => {
  it("marks ambiguous interruptions for operator retry", () => {
    expect(
      planInterruptedUpdateJobRecovery({
        wasInterrupted: true,
        phase: "applying-files",
        interruptedIsAmbiguous: true,
        serverExists: true,
      }),
    ).toEqual({
      status: "failed",
      operatorRetryAllowed: true,
      recoveryReason: 'YARK closed during phase "applying-files". Retry to continue.',
      restartInterrupted: true,
    });
  });

  it("resumes files-applied checkpoints without operator retry", () => {
    expect(
      planInterruptedUpdateJobRecovery({
        wasInterrupted: true,
        phase: "files-applied",
        interruptedIsAmbiguous: false,
        serverExists: true,
      }),
    ).toMatchObject({
      status: "pending",
      operatorRetryAllowed: false,
    });
  });
});

describe("planDuplicateRecoveredUpdateJob", () => {
  it("blocks duplicate rows when the server still exists", () => {
    expect(planDuplicateRecoveredUpdateJob(true)?.status).toBe("blocked");
    expect(planDuplicateRecoveredUpdateJob(false)).toBeNull();
  });
});
