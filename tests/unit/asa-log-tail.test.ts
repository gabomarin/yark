import { mkdirSync, mkdtempSync, writeFileSync, appendFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AsaSavedLogsTailer,
  asaSavedLogsDir,
  decodeAsaLogBytes,
  listAsaLogFiles,
  pickAsaLogFile,
} from "@backend/infra/process/asa-log-tail";

describe("decodeAsaLogBytes", () => {
  it("decodes UTF-8", () => {
    expect(decodeAsaLogBytes(Buffer.from("hello\nworld", "utf8"))).toBe("hello\nworld");
  });

  it("decodes UTF-16 LE with BOM", () => {
    const body = Buffer.from("Log line", "utf16le");
    const withBom = Buffer.concat([Buffer.from([0xff, 0xfe]), body]);
    expect(decodeAsaLogBytes(withBom)).toBe("Log line");
  });

  it("detects UTF-16 LE without BOM via NUL heuristic", () => {
    const encoded = Buffer.from("AbCdEfGh", "utf16le");
    expect(decodeAsaLogBytes(encoded)).toBe("AbCdEfGh");
  });
});

describe("pickAsaLogFile", () => {
  it("returns null for empty list", () => {
    expect(pickAsaLogFile([], Date.now())).toBeNull();
  });

  it("prefers a log modified at/after start", () => {
    const root = mkdtempSync(join(tmpdir(), "asa-log-pick-"));
    const logsDir = join(root, "ShooterGame", "Saved", "Logs");
    mkdirSync(logsDir, { recursive: true });
    const oldPath = join(logsDir, "ShooterGame_old.log");
    const newPath = join(logsDir, "ShooterGame.log");
    writeFileSync(oldPath, "old");
    writeFileSync(newPath, "new");
    const startedAt = Date.now();
    // Force clear mtime ordering regardless of filesystem timestamp resolution.
    utimesSync(oldPath, new Date(startedAt - 60_000), new Date(startedAt - 60_000));
    utimesSync(newPath, new Date(startedAt), new Date(startedAt));
    const picked = pickAsaLogFile([oldPath, newPath], startedAt);
    expect(picked).toBe(newPath);
  });
});

describe("AsaSavedLogsTailer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tails new bytes from Saved/Logs and handles append", () => {
    vi.useFakeTimers();
    const root = mkdtempSync(join(tmpdir(), "asa-log-tail-"));
    const logsDir = asaSavedLogsDir(root);
    mkdirSync(logsDir, { recursive: true });
    const chunks: string[] = [];
    const startedAt = Date.now();
    const logPath = join(logsDir, "ShooterGame.log");
    writeFileSync(logPath, "boot\n", "utf8");

    const tailer = new AsaSavedLogsTailer(root, (text) => chunks.push(text), {
      pollMs: 100,
    });
    tailer.start(startedAt);
    expect(listAsaLogFiles(logsDir)).toEqual([logPath]);
    // Fresh small file starts at offset 0 → initial content.
    expect(chunks.join("")).toContain("boot");

    appendFileSync(logPath, "ready\n", "utf8");
    vi.advanceTimersByTime(100);
    expect(chunks.join("")).toContain("ready");

    tailer.stop();
  });

  it("attaches at EOF for large older logs", () => {
    vi.useFakeTimers();
    const root = mkdtempSync(join(tmpdir(), "asa-log-tail-old-"));
    const logsDir = asaSavedLogsDir(root);
    mkdirSync(logsDir, { recursive: true });
    const logPath = join(logsDir, "ShooterGame.log");
    const big = "x".repeat(70 * 1024);
    writeFileSync(logPath, `${big}\n`, "utf8");

    const chunks: string[] = [];
    // Start well after the file's mtime window so it is treated as pre-existing.
    const startedAt = Date.now() + 10_000;
    const tailer = new AsaSavedLogsTailer(root, (text) => chunks.push(text), {
      pollMs: 50,
    });
    tailer.start(startedAt);
    expect(chunks).toEqual([]);

    appendFileSync(logPath, "after-attach\n", "utf8");
    vi.advanceTimersByTime(50);
    expect(chunks.join("")).toContain("after-attach");
    expect(chunks.join("")).not.toContain(big.slice(0, 32));

    tailer.stop();
  });
});
