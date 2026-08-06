import { describe, expect, it } from "vitest";
import type { UsageBucket } from "./api/types";
import {
  formatAxisValue,
  formatCardNote,
  formatCardStat,
  formatDateKey,
  formatSummaryCostText,
  formatTooltipValue,
  summarizeBuckets,
  usageTableColumns,
  usageTableRows,
} from "./usageChartStats";

const bucket = (overrides: Partial<UsageBucket> = {}): UsageBucket => ({
  date: "2026-07-01",
  requests: 0,
  successful: 0,
  failed: 0,
  cancelled: 0,
  input_tokens: 0,
  output_tokens: 0,
  total_tokens: 0,
  cost_usd: 0,
  average_latency_ms: null,
  ...overrides,
});

describe("usageChartStats", () => {
  describe("formatAxisValue", () => {
    it("compacts plain counts", () => {
      expect(formatAxisValue("requests", 1200)).toBe("1.2K");
      expect(formatAxisValue("requests", 500)).toBe("500");
    });

    it("formats cost as compact currency", () => {
      expect(formatAxisValue("cost", 2500)).toBe("$2.5K");
      expect(formatAxisValue("cost", 0)).toBe("$0");
    });

    it("formats latency with ms and seconds units", () => {
      expect(formatAxisValue("latency", 250)).toBe("250ms");
      expect(formatAxisValue("latency", 1500)).toBe("1.5s");
      expect(formatAxisValue("latency", 2000)).toBe("2s");
    });

    it("returns empty for non-finite values", () => {
      expect(formatAxisValue("requests", "nope")).toBe("");
    });
  });

  describe("formatTooltipValue", () => {
    it("uses currency precision for the known cost bar and counts for coverage", () => {
      expect(formatTooltipValue("cost", 0.000042, "Known estimate")).toBe("$0.000042");
      expect(formatTooltipValue("cost", 5, "Unknown pricing")).toBe("5");
    });

    it("labels latency with milliseconds", () => {
      expect(formatTooltipValue("latency", 812)).toBe("812 ms");
    });

    it("compacts large token and request values", () => {
      expect(formatTooltipValue("tokens", 1_200_000)).toBe("1.2M");
      expect(formatTooltipValue("requests", 40_000)).toBe("40K");
    });

    it("returns em dash for non-finite values", () => {
      expect(formatTooltipValue("latency", Number.NaN)).toBe("—");
    });
  });

  describe("summarizeBuckets", () => {
    it("sums counts and cost across buckets", () => {
      const aggregate = summarizeBuckets([
        bucket({ requests: 40, successful: 38, failed: 1, cancelled: 1, input_tokens: 30_000, output_tokens: 10_000, total_tokens: 40_000, cost_usd: 0.14, complete_cost_requests: 1, average_latency_ms: 700 }),
        bucket({ date: "2026-07-02", requests: 55, successful: 50, failed: 3, cancelled: 2, input_tokens: 42_000, output_tokens: 12_000, total_tokens: 54_000, cost_usd: 0.000042, unknown_cost_requests: 1, average_latency_ms: 820 }),
      ]);
      expect(aggregate.requests).toBe(95);
      expect(aggregate.input_tokens).toBe(72_000);
      expect(aggregate.cost_usd).toBe(0.140042);
      expect(aggregate.complete_cost_requests).toBe(1);
      expect(aggregate.unknown_cost_requests).toBe(1);
    });

    it("weights average latency by request count", () => {
      const aggregate = summarizeBuckets([
        bucket({ requests: 100, average_latency_ms: 100 }),
        bucket({ requests: 300, average_latency_ms: 200 }),
      ]);
      expect(aggregate.average_latency_ms).toBe(175);
    });

    it("keeps latency null when no bucket has a value", () => {
      const aggregate = summarizeBuckets([bucket({ average_latency_ms: null })]);
      expect(aggregate.average_latency_ms).toBeNull();
    });
  });

  describe("formatCardStat", () => {
    const summary = {
      requests: 1200,
      successful: 1100,
      input_tokens: 900_000,
      output_tokens: 300_000,
      total_tokens: 1_200_000,
      cost_usd: 4.25,
      unknown_cost_requests: 2,
      legacy_cost_requests: 1,
      average_latency_ms: 812,
    };

    it("shows the period headline per metric", () => {
      expect(formatCardStat("requests", summary)).toBe("1,200");
      expect(formatCardStat("tokens", summary)).toBe("1.2M");
      expect(formatCardStat("cost", summary)).toBe("$4.25");
      expect(formatCardStat("latency", summary)).toBe("812 ms");
    });

    it("falls back to an em dash without a source", () => {
      expect(formatCardStat("requests", undefined)).toBe("—");
    });

    it("keeps unknown cost as Unknown and free pricing as Free", () => {
      expect(formatCardStat("cost", { cost_usd: 0, unknown_cost_requests: 3 })).toBe("Unknown");
      expect(formatCardStat("cost", { cost_usd: 0, complete_cost_requests: 5 })).toBe("Free");
    });
  });

  describe("formatCardNote", () => {
    it("summarizes outcomes, tokens, cost coverage, and latency", () => {
      expect(formatCardNote("requests", { successful: 1100 })).toBe("1,100 successful");
      expect(formatCardNote("tokens", { input_tokens: 900_000, output_tokens: 300_000 })).toBe("900K in · 300K out");
      expect(formatCardNote("cost", { cost_usd: 4.25, unknown_cost_requests: 2, legacy_cost_requests: 1 })).toBe("2 unknown pricing · 1 legacy estimate");
      expect(formatCardNote("latency", { physical_attempts: 1400 })).toBe("1,400 physical attempts");
    });

    it("uses a neutral note when latency attempts are unknown", () => {
      expect(formatCardNote("latency", {})).toBe("Average daily latency");
    });
  });

  describe("formatSummaryCostText", () => {
    it("renders Free for known zero-price usage and Unknown for no catalog pricing", () => {
      expect(formatSummaryCostText({ cost_usd: 0, complete_cost_requests: 5 })).toBe("Free");
      expect(formatSummaryCostText({ cost_usd: 0, unknown_cost_requests: 3 })).toBe("Unknown");
    });

    it("renders the dollar amount for any known positive cost", () => {
      expect(formatSummaryCostText({ cost_usd: 4.25, legacy_cost_requests: 1 })).toBe("$4.25");
    });

    it("renders an em dash without a source", () => {
      expect(formatSummaryCostText(undefined)).toBe("—");
    });
  });

  describe("usageTableColumns", () => {
    it("exposes metric-specific column sets", () => {
      expect(usageTableColumns("requests").map((column) => column.key)).toEqual(["requests", "successful", "failed", "cancelled", "partial"]);
      expect(usageTableColumns("cost").map((column) => column.key)).toEqual(["cost_usd", "complete_cost_requests", "partial_cost_requests", "unknown_cost_requests", "legacy_cost_requests"]);
    });
  });

  describe("usageTableRows", () => {
    it("maps buckets to formatted cells for the cost table", () => {
      const rows = usageTableRows("cost", [
        bucket({ date: "2026-07-01", cost_usd: 0.14, complete_cost_requests: 1 }),
        bucket({ date: "2026-07-02", cost_usd: 0.000042, unknown_cost_requests: 1 }),
      ]);
      expect(rows).toEqual([
        { date: "Jul 1", cells: { cost_usd: "$0.14", complete_cost_requests: "1", partial_cost_requests: "0", unknown_cost_requests: "0", legacy_cost_requests: "0" } },
        { date: "Jul 2", cells: { cost_usd: "$0.000042", complete_cost_requests: "0", partial_cost_requests: "0", unknown_cost_requests: "1", legacy_cost_requests: "0" } },
      ]);
    });

    it("shows an em dash for missing latency", () => {
      const rows = usageTableRows("latency", [bucket({ average_latency_ms: null })]);
      expect(rows[0]?.cells.average_latency_ms).toBe("—");
    });
  });

  it("formats date keys in UTC without dropping invalid input", () => {
    expect(formatDateKey("2026-07-01")).toBe("Jul 1");
    expect(formatDateKey("not-a-date")).toBe("not-a-date");
  });
});
