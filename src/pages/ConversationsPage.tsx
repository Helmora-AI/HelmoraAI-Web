import { Badge, Button, TextInput } from "@astryxdesign/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AsyncList } from "../components/AsyncList";
import { HelmoraScrollArea } from "../components/HelmoraScrollArea";
import { RequestError } from "../components/InlineAlert";
import { RecordRow } from "../components/RecordRow";
import { api } from "../lib/api/client";
import { formatDate } from "../lib/format";
import type { Conversation, ConversationDetail, ConversationList, StoredMessage } from "../lib/api/types";

export function ConversationsPage() {
  const queryClient = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [rename, setRename] = useState("");
  const list = useQuery({ queryKey: ["conversations", { archived }], queryFn: () => api.request<ConversationList>(`/api/v2/conversations?limit=100&archived=${archived}`) });
  const detail = useQuery({ queryKey: ["conversation", selectedId], queryFn: () => api.request<ConversationDetail>(`/api/v2/conversations/${encodeURIComponent(selectedId!)}`), enabled: Boolean(selectedId) });
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query ? list.data?.data.filter((item) => item.title.toLocaleLowerCase().includes(query)) ?? [] : list.data?.data ?? [];
  }, [list.data, search]);

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => api.request<Conversation>(`/api/v2/conversations/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["conversations"] }); await queryClient.invalidateQueries({ queryKey: ["conversation"] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.request<void>(`/api/v2/conversations/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: async () => { setSelectedId(undefined); await queryClient.invalidateQueries({ queryKey: ["conversations"] }); },
  });
  const fork = useMutation({
    mutationFn: ({ id, throughSequence }: { id: string; throughSequence: number }) => api.request<{ branchId: string }>(`/api/v2/conversations/${encodeURIComponent(id)}/fork`, { method: "POST", body: { throughSequence } }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["conversation"] }); },
  });

  async function exportConversation(id: string) {
    const payload = await api.request<Record<string, unknown>>(`/api/v2/conversations/${encodeURIComponent(id)}/export`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `helmora-${id}.json`; link.click(); URL.revokeObjectURL(url);
  }

  const active = detail.data?.conversation;
  const mutationError = update.error ?? remove.error ?? fork.error;
  return (
    <div className="page">
      <section className="page-intro"><div><p className="eyebrow">Conversation archive</p><h2>Every thread, still yours.</h2><p>Search, inspect, rename, fork, export, archive, or permanently remove tenant-owned conversations.</p></div><Button label="Open chat" variant="primary" href="/chat" /></section>
      <div className="master-detail">
        <section className="panel master-list">
          <div className="list-toolbar"><TextInput label="Search conversations" isLabelHidden value={search} onChange={setSearch} placeholder="Search titles…" hasClear /><label className="toggle"><input type="checkbox" checked={archived} onChange={(event) => { setArchived(event.target.checked); setSelectedId(undefined); }} /><span aria-hidden="true" /><strong>Archived</strong></label></div>
          <AsyncList error={list.error} isPending={list.isPending} loadingLabel="Loading conversations…">{visible.length ? <div className="record-list">{visible.map((conversation) => <RecordRow key={conversation.id} mark="C" title={conversation.title} subtitle={formatDate(conversation.updatedAt)} active={selectedId === conversation.id} onClick={() => { setSelectedId(conversation.id); setRename(conversation.title); }} trailing={<Badge variant={conversation.archived ? "neutral" : "teal"} label={conversation.archived ? "Archived" : "Active"} />} />)}</div> : <p className="muted-copy">No matching conversations.</p>}</AsyncList>
        </section>
        <section className="panel detail-panel">
          {!selectedId ? <DetailEmpty /> : detail.isPending ? <p className="muted-copy">Loading conversation…</p> : detail.error ? <RequestError error={detail.error} /> : active ? <>
            <header className="detail-panel__header"><div><p className="eyebrow">Conversation</p><h3>{active.title}</h3><p>{active.id}</p></div><Badge variant={active.archived ? "neutral" : "success"} label={active.archived ? "Archived" : "Active"} /></header>
            <div className="detail-actions">
              <TextInput label="Title" value={rename} onChange={setRename} />
              <Button label="Rename" variant="secondary" isLoading={update.isPending} isDisabled={!rename.trim() || rename.trim() === active.title} onClick={() => { update.mutate({ id: active.id, patch: { title: rename } }); }} />
              <Button label={active.archived ? "Restore" : "Archive"} variant="secondary" onClick={() => { update.mutate({ id: active.id, patch: { archived: !active.archived } }); }} />
              <Button label="Export" variant="ghost" onClick={() => { void exportConversation(active.id); }} />
            </div>
            {mutationError ? <RequestError error={mutationError} /> : null}
            <HelmoraScrollArea className="conversation-preview" aria-label="Conversation messages">{detail.data.messages.length ? detail.data.messages.map((message) => <StoredMessageRow message={message} key={message.id} />) : <p className="muted-copy">No messages stored.</p>}</HelmoraScrollArea>
            <footer className="detail-panel__footer">
              <Button label="Fork from latest" variant="secondary" isDisabled={!detail.data.messages.length} isLoading={fork.isPending} onClick={() => { const last = detail.data?.messages.at(-1); if (last) fork.mutate({ id: active.id, throughSequence: last.sequence }); }} />
              <Button label="Delete permanently" variant="destructive" isLoading={remove.isPending} onClick={() => { if (window.confirm(`Delete “${active.title}” and every stored message?`)) remove.mutate(active.id); }} />
            </footer>
          </> : null}
        </section>
      </div>
    </div>
  );
}

function DetailEmpty() { return <div className="detail-empty"><span>C</span><h3>Select a conversation</h3><p>Its messages, metadata, and lifecycle controls will appear here.</p></div>; }
function StoredMessageRow({ message }: { message: StoredMessage }) { const text = message.parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join(""); return <article className={`stored-message stored-message--${message.role}`}><header><strong>{message.role}</strong><span>#{message.sequence}</span><time>{formatDate(message.createdAt)}</time></header><p>{text || `[${message.parts.map((part) => part.type).join(", ")}]`}</p></article>; }

