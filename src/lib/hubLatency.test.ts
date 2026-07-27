import { describe, expect, it, vi } from "vitest";
import {
  HUB_LATENCY_POLL_MS,
  formatHubLatencyLabel,
  hubLatencyAccessibleName,
  roundLatencyMs,
} from "./hubLatency";

describe("hub latency helpers", () => {
  it("exports a five-second refresh contract", () => {
    expect(HUB_LATENCY_POLL_MS).toBe(5_000);
  });

  it("rounds elapsed time to a whole non-negative millisecond", () => {
    expect(roundLatencyMs(100, 124.4)).toBe(24);
    expect(roundLatencyMs(100, 124.6)).toBe(25);
    expect(roundLatencyMs(200, 199)).toBe(0);
    expect(roundLatencyMs(Number.NaN, 10)).toBe(0);
    expect(roundLatencyMs(0, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("formats pending, success, and error labels without stale success after failure", () => {
    expect(formatHubLatencyLabel("pending")).toBe("… ms");
    expect(formatHubLatencyLabel("success", 24)).toBe("24 ms");
    expect(formatHubLatencyLabel("error", 24)).toBe("Hub offline");
    expect(formatHubLatencyLabel("error")).toBe("Hub offline");
    expect(formatHubLatencyLabel("success", Number.NaN)).toBe("0 ms");
  });

  it("exposes accessible names for the latency badge", () => {
    expect(hubLatencyAccessibleName("pending")).toBe("Checking Hub latency");
    expect(hubLatencyAccessibleName("error")).toBe("Hub offline");
    expect(hubLatencyAccessibleName("success", 18)).toMatch(/Hub round-trip latency 18 ms/u);
  });

  it("probes /health with an injected clock and never /ready or runtime status", async () => {
    const paths: string[] = [];
    let now = 1_000;
    const clock = { now: () => now };
    const request = vi.fn(async (path: string) => {
      paths.push(path);
      now = 1_024.2;
      return { status: "ok", version: "2.0.0-alpha.1", uptime_seconds: 12 };
    });

    const started = clock.now();
    await request("/health");
    const latencyMs = roundLatencyMs(started, clock.now());

    expect(paths).toEqual(["/health"]);
    expect(paths.some((path) => path.includes("/ready") || path.includes("runtime/status"))).toBe(false);
    expect(latencyMs).toBe(24);
    expect(formatHubLatencyLabel("success", latencyMs)).toBe("24 ms");
  });
});
