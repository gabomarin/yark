/** Mantine NumberInput value: keep blank/invalid instead of coercing to 0/NaN. */
export function numberInputValueFromIni(value: string): number | "" {
  const trimmed = value.trim();
  if (trimmed === "") {
    return "";
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : "";
}
