import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts/ci/discord-release-notify.py").replace(
  /\\/g,
  "/",
);

function runPython(code: string, input: string): string {
  const cmd = process.platform === "win32" ? "py" : "python3";
  const args =
    process.platform === "win32" ? ["-3", "-c", code] : ["-c", code];
  const result = spawnSync(cmd, args, {
    input,
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    // Fallback for hosts without the py launcher / python3 alias.
    const fallback = spawnSync("python", ["-c", code], {
      input,
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
    });
    if (fallback.status !== 0) {
      throw new Error(
        fallback.stderr ||
          result.stderr ||
          String(result.error ?? fallback.error) ||
          "python filter failed",
      );
    }
    return fallback.stdout;
  }
  return result.stdout;
}

function filterBody(body: string): string {
  const py = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("notify", r"${script}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(json.dumps(mod.filter_release_notes_body(sys.stdin.read())))
`;
  return JSON.parse(runPython(py, body).trim()) as string;
}

describe("discord-release-notify filter_release_notes_body", () => {
  it("drops the SemVer cut PR bullet from auto-generated notes", () => {
    const input = [
      "## What's Changed",
      "* Add experimental Ark Server API workspace tab (#243) by @gabomarin in https://github.com/gabomarin/yark/pull/537",
      "* release: v0.20.0 by @gabomarin in https://github.com/gabomarin/yark/pull/539",
      "",
      "",
      "**Full Changelog**: https://github.com/gabomarin/yark/compare/v0.19.0...v0.20.0",
    ].join("\n");

    const filtered = filterBody(input);
    expect(filtered).toContain("Ark Server API");
    expect(filtered).toContain("Full Changelog");
    expect(filtered).not.toMatch(/release:\s*v0\.20\.0/i);
  });
});
