import { Badge, Button } from "@astryxdesign/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { RequestError } from "../components/InlineAlert";
import { api } from "../lib/api/client";
import type { ListResponse, ModelSummary, RuntimeStatus, RuntimeVersion } from "../lib/api/types";

interface ProvidersResponse { providers: Array<Record<string, unknown>>; connections: Array<Record<string, unknown>>; }
interface ConversationsResponse { data: Array<Record<string, unknown>>; nextCursor?: string; }
interface TasksResponse { data: Array<Record<string, unknown>>; }

export function OverviewPage() {
  const runtime = useQuery({ queryKey: ["runtime-status"], queryFn: () => api.request<RuntimeStatus>("/api/v2/runtime/status") });
  const version = useQuery({ queryKey: ["runtime-version"], queryFn: () => api.request<RuntimeVersion>("/api/v2/runtime/version") });
  const providers = useQuery({ queryKey: ["providers"], queryFn: () => api.request<ProvidersResponse>("/api/v2/providers") });
  const models = useQuery({ queryKey: ["models"], queryFn: () => api.request<ListResponse<ModelSummary>>("/api/v2/models") });
  const conversations = useQuery({ queryKey: ["conversations", "overview"], queryFn: () => api.request<ConversationsResponse>("/api/v2/conversations?limit=5") });
  const tasks = useQuery({ queryKey: ["tasks", "overview"], queryFn: () => api.request<TasksResponse>("/api/v2/tasks?limit=5") });
  const primaryError = runtime.error ?? version.error;

  return (
    <div className="page page--overview">
      <section className="page-intro">
        <div><p className="eyebrow">Control plane</p><h2>Your AI infrastructure, at a glance.</h2><p>Runtime health, connected capacity, and active work from the same Hub contract your clients use.</p></div>
        <Button label="Start a conversation" variant="primary" href="/chat" />
      </section>
      {primaryError ? <RequestError error={primaryError} /> : null}
      <section className="metric-strip" aria-label="Hub summary">
        <Metric label="Runtime" value={runtime.isPending ? "—" : runtime.data?.status ?? "Unknown"} note={version.data ? `v${version.data.version}` : "Reading version"} tone={runtime.data?.status === "ready" ? "teal" : "amber"} />
        <Metric label="Provider connections" value={providers.isPending ? "—" : String(providers.data?.connections.length ?? 0)} note={`${providers.data?.providers.length ?? 0} adapters available`} tone="blue" />
        <Metric label="Models" value={models.isPending ? "—" : String(models.data?.data.length ?? 0)} note="Direct and virtual catalog" tone="violet" />
        <Metric label="Inflight requests" value={runtime.isPending ? "—" : String(runtime.data?.inflight ?? 0)} note={runtime.data?.database === "ok" ? "Database healthy" : `Database: ${runtime.data?.database ?? "unknown"}`} tone="coral" />
      </section>
      <div className="overview-grid">
        <section className="panel panel--wide">
          <header className="panel__header"><div><p className="eyebrow">Connection map</p><h3>Provider capacity</h3></div><Link to="/providers">Manage providers →</Link></header>
          {providers.error ? <RequestError error={providers.error} /> : providers.isPending ? <LoadingRows /> : providers.data?.connections.length ? (
            <div className="connection-list">{providers.data.connections.slice(0, 5).map((connection, index) => <ConnectionRow key={String(connection.id ?? index)} connection={connection} />)}</div>
          ) : <EmptyCopy title="No provider connections yet" copy="Connect a hosted or local model provider before sending live inference traffic." action="Configure providers" href="/providers" />}
        </section>
        <section className="panel">
          <header className="panel__header"><div><p className="eyebrow">Recent</p><h3>Conversations</h3></div><Link to="/conversations">View all</Link></header>
          {conversations.isPending ? <LoadingRows /> : conversations.data?.data.length ? <CompactRows rows={conversations.data.data} primary="title" fallback="Untitled conversation" /> : <EmptyCopy title="A quiet workspace" copy="Your recent conversations will appear here." action="Open chat" href="/chat" />}
        </section>
        <section className="panel">
          <header className="panel__header"><div><p className="eyebrow">Durable work</p><h3>Tasks</h3></div><Link to="/tasks">View queue</Link></header>
          {tasks.isPending ? <LoadingRows /> : tasks.data?.data.length ? <CompactRows rows={tasks.data.data} primary="kind" fallback="Task" status="status" /> : <EmptyCopy title="No tasks running" copy="Research and background jobs will report progress here." action="Start research" href="/research" />}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) { return <article className={`metric metric--${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function ConnectionRow({ connection }: { connection: Record<string, unknown> }) { const enabled = connection.enabled !== false && connection.disabled !== true; return <article className="connection-row"><span className="connection-row__mark">{String(connection.providerId ?? connection.provider_id ?? "AI").slice(0, 2).toUpperCase()}</span><div><strong>{String(connection.name ?? "Provider connection")}</strong><small>{String(connection.providerId ?? connection.provider_id ?? "Custom adapter")}</small></div><Badge variant={enabled ? "success" : "neutral"} label={enabled ? "Enabled" : "Disabled"} /></article>; }
function CompactRows({ rows, primary, fallback, status }: { rows: Array<Record<string, unknown>>; primary: string; fallback: string; status?: string }) { return <div className="compact-rows">{rows.slice(0, 5).map((row, index) => <article key={String(row.id ?? index)}><span className="compact-rows__index">{String(index + 1).padStart(2, "0")}</span><div><strong>{String(row[primary] ?? fallback)}</strong><small>{String(row.updatedAt ?? row.updated_at ?? row.createdAt ?? row.created_at ?? "Recently")}</small></div>{status ? <Badge variant="neutral" label={String(row[status] ?? "queued")} /> : null}</article>)}</div>; }
function EmptyCopy({ title, copy, action, href }: { title: string; copy: string; action: string; href: string }) { return <div className="empty-copy"><span aria-hidden="true">·</span><h4>{title}</h4><p>{copy}</p><Link to={href}>{action} →</Link></div>; }
function LoadingRows() { return <div className="loading-rows" aria-label="Loading"><i /><i /><i /></div>; }
