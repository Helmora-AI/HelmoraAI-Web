import { describe, expect, it } from "vitest";
import { formatNumeric, parseNumeric } from "./Metric";

describe("Metric count-up helpers", () => {
  it("parses plain integers", () => {
    const parsed = parseNumeric("12");
    expect(parsed).not.toBeNull();
    expect(parsed!.value).toBe(12);
    expect(parsed!.parts).toEqual({ prefix: "", suffix: "", decimals: 0, group: false });
  });

  it("parses grouped thousands, currency prefixes, and unit suffixes", () => {
    expect(parseNumeric("1,200")!.value).toBe(1200);
    expect(parseNumeric("1,200")!.parts.group).toBe(true);
    expect(parseNumeric("$4.25")).toMatchObject({ value: 4.25, parts: { prefix: "$", suffix: "", decimals: 2 } });
    expect(parseNumeric("812 ms")).toMatchObject({ value: 812, parts: { suffix: " ms" } });
    expect(parseNumeric("1.2M")).toMatchObject({ value: 1.2, parts: { suffix: "M", decimals: 1 } });
  });

  it("rejects non-numeric values", () => {
    expect(parseNumeric("Online")).toBeNull();
    expect(parseNumeric("—")).toBeNull();
    expect(parseNumeric("Unknown")).toBeNull();
    expect(parseNumeric("")).toBeNull();
  });

  it("formats back with the original shape", () => {
    expect(formatNumeric(1234, { prefix: "", suffix: "", decimals: 0, group: true })).toBe("1,234");
    expect(formatNumeric(4.25, { prefix: "$", suffix: "", decimals: 2, group: false })).toBe("$4.25");
    expect(formatNumeric(812, { prefix: "", suffix: " ms", decimals: 0, group: false })).toBe("812 ms");
    expect(formatNumeric(1.2, { prefix: "", suffix: "M", decimals: 1, group: false })).toBe("1.2M");
  });
});
