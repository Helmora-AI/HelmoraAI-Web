const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "medium" };
const GRANULAR_KEYS: Array<keyof Intl.DateTimeFormatOptions> = ["weekday", "era", "year", "month", "day", "hour", "minute", "second", "timeZone"];

export function formatDate(value: string, options: Intl.DateTimeFormatOptions = {}): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  const usesGranular = GRANULAR_KEYS.some((key) => key in options);
  const resolved = usesGranular ? options : { ...DEFAULT_DATE_OPTIONS, ...options };
  return new Intl.DateTimeFormat(undefined, resolved).format(date);
}

const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB"];

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return String(value);
  if (value < 1024) return `${value} B`;
  const index = Math.min(Math.floor(Math.log2(value) / 10), BYTE_UNITS.length - 1);
  return `${(value / 1024 ** index).toFixed(1)} ${BYTE_UNITS[index]}`;
}

export function formatRateLimits(limits: Record<string, number>): string {
  const parts: string[] = [];
  if (typeof limits.rpm === "number") parts.push(`${limits.rpm} req/min`);
  if (typeof limits.tpm === "number") parts.push(`${limits.tpm} tok/min`);
  return parts.join(" · ");
}

export function formatDuration(milliseconds: number): string {
  return milliseconds >= 1_000 ? `${Math.round(milliseconds / 1_000)}s` : `${milliseconds}ms`;
}
