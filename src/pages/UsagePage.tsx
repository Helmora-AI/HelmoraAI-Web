import { Badge, Button } from "@astryxdesign/core";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { HelmoraScrollArea } from "../components/HelmoraScrollArea";
import { RequestError } from "../components/InlineAlert";
import { api } from "../lib/api/client";
import type { UsageRequest, UsageResponse } from "../lib/api/types";
import {
  formatCostSource,
  formatEstimatedCost,
  formatModelSubtext,
  formatNumber,
  formatProtocolLabel,
  formatUsd,
  formatUsageSource,
  successRate,
  totalTokens,
} from "../lib/usageFormatting";
import type { UsageMetric } from "../components/UsageChart";

const UsageChart = lazy(() => import("../components/UsageChart"));
const USAGE_CHARTS: Array<{ metric: UsageMetric; eyebrow: string; title: string; description: string }> = [
  { metric: "requests", eyebrow: "Reliability", title: "Request outcomes", description: "Successful, failed, cancelled, and partial requests." },
  { metric: "tokens", eyebrow: "Demand", title: "Token volume", description: "Input and output token consumption over time." },
  { metric: "cost", eyebrow: "Economics", title: "Estimated cost", description: "Known catalog cost with unknown-pricing coverage." },
  { metric: "latency", eyebrow: "Performance", title: "Average latency", description: "End-to-end response time for logical requests." },
];

