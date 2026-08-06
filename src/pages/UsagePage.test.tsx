import { fireEvent, render, screen, within, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UsageResponse } from "../lib/api/types";
import { UsagePage } from "./UsagePage";

vi.mock("../components/UsageChart", () => ({
  default: ({ buckets, metric }: { buckets: Array<{ date: string }>; metric: string }) => (
    <div role="img" aria-label={`mock-chart-${metric}`} data-bucket-count={buckets.length} />
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sampleUsage: UsageResponse = {
  summary: {
    requests: 1200,
    successful: 1100,
    failed: 50,
    cancelled: 30,
    partial: 20,
    success_rate: 0.916,
    physical_attempts: 1400,
    input_tokens: 900_000,
    output_tokens: 300_000,
    total_tokens: 1_200_000,
    cost_usd: 4.25,
    unknown_cost_requests: 2,
    legacy_cost_requests: 1,
    average_latency_ms: 812,
    days: 30,
  },
  buckets: [
    { date: "2026-07-01", requests: 40, successful: 38, failed: 1, cancelled: 1, input_tokens: 30_000, output_tokens: 10_000, total_tokens: 40_000, cost_usd: 0.14, unknown_cost_requests: 0, average_latency_ms: 700 },
    { date: "2026-07-02", requests: 55, successful: 50, failed: 3, cancelled: 2, input_tokens: 42_000, output_tokens: 12_000, total_tokens: 54_000, cost_usd: 0.000042, unknown_cost_requests: 1, average_latency_ms: 820 },
  ],
  requests: [
    {
      id: "req_known_cost",
      protocol: "openai-responses",
      requested_model: "gpt-4o-mini",
      selected_model: "gpt-4o-mini",
      selected_provider: "openai",
      status: "completed",
      attempt_count: 1,
      prompt_tokens: 120,
      completion_tokens: 30,
      total_tokens: 150,
      cost_usd: 0.000042,
      usage_source: "provider",
      cost_source: "catalog_provider_usage",
      cost_known: true,
      latency_ms: 640,
      error_code: null,
      created_at: "2026-07-02T12:00:00.000Z",
      completed_at: "2026-07-02T12:00:01.000Z",
    },
    {
      id: "req_unknown_cost",
      protocol: "anthropic-messages",
      requested_model: "custom-model",
      selected_model: "custom-model",
      selected_provider: "custom",
      status: "completed",
      attempt_count: 2,
      prompt_tokens: 80,
      completion_tokens: 20,
      total_tokens: 100,
      cost_usd: 0,
      usage_source: "estimated",
      cost_source: "unknown_pricing",
      cost_known: false,
      latency_ms: 910,
      error_code: null,
      created_at: "2026-07-02T13:00:00.000Z",
      completed_at: "2026-07-02T13:00:02.000Z",
    },
    {
      id: "req_failed",
      protocol: "openai-chat",
      requested_model: "gpt-4o",
      selected_model: "gpt-4o-2024-05-13",
      selected_provider: "openai",
      status: "failed",
      attempt_count: 3,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost_usd: 0,
      usage_source: "unknown",
      cost_source: "unknown_pricing",
      cost_known: false,
      latency_ms: 1200,
      error_code: "upstream_timeout",
      created_at: "2026-07-02T14:00:00.000Z",
      completed_at: "2026-07-02T14:00:02.000Z",
    },
  ],
};

describe("UsagePage expanded monitoring UI", () => {
  it("maps full-period summary cards and discloses the capped ledger", async () => {
    stubUsageApi(sampleUsage);
    const { container } = renderUsage();
    expect((await screen.findAllByText("1.2M")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("$4.25").length).toBeGreaterThan(0);
    expect(screen.getByText(/91\.6% successful/)).toBeInTheDocument();
    expect(screen.getByText(/50 failed/)).toBeInTheDocument();
    expect(screen.getAllByText(/2 unknown pricing · 1 legacy estimate/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Recent requests only/)).toBeInTheDocument();
    expect(screen.getByText(/3 shown · 3 loaded/)).toBeInTheDocument();
    expect(container.querySelector(".usage-ledger__scroll")).toBeTruthy();
  });

  it("explains partial pricing and unknown coverage in summary note when present", async () => {
    stubUsageApi({
      ...sampleUsage,
      summary: {
        ...sampleUsage.summary,
        complete_cost_requests: 10,
        partial_cost_requests: 3,
        unknown_cost_requests: 2,
        legacy_cost_requests: 0,
      },
    });
    renderUsage();
    expect((await screen.findAllByText(/3 partial pricing · 2 unknown pricing/)).length).toBeGreaterThan(0);
  });

  it("uses real Hub protocol values and friendly labels without Google option", async () => {
    stubUsageApi(sampleUsage);
    renderUsage();
    await screen.findByText("req_known_cost");
    const protocolSelect = screen.getByLabelText("Filter loaded rows by protocol") as HTMLSelectElement;
    const options = Array.from(protocolSelect.options).map((opt) => ({ value: opt.value, text: opt.text }));
    expect(options).toEqual([
      { value: "all", text: "All protocols" },
      { value: "openai-chat", text: "OpenAI Chat Completions" },
      { value: "openai-responses", text: "OpenAI Responses" },
      { value: "anthropic-messages", text: "Anthropic Messages" },
      { value: "legacy-completions", text: "Legacy Completions" },
      { value: "embeddings", text: "Embeddings" },
      { value: "helmora-native", text: "Helmora Native" },
    ]);
  });

  it("displays model cell without coalescing selected_model away when selected_provider exists", async () => {
    stubUsageApi(sampleUsage);
    renderUsage();
    const row = (await screen.findByText("req_failed")).closest("tr")!;
    expect(within(row).getByText("gpt-4o")).toBeInTheDocument();
    expect(within(row).getByText("openai · gpt-4o-2024-05-13")).toBeInTheDocument();
  });

  it("shows filter-specific empty message when filters produce zero matches", async () => {
    stubUsageApi(sampleUsage);
    renderUsage();
    await screen.findByText("req_known_cost");
    await userEvent.selectOptions(screen.getByLabelText("Filter loaded rows by protocol"), "embeddings");
    expect(screen.getByText("No loaded requests match these filters.")).toBeInTheDocument();
    expect(screen.queryByText("No requests in this period.")).toBeNull();
  });

  it("feeds Hub buckets to the chart and switches metrics without refetching", async () => {
    const fetchMock = stubUsageApi(sampleUsage);
    renderUsage();
    await waitFor(() => {
      expect(screen.getByRole("img", { name: "mock-chart-requests" }).getAttribute("data-bucket-count")).toBe("2");
    });
    await userEvent.selectOptions(screen.getByLabelText("Metric"), "tokens");
    expect(await screen.findByRole("img", { name: "mock-chart-tokens" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes("/api/v2/admin/usage"))).toHaveLength(1);
  });

  it("renders ledger token columns, unknown cost, and small non-zero estimates", async () => {
    stubUsageApi(sampleUsage);
    renderUsage();
    const row = (await screen.findByText("req_known_cost")).closest("tr")!;
    expect(within(row).getByText("120")).toBeInTheDocument();
    expect(within(row).getByText("30")).toBeInTheDocument();
    expect(within(row).getByText("150")).toBeInTheDocument();
    expect(within(row).getByText(/\$0\.0{3,4}\d/)).toBeInTheDocument();
    const unknownRow = screen.getByText("req_unknown_cost").closest("tr")!;
    expect(within(unknownRow).getByText("Unknown")).toBeInTheDocument();
    expect(within(unknownRow).queryByText("$0.00")).toBeNull();
  });

  it("filters only the loaded recent rows client-side", async () => {
    stubUsageApi(sampleUsage);
    renderUsage();
    await screen.findByText("req_failed");
    await userEvent.selectOptions(screen.getByLabelText("Filter loaded rows by status"), "failed");
    expect(screen.getByText("req_failed")).toBeInTheDocument();
    expect(screen.queryByText("req_known_cost")).toBeNull();
    expect(screen.getByText(/1 shown · 3 loaded/)).toBeInTheDocument();
  });

  it("opens a structured inspector with collapsed raw JSON and keyboard close", async () => {
    stubUsageApi(sampleUsage, {
      id: "req_known_cost",
      status: "completed",
      protocol: "openai",
      requested_model: "gpt-4o-mini",
      selected_provider: "openai",
      selected_model: "gpt-4o-mini",
      prompt_tokens: 120,
      completion_tokens: 30,
      total_tokens: 150,
      cost_usd: 0.000042,
      cost_known: true,
      cost_source: "catalog_provider_usage",
      usage_source: "provider",
      latency_ms: 640,
      attempts: [
        {
          attempt_index: 0,
          provider_id: "openai",
          model_id: "gpt-4o-mini",
          connection_ref: "conn_abc123",
          status: "completed",
          latency_ms: 640,
          ttft_ms: 120,
          prompt_tokens: 120,
          completion_tokens: 30,
          total_tokens: 150,
          cost_usd: 0.000042,
          cost_known: true,
          cost_source: "catalog_provider_usage",
          error_code: null,
          created_at: "2026-07-02T12:00:01.000Z",
        },
      ],
    });
    renderUsage();
    const row = await screen.findByText("req_known_cost");
    await userEvent.click(within(row.closest("tr")!).getByRole("button", { name: "Inspect" }));
    const dialog = await screen.findByRole("dialog", { name: "Request details" });
    expect(within(dialog).getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(within(dialog).getByText("Catalog · provider usage")).toBeInTheDocument();
    expect(within(dialog).getByText("conn_abc123")).toBeInTheDocument();
    const advanced = screen.getByText("Advanced").closest("details")!;
    expect(advanced).not.toHaveAttribute("open");
    expect(within(advanced).getByText(/"attempts"/)).not.toBeVisible();
    fireEvent.click(screen.getByText("Advanced"));
    expect(within(advanced).getByText(/"attempts"/)).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves focus into the dialog on open, traps Tab/Shift+Tab, and restores focus to the Inspect button on close", async () => {
    stubUsageApi(sampleUsage, {
      id: "req_known_cost",
      status: "completed",
      attempts: [],
    });
    renderUsage();
    const row = await screen.findByText("req_known_cost");
    const inspectBtn = within(row.closest("tr")!).getByRole("button", { name: "Inspect" });
    inspectBtn.focus();
    expect(document.activeElement).toBe(inspectBtn);

    await userEvent.click(inspectBtn);
    const dialog = await screen.findByRole("dialog", { name: "Request details" });

    // Focus must move inside the dialog
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    // Tab wrapping test
    const closeBtn = within(dialog).getByRole("button", { name: "Close" });
    closeBtn.focus();
    fireEvent.keyDown(closeBtn, { key: "Tab", shiftKey: true });
    // Focus should move to last focusable element in dialog
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Escape closes dialog and restores focus to Inspect button
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(inspectBtn);
  });

  it("keeps sticky headings and horizontal overflow inside the ledger scroll region", async () => {
    stubUsageApi(sampleUsage);
    const { container } = renderUsage();
    await screen.findByText("req_known_cost");
    const scroll = container.querySelector(".usage-ledger__scroll")!;
    expect(scroll.className).toContain("usage-ledger__scroll");
    expect(scroll.querySelector(".usage-table")).toBeTruthy();
    expect(scroll.querySelector("thead th")).toBeTruthy();
    expect(scroll.querySelector(".helmora-scroll__viewport")).toBeTruthy();
  });
});

function renderUsage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UsagePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function stubUsageApi(usage: UsageResponse, detail?: Record<string, unknown>) {
  const fetchMock = vi.fn(async (inputUrl: RequestInfo | URL) => {
    const url = String(inputUrl);
    if (url.includes("/api/v2/admin/usage")) return json(usage);
    if (url.includes("/api/v2/requests/")) return json(detail ?? { id: "req_known_cost", status: "completed", attempts: [] });
    throw new Error(`Unhandled fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}
