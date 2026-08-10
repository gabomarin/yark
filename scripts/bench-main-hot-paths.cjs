/**
 * Rough p50/p95 timings for main-process hot-path helpers (#145).
 * Run on Windows: `node scripts/bench-main-hot-paths.cjs`
 *
 * Not a CI gate — evidence for docs/server-lifecycle.md Main-process I/O.
 */

const { mkdirSync, mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");
const { pathToFileURL } = require("node:url");

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

function summarize(label, samplesMs) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  console.log(
    `${label}: n=${sorted.length} mean=${mean.toFixed(1)}ms p50=${p50?.toFixed(1)}ms p95=${p95?.toFixed(1)}ms`,
  );
}

async function timeMany(label, iterations, fn) {
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const started = performance.now();
    await fn(i);
    samples.push(performance.now() - started);
  }
  summarize(label, samples);
}

async function main() {
  // Load compiled? Prefer ts via electron-vite is heavy — require source through vitest/tsx unavailable.
  // Use dynamic import of built-out is also heavy. Inline minimal fs.promises probes that mirror inspect.
  const { access, readdir, stat, readFile } = require("node:fs/promises");
  const { execFile } = require("node:child_process");
  const { promisify } = require("node:util");
  const execFileAsync = promisify(execFile);

  const root = mkdtempSync(join(tmpdir(), "yark-bench-io-"));
  try {
    const installDir = join(root, "asa");
    const binDir = join(installDir, "ShooterGame", "Binaries", "Win64");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, "ArkAscendedServer.exe"), "fake");
    writeFileSync(join(binDir, "version.txt"), "v99.0\n");
    mkdirSync(join(installDir, "steamapps"), { recursive: true });
    writeFileSync(
      join(installDir, "steamapps", "appmanifest_2430930.acf"),
      '"AppState"\n{\n  "appid" "2430930"\n  "buildid" "100"\n  "installdir" "asa"\n}',
    );

    await timeMany("async-fs-install-probe", 40, async () => {
      await access(join(binDir, "ArkAscendedServer.exe"));
      await readFile(join(binDir, "version.txt"), "utf8");
      await readFile(
        join(installDir, "steamapps", "appmanifest_2430930.acf"),
        "utf8",
      );
      await readdir(installDir);
      await stat(binDir);
    });

    if (process.platform === "win32") {
      await timeMany("bounded-where-steamcmd", 8, async () => {
        try {
          await execFileAsync("where.exe", ["steamcmd.exe"], {
            timeout: 2_000,
            windowsHide: true,
            maxBuffer: 64 * 1024,
          });
        } catch {
          // missing steamcmd is fine for timing
        }
      });

      await timeMany("bounded-powershell-pid-query", 6, async () => {
        const pid = process.pid;
        const script = [
          `$ProcessId = ${pid}`,
          `$p = Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId=' + $ProcessId) -ErrorAction SilentlyContinue`,
          `if ($null -eq $p) { '' } else { $p | Select-Object ProcessId | ConvertTo-Json -Compress }`,
        ].join("; ");
        await execFileAsync(
          "powershell.exe",
          ["-NoProfile", "-NoLogo", "-NonInteractive", "-Command", script],
          { timeout: 5_000, windowsHide: true, maxBuffer: 1024 * 1024 },
        );
      });
    } else {
      console.log("Skipping Windows-only process probes (not win32)");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  console.log(
    "\nNote: after #145, fleet/start use promise FS + execFileBounded; these timings are non-blocking for Electron main.",
  );
  void pathToFileURL; // keep import used if tree-shaken tooling complains
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