export function UsagePage() {
  const [days, setDays] = useState("30");
  const [metric, setMetric] = useState<UsageMetric>("requests");
  const [selected, setSelected] = useState<string>();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [protocolFilter, setProtocolFilter] = useState("all");
  const triggerRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);

  const usage = useQuery({ queryKey: ["usage", days], queryFn: () => api.request<UsageResponse>(`/api/v2/admin/usage?days=${days}&limit=500`) });
  const details = useQuery({
    queryKey: ["request", selected],
    queryFn: () => api.request<Record<string, unknown>>(`/api/v2/requests/${encodeURIComponent(selected!)}`),
    enabled: Boolean(selected),
  });

  useEffect(() => {
    if (!selected) return;
    triggerRef.current = document.activeElement as HTMLElement | null;

    const timer = setTimeout(() => {
      if (modalRef.current) {
        const closeBtn = modalRef.current.querySelector<HTMLElement>("button, [tabindex='0']");
        (closeBtn ?? modalRef.current).focus();
      }
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelected(undefined);
        return;
      }
      if (event.key === "Tab" && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);

        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;

        if (event.shiftKey && (document.activeElement === first || document.activeElement === modalRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [selected]);

  const summary = usage.data?.summary;
  const filteredRequests = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (usage.data?.requests ?? []).filter((request) => {
      if (statusFilter !== "all" && request.status !== statusFilter) return false;
      if (protocolFilter !== "all" && request.protocol !== protocolFilter) return false;
      if (!needle) return true;
      const haystack = [
        request.id,
        request.requested_model,
        request.selected_model ?? "",
        request.selected_provider ?? "",
        request.protocol,
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [usage.data?.requests, search, statusFilter, protocolFilter]);

  return (
    <div className="page page--usage">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Observability</p>
          <h2>Every token has a route and an outcome.</h2>
          <p>Inspect aggregate demand, estimated cost, latency, request status, and every upstream attempt without exposing provider credentials.</p>
        </div>
        <label className="native-field period-select">
          <span>Period</span>
          <select value={days} onChange={(event) => { setDays(event.target.value); }}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </select>
        </label>
      </section>
      {usage.error ? <RequestError error={usage.error} /> : null}
      <section className="metric-strip usage-summary">
        <Metric label="Requests" value={formatNumber(summary?.requests)} note={formatRequestBreakdown(summary)} tone="teal" />
        <Metric label="Total tokens" value={formatNumber(summary?.total_tokens ?? (summary?.input_tokens ?? 0) + (summary?.output_tokens ?? 0))} note={`${formatNumber(summary?.input_tokens)} in · ${formatNumber(summary?.output_tokens)} out`} tone="blue" />
        <Metric label="Estimated cost" value={formatSummaryCost(summary)} note={formatSummaryCostNote(summary)} tone="violet" />
        <Metric label="Average latency" value={`${Math.round(summary?.average_latency_ms ?? 0)} ms`} note={`${formatNumber(summary?.physical_attempts)} physical attempts`} tone="coral" />
      </section>
      <section className="usage-observatory">
        <header className="panel__header">
          <div><p className="eyebrow">Telemetry board</p><h3>Four views of the same workload</h3><p className="usage-ledger__note">Charts cover the full selected period using daily UTC buckets. Select a focus to expand it.</p></div>
          <label className="native-field usage-metric-select">
            <span>Metric</span>
            <select value={metric} onChange={(event) => { setMetric(event.target.value as UsageMetric); }}>
              <option value="requests">Requests</option>
              <option value="tokens">Tokens</option>
              <option value="cost">Estimated cost</option>
              <option value="latency">Latency</option>
            </select>
          </label>
        </header>
        <div className="usage-chart-grid">
          {USAGE_CHARTS.map((chart) => (
            <article key={chart.metric} className={chart.metric === metric ? `usage-chart-card usage-chart-card--${chart.metric} usage-chart-card--active` : `usage-chart-card usage-chart-card--${chart.metric}`}>
              <header>
                <div><p className="eyebrow">{chart.eyebrow}</p><h4>{chart.title}</h4><p>{chart.description}</p></div>
                <button type="button" aria-pressed={chart.metric === metric} onClick={() => { setMetric(chart.metric); }}>{chart.metric === metric ? "Focused" : "Expand"}</button>
              </header>
              <Suspense fallback={<div className="chart-empty">Loading chart…</div>}>
                <UsageChart buckets={usage.data?.buckets ?? []} metric={chart.metric} height={chart.metric === metric ? 280 : 205} />
              </Suspense>
            </article>
          ))}
        </div>
      </section>
      <section className="panel data-panel usage-ledger">
        <header className="panel__header">
          <div>
            <p className="eyebrow">Request ledger</p>
            <h3>Recent inference</h3>
            <p className="usage-ledger__note">Recent requests only. Summary and charts cover the full selected period.</p>
          </div>
          <Badge variant="neutral" label={`${filteredRequests.length} shown · ${usage.data?.requests.length ?? 0} loaded`} />
        </header>
        <div className="usage-ledger__filters">
          <label className="native-field"><span>Search loaded rows</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); }} placeholder="Request, model, provider" /></label>
          <label className="native-field"><span>Status</span>
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); }} aria-label="Filter loaded rows by status">
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
              <option value="partial">Partial</option>
            </select>
          </label>
          <label className="native-field"><span>Protocol</span>
            <select value={protocolFilter} onChange={(event) => { setProtocolFilter(event.target.value); }} aria-label="Filter loaded rows by protocol">
              <option value="all">All protocols</option>
              <option value="openai-chat">OpenAI Chat Completions</option>
              <option value="openai-responses">OpenAI Responses</option>
              <option value="anthropic-messages">Anthropic Messages</option>
              <option value="legacy-completions">Legacy Completions</option>
              <option value="embeddings">Embeddings</option>
              <option value="helmora-native">Helmora Native</option>
            </select>
          </label>
        </div>
        {usage.isPending ? (
          <p className="muted-copy">Loading usage…</p>
        ) : (usage.data?.requests.length ?? 0) > 0 ? (
          filteredRequests.length > 0 ? (
            <HelmoraScrollArea className="usage-ledger__scroll" aria-label="Recent request ledger">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th scope="col">Timestamp</th>
                    <th scope="col">Request</th>
                    <th scope="col">Protocol</th>
                    <th scope="col">Model</th>
                    <th scope="col">In</th>
                    <th scope="col">Out</th>
                    <th scope="col">Total</th>
                    <th scope="col">Estimated cost</th>
                    <th scope="col">Latency</th>
                    <th scope="col">Attempts</th>
                    <th scope="col">Status</th>
                    <th scope="col">Error</th>
                    <th scope="col"><span className="sr-only">Inspect</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((request) => (
                    <tr key={request.id}>
                      <td>{formatTimestamp(request.created_at)}</td>
                      <td><code>{request.id}</code></td>
                      <td>{formatProtocolLabel(request.protocol)}</td>
                      <td>
                        <strong>{request.requested_model}</strong>
                        <small>{formatModelSubtext(request)}</small>
                      </td>
                      <td>{formatNumber(request.prompt_tokens)}</td>
                      <td>{formatNumber(request.completion_tokens)}</td>
                      <td>{formatNumber(totalTokens(request))}</td>
                      <td>
                        {formatEstimatedCost(request)}
                        {request.cost_source ? <small>{formatCostSource(request.cost_source)}</small> : null}
                      </td>
                      <td>{Math.round(request.latency_ms ?? 0)} ms</td>
                      <td>{request.attempt_count}</td>
                      <td><Badge variant={statusVariant(request.status)} label={request.status} /></td>
                      <td>{request.error_code ?? "—"}</td>
                      <td><Button label="Inspect" variant="secondary" size="sm" onClick={() => { setSelected(request.id); }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </HelmoraScrollArea>
          ) : (
            <p className="muted-copy">No loaded requests match these filters.</p>
          )
        ) : (
          <p className="muted-copy">No inference requests in this period.</p>
        )}
      </section>
      {selected ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(undefined); }}>
          <section ref={modalRef} className="modal-panel usage-inspector" role="dialog" aria-modal="true" aria-label="Request details" tabIndex={-1}>
            <header>
              <div><p className="eyebrow">Request inspector</p><h3>{selected}</h3></div>
              <Button label="Close" variant="ghost" size="sm" onClick={() => { setSelected(undefined); }} />
            </header>
            {details.error ? <RequestError error={details.error} /> : details.isPending ? <p className="muted-copy">Loading attempts…</p> : (
              <HelmoraScrollArea className="usage-inspector__scroll" aria-label="Request inspector content">
                <RequestInspector details={details.data ?? {}} />
              </HelmoraScrollArea>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  return <article className={`metric metric--${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function RequestInspector({ details }: { details: Record<string, unknown> }) {
  const attempts = Array.isArray(details.attempts) ? details.attempts as Array<Record<string, unknown>> : [];
  return (
    <div className="usage-inspector__sections">
      <section>
        <h4>Overview</h4>
        <dl className="usage-inspector__grid">
          <div><dt>Status</dt><dd>{String(details.status ?? "—")}</dd></div>
          <div><dt>Request ID</dt><dd><code>{String(details.id ?? "—")}</code></dd></div>
          <div><dt>Created</dt><dd>{formatTimestamp(String(details.created_at ?? ""))}</dd></div>
          <div><dt>Completed</dt><dd>{details.completed_at ? formatTimestamp(String(details.completed_at)) : "—"}</dd></div>
          <div><dt>Latency</dt><dd>{Math.round(Number(details.latency_ms ?? 0))} ms</dd></div>
          <div><dt>Protocol</dt><dd>{String(details.protocol ?? "—")}</dd></div>
          <div><dt>Requested model</dt><dd>{String(details.requested_model ?? "—")}</dd></div>
          <div><dt>Selected route</dt><dd>{String(details.selected_provider ?? "—")} · {String(details.selected_model ?? "—")}</dd></div>
        </dl>
      </section>
      <section>
        <h4>Usage</h4>
        <dl className="usage-inspector__grid">
          <div><dt>Input tokens</dt><dd>{formatNumber(Number(details.prompt_tokens ?? 0))}</dd></div>
          <div><dt>Output tokens</dt><dd>{formatNumber(Number(details.completion_tokens ?? 0))}</dd></div>
          <div><dt>Total tokens</dt><dd>{formatNumber(Number(details.total_tokens ?? Number(details.prompt_tokens ?? 0) + Number(details.completion_tokens ?? 0)))}</dd></div>
          <div><dt>Estimated cost</dt><dd>{formatEstimatedCost({
            cost_usd: Number(details.cost_usd ?? 0),
            cost_known: Boolean(details.cost_known),
            cost_coverage: details.cost_coverage as UsageRequest["cost_coverage"],
            cost_source: details.cost_source as UsageRequest["cost_source"],
          })}</dd></div>
          <div><dt>Usage source</dt><dd>{formatUsageSource(String(details.usage_source ?? ""))}</dd></div>
          <div><dt>Cost source</dt><dd>{formatCostSource(details.cost_source as UsageRequest["cost_source"])}</dd></div>
          <div><dt>Coverage</dt><dd>{formatCostCoverage(details)}</dd></div>
        </dl>
      </section>
      <section>
        <h4>Attempts</h4>
        {attempts.length ? (
          <div className="usage-attempts">
            {attempts.map((attempt) => (
              <article key={String(attempt.attempt_index ?? attempt.created_at ?? Math.random())}>
                <header>
                  <strong>Attempt {Number(attempt.attempt_index ?? 0) + 1}</strong>
                  <Badge variant={statusVariant(String(attempt.status ?? "unknown"))} label={String(attempt.status ?? "unknown")} />
                </header>
                <dl className="usage-inspector__grid">
                  <div><dt>Provider</dt><dd>{String(attempt.provider_id ?? "—")}</dd></div>
                  <div><dt>Model</dt><dd>{String(attempt.model_id ?? "—")}</dd></div>
                  <div><dt>Connection</dt><dd><code>{String(attempt.connection_ref ?? "—")}</code></dd></div>
                  <div><dt>Latency</dt><dd>{Math.round(Number(attempt.latency_ms ?? 0))} ms</dd></div>
                  <div><dt>TTFT</dt><dd>{attempt.ttft_ms == null ? "—" : `${Math.round(Number(attempt.ttft_ms))} ms`}</dd></div>
                  <div><dt>Tokens</dt><dd>{formatNumber(Number(attempt.total_tokens ?? Number(attempt.prompt_tokens ?? 0) + Number(attempt.completion_tokens ?? 0)))}</dd></div>
                  <div><dt>Estimated cost</dt><dd>{formatEstimatedCost({
                    cost_usd: Number(attempt.cost_usd ?? 0),
                    cost_known: Boolean(attempt.cost_known),
                    cost_coverage: attempt.cost_coverage as UsageRequest["cost_coverage"],
                    cost_source: attempt.cost_source as UsageRequest["cost_source"],
                  })}</dd></div>
                  <div><dt>Error</dt><dd>{String(attempt.error_code ?? "—")}</dd></div>
                  <div><dt>Timestamp</dt><dd>{formatTimestamp(String(attempt.created_at ?? ""))}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        ) : <p className="muted-copy">No attempts recorded.</p>}
      </section>
      <details className="usage-advanced">
        <summary>Advanced</summary>
        <pre className="json-preview request-json">{JSON.stringify(details, null, 2)}</pre>
      </details>
    </div>
  );
}

function formatSummaryCost(summary?: UsageResponse["summary"]): string {
  if (!summary) return "—";
  const hasKnown = (summary.complete_cost_requests ?? 0) > 0 || (summary.partial_cost_requests ?? 0) > 0;
  if (!hasKnown && summary.cost_usd === 0) return "Unknown";
  return formatUsd(summary.cost_usd);
}

function formatRequestBreakdown(summary?: UsageResponse["summary"]): string {
  if (!summary) return "Catalog estimate";
  const parts = [`${successRate(summary)} successful`];
  if (summary.failed) parts.push(`${formatNumber(summary.failed)} failed`);
  if (summary.cancelled) parts.push(`${formatNumber(summary.cancelled)} cancelled`);
  if (summary.partial) parts.push(`${formatNumber(summary.partial)} partial`);
  return parts.join(" · ");
}

function formatCostCoverage(details: Record<string, unknown>): string {
  const coverage = details.cost_coverage as string | undefined;
  const source = details.cost_source as string | undefined;
  const known = Boolean(details.cost_known);

  if (source === "legacy_estimate") {
    return "Legacy pre-migration estimate.";
  }
  if (coverage === "complete" || (known && source !== "partial_pricing")) {
    return "Complete catalog estimate.";
  }
  if (coverage === "partial" || source === "partial_pricing") {
    return "Partial known subtotal across physical attempts.";
  }
  if (coverage === "unknown" || source === "unknown_pricing" || !known) {
    return "Pricing unavailable for this route; cost is fully unknown.";
  }
  return "Catalog estimate from final usage.";
}

function formatSummaryCostNote(summary?: UsageResponse["summary"]): string {
  if (!summary) return "Catalog estimate";
  const complete = summary.complete_cost_requests ?? 0;
  const partial = summary.partial_cost_requests ?? 0;
  const unknown = summary.unknown_cost_requests ?? 0;
  const legacy = summary.legacy_cost_requests ?? 0;

  const parts: string[] = [];
  if (partial > 0) parts.push(`${partial} partial pricing`);
  if (unknown > 0) parts.push(`${unknown} unknown pricing`);
  if (legacy > 0) parts.push(`${legacy} legacy estimate`);

  if (parts.length > 0) return parts.join(" · ");
  if (complete > 0) return "Complete catalog estimate";
  return "Catalog estimate";
}

function statusVariant(status: string): "success" | "error" | "neutral" | "info" {
  if (status === "completed" || status === "success") return "success";
  if (status === "cancelled" || status === "neutral") return "neutral";
  if (status === "partial") return "info";
  return "error";
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
