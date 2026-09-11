/** MySQL DATETIME(3) is stored UTC without a zone. Emit ISO-8601 with Z. */
export function toApiIsoDateTime(value: string | Date | null | undefined): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  const raw = String(value).trim();
  if (!raw) return "";
  if (/[zZ]$/.test(raw) || /[+-]\d{2}:\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
  }
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const parsed = new Date(`${iso}Z`);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}
