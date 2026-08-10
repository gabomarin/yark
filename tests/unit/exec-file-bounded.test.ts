import { describe, expect, it } from "vitest";
import {
  ExecFileBoundedError,
  execFileBounded,
} from "../../src/backend/infra/process/exec-file-bounded";

describe("execFileBounded", () => {
  it("resolves stdout for a fast command", async () => {
    const result =
      process.platform === "win32"
        ? await execFileBounded("cmd.exe", ["/d", "/c", "echo hello"], {
            timeoutMs: 5_000,
            maxBuffer: 64 * 1024,
          })
        : await execFileBounded("node", ["-e", "process.stdout.write('hello')"], {
            timeoutMs: 5_000,
            maxBuffer: 64 * 1024,
          });
    expect(result.stdout.trim()).toBe("hello");
  });

  it("times out a hanging command without blocking forever", async () => {
    const started = Date.now();
    const hang =
      process.platform === "win32"
        ? execFileBounded(
            "powershell.exe",
            ["-NoProfile", "-Command", "Start-Sleep -Seconds 30"],
            { timeoutMs: 400, maxBuffer: 64 * 1024 },
          )
        : execFileBounded("node", ["-e", "setTimeout(() => {}, 30000)"], {
            timeoutMs: 400,
            maxBuffer: 64 * 1024,
          });

    await expect(hang).rejects.toMatchObject({
      name: "ExecFileBoundedError",
      timedOut: true,
      code: "ETIMEDOUT",
    });
    expect(Date.now() - started).toBeLessThan(8_000);
  });

  it("rejects when stdout exceeds maxBuffer", async () => {
    const bloated =
      process.platform === "win32"
        ? execFileBounded(
            "powershell.exe",
            [
              "-NoProfile",
              "-Command",
              "$s = 'x' * 20000; Write-Output $s",
            ],
            { timeoutMs: 5_000, maxBuffer: 256 },
          )
        : execFileBounded(
            "node",
            ["-e", "process.stdout.write('x'.repeat(20000))"],
            { timeoutMs: 5_000, maxBuffer: 256 },
          );

    await expect(bloated).rejects.toBeInstanceOf(ExecFileBoundedError);
  });
});
