import { describe, expect, it } from "vitest";
import { formatBytes, formatDate, formatDuration, formatRateLimits } from "./format";

describe("format", () => {
  it("formats dates and falls back to the raw value when invalid", () => {
    const formatted = formatDate("2026-01-02T03:04:05Z");
    expect(formatted).not.toBe("2026-01-02T03:04:05Z");
    expect(formatted).toContain("2026".slice(-2));
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  it("formats four-digit years when asked", () => {
    expect(formatDate("2026-01-02T03:04:05Z", { year: "numeric", month: "2-digit", day: "2-digit" })).toContain("2026");
  });

  it("supports date-only overrides", () => {
    expect(formatDate("2026-01-02T03:04:05Z", { dateStyle: "medium" })).not.toMatch(/03:04/);
  });

  it("formats byte sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KiB");
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(1024 ** 2)).toBe("1.0 MiB");
    expect(formatBytes(1024 ** 3)).toBe("1.0 GiB");
  });

  it("formats rate limits", () => {
    expect(formatRateLimits({})).toBe("");
    expect(formatRateLimits({ rpm: 10 })).toBe("10 req/min");
    expect(formatRateLimits({ tpm: 5 })).toBe("5 tok/min");
    expect(formatRateLimits({ rpm: 10, tpm: 5 })).toBe("10 req/min · 5 tok/min");
  });

  it("formats durations", () => {
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(1_000)).toBe("1s");
    expect(formatDuration(1_500)).toBe("2s");
  });
});
