import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { UsageBucket } from "../lib/api/types";
import UsageChartData from "./UsageChartData";

const buckets: UsageBucket[] = [
  {
    date: "2026-07-01",
    requests: 40,
    successful: 38,
    failed: 1,
    cancelled: 1,
    input_tokens: 30_000,
    output_tokens: 10_000,
    total_tokens: 40_000,
    cost_usd: 0.14,
    complete_cost_requests: 1,
    average_latency_ms: 700,
  },
  {
    date: "2026-07-02",
    requests: 55,
    successful: 50,
    failed: 3,
    cancelled: 2,
    input_tokens: 42_000,
    output_tokens: 12_000,
    total_tokens: 54_000,
    cost_usd: 0.000042,
    unknown_cost_requests: 1,
    average_latency_ms: 820,
  },
];

describe("UsageChartData", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the date column and metric-specific headers", () => {
    render(<UsageChartData metric="cost" buckets={buckets} />);
    const table = screen.getByRole("table", { name: "Daily cost values" });
    const headers = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(["Date", "Cost", "Known", "Partial pricing", "Unknown pricing", "Legacy"]);
  });

  it("formats a daily row for the cost metric", () => {
    render(<UsageChartData metric="cost" buckets={buckets} />);
    const rows = screen.getAllByRole("row");
    const first = within(rows[1]!).getAllByRole("cell").map((cell) => cell.textContent);
    expect(first).toEqual(["$0.14", "1", "0", "0", "0"]);
  });

  it("renders request-outcome columns for the requests metric", () => {
    render(<UsageChartData metric="requests" buckets={buckets} />);
    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(["Date", "Requests", "Successful", "Failed", "Cancelled", "Partial"]);
  });

  it("renders nothing for an empty bucket list", () => {
    const { container } = render(<UsageChartData metric="latency" buckets={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
