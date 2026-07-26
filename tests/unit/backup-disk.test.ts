import { describe, expect, it } from "vitest";
import {
  isBackupDestinationReachable,
  volumeRootForPath,
} from "@backend/domains/backups/backup-disk";

describe("backup-disk helpers", () => {
  it("resolves Windows drive roots", () => {
    expect(volumeRootForPath("D:\\Backups\\Island")).toBe("D:\\");
    expect(volumeRootForPath("c:/ARK/srv/Backups")).toMatch(/^c:\\$/i);
  });

  it("treats missing roots with an existing parent as reachable", () => {
    expect(isBackupDestinationReachable(process.cwd())).toBe(true);
  });
});
