import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AsaSavedLogsTailer,
  asaPrimaryLogPath,
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

  it("pins ShooterGame.log even when another log is newer", () => {
    const root = mkdtempSync(join(tmpdir(), "asa-log-pick-"));
    const logsDir = join(root, "ShooterGame", "Saved", "Logs");
    mkdirSync(logsDir, { recursive: true });
    const primary = join(logsDir, "ShooterGame.log");
    const other = join(logsDir, "ShooterGame_2.log");
    writeFileSync(primary, "primary");
    writeFileSync(other, "other");
    const startedAt = Date.now();
    utimesSync(primary, new Date(startedAt - 60_000), new Date(startedAt - 60_000));
    utimesSync(other, new Date(startedAt), new Date(startedAt));
    expect(pickAsaLogFile([primary, other], startedAt)).toBe(primary);
    expect(asaPrimaryLogPath(root)).toBe(primary);
  });
});

describe("AsaSavedLogsTailer", () => {
  async function delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(
    condition: () => boolean,
    timeoutMs = 1_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() >= deadline) {
        throw new Error("Timed out waiting for tailer output");
      }
      await delay(10);
    }
  }

  it("tails new bytes from ShooterGame.log and handles append", async () => {
    const root = mkdtempSync(join(tmpdir(), "asa-log-tail-"));
    const logsDir = asaSavedLogsDir(root);
    mkdirSync(logsDir, { recursive: true });
    const chunks: string[] = [];
    const startedAt = Date.now();
    const logPath = join(logsDir, "ShooterGame.log");
    writeFileSync(logPath, "boot\n", "utf8");

    const tailer = new AsaSavedLogsTailer(root, (text) => chunks.push(text), {
      pollMs: 10,
    });
    tailer.start(startedAt);
    await waitFor(() => chunks.join("").includes("boot"));
    expect(listAsaLogFiles(logsDir)).toEqual([logPath]);
    expect(chunks.join("")).toContain("boot");

    appendFileSync(logPath, "ready\n", "utf8");
    await waitFor(() => chunks.join("").includes("ready"));
    expect(chunks.join("")).toContain("ready");

    tailer.stop();
  });

  it("buffers a partial trailing line until newline", async () => {
    const root = mkdtempSync(join(tmpdir(), "asa-log-partial-"));
    const logsDir = asaSavedLogsDir(root);
    mkdirSync(logsDir, { recursive: true });
    const logPath = join(logsDir, "ShooterGame.log");
    writeFileSync(logPath, "", "utf8");
    const chunks: string[] = [];
    const startedAt = Date.now();
    const tailer = new AsaSavedLogsTailer(root, (text) => chunks.push(text), {
      pollMs: 10,
    });
    tailer.start(startedAt);
    await delay(30);

    appendFileSync(logPath, "partial", "utf8");
    await delay(30);
    expect(chunks.join("")).not.toContain("partial");

    appendFileSync(logPath, "-line\n", "utf8");
    await waitFor(() => chunks.join("").includes("partial-line"));
    expect(chunks.join("")).toContain("partial-line");

    tailer.stop();
  });

  it("preserves a UTF-8 character split between file reads", async () => {
    const root = mkdtempSync(join(tmpdir(), "asa-log-utf8-"));
    const logsDir = asaSavedLogsDir(root);
    mkdirSync(logsDir, { recursive: true });
    const logPath = join(logsDir, "ShooterGame.log");
    writeFileSync(logPath, "", "utf8");
    const chunks: string[] = [];
    const tailer = new AsaSavedLogsTailer(root, (text) => chunks.push(text), {
      pollMs: 10,
    });
    tailer.start(Date.now());
    await delay(30);

    const encoded = Buffer.from("🦖", "utf8");
    appendFileSync(logPath, encoded.subarray(0, 2));
    await delay(30);
    expect(chunks).toEqual([]);

    appendFileSync(
      logPath,
      Buffer.concat([encoded.subarray(2), Buffer.from("\n")]),
    );
    await waitFor(() => chunks.length > 0);
    expect(chunks.join("")).toContain("🦖");
    expect(chunks.join("")).not.toContain("�");

    tailer.stop();
  });

  it("detects a short UTF-16 LE line without a BOM", async () => {
    const root = mkdtempSync(join(tmpdir(), "asa-log-utf16-short-"));
    const logsDir = asaSavedLogsDir(root);
    mkdirSync(logsDir, { recursive: true });
    const logPath = join(logsDir, "ShooterGame.log");
    writeFileSync(logPath, "", "utf8");
    const chunks: string[] = [];
    const tailer = new AsaSavedLogsTailer(root, (text) => chunks.push(text), {
      pollMs: 10,
    });
    tailer.start(Date.now());
    await delay(30);

    appendFileSync(logPath, Buffer.from("x\n", "utf16le"));
    await delay(30);
    expect(chunks).toEqual([]);

    appendFileSync(logPath, Buffer.from("ready\n", "utf16le"));
    await waitFor(() => chunks.join("").includes("x"));
    expect(chunks.join("")).toContain("ready");
    expect(chunks.join("")).not.toContain("\u0000");

    tailer.stop();
  });

  it("attaches at EOF for large older logs", async () => {
    const root = mkdtempSync(join(tmpdir(), "asa-log-tail-old-"));
    const logsDir = asaSavedLogsDir(root);
    mkdirSync(logsDir, { recursive: true });
    const logPath = join(logsDir, "ShooterGame.log");
    const big = "x".repeat(70 * 1024);
    writeFileSync(logPath, `${big}\n`, "utf8");

    const chunks: string[] = [];
    const startedAt = Date.now() + 10_000;
    const tailer = new AsaSavedLogsTailer(root, (text) => chunks.push(text), {
      pollMs: 10,
    });
    tailer.start(startedAt);
    await delay(30);
    expect(chunks).toEqual([]);

    appendFileSync(logPath, "after-attach\n", "utf8");
    await waitFor(() => chunks.join("").includes("after-attach"));
    expect(chunks.join("")).toContain("after-attach");
    expect(chunks.join("")).not.toContain(big.slice(0, 32));

    tailer.stop();
  });

  it("detects a replaced ShooterGame.log even when it is larger", async () => {
    const root = mkdtempSync(join(tmpdir(), "asa-log-replaced-"));
    const logsDir = asaSavedLogsDir(root);
    mkdirSync(logsDir, { recursive: true });
    const logPath = join(logsDir, "ShooterGame.log");
    const rotatedPath = join(logsDir, "ShooterGame-backup.log");
    writeFileSync(logPath, "old\n", "utf8");
    const chunks: string[] = [];
    const tailer = new AsaSavedLogsTailer(root, (text) => chunks.push(text), {
      pollMs: 10,
    });
    tailer.start(Date.now() + 10_000);
    await delay(30);
    expect(chunks).toEqual([]);

    renameSync(logPath, rotatedPath);
    writeFileSync(logPath, "new-start-is-larger-than-old\n", "utf8");
    await waitFor(() =>
      chunks.join("").includes("new-start-is-larger-than-old"),
    );
    expect(chunks.join("")).toContain("new-start-is-larger-than-old");

    tailer.stop();
  });

  it("drains a backlog larger than one bounded read", async () => {
    const root = mkdtempSync(join(tmpdir(), "asa-log-backlog-"));
    const logsDir = asaSavedLogsDir(root);
    mkdirSync(logsDir, { recursive: true });
    const logPath = join(logsDir, "ShooterGame.log");
    writeFileSync(logPath, "", "utf8");
    const chunks: string[] = [];
    const tailer = new AsaSavedLogsTailer(root, (text) => chunks.push(text), {
      pollMs: 10,
    });
    tailer.start(Date.now());
    await delay(30);

    const line = `${"x".repeat(300 * 1024)}\n`;
    appendFileSync(logPath, line, "utf8");
    await waitFor(() => chunks.join("").length === line.length);
    expect(chunks.join("")).toHaveLength(line.length);

    tailer.stop();
  });

  it("ignores a newer secondary log file", async () => {
    const root = mkdtempSync(join(tmpdir(), "asa-log-ignore-"));
    const logsDir = asaSavedLogsDir(root);
    mkdirSync(logsDir, { recursive: true });
    const primary = join(logsDir, "ShooterGame.log");
    const secondary = join(logsDir, "CE.log");
    writeFileSync(primary, "from-primary\n", "utf8");
    writeFileSync(secondary, "from-secondary\n", "utf8");
    const chunks: string[] = [];
    const startedAt = Date.now();
    const tailer = new AsaSavedLogsTailer(root, (text) => chunks.push(text), {
      pollMs: 10,
    });
    tailer.start(startedAt);
    await waitFor(() => chunks.join("").includes("from-primary"));
    expect(chunks.join("")).toContain("from-primary");
    expect(chunks.join("")).not.toContain("from-secondary");

    appendFileSync(secondary, "more-secondary\n", "utf8");
    await delay(30);
    expect(chunks.join("")).not.toContain("more-secondary");

    tailer.stop();
  });
});
