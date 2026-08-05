import { Badge, Button, TextInput } from "@astryxdesign/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { InlineAlert, RequestError } from "../components/InlineAlert";
import { SecretReveal } from "../components/SecretReveal";
import { api } from "../lib/api/client";
import type { ListResponse, ReadyResponse, RuntimeStatus, RuntimeVersion, WebhookReceipt, WebhookRecord } from "../lib/api/types";

interface Health { status: string; version: string; uptime_seconds: number; }

export function RuntimePage() {
  const health = useQuery({ queryKey: ["health"], queryFn: () => api.request<Health>("/health"), refetchInterval: 15_000 });
  const ready = useQuery({ queryKey: ["ready"], queryFn: () => api.request<ReadyResponse>("/ready"), refetchInterval: 15_000 });
  const status = useQuery({ queryKey: ["runtime-status"], queryFn: () => api.request<RuntimeStatus>("/api/v2/runtime/status"), refetchInterval: 15_000 });
  const version = useQuery({ queryKey: ["runtime-version"], queryFn: () => api.request<RuntimeVersion>("/api/v2/runtime/version") });
  const openapi = useQuery({ queryKey: ["openapi-summary"], queryFn: () => api.request<{ paths: Record<string, Record<string, unknown>> }>("/openapi.json") });
  const operations = openapi.data ? Object.values(openapi.data.paths).reduce((total, path) => total + Object.keys(path).length, 0) : 0;
  const error = health.error ?? ready.error ?? status.error ?? version.error ?? openapi.error;
  return <div className="page"><section className="page-intro"><div><p className="eyebrow">System status</p><h2>Know what this process can safely serve.</h2><p>Liveness, readiness, database integrity, inflight pressure, version, public contract, and outbound webhooks in one operational view.</p></div><Button label="Refresh status" variant="secondary" isLoading={health.isFetching || ready.isFetching || status.isFetching || version.isFetching || openapi.isFetching} onClick={() => { void Promise.all([health.refetch(), ready.refetch(), status.refetch(), version.refetch(), openapi.refetch()]); }} /></section>{error ? <RequestError error={error} /> : null}
    <section className="runtime-board"><RuntimeCard label="Process" value={health.data?.status ?? "Checking"} note={health.data ? formatUptime(health.data.uptime_seconds) : "Reading liveness"} icon="H" tone="teal" ok={health.data?.status === "ok"} /><RuntimeCard label="Database" value={ready.data?.database ?? "Checking"} note={ready.data?.initialized ? "Setup complete" : "Setup required"} icon="D" tone="blue" ok={ready.data?.database === "ok"} /><RuntimeCard label="Runtime version" value={version.data?.version ?? "—"} note={version.data?.name ?? "Helmora-Hub"} icon="V" tone="violet" ok={Boolean(version.data)} /><RuntimeCard label="Public API" value={String(operations || "—")} note="OpenAPI operations" icon="↗" tone="coral" ok={operations > 0} /></section>
    <section className="panel runtime-detail"><header className="panel__header"><div><p className="eyebrow">Live readiness</p><h3>Request capacity</h3></div><Badge variant={status.data?.status === "ready" ? "success" : "warning"} label={status.data?.status ?? "checking"} /></header><div className="runtime-lines"><div><span>Inflight HTTP requests</span><strong>{status.data?.inflight ?? ready.data?.inflight ?? 0}</strong></div><div><span>Database integrity</span><strong>{status.data?.database ?? "unknown"}</strong></div><div><span>Initialization</span><strong>{status.data?.initialized ? "complete" : "required"}</strong></div><div><span>API generation</span><strong>{version.data?.api ?? "v2"}</strong></div></div></section>
    <WebhooksPanel />
  </div>;
}

