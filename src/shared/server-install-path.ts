/**
 * Resolución y validación de carpetas de instalación de servidor (Windows).
 * El usuario elige una carpeta base; el servidor vive en base\<nombre>.
 */

/** Caracteres prohibidos en un nombre de carpeta Windows. */
const INVALID_FOLDER_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;

/** Nombres reservados de dispositivo en Windows (con o sin extensión). */
const RESERVED_FOLDER_NAMES =
  /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i;

const INVALID_CHARS_MESSAGE =
  'No puede contener < > : " / \\ | ? * ni caracteres de control';

/**
 * Devuelve el motivo de error si el nombre no es válido como carpeta Windows, o null si es válido.
 */
export function getServerFolderNameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "Nombre requerido";
  }
  if (trimmed === "." || trimmed === "..") {
    return 'El nombre no puede ser "." ni ".."';
  }
  if (INVALID_FOLDER_CHARS.test(trimmed)) {
    return INVALID_CHARS_MESSAGE;
  }
  if (/[. ]$/.test(trimmed)) {
    return "El nombre no puede terminar en punto ni espacio";
  }
  if (RESERVED_FOLDER_NAMES.test(trimmed)) {
    return `"${trimmed}" es un nombre reservado de Windows`;
  }
  return null;
}

export function isValidServerFolderName(name: string): boolean {
  return getServerFolderNameError(name) === null;
}

/** Nombre de carpeta a usar (trim). Solo llamar tras validar. */
export function serverFolderName(name: string): string {
  return name.trim();
}

/**
 * @deprecated Preferir validación estricta con getServerFolderNameError.
 * Conservado por si se necesita una sugerencia limpia.
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

function normalizeWindowsPath(path: string): string {
  return path.trim().replace(/\//g, "\\").replace(/\\+$/g, "");
}

function pathLeaf(path: string): string {
  const parts = normalizeWindowsPath(path).split("\\").filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? "";
}

/** Segmentos de carpeta de una ruta Windows (sin la unidad). */
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
 * Valida que ningún segmento de la ruta tenga caracteres incompatibles con Windows.
 */
export function getWindowsPathError(path: string, fieldLabel = "Ruta"): string | null {
  const trimmed = path.trim();
  if (trimmed.length === 0) {
    return `${fieldLabel} requerida`;
  }
  for (const segment of windowsPathFolderSegments(trimmed)) {
    const error = getServerFolderNameError(segment);
    if (error !== null) {
      return `${fieldLabel}: segmento "${segment}" — ${error}`;
    }
  }
  return null;
}

/**
 * Une carpeta base + nombre del servidor.
 * Si la base ya termina en una carpeta con el mismo nombre, no anida de nuevo.
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
