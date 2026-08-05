/**
 * Shared Windows robocopy helper for full-tree and cache-sync copies.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { constants as osConstants, setPriority } from "node:os";
import { resolve } from "node:path";

/** Threads for robocopy — leave disk headroom so Electron stays responsive. */
export const DEFAULT_ROBOCOPY_THREADS = 4;

export class OperationCancelledError extends Error {
  constructor(message = "Operation cancelled by the user") {
    super(message);
    this.name = "OperationCancelledError";
  }
}

export function isOperationCancelledError(error: unknown): boolean {
  return (
    error instanceof OperationCancelledError
    || (error instanceof Error && error.name === "OperationCancelledError")
  );
}

export function isRobocopySuccess(exitCode: number | null): boolean {
  // Robocopy: 0–7 = success with varying copy degrees; >= 8 = error.
  const code = exitCode ?? 16;
  return code >= 0 && code < 8;
}

export interface RobocopyTreeOptions {
  /** Relative directory names to exclude (`/XD`). */
  excludeDirs?: readonly string[];
  onSpawn?: (child: ChildProcess) => void;
  isCancelled?: () => boolean;
  /** Robocopy multi-thread count (default matches ASA cache sync). */
  threads?: number;
  /** Extra label used in error messages. */
  operationLabel?: string;
}

/**
 * Copies `source` → `dest` with robocopy `/E` (includes empty dirs).
 * Does not delete extras at destination.
 */
export async function robocopyTree(
  sourceDir: string,
  destDir: string,
  options: RobocopyTreeOptions = {},
): Promise<number> {
  const source = resolve(sourceDir);
  const dest = resolve(destDir);
  if (source.toLowerCase() === dest.toLowerCase()) {
    return 0;
  }

  const label = options.operationLabel ?? "copy";
  const threads = options.threads ?? DEFAULT_ROBOCOPY_THREADS;
  const excludeDirs = options.excludeDirs ?? [];

  return await new Promise<number>((resolvePromise, reject) => {
    if (options.isCancelled?.() === true) {
      reject(new OperationCancelledError());
      return;
    }

    const args = [
      source,
      dest,
      "/E",
      ...(excludeDirs.length > 0 ? ["/XD", ...excludeDirs] : []),
      "/R:2",
      "/W:2",
      `/MT:${threads}`,
      "/NFL",
      "/NDL",
      "/NJH",
      "/NJS",
      "/nc",
      "/ns",
      "/np",
    ];
    const child = spawn("robocopy.exe", args, {
      windowsHide: true,
      shell: false,
    });
    if (child.pid != null) {
      try {
        setPriority(child.pid, osConstants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        // Best effort: some hosts disallow priority changes.
      }
    }
    options.onSpawn?.(child);

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.once("error", (error) => {
      reject(
        new Error(
          `Could not run robocopy to ${label}: ${error.message}`,
        ),
      );
    });

    child.once("exit", (code) => {
      if (options.isCancelled?.() === true) {
        reject(new OperationCancelledError());
        return;
      }
      const exitCode = code ?? 16;
      if (!isRobocopySuccess(exitCode)) {
        reject(
          new Error(
            `${label} failed (robocopy exit ${exitCode})${
              stderr.trim().length > 0 ? `: ${stderr.trim()}` : ""
            }`,
          ),
        );
        return;
      }
      resolvePromise(exitCode);
    });
  });
}
