import { Badge, Button } from "@astryxdesign/core";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { RequestError } from "../components/InlineAlert";
import { api } from "../lib/api/client";
import type { UsageResponse, UsageRequest } from "../lib/api/types";

const UsageChart = lazy(() => import("../components/UsageChart"));

export function UsagePage() {
  const [days, setDays] = useState("30");
  const [selected, setSelected] = useState<string>();
  const usage = useQuery({ queryKey: ["usage", days], queryFn: () => api.request<UsageResponse>(`/api/v2/admin/usage?days=${days}&limit=500`) });
  const details = useQuery({ queryKey: ["request", selected], queryFn: () => api.request<Record<string, unknown>>(`/api/v2/requests/${encodeURIComponent(selected!)}`), enabled: Boolean(selected) });
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(undefined); };
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("keydown", close); };
  }, [selected]);
  const summary = usage.data?.summary;
  const successRate = summary?.requests ? summary.successful / summary.requests * 100 : 0;
  return <div className="page"><section className="page-intro"><div><p className="eyebrow">Observability</p><h2>Every token has a route and an outcome.</h2><p>Inspect aggregate demand, cost, latency, request status, and every upstream attempt without exposing provider credentials.</p></div><label className="native-field period-select"><span>Period</span><select value={days} onChange={(event) => { setDays(event.target.value); }}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select></label></section>
    {usage.error ? <RequestError error={usage.error} /> : null}
    <section className="metric-strip"><Metric label="Requests" value={formatNumber(summary?.requests)} note={`${successRate.toFixed(1)}% successful`} tone="teal" /><Metric label="Input tokens" value={formatNumber(summary?.input_tokens)} note="Prompts and context" tone="blue" /><Metric label="Output tokens" value={formatNumber(summary?.output_tokens)} note="Model generation" tone="violet" /><Metric label="Average latency" value={`${Math.round(summary?.average_latency_ms ?? 0)} ms`} note={`$${(summary?.cost_usd ?? 0).toFixed(4)} estimated`} tone="coral" /></section>
    <section className="panel usage-visual"><header className="panel__header"><div><p className="eyebrow">Trend</p><h3>Daily token volume</h3></div></header><Suspense fallback={<div className="chart-empty">Loading chart…</div>}><UsageChart requests={usage.data?.requests ?? []} /></Suspense></section>
    <section className="panel data-panel"><header className="panel__header"><div><p className="eyebrow">Request ledger</p><h3>Recent inference</h3></div><Badge variant="neutral" label={`${usage.data?.requests.length ?? 0} rows`} /></header>{usage.isPending ? <p className="muted-copy">Loading usage…</p> : usage.data?.requests.length ? <div className="request-list">{usage.data.requests.map((request) => <RequestRow request={request} key={request.id} onInspect={() => { setSelected(request.id); }} />)}</div> : <p className="muted-copy">No inference requests in this period.</p>}</section>
    {selected ? <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(undefined); }}><section className="modal-panel" role="dialog" aria-modal="true" aria-label="Request details"><header><div><p className="eyebrow">Request inspector</p><h3>{selected}</h3></div><Button label="Close" variant="ghost" size="sm" onClick={() => { setSelected(undefined); }} /></header>{details.error ? <RequestError error={details.error} /> : details.isPending ? <p className="muted-copy">Loading attempts…</p> : <pre className="json-preview request-json">{JSON.stringify(details.data, null, 2)}</pre>}</section></div> : null}
  </div>;
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) { return <article className={`metric metric--${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function RequestRow({ request, onInspect }: { request: UsageRequest; onInspect: () => void }) { return <article><div><strong>{request.requested_model}</strong><small>{request.id} · {request.protocol}</small></div><div><strong>{formatNumber(request.prompt_tokens + request.completion_tokens)}</strong><small>{request.attempt_count} attempt{request.attempt_count === 1 ? "" : "s"}</small></div><div><strong>{Math.round(request.latency_ms ?? 0)} ms</strong><small>{request.selected_provider ?? request.error_code ?? "No provider"}</small></div><Badge variant={request.status === "completed" ? "success" : request.status === "cancelled" ? "neutral" : "error"} label={request.status} /><Button label="Inspect" variant="secondary" size="sm" onClick={onInspect} /></article>; }
function formatNumber(value = 0): string { return new Intl.NumberFormat(undefined, { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value); }
