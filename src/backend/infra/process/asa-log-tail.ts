import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readSync,
  readdirSync,
  statSync,
} from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";

const DEFAULT_POLL_MS = 750;
const MAX_READ_BYTES = 256 * 1024;

type AsaLogEncoding = "utf8" | "utf16le" | "utf16be";

interface FileSnapshot {
  identity: string;
  mtimeMs: number;
  size: number;
}

export function asaSavedLogsDir(installDir: string): string {
  return join(installDir, "ShooterGame", "Saved", "Logs");
}

/** Canonical ASA session log; do not follow other *.log files in the folder. */
export function asaPrimaryLogPath(installDir: string): string {
  return join(asaSavedLogsDir(installDir), "ShooterGame.log");
}

const DEFAULT_EXCERPT_BYTES = 64 * 1024;

/** Identity + size of ShooterGame.log at process start (crash diagnosis must ignore older bytes). */
export interface AsaLogSessionAnchor {
  identity: string | null;
  size: number;
  mtimeMs: number;
}

function asaLogFileIdentity(stats: {
  dev: number | bigint;
  ino: number | bigint;
  birthtimeMs: number;
}): string {
  return `${String(stats.dev)}:${String(stats.ino)}:${stats.birthtimeMs}`;
}

export function captureAsaLogSessionAnchor(installDir: string): AsaLogSessionAnchor {
  const path = asaPrimaryLogPath(installDir);
  try {
    const stats = statSync(path);
    return {
      identity: asaLogFileIdentity(stats),
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    };
  } catch {
    return { identity: null, size: 0, mtimeMs: 0 };
  }
}

function readFdTailRange(
  fd: number,
  fileSize: number,
  rangeStart: number,
  maxBytes: number,
): Buffer {
  if (fileSize <= rangeStart) return Buffer.alloc(0);
  const position = Math.max(rangeStart, fileSize - maxBytes);
  const length = fileSize - position;
  const buffer = Buffer.alloc(length);
  const bytesRead = readSync(fd, buffer, 0, length, position);
  return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
}

/**
 * Last `maxBytes` of ShooterGame.log without reading the whole file into memory.
 */
export function readAsaLogTailExcerpt(
  installDir: string,
  maxBytes = DEFAULT_EXCERPT_BYTES,
): string {
  const path = asaPrimaryLogPath(installDir);
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return "";
  }
  try {
    const stats = fstatSync(fd);
    return decodeAsaLogBytes(readFdTailRange(fd, stats.size, 0, maxBytes));
  } finally {
    closeSync(fd);
  }
}

/**
 * Bytes written to ShooterGame.log after `anchor` (or a replaced/truncated file).
 * Caps at the last `maxBytes` of that session range.
 */
export function readAsaLogSessionExcerpt(
  installDir: string,
  anchor: AsaLogSessionAnchor,
  maxBytes = DEFAULT_EXCERPT_BYTES,
): string {
  const path = asaPrimaryLogPath(installDir);
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return "";
  }
  try {
    const stats = fstatSync(fd);
    const replacedOrTruncated =
      anchor.identity === null ||
      asaLogFileIdentity(stats) !== anchor.identity ||
      stats.size < anchor.size;
    const sessionStart = replacedOrTruncated ? 0 : anchor.size;
    return decodeAsaLogBytes(readFdTailRange(fd, stats.size, sessionStart, maxBytes));
  } finally {
    closeSync(fd);
  }
}

export function listAsaLogFiles(logsDir: string): string[] {
  if (!existsSync(logsDir)) return [];
  const files: string[] = [];
  for (const name of readdirSync(logsDir)) {
    if (/\.log$/i.test(name)) {
      files.push(join(logsDir, name));
    }
  }
  return files;
}

/** Decode ASA/UE log bytes (UTF-8 or UTF-16 LE with BOM). */
export function decodeAsaLogBytes(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i + 1 < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1]!;
      swapped[i - 1] = buffer[i]!;
    }
    return swapped.toString("utf16le");
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 64));
  let nulCount = 0;
  for (const byte of sample) {
    if (byte === 0) nulCount += 1;
  }
  if (sample.length >= 8 && nulCount >= sample.length / 4) {
    return buffer.toString("utf16le");
  }
  return buffer.toString("utf8");
}

/**
 * Prefer `ShooterGame.log` when present. Other *.log files are ignored so Runtime
 * does not jump between secondary Unreal logs.
 */
export function pickAsaLogFile(
  logFiles: string[],
  _startedAtMs?: number,
): string | null {
  const primary = logFiles.find((file) =>
    /(?:^|[/\\])ShooterGame\.log$/i.test(file),
  );
  return primary ?? null;
}

/**
 * Follows ShooterGame/Saved/Logs/ShooterGame.log while a piped ASA process runs.
 * Handles in-place truncate/rotation, incomplete UTF-16 bytes, and partial lines.
 */
