"use strict";

/**
 * Acceptance: child argv (and ASA Commandline log) must keep quotes:
 *   "TheIsland_WP"?SessionName="gabo"
 *
 * Bare `"` on lpCommandLine are stripped by CommandLineToArgvW →
 *   ARGV0=TheIsland_WP?SessionName=gabo  (matches the broken ASA log).
 *
 * Winning strategy (ProcessManager):
 * - Pass LOGICAL map token: "TheIsland_WP"?SessionName="gabo"
 * - spawn(exe, args, { windowsVerbatimArguments: false, shell: false })
 * - Node quotes spaced exe paths and escapes embedded quotes so argv keeps "
 * - Never .cmd / cmd /c (visible console + tracks cmd.exe, not the game)
 *
 * Verbatim `\"Map\"?SessionName=\"name\"` still works for paths WITHOUT spaces,
 * but breaks spaced exe paths (unquoted path on lpCommandLine).
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function quoteWindowsArg(value) {
  if (value.length === 0) return '""';
  if (!/[\s"]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function mapUrlToWindowsVerbatimArg(logical) {
  return logical.replace(/"/g, '\\"');
}

const logicalMap = '"TheIsland_WP"?SessionName="gabo"';
const logicalArgs = [logicalMap, "-port=7777", "-ServerPlatform=ALL"];
const expectedArgv0 = '"TheIsland_WP"?SessionName="gabo"';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asa-win-argv-"));
const spaceDir = path.join(dir, "path with spaces");
const nospaceDir = path.join(dir, "nospace");
fs.mkdirSync(spaceDir);
fs.mkdirSync(nospaceDir);

const cs = path.join(dir, "ShowCmd.cs");
fs.writeFileSync(
  cs,
  `
using System;
using System.Runtime.InteropServices;
class ShowCmd {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
  static extern IntPtr GetCommandLineW();
  static void Main(string[] args) {
    string raw = Marshal.PtrToStringUni(GetCommandLineW());
    Console.WriteLine("RAW=" + raw);
    string rest = raw;
    if (rest.Length > 0 && rest[0] == '"') {
      int end = rest.IndexOf('"', 1);
      if (end >= 0) rest = rest.Substring(end + 1).TrimStart();
    } else {
      int sp = rest.IndexOf(' ');
      if (sp >= 0) rest = rest.Substring(sp + 1);
    }
    Console.WriteLine("ARGS_RAW=" + rest);
    Console.WriteLine("ARGV0=" + (args.Length > 0 ? args[0] : ""));
  }
}
`,
);

const csc = path.join(
  process.env.WINDIR || "C:\\Windows",
  "Microsoft.NET",
  "Framework64",
  "v4.0.30319",
  "csc.exe",
);
const exeSpace = path.join(spaceDir, "ShowCmd.exe");
const exeNoSpace = path.join(nospaceDir, "ShowCmd.exe");
for (const out of [exeSpace, exeNoSpace]) {
  const r = spawnSync(csc, ["/nologo", `/out:${out}`, cs], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    process.exit(1);
  }
}

function check(label, r) {
  console.log(`\n===== ${label} =====`);
  const out = String(r.stdout || "").trim();
  console.log(out || "(no stdout)");
  if (r.error) console.log("error:", r.error.message);
  const argv0 = out.split(/\r?\n/).find((l) => l.startsWith("ARGV0="));
  const ok = argv0 === `ARGV0=${expectedArgv0}`;
  console.log(ok ? "MATCH_ARGV0_WITH_QUOTES=yes" : "MATCH_ARGV0_WITH_QUOTES=no");
  return ok;
}

let failed = false;

// ProcessManager primary: logical args + Node default escaping (works with spaces)
if (
  !check(
    "non-verbatim logical no-space (ProcessManager)",
    spawnSync(exeNoSpace, logicalArgs, {
      encoding: "utf8",
      windowsVerbatimArguments: false,
      shell: false,
      windowsHide: true,
    }),
  )
) {
  failed = true;
}

if (
  !check(
    "non-verbatim logical spaced path (ProcessManager)",
    spawnSync(exeSpace, logicalArgs, {
      encoding: "utf8",
      windowsVerbatimArguments: false,
      shell: false,
      windowsHide: true,
    }),
  )
) {
  failed = true;
}

// Verbatim + \" still OK without spaces (legacy)
{
  const spawnArgs = logicalArgs.map((a) =>
    a.includes("SessionName=") ? mapUrlToWindowsVerbatimArg(a) : a,
  );
  if (
    !check(
      "verbatim \\\" map no-space (legacy OK)",
      spawnSync(exeNoSpace, spawnArgs, {
        encoding: "utf8",
        windowsVerbatimArguments: true,
        shell: false,
        windowsHide: true,
      }),
    )
  ) {
    failed = true;
  }

  // Prove spaced + verbatim breaks (why we do not use it)
  console.log("\n===== verbatim spaced path (must FAIL — do not use) =====");
  const bad = spawnSync(exeSpace, spawnArgs, {
    encoding: "utf8",
    windowsVerbatimArguments: true,
    shell: false,
    windowsHide: true,
  });
  console.log(String(bad.stdout || "").trim());
  const argv0 = String(bad.stdout || "")
    .split(/\r?\n/)
    .find((l) => l.startsWith("ARGV0="));
  console.log(
    argv0 === `ARGV0=${expectedArgv0}`
      ? "unexpected: spaced verbatim kept quotes"
      : "confirmed: spaced verbatim breaks argv → " + argv0,
  );
}

// Prove shell+literal logical quotes lose argv quotes
{
  const literalLine = [quoteWindowsArg(exeSpace), ...logicalArgs].join(" ");
  const r = spawnSync(literalLine, {
    encoding: "utf8",
    shell: true,
    windowsVerbatimArguments: true,
  });
  console.log("\n===== OLD shell+literal (must FAIL argv quotes) =====");
  console.log(String(r.stdout || "").trim());
  const argv0 = String(r.stdout || "")
    .split(/\r?\n/)
    .find((l) => l.startsWith("ARGV0="));
  console.log(
    argv0 === `ARGV0=${expectedArgv0}`
      ? "unexpected: old path kept argv quotes"
      : "confirmed: old path strips argv quotes → " + argv0,
  );
}

if (failed) {
  console.error("\nFAIL: ProcessManager strategies did not preserve argv quotes");
  process.exit(1);
}
console.log("\nOK: child ARGV0 contains \"TheIsland_WP\"?SessionName=\"gabo\"");
