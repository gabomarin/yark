/**
 * Local wall-clock stamp for backup archive filenames: `YYYYMMDD-HHmmss`.
 * Compact, sortable, and intended as the last name segment before `.zip`.
 */
export function formatBackupFileStamp(input: Date | string = new Date()): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    if (typeof input === "string" && input.length > 0) {
      return input.replace(/[:.]/g, "-");
    }
    return formatBackupFileStamp(new Date());
  }
  const pad = (value: number): string => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${day}-${time}`;
}
