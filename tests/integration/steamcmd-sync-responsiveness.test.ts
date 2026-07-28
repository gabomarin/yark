/**
 * Integration coverage for #48: robocopy sync must leave the Node event loop
 * responsive enough for UI heartbeats / cancel polling (not a full ASA install).
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ASA_CONTENT_SYNC_ROBOCOPY_THREADS,
  syncAsaContentCacheToInstallDir,
} from "@backend/domains/updates/steamcmd-content-cache";

const roots: string[] = [];

function makeTree(label: string, fileCount: number): string {
  const root = mkdtempSync(join(tmpdir(), `yark-sync-${label}-`));
  roots.push(root);
  const nested = join(root, "ShooterGame", "Content", "Paks");
  mkdirSync(nested, { recursive: true });
  mkdirSync(join(root, "ShooterGame", "Saved"), { recursive: true });
  writeFileSync(join(root, "ShooterGame", "Saved", "keep-me.txt"), "world", "utf8");
  for (let i = 0; i < fileCount; i += 1) {
    writeFileSync(join(nested, `chunk-${i}.bin`), Buffer.alloc(64 * 1024, i % 255));
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0, roots.length)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Best effort on Windows (AV may briefly lock files).
    }
  }
});

describe("steamcmd sync responsiveness (#48)", () => {
  it("uses a moderate robocopy thread count", () => {
    expect(ASA_CONTENT_SYNC_ROBOCOPY_THREADS).toBeLessThanOrEqual(4);
    expect(ASA_CONTENT_SYNC_ROBOCOPY_THREADS).toBeGreaterThanOrEqual(2);
  });

  it.runIf(process.platform === "win32")(
    "keeps the event loop ticking while robocopy syncs a mid-size tree",
    async () => {
      const cache = makeTree("cache", 80);
      const install = makeTree("install-empty", 0);
      // Empty dest tree — only the folder should exist.
      rmSync(join(install, "ShooterGame"), { recursive: true, force: true });
      mkdirSync(install, { recursive: true });

      let ticks = 0;
      const timer = setInterval(() => {
        ticks += 1;
      }, 50);

      const started = Date.now();
      const code = await syncAsaContentCacheToInstallDir(cache, install);
      clearInterval(timer);
      const elapsedMs = Date.now() - started;

      expect(code).toBeGreaterThanOrEqual(0);
      expect(code).toBeLessThan(8);
      expect(existsSync(join(install, "ShooterGame", "Content", "Paks", "chunk-0.bin"))).toBe(
        true,
      );
      expect(existsSync(join(install, "ShooterGame", "Content", "Paks", "chunk-79.bin"))).toBe(
        true,
      );

      // If the main thread were fully blocked for the whole copy, ticks ≈ 0.
      // Fast copies may only see one 50ms tick; longer ones should see more.
      const expectedMinTicks = elapsedMs < 200 ? 1 : Math.max(2, Math.floor(elapsedMs / 250));
      expect(ticks).toBeGreaterThanOrEqual(expectedMinTicks);
    },
    60_000,
  );
});