function RuntimeCard({ label, value, note, icon, tone, ok }: { label: string; value: string; note: string; icon: string; tone: string; ok: boolean }) { return <article><span className={`runtime-icon runtime-icon--${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div><span role="img" className={ok ? "status-dot status-dot--ok" : "status-dot"} aria-label={ok ? "Healthy" : "Not ready"} /></article>; }

function WebhooksPanel() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("*");
  const [secret, setSecret] = useState<string>();
  const hooks = useQuery({ queryKey: ["webhooks"], queryFn: () => api.request<ListResponse<WebhookRecord>>("/api/v2/admin/webhooks") });
  const create = useMutation({ mutationFn: () => api.request<WebhookReceipt>("/api/v2/admin/webhooks", { method: "POST", body: { url, events: events.split(",").map((item) => item.trim()).filter(Boolean) } }), onSuccess: async (result) => { setSecret(result.secret); setUrl(""); setEvents("*"); await queryClient.invalidateQueries({ queryKey: ["webhooks"] }); } });
  const toggle = useMutation({ mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.request<WebhookRecord>(`/api/v2/admin/webhooks/${encodeURIComponent(id)}`, { method: "PATCH", body: { enabled } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }) });
  const test = useMutation({ mutationFn: (id: string) => api.request<Record<string, unknown>>(`/api/v2/admin/webhooks/${encodeURIComponent(id)}/test`, { method: "POST", body: {} }) });
  const rotate = useMutation({ mutationFn: (id: string) => api.request<{ secret: string }>(`/api/v2/admin/webhooks/${encodeURIComponent(id)}/rotate-secret`, { method: "POST", body: {} }), onSuccess: (result) => { setSecret(result.secret); } });
  const remove = useMutation({ mutationFn: (id: string) => api.request<{ deleted: boolean }>(`/api/v2/admin/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }) });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); create.mutate(); }
  const error = create.error ?? toggle.error ?? test.error ?? rotate.error ?? remove.error;
  return <section className="panel webhook-panel"><header className="panel__header"><div><p className="eyebrow">External events</p><h3>Signed webhooks</h3></div><Button label={showForm ? "Close form" : "Add webhook"} variant="secondary" size="sm" onClick={() => { setShowForm((value) => !value); }} /></header>{showForm ? <form className="form-grid" onSubmit={submit}><TextInput label="HTTPS endpoint" value={url} onChange={setUrl} placeholder="https://example.com/helmora" isRequired /><TextInput label="Events" value={events} onChange={setEvents} description="Comma separated, or *" isRequired /><div className="form-grid__action"><Button type="submit" label="Create webhook" variant="primary" isLoading={create.isPending} isDisabled={!url.trim() || !events.trim()} /></div></form> : null}{secret ? <div className="webhook-secret"><InlineAlert title="Save the signing secret" tone="success">This secret is shown only once.</InlineAlert><SecretReveal label="Webhook signing secret" secret={secret} size="sm" /><Button label="I saved it" variant="primary" size="sm" onClick={() => { setSecret(undefined); }} /></div> : null}{error ? <RequestError error={error} /> : null}<div className="webhook-list">{hooks.isPending ? <p className="muted-copy">Loading webhooks…</p> : hooks.data?.data.length ? hooks.data.data.map((hook) => <article key={hook.id}><span className={`status-dot${hook.enabled ? " status-dot--ok" : ""}`} /><div><strong>{hook.url}</strong><small>{hook.events.join(", ")} · {hook.id}</small></div><Badge variant={hook.enabled ? "success" : "neutral"} label={hook.enabled ? "Enabled" : "Disabled"} /><Button label="Test" variant="secondary" size="sm" isLoading={test.isPending && test.variables === hook.id} onClick={() => { test.mutate(hook.id); }} /><Button label={hook.enabled ? "Disable" : "Enable"} variant="ghost" size="sm" onClick={() => { toggle.mutate({ id: hook.id, enabled: !hook.enabled }); }} /><Button label="Rotate" variant="ghost" size="sm" onClick={() => { if (window.confirm(`Rotate the signing secret for “${hook.url}”? The previous secret stops working immediately.`)) rotate.mutate(hook.id); }} /><Button label="Delete" variant="destructive" size="sm" onClick={() => { if (window.confirm(`Delete webhook “${hook.url}”?`)) remove.mutate(hook.id); }} /></article>) : <p className="muted-copy">No webhooks configured.</p>}</div></section>;
}

function formatUptime(seconds: number): string { const hours = Math.floor(seconds / 3600); const minutes = Math.floor(seconds % 3600 / 60); return `${hours}h ${minutes}m uptime`; }
