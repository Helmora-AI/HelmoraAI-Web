import { Badge, Button } from "@astryxdesign/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RequestError } from "../components/InlineAlert";
import { api } from "../lib/api/client";
import type { ListResponse, TaskDetail, TaskEvent, TaskRecord } from "../lib/api/types";

export function TasksPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [liveEvents, setLiveEvents] = useState<TaskEvent[]>([]);
  const tasks = useQuery({ queryKey: ["tasks", { status }], queryFn: () => api.request<ListResponse<TaskRecord>>(`/api/v2/tasks?limit=200${status ? `&status=${encodeURIComponent(status)}` : ""}`), refetchInterval: 5_000 });
  const detail = useQuery({ queryKey: ["task", selectedId], queryFn: () => api.request<TaskDetail>(`/api/v2/tasks/${encodeURIComponent(selectedId!)}`), enabled: Boolean(selectedId), refetchInterval: (query) => query.state.data && ["queued", "running"].includes(query.state.data.task.status) ? 2_000 : false });
  const cancel = useMutation({ mutationFn: (id: string) => api.request<TaskRecord>(`/api/v2/tasks/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {} }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["tasks"] }); await queryClient.invalidateQueries({ queryKey: ["task"] }); } });

  useEffect(() => {
    setLiveEvents(detail.data?.events ?? []);
    if (!selectedId || !detail.data || !["queued", "running"].includes(detail.data.task.status)) return;
    const controller = new AbortController();
    const after = detail.data.events.at(-1)?.sequence ?? 0;
    void (async () => {
      try {
        for await (const event of api.stream<TaskEvent>(`/api/v2/tasks/${encodeURIComponent(selectedId)}/events?after=${after}`, { method: "GET", signal: controller.signal })) {
          if (event.event === "task.terminal") { await queryClient.invalidateQueries({ queryKey: ["task", selectedId] }); await queryClient.invalidateQueries({ queryKey: ["tasks"] }); }
          else setLiveEvents((current) => current.some((item) => item.sequence === event.data.sequence) ? current : [...current, event.data]);
        }
      } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) void queryClient.invalidateQueries({ queryKey: ["task", selectedId] }); }
    })();
    return () => { controller.abort(); };
  }, [selectedId, detail.data?.task.status]);

  const active = detail.data?.task;
  return <div className="page"><section className="page-intro"><div><p className="eyebrow">Durable orchestration</p><h2>Background work you can inspect and stop.</h2><p>Tasks survive request boundaries, expose ordered events, and accept cancellation while queued or running.</p></div><Button label="Start research" variant="primary" href="/research" /></section>
    <div className="task-filter"><label className="native-field"><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setSelectedId(undefined); }}><option value="">All states</option><option value="queued">Queued</option><option value="running">Running</option><option value="completed">Completed</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select></label></div>
    <div className="master-detail"><section className="panel master-list">{tasks.error ? <RequestError error={tasks.error} /> : tasks.isPending ? <p className="muted-copy">Loading tasks…</p> : tasks.data?.data.length ? <div className="record-list">{tasks.data.data.map((task) => <button className={task.id === selectedId ? "record-row record-row--active" : "record-row"} key={task.id} onClick={() => { setSelectedId(task.id); }}><span className="record-row__mark">T</span><span><strong>{task.kind}</strong><small>{task.id} · {formatDate(task.updatedAt)}</small></span><StatusBadge status={task.status} /></button>)}</div> : <p className="muted-copy">No tasks in this state.</p>}</section>
      <section className="panel detail-panel">{!active ? <div className="detail-empty"><span>T</span><h3>Select a task</h3><p>Ordered progress events and the terminal result will appear here.</p></div> : <><header className="detail-panel__header"><div><p className="eyebrow">{active.kind}</p><h3>{active.id}</h3><p>created {formatDate(active.createdAt)}</p></div><StatusBadge status={active.status} /></header><div className="progress"><i style={{ width: `${Math.max(active.status === "queued" ? 2 : 5, active.progress * 100)}%` }} /></div>{detail.error ? <RequestError error={detail.error} /> : null}<section className="task-events"><h4>Event timeline</h4>{liveEvents.map((event) => <article key={event.sequence}><span>{event.sequence}</span><div><strong>{event.type}</strong><small>{formatDate(event.createdAt)}</small></div><code>{JSON.stringify(event.payload)}</code></article>)}</section>{active.result !== undefined || active.error !== undefined ? <section><p className="eyebrow">Terminal payload</p><pre className="json-preview">{JSON.stringify(active.result ?? active.error, null, 2)}</pre></section> : null}{["queued", "running"].includes(active.status) ? <footer className="detail-panel__footer"><span /><Button label={active.cancelRequested ? "Cancellation requested" : "Cancel task"} variant="destructive" isDisabled={active.cancelRequested} isLoading={cancel.isPending} onClick={() => { cancel.mutate(active.id); }} /></footer> : null}</>}</section>
    </div>{cancel.error ? <RequestError error={cancel.error} /> : null}
  </div>;
}

function StatusBadge({ status }: { status: string }) { return <Badge variant={status === "completed" ? "success" : status === "failed" ? "error" : status === "cancelled" ? "neutral" : status === "running" ? "info" : "warning"} label={status} />; }
function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" }).format(date); }
