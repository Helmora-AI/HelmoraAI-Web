import { Badge, Button, TextInput } from "@astryxdesign/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { AsyncList } from "../components/AsyncList";
import { RequestError } from "../components/InlineAlert";
import { api } from "../lib/api/client";
import { formatDate } from "../lib/format";
import type { ListResponse, MemoryRecord } from "../lib/api/types";

export function MemoryPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState("fact");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [search, setSearch] = useState("");
  const memories = useQuery({ queryKey: ["memories"], queryFn: () => api.request<ListResponse<MemoryRecord>>("/api/v2/memories") });
  const visible = useMemo(() => { const q = search.trim().toLocaleLowerCase(); return q ? memories.data?.data.filter((memory) => memory.content.toLocaleLowerCase().includes(q) || memory.kind.toLocaleLowerCase().includes(q)) ?? [] : memories.data?.data ?? []; }, [memories.data, search]);
  const create = useMutation({ mutationFn: () => api.request<MemoryRecord>("/api/v2/memories", { method: "POST", body: { kind, content, pinned } }), onSuccess: async () => { setContent(""); setPinned(false); setShowForm(false); await queryClient.invalidateQueries({ queryKey: ["memories"] }); } });
  const exclude = useMutation({ mutationFn: (id: string) => api.request<{ excluded: boolean }>(`/api/v2/memories/${encodeURIComponent(id)}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memories"] }) });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); create.mutate(); }
  return <div className="page"><section className="page-intro"><div><p className="eyebrow">Context policy</p><h2>Memory should be useful, visible, and reversible.</h2><p>Review exactly what Helmora can retrieve, pin durable context, and exclude anything that no longer belongs.</p></div><Button label={showForm ? "Close form" : "Add memory"} variant={showForm ? "secondary" : "primary"} onClick={() => { setShowForm((value) => !value); }} /></section>
    {showForm ? <section className="panel create-panel"><form className="form-grid" onSubmit={submit}><label className="native-field"><span>Memory kind</span><select value={kind} onChange={(event) => { setKind(event.target.value); }}><option value="fact">Fact</option><option value="preference">Preference</option><option value="instruction">Instruction</option><option value="project">Project</option></select></label><TextInput label="Content" value={content} onChange={setContent} isRequired /><label className="check-row"><input type="checkbox" checked={pinned} onChange={(event) => { setPinned(event.target.checked); }} /> Pin for retrieval priority</label><div className="form-grid__action"><Button type="submit" label="Save memory" variant="primary" isLoading={create.isPending} isDisabled={!content.trim()} /></div></form></section> : null}
    {create.error || exclude.error ? <RequestError error={create.error ?? exclude.error} /> : null}
    <section className="panel"><div className="list-toolbar"><TextInput label="Filter memories" isLabelHidden value={search} onChange={setSearch} placeholder="Filter memory…" hasClear /><Badge variant="neutral" label={`${visible.length} memories`} /></div><AsyncList error={memories.error} isPending={memories.isPending} loadingLabel="Loading memory…">{visible.length ? <div className="memory-grid">{visible.map((memory) => <article className="memory-card" key={memory.id}><header><Badge variant={memory.pinned ? "teal" : "neutral"} label={memory.kind} /><span>{memory.pinned ? "Pinned" : memory.sensitivity}</span></header><p>{memory.content}</p><footer><time>{formatDate(memory.updatedAt, { dateStyle: "medium" })}</time><Button label="Exclude" variant="destructive" size="sm" onClick={() => { if (window.confirm("Exclude this memory from future retrieval?")) exclude.mutate(memory.id); }} /></footer></article>)}</div> : <p className="muted-copy">No active memories.</p>}</AsyncList></section>
  </div>;
}
