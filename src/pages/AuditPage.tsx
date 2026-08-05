import { Badge, TextInput } from "@astryxdesign/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AsyncList } from "../components/AsyncList";
import { RequestError } from "../components/InlineAlert";
import { JsonPreview } from "../components/JsonPreview";
import { api } from "../lib/api/client";
import { formatDate } from "../lib/format";
import type { AuditEvent, ListResponse } from "../lib/api/types";

export function AuditPage() {
  const [search, setSearch] = useState("");
  const events = useQuery({ queryKey: ["audit"], queryFn: () => api.request<ListResponse<AuditEvent>>("/api/v2/admin/audit?limit=500") });
  const visible = useMemo(() => { const query = search.trim().toLocaleLowerCase(); return query ? events.data?.data.filter((event) => `${event.action} ${event.target_type} ${event.actor_type} ${event.outcome}`.toLocaleLowerCase().includes(query)) ?? [] : events.data?.data ?? []; }, [events.data, search]);
  return <div className="page"><section className="page-intro"><div><p className="eyebrow">Security record</p><h2>Management actions leave a trail.</h2><p>Audit metadata is redacted at write time and remains tenant-scoped for incident review and operational accountability.</p></div></section><section className="panel data-panel"><div className="list-toolbar"><TextInput label="Filter audit events" isLabelHidden value={search} onChange={setSearch} placeholder="Filter action, actor, target…" hasClear /><Badge variant="neutral" label={`${visible.length} events`} /></div><AsyncList error={events.error} isPending={events.isPending} loadingLabel="Loading audit events…">{visible.length ? <div className="audit-list">{visible.map((event) => <article key={event.id}><span className={`audit-mark audit-mark--${event.outcome}`}>{event.outcome === "success" ? "✓" : "!"}</span><div><strong>{event.action}</strong><small>{event.actor_type}{event.actor_id ? ` · ${event.actor_id}` : ""}</small></div><div><strong>{event.target_type}</strong><small>{event.target_id ?? "system"}</small></div><Badge variant={event.outcome === "success" ? "success" : event.outcome === "denied" ? "warning" : "error"} label={event.outcome} /><time>{formatDate(event.created_at)}</time><JsonPreview value={event.metadata} label="Metadata" /></article>)}</div> : <p className="muted-copy">No matching audit events.</p>}</AsyncList></section></div>;
}

