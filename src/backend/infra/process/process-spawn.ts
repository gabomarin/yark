import { spawn, type ChildProcess } from "node:child_process";
import {
  buildWindowsVerbatimSpawnArgs,
  quoteWindowsArg,
} from "../../domains/instances/launch-args";

export function argsIncludeLogFlag(args: readonly string[]): boolean {
  return args.some((arg) => /^[-/]log$/i.test(arg.trim()));
}

export function argsIncludeConsoleFlag(args: readonly string[]): boolean {
  return args.some((arg) => /^[-/]console$/i.test(arg.trim()));
}

export function ensureLaunchLogFlags(
  args: readonly string[],
  nativeConsole: boolean,
): string[] {
  let spawnArgs = [...args];
  if (nativeConsole && !argsIncludeConsoleFlag(spawnArgs)) {
    spawnArgs = [...spawnArgs, "-console"];
  }
  if (!argsIncludeLogFlag(spawnArgs)) {
    spawnArgs = [...spawnArgs, "-log"];
  }
  return spawnArgs;
}

/**
 * Spawns ASA so its raw command line keeps the intended, separate quotes on
 * map and SessionName, and so `child` is always `ArkAscendedServer.exe`.
 */
export function spawnAsaProcess(
  binary: string,
  args: readonly string[],
  cwd: string,
  options: { nativeConsole: boolean },
): ChildProcess {
  const isWindows = process.platform === "win32";
  const spawnArgs = isWindows
    ? buildWindowsVerbatimSpawnArgs([...args])
    : [...args];
  const argv0 = isWindows ? quoteWindowsArg(binary) : binary;

  if (options.nativeConsole) {
    return spawn(binary, spawnArgs, {
      argv0,
      cwd,
      shell: false,
      windowsVerbatimArguments: isWindows,
      windowsHide: false,
      stdio: "ignore",
      detached: true,
    });
  }

  return spawn(binary, spawnArgs, {
    argv0,
    cwd,
    shell: false,
    windowsVerbatimArguments: isWindows,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
}

export function disconnectChildStdio(child: ChildProcess): void {
  for (const stream of [child.stdin, child.stdout, child.stderr]) {
    if (stream == null || stream.destroyed) {
      continue;
    }
    try {
      stream.destroy();
    } catch {
      // Ignore: already closing during Leave.
    }
  }
}
