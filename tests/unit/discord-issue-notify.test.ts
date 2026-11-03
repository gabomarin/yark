import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts/ci/discord-issue-notify.py").replace(/\\/g, "/");

function runPython(code: string, input = ""): string {
  const cmd = process.platform === "win32" ? "py" : "python3";
  const args = process.platform === "win32" ? ["-3", "-c", code] : ["-c", code];
  const result = spawnSync(cmd, args, {
    input,
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const fallback = spawnSync("python", ["-c", code], {
      input,
      encoding: "utf8",
      timeout: 15_000,
      windowsHide: true,
    });
    if (fallback.status !== 0) {
      throw new Error(fallback.stderr || result.stderr || String(result.error ?? fallback.error));
    }
    return fallback.stdout;
  }
  return result.stdout;
}

function call(expr: string, payload: unknown): unknown {
  const py = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("notify", r"${script}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
data = json.loads(sys.stdin.read())
print(json.dumps(${expr}))
`;
  return JSON.parse(runPython(py, JSON.stringify(payload)).trim());
}

function runScript(env: NodeJS.ProcessEnv): { status: number | null; stdout: string; stderr: string } {
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

describe("discord-issue-notify should_notify", () => {
  it("accepts a human other than the owner", () => {
    expect(call("mod.should_notify(data['login'], data['type'])", { login: "ada", type: "User" })).toBe(true);
  });

  it("rejects the owner regardless of case", () => {
    expect(call("mod.should_notify(data['login'], data['type'])", { login: "Gabomarin", type: "User" })).toBe(false);
  });

  it("rejects GitHub bot accounts and [bot] logins", () => {
    expect(call("mod.should_notify(data['login'], data['type'])", { login: "dependabot[bot]", type: "Bot" })).toBe(
      false,
    );
    expect(call("mod.should_notify(data['login'], data['type'])", { login: "renovate[bot]", type: "User" })).toBe(
      false,
    );
  });
});

describe("discord-issue-notify message", () => {
  it("names the issue, author, and canonical link without a raw mention", () => {
    const message = call("mod.build_message(data['number'], data['title'], data['url'], data['author'])", {
      number: 42,
      title: "Crash on boot\n@everyone <https://evil.example>",
      url: "https://github.com/gabomarin/yark/issues/42",
      author: "ada",
    }) as string;

    expect(message).toContain("**Issue #42** opened by ada");
    expect(message).toContain("<https://github.com/gabomarin/yark/issues/42>");
    expect(message).not.toContain("\n@everyone");
    expect(message).not.toContain("<https://evil.example>");
    expect(message.split("\n")[1]).not.toContain("\n");
  });

  it("replaces a foreign html_url with the repo issue link", () => {
    const message = call("mod.build_message(7, 'Title', data, 'ada')", "https://github.com/other/repo/issues/7");
    expect(message).toContain("<https://github.com/gabomarin/yark/issues/7>");
  });
});

describe("discord-issue-notify main", () => {
  it("skips the owner without a Discord token", () => {
    const result = runScript({
      ISSUE_NUMBER: "9",
      ISSUE_TITLE: "Mine",
      ISSUE_URL: "https://github.com/gabomarin/yark/issues/9",
      ISSUE_AUTHOR: "gabomarin",
      ISSUE_USER_TYPE: "User",
      DISCORD_BOT_TOKEN: "",
      DISCORD_ISSUES_CHANNEL_ID: "",
      DRY_RUN: "",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Skip:");
  });

  it("prints a dry run and does not require Discord credentials", () => {
    const result = runScript({
      ISSUE_NUMBER: "10",
      ISSUE_TITLE: "Help",
      ISSUE_URL: "https://github.com/gabomarin/yark/issues/10",
      ISSUE_AUTHOR: "ada",
      ISSUE_USER_TYPE: "User",
      DISCORD_BOT_TOKEN: "",
      DISCORD_ISSUES_CHANNEL_ID: "",
      DRY_RUN: "true",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("nothing posted");
    expect(result.stdout).toContain("**Issue #10** opened by ada");
  });

  it("skips a pull request payload from workflow_dispatch", () => {
    const dir = mkdtempSync(join(tmpdir(), "yark-issue-notify-"));
    const issuePath = join(dir, "issue.json");
    writeFileSync(
      issuePath,
      JSON.stringify({
        number: 11,
        title: "Actually a PR",
        html_url: "https://github.com/gabomarin/yark/pull/11",
        pull_request: { url: "https://api.github.com/repos/gabomarin/yark/pulls/11" },
        user: { login: "ada", type: "User" },
      }),
    );
    const result = runScript({
      ISSUE_JSON: issuePath,
      DRY_RUN: "true",
      DISCORD_BOT_TOKEN: "",
      DISCORD_ISSUES_CHANNEL_ID: "",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Skip: pull request");
  });
});
