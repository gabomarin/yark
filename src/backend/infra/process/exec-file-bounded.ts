import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process";

export class ExecFileBoundedError extends Error {
  readonly code: string;
  readonly timedOut: boolean;
  readonly killed: boolean;
  readonly stdout: string;
  readonly stderr: string;

  constructor(
    message: string,
    options: {
      code: string;
      timedOut: boolean;
      killed: boolean;
      stdout: string;
      stderr: string;
    },
  ) {
    super(message);
    this.name = "ExecFileBoundedError";
    this.code = options.code;
    this.timedOut = options.timedOut;
    this.killed = options.killed;
    this.stdout = options.stdout;
    this.stderr = options.stderr;
  }
}

export interface ExecFileBoundedOptions {
  timeoutMs: number;
  /** Caps combined stdout/stderr buffer; Node kills the child when exceeded. */
  maxBuffer?: number;
  windowsHide?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ExecFileBoundedResult {
  stdout: string;
  stderr: string;
}

/**
 * Async `execFile` with explicit timeout and output bounds so Electron main
 * never blocks on PowerShell / where / taskkill stalls (#145).
 */
export function execFileBounded(
  file: string,
  args: readonly string[],
  options: ExecFileBoundedOptions,
): Promise<ExecFileBoundedResult> {
  const timeoutMs = options.timeoutMs;
  const maxBuffer = options.maxBuffer ?? 1024 * 1024;
  const execOptions: ExecFileOptionsWithStringEncoding = {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer,
    windowsHide: options.windowsHide ?? true,
    cwd: options.cwd,
    env: options.env,
  };

  return new Promise((resolve, reject) => {
    execFile(file, [...args], execOptions, (error, stdout, stderr) => {
      const out = typeof stdout === "string" ? stdout : String(stdout ?? "");
      const errOut = typeof stderr === "string" ? stderr : String(stderr ?? "");
      if (error == null) {
        resolve({ stdout: out, stderr: errOut });
        return;
      }

      const errno = error as NodeJS.ErrnoException & {
        killed?: boolean;
        signal?: string | null;
      };
      const timedOut =
        errno.killed === true
        || errno.signal === "SIGTERM"
        || /ETIMEDOUT/i.test(errno.code ?? "")
        || /timed?\s*out/i.test(error.message);
      const code = timedOut
        ? "ETIMEDOUT"
        : (errno.code ?? "EEXEC");
      const detail = timedOut
        ? `Command timed out after ${timeoutMs}ms: ${file}`
        : error.message;
      reject(
        new ExecFileBoundedError(detail, {
          code,
          timedOut,
          killed: errno.killed === true,
          stdout: out,
          stderr: errOut,
        }),
      );
    });
  });
}
