import { describe, expect, it } from "vitest";
import {
  formatCostSource,
  formatEstimatedCost,
  formatUsd,
  successRate,
  totalTokens,
} from "./usageFormatting";

describe("usageFormatting", () => {
  it("formats small non-zero catalog estimates with extra precision", () => {
    expect(formatUsd(0.000042)).toMatch(/\$0\.0{3,4}\d/);
    expect(formatUsd(0.42)).toBe("$0.42");
  });

  it("never renders unknown pricing as zero dollars", () => {
    expect(formatEstimatedCost({ cost_usd: 0, cost_known: false, cost_source: "unknown_pricing" })).toBe("Unknown");
    expect(formatEstimatedCost({ cost_usd: 0, cost_known: false, cost_source: "catalog_estimated_usage" })).toBe("Unknown");
  });

  it("recognizes explicit known zero-price usage as Free", () => {
    expect(formatEstimatedCost({ cost_usd: 0, cost_known: true, cost_source: "catalog_provider_usage" })).toBe("Free");
  });

  it("derives total tokens from prompt and completion when total is absent", () => {
    expect(totalTokens({ prompt_tokens: 120, completion_tokens: 30 })).toBe(150);
    expect(totalTokens({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 99 })).toBe(99);
  });

  it("computes success rate from summary counts", () => {
    expect(successRate({ requests: 10, successful: 8, success_rate: 0.825 })).toBe("82.5%");
    expect(successRate({ requests: 4, successful: 1 })).toBe("25.0%");
  });

  it("formats partial cost coverage with subtotal and partial label", () => {
    expect(formatEstimatedCost({ cost_usd: 0.000042, cost_known: false, cost_coverage: "partial", cost_source: "partial_pricing" }))
      .toBe("$0.000042 known subtotal · partial");
    expect(formatEstimatedCost({ cost_usd: 0, cost_known: false, cost_coverage: "partial", cost_source: "partial_pricing" }))
      .toBe("$0.00 known subtotal · partial");
  });

  it("formats partial_pricing cost source label", () => {
    expect(formatCostSource("partial_pricing" as any)).toBe("Partial pricing");
  });
});
