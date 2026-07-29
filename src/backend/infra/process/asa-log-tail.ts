import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_POLL_MS = 750;

export function asaSavedLogsDir(installDir: string): string {
  return join(installDir, "ShooterGame", "Saved", "Logs");
}

/** Decode ASA/UE log bytes (UTF-8 or UTF-16 LE with BOM). */
export function decodeAsaLogBytes(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    // Rare BE BOM — swap pairs then decode as LE.
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i + 1 < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1]!;
      swapped[i - 1] = buffer[i]!;
    }
    return swapped.toString("utf16le");
  }
  // Heuristic: many NULs in first block ⇒ UTF-16 LE without BOM.
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

export function listAsaLogFiles(logsDir: string): string[] {
  if (!existsSync(logsDir)) return [];
  return readdirSync(logsDir)
    .filter((name) => /\.log$/i.test(name))
    .map((name) => join(logsDir, name));
}

/**
 * Prefer the newest log modified at/after process start; otherwise newest overall.
 */
export function pickAsaLogFile(
  logFiles: string[],
  startedAtMs: number,
): string | null {
  if (logFiles.length === 0) return null;
  const ranked = logFiles
    .map((file) => {
      try {
        const st = statSync(file);
        return { file, mtimeMs: st.mtimeMs, size: st.size };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { file: string; mtimeMs: number; size: number } => entry !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.size - a.size);

  if (ranked.length === 0) return null;
  const fresh = ranked.find((entry) => entry.mtimeMs >= startedAtMs - 2_000);
  return (fresh ?? ranked[0])!.file;
}

/**
 * Follows ShooterGame/Saved/Logs/*.log while a piped ASA process runs.
 * Unreal rarely writes the console stream to stdout when windowsHide is set.
 */
export class AsaSavedLogsTailer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeFile: string | null = null;
  private offset = 0;
  private startedAtMs = 0;
  private readonly pollMs: number;

  constructor(
    private readonly installDir: string,
    private readonly onChunk: (text: string) => void,
    options?: { pollMs?: number },
  ) {
    this.pollMs = options?.pollMs ?? DEFAULT_POLL_MS;
  }

  start(startedAtMs = Date.now()): void {
    this.stop();
    this.startedAtMs = startedAtMs;
    this.activeFile = null;
    this.offset = 0;
    this.timer = setInterval(() => {
      this.tick();
    }, this.pollMs);
    if (typeof this.timer.unref === "function") {
      this.timer.unref();
    }
    this.tick();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.activeFile = null;
    this.offset = 0;
  }

  private tick(): void {
    const logsDir = asaSavedLogsDir(this.installDir);
    const nextFile = pickAsaLogFile(listAsaLogFiles(logsDir), this.startedAtMs);
    if (nextFile === null) return;

    if (nextFile !== this.activeFile) {
      this.activeFile = nextFile;
      // Attach at EOF for pre-existing logs; new/rotated files start at 0 below.
      try {
        const st = statSync(nextFile);
        this.offset =
          st.mtimeMs >= this.startedAtMs - 2_000 && st.size < 64 * 1024
            ? 0
            : st.size;
      } catch {
        this.offset = 0;
      }
    }

    let size = 0;
    try {
      size = statSync(nextFile).size;
    } catch {
      return;
    }

    if (size < this.offset) {
      // Truncated / rotated in place.
      this.offset = 0;
    }
    if (size === this.offset) return;

    const length = size - this.offset;
    const buffer = Buffer.alloc(length);
    let fd: number | null = null;
    try {
      fd = openSync(nextFile, "r");
      readSync(fd, buffer, 0, length, this.offset);
      this.offset = size;
    } catch {
      return;
    } finally {
      if (fd !== null) {
        try {
          closeSync(fd);
        } catch {
          // ignore
        }
      }
    }

    const text = decodeAsaLogBytes(buffer);
    if (text.length > 0) {
      this.onChunk(text);
    }
  }
}
