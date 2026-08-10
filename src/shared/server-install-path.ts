/**
 * Resolve and validate server install folders (Windows).
 * The user picks a base folder; the server lives in base\<name>.
 */

/** Soft long-path bound shared by IPC Zod and domain path checks (#143). */
export const MAX_WINDOWS_PATH_LENGTH = 4096;

/** Characters forbidden in a Windows folder name. */
const INVALID_FOLDER_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;

/** Reserved Windows device names (with or without extension). */
const RESERVED_FOLDER_NAMES =
  /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i;

const INVALID_CHARS_MESSAGE =
  'Cannot contain < > : " / \\ | ? * or control characters';

/**
 * Returns an error reason if the name is not a valid Windows folder name, or null if valid.
 */
export function getServerFolderNameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "Name required";
  }
  if (trimmed === "." || trimmed === "..") {
    return 'Name cannot be "." or ".."';
  }
  if (INVALID_FOLDER_CHARS.test(trimmed)) {
    return INVALID_CHARS_MESSAGE;
  }
  if (/[. ]$/.test(trimmed)) {
    return "Name cannot end with a period or space";
  }
  if (RESERVED_FOLDER_NAMES.test(trimmed)) {
    return `"${trimmed}" is a reserved Windows name`;
  }
  return null;
}

export function isValidServerFolderName(name: string): boolean {
  return getServerFolderNameError(name) === null;
}

/** Folder name to use (trimmed). Call only after validation. */
export function serverFolderName(name: string): string {
  return name.trim();
}

/**
 * @deprecated Prefer strict validation with getServerFolderNameError.
 * Kept when a cleaned suggestion is needed.
 */
export function sanitizeServerFolderName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\.]+|[_\.]+$/g, "");
  return cleaned.length > 0 ? cleaned : "server";
}

/** Normalize separators and remove trailing separators from a user-entered Windows path. */
export function normalizeWindowsPath(path: string): string {
  return path.trim().replace(/\//g, "\\").replace(/\\+$/g, "");
}

function pathLeaf(path: string): string {
  const parts = normalizeWindowsPath(path).split("\\").filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? "";
}

/** Folder segments of a Windows path (without the drive letter). */
export function windowsPathFolderSegments(path: string): string[] {
  const normalized = normalizeWindowsPath(path);
  if (normalized.startsWith("\\\\")) {
    return normalized.slice(2).split("\\").filter((part) => part.length > 0);
  }
  return normalized
    .replace(/^[a-zA-Z]:\\?/, "")
    .split("\\")
    .filter((part) => part.length > 0);
}

/**
 * Validates that no path segment has characters incompatible with Windows.
 */
export function getWindowsPathError(path: string, fieldLabel = "Path"): string | null {
  const trimmed = path.trim();
  if (trimmed.length === 0) {
    return `${fieldLabel} required`;
  }
  if (trimmed.length > MAX_WINDOWS_PATH_LENGTH) {
    return `${fieldLabel} must be at most ${MAX_WINDOWS_PATH_LENGTH} characters`;
  }
  for (const segment of windowsPathFolderSegments(trimmed)) {
    const error = getServerFolderNameError(segment);
    if (error !== null) {
      return `${fieldLabel}: segment "${segment}" — ${error}`;
    }
  }
  return null;
}

/**
 * Joins base folder + server name.
 * If the base already ends with a folder of the same name, does not nest again.
 */
export function resolveServerInstallDir(parentDir: string, serverName: string): string {
  const parent = normalizeWindowsPath(parentDir);
  const folder = serverFolderName(serverName);
  if (parent.length === 0) {
    return folder;
  }
  if (pathLeaf(parent).toLowerCase() === folder.toLowerCase()) {
    return parent;
  }
  return `${parent}\\${folder}`;
}

/** Parent directory of a Windows path (drive root keeps trailing backslash). */
export function windowsPathParentDir(path: string): string {
  const normalized = normalizeWindowsPath(path);
  const idx = normalized.lastIndexOf("\\");
  if (idx < 0) {
    return normalized;
  }
  const parent = normalized.slice(0, idx);
  if (parent.length === 0) {
    return "\\";
  }
  if (/^[a-zA-Z]:$/.test(parent)) {
    return `${parent}\\`;
  }
  return parent;
}

/** Suggested install folder for a clone: sibling of the source under the same parent. */
export function suggestCloneInstallDir(sourceInstallDir: string, cloneName: string): string {
  return resolveServerInstallDir(windowsPathParentDir(sourceInstallDir), cloneName);
}
