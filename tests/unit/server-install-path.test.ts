import { describe, expect, it } from "vitest";
import {
  getServerFolderNameError,
  getWindowsPathError,
  resolveServerInstallDir,
  sanitizeServerFolderName,
  suggestCloneInstallDir,
  windowsPathParentDir,
} from "@shared/server-install-path";

describe("server-install-path", () => {
  it("rejects folder names with Windows-incompatible characters", () => {
    expect(getServerFolderNameError("my_server")).toBeNull();
    expect(getServerFolderNameError("My Server")).toBeNull();
    expect(getServerFolderNameError('bad<>:"name')).toMatch(/Cannot contain/);
    expect(getServerFolderNameError("a/b")).toMatch(/Cannot contain/);
    expect(getServerFolderNameError("con")).toMatch(/reserved/i);
    expect(getServerFolderNameError("aux.txt")).toMatch(/reserved/i);
    expect(getServerFolderNameError("ends.")).toMatch(/period or space/i);
    expect(getServerFolderNameError("..")).toMatch(/\.\./);
  });

  it("still offers a sanitized suggestion helper", () => {
    expect(sanitizeServerFolderName("my_server")).toBe("my_server");
    expect(sanitizeServerFolderName('bad<>:"name')).toBe("bad_name");
  });

  it("nests server name under the chosen base folder", () => {
    expect(resolveServerInstallDir("C:/ark_servers", "my_server")).toBe(
      "C:\\ark_servers\\my_server",
    );
    expect(resolveServerInstallDir("C:\\ark_servers\\", "My Server")).toBe(
      "C:\\ark_servers\\My Server",
    );
  });

  it("does not double-nest if the base already ends with the server folder", () => {
    expect(resolveServerInstallDir("C:\\ark_servers\\my_server", "my_server")).toBe(
      "C:\\ark_servers\\my_server",
    );
  });

  it("rejects path segments with incompatible characters", () => {
    expect(getWindowsPathError("C:\\ark_servers\\ok")).toBeNull();
    expect(getWindowsPathError("C:\\ark_servers\\bad|name")).toMatch(/bad\|name/);
  });

  it("returns the parent of a Windows install path", () => {
    expect(windowsPathParentDir("C:\\ark_servers\\my_server")).toBe("C:\\ark_servers");
    expect(windowsPathParentDir("C:\\my_server")).toBe("C:\\");
    expect(windowsPathParentDir("C:/ark_servers/my_server/")).toBe("C:\\ark_servers");
  });

  it("suggests a sibling folder for clone installs", () => {
    expect(suggestCloneInstallDir("C:\\ark_servers\\Island", "Island-copy")).toBe(
      "C:\\ark_servers\\Island-copy",
    );
    expect(suggestCloneInstallDir("D:\\ARK", "ARK-copy")).toBe("D:\\ARK-copy");
  });
});
