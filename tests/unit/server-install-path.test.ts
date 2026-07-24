import { describe, expect, it } from "vitest";
import {
  getServerFolderNameError,
  getWindowsPathError,
  resolveServerInstallDir,
  sanitizeServerFolderName,
} from "@shared/server-install-path";

describe("server-install-path", () => {
  it("rejects folder names with Windows-incompatible characters", () => {
    expect(getServerFolderNameError("my_server")).toBeNull();
    expect(getServerFolderNameError("My Server")).toBeNull();
    expect(getServerFolderNameError('bad<>:"name')).toMatch(/No puede contener/);
    expect(getServerFolderNameError("a/b")).toMatch(/No puede contener/);
    expect(getServerFolderNameError("con")).toMatch(/reservado/i);
    expect(getServerFolderNameError("aux.txt")).toMatch(/reservado/i);
    expect(getServerFolderNameError("ends.")).toMatch(/terminar/);
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
});
