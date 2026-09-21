import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts/ci/discord-release-notify.py").replace(/\\/g, "/");

function runNotifyScript(env: NodeJS.ProcessEnv): { status: number | null; stdout: string; stderr: string } {
  const cmd = process.platform === "win32" ? "py" : "python3";
  const args = process.platform === "win32" ? ["-3", script] : [script];
  const attempt = (command: string, commandArgs: string[]) =>
    spawnSync(command, commandArgs, {
      env: { ...process.env, ...env },
      encoding: "utf8",
      timeout: 15_000,
      windowsHide: true,
    });

  const result = attempt(cmd, args);
  if (result.error || result.status !== 0) {
    const fallback = attempt("python", [script]);
    if (!fallback.error && fallback.status === 0) {
      return { status: fallback.status, stdout: fallback.stdout, stderr: fallback.stderr };
    }
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function runPython(code: string, input: string): string {
  const cmd = process.platform === "win32" ? "py" : "python3";
  const args = process.platform === "win32" ? ["-3", "-c", code] : ["-c", code];
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
        fallback.stderr || result.stderr || String(result.error ?? fallback.error) || "python filter failed",
      );
    }
    return fallback.stdout;
  }
  return result.stdout;
}

function runScript(expr: string, input: string): unknown {
  const py = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("notify", r"${script}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
data = json.loads(sys.stdin.read())
print(json.dumps(${expr}))
`;
  return JSON.parse(runPython(py, input).trim());
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

const sampleChangelogTs = [
  "export const changelog: ChangelogEntry[] = [",
  "  {",
  '    version: "0.2.0",',
  '    date: "2026-01-02",',
  "    sections: [",
  "      {",
  '        title: "Highlights",',
  "        items: [",
  '          "Light theme for bright rooms.",',
  '          "Crash recovery, off by default.",',
  "        ],",
  "      },",
  "    ],",
  "  },",
  "  {",
  '    version: "0.1.0",',
  '    date: "2026-01-01",',
  "    sections: [",
  "      {",
  '        title: "Added",',
  '        items: ["Older line."],',
  "      },",
  "    ],",
  "  },",
  "];",
].join("\n");

describe("discord-release-notify curated What's new", () => {
  it("extracts only the released version and stops at the next entry", () => {
    const sections = runScript(
      'mod.parse_whats_new_sections(data["ts"], data["version"])',
      JSON.stringify({ ts: sampleChangelogTs, version: "0.2.0" }),
    );

    expect(sections).toEqual([
      { title: "Highlights", items: ["Light theme for bright rooms.", "Crash recovery, off by default."] },
    ]);
  });

  it("returns nothing for an unknown version so the GitHub notes fall back", () => {
    const sections = runScript(
      'mod.parse_whats_new_sections(data["ts"], data["version"])',
      JSON.stringify({ ts: sampleChangelogTs, version: "9.9.9" }),
    );

    expect(sections).toEqual([]);
  });

  it("announces the curated What's new instead of the PR list", () => {
    const content = runScript(
      'mod.build_message_content(data["release"], data["sections"])',
      JSON.stringify({
        release: {
          tag_name: "v0.2.0",
          name: "YARK server manager v0.2.0",
          html_url: "https://github.com/gabomarin/yark/releases/tag/v0.2.0",
          prerelease: false,
          body: "* feat: x (#1) by @gabomarin in https://github.com/gabomarin/yark/pull/1",
        },
        sections: [{ title: "Highlights", items: ["Light theme for bright rooms."] }],
      }),
    ) as string;

    expect(content).toContain("**YARK server manager v0.2.0** is available.");
    expect(content).toContain("**Highlights**");
    expect(content).toContain("Light theme for bright rooms.");
    expect(content).not.toContain("pull/1");
    expect(content).not.toContain("@gabomarin");
  });

  it("prints the message and posts nothing in dry-run", () => {
    const dir = mkdtempSync(join(tmpdir(), "yark-discord-dry-run-"));
    const releasePath = join(dir, "release.json");
    const changelogPath = join(dir, "changelog.ts");
    writeFileSync(changelogPath, sampleChangelogTs);
    writeFileSync(
      releasePath,
      JSON.stringify({
        tag_name: "v0.2.0",
        name: "YARK server manager v0.2.0",
        html_url: "https://github.com/gabomarin/yark/releases/tag/v0.2.0",
        prerelease: false,
        assets: [{ name: "setup.exe" }],
        body: "* feat: x (#1) by @gabomarin in https://github.com/gabomarin/yark/pull/1",
      }),
    );

    const { status, stdout } = runNotifyScript({
      RELEASE_JSON: releasePath,
      WHATS_NEW_TS: changelogPath,
      DRY_RUN: "true",
      DISCORD_BOT_TOKEN: "",
      DISCORD_RELEASES_CHANNEL_ID: "",
      WEBHOOK_URL: "",
    });

    expect(status).toBe(0);
    expect(stdout).toContain("dry run");
    expect(stdout).toContain("Light theme for bright rooms.");
    expect(stdout).not.toContain("pull/1");
  });

  it("falls back to the release notes when no curated entry exists", () => {
    const content = runScript(
      'mod.build_message_content(data["release"], data["sections"])',
      JSON.stringify({
        release: {
          tag_name: "v0.2.1",
          name: "YARK server manager v0.2.1",
          html_url: "https://github.com/gabomarin/yark/releases/tag/v0.2.1",
          prerelease: false,
          body: "Operator fix for the launch preview.",
        },
        sections: [],
      }),
    ) as string;

    expect(content).toContain("Operator fix for the launch preview.");
  });
});