export class AsaSavedLogsTailer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private activeFileIdentity: string | null = null;
  private offset = 0;
  private readonly pollMs: number;
  private pendingBytes = Buffer.alloc(0);
  private pendingText = "";
  private encoding: AsaLogEncoding | null = null;
  private decoder: StringDecoder | null = null;

  constructor(
    private readonly installDir: string,
    private readonly onChunk: (text: string) => void,
    options?: { pollMs?: number },
  ) {
    this.pollMs = options?.pollMs ?? DEFAULT_POLL_MS;
  }

  start(
    anchor: AsaLogSessionAnchor = captureAsaLogSessionAnchor(this.installDir),
  ): void {
    this.stop();
    this.activeFileIdentity = anchor.identity;
    this.offset = anchor.size;
    this.resetDecodingState();
    const generation = ++this.generation;
    void this.poll(generation);
  }

  stop(): void {
    this.generation += 1;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flushDecoder();
    this.flushPendingText();
    this.activeFileIdentity = null;
    this.offset = 0;
    this.resetDecodingState();
  }

  private async poll(generation: number): Promise<void> {
    let hasMore = false;
    try {
      hasMore = await this.tick(generation);
    } catch {
      // The file may disappear while Unreal rotates it; retry on the next poll.
    }
    if (generation !== this.generation) return;
    this.timer = setTimeout(() => {
      void this.poll(generation);
    }, hasMore ? 0 : this.pollMs);
    if (typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  private async tick(generation: number): Promise<boolean> {
    const nextFile = asaPrimaryLogPath(this.installDir);
    let handle;
    try {
      handle = await open(nextFile, "r");
    } catch {
      return false;
    }

    try {
      const stats = await handle.stat();
      if (generation !== this.generation) return false;
      const snapshot = this.snapshot(stats);

      if (this.activeFileIdentity === null) {
        // File appeared after start — read from the beginning of the new file.
        this.activeFileIdentity = snapshot.identity;
        this.offset = 0;
        this.resetDecodingState();
      } else if (snapshot.identity !== this.activeFileIdentity) {
        // ShooterGame.log was renamed/replaced, even if the new file is larger.
        this.activeFileIdentity = snapshot.identity;
        this.offset = 0;
        this.resetDecodingState();
      } else if (snapshot.size < this.offset) {
        // Truncated in place.
        this.offset = 0;
        this.resetDecodingState();
      }

      if (snapshot.size === this.offset) return false;

      const length = Math.min(snapshot.size - this.offset, MAX_READ_BYTES);
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(
        buffer,
        0,
        length,
        this.offset,
      );
      if (generation !== this.generation || bytesRead === 0) return false;
      this.offset += bytesRead;
      this.consumeBytes(buffer.subarray(0, bytesRead));
      return this.offset < snapshot.size;
    } finally {
      await handle.close().catch(() => undefined);
    }
  }

  private consumeBytes(buffer: Buffer): void {
    let data = Buffer.concat([this.pendingBytes, buffer]);
    this.pendingBytes = Buffer.alloc(0);
    if (data.length === 0) return;

    if (this.encoding === null) {
      if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
        this.setEncoding("utf16le");
        data = data.subarray(2);
      } else if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
        this.setEncoding("utf16be");
        data = data.subarray(2);
      } else {
        if (
          data.length < 8 &&
          (!data.includes(0x0a) || data.includes(0x00))
        ) {
          this.pendingBytes = data;
          return;
        }
        const sample = data.subarray(0, Math.min(data.length, 64));
        let nulCount = 0;
        for (const byte of sample) {
          if (byte === 0) nulCount += 1;
        }
        this.setEncoding(
          sample.length >= 8 && nulCount >= sample.length / 4
            ? "utf16le"
            : "utf8",
        );
      }
    }

    if (this.encoding === "utf16be" && data.length % 2 === 1) {
      this.pendingBytes = data.subarray(data.length - 1);
      data = data.subarray(0, data.length - 1);
    }
    if (data.length === 0) return;

    const decoded =
      this.encoding === "utf16be"
        ? this.swapUtf16Pairs(data)
        : data;
    const text = this.decoder?.write(decoded) ?? "";
    this.emitDecodedText(text);
  }

  private setEncoding(encoding: AsaLogEncoding): void {
    this.encoding = encoding;
    this.decoder = new StringDecoder(
      encoding === "utf8" ? "utf8" : "utf16le",
    );
  }

  private resetDecodingState(): void {
    this.pendingBytes = Buffer.alloc(0);
    this.pendingText = "";
    this.encoding = null;
    this.decoder = null;
  }

  private flushDecoder(): void {
    if (this.encoding === null && this.pendingBytes.length > 0) {
      this.setEncoding(
        this.pendingBytes.includes(0x00) &&
          this.pendingBytes.length % 2 === 0
          ? "utf16le"
          : "utf8",
      );
    }
    if (this.pendingBytes.length > 0) {
      const pending =
        this.encoding === "utf16be"
          ? this.swapUtf16Pairs(
              this.pendingBytes.subarray(
                0,
                this.pendingBytes.length - (this.pendingBytes.length % 2),
              ),
            )
          : this.pendingBytes;
      this.pendingBytes = Buffer.alloc(0);
      if (pending.length > 0) {
        this.emitDecodedText(this.decoder?.write(pending) ?? "");
      }
    }
    this.emitDecodedText(this.decoder?.end() ?? "");
  }

  private swapUtf16Pairs(buffer: Buffer): Buffer {
    const swapped = Buffer.allocUnsafe(buffer.length);
    for (let i = 0; i + 1 < buffer.length; i += 2) {
      swapped[i] = buffer[i + 1]!;
      swapped[i + 1] = buffer[i]!;
    }
    return swapped;
  }

  private snapshot(stats: {
    dev: number | bigint;
    ino: number | bigint;
    birthtimeMs: number;
    mtimeMs: number;
    size: number;
  }): FileSnapshot {
    return {
      identity: asaLogFileIdentity(stats),
      mtimeMs: stats.mtimeMs,
      size: stats.size,
    };
  }

  private emitDecodedText(text: string): void {
    const combined = this.pendingText + text;
    const parts = combined.split(/\r?\n/);
    this.pendingText = parts.pop() ?? "";
    const complete = parts.filter((line) => line.trim().length > 0);
    if (complete.length > 0) {
      this.onChunk(`${complete.join("\n")}\n`);
    }
  }

  private flushPendingText(): void {
    const leftover = this.pendingText.trim();
    this.pendingText = "";
    if (leftover.length > 0) {
      this.onChunk(`${leftover}\n`);
    }
  }
}
