import { Badge, Button, TextInput } from "@astryxdesign/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { RequestError } from "../components/InlineAlert";
import { api } from "../lib/api/client";
import type { KnowledgeBase, KnowledgeDocument, ListResponse } from "../lib/api/types";

export function KnowledgePage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>();
  const [baseName, setBaseName] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Array<Record<string, unknown>>>();
  const bases = useQuery({ queryKey: ["knowledge-bases"], queryFn: () => api.request<ListResponse<KnowledgeBase>>("/api/v2/knowledge-bases") });
  const documents = useQuery({ queryKey: ["knowledge-documents", selectedId], queryFn: () => api.request<ListResponse<KnowledgeDocument>>(`/api/v2/knowledge-bases/${encodeURIComponent(selectedId!)}/documents`), enabled: Boolean(selectedId) });
  const createBase = useMutation({ mutationFn: () => api.request<KnowledgeBase>("/api/v2/knowledge-bases", { method: "POST", body: { name: baseName } }), onSuccess: async (created) => { setBaseName(""); setSelectedId(created.id); await queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] }); } });
  const deleteBase = useMutation({ mutationFn: (id: string) => api.request<{ deleted: boolean }>(`/api/v2/knowledge-bases/${encodeURIComponent(id)}`, { method: "DELETE" }), onSuccess: async () => { setSelectedId(undefined); await queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] }); } });
  const addDocument = useMutation({ mutationFn: () => api.request<KnowledgeDocument>(`/api/v2/knowledge-bases/${encodeURIComponent(selectedId!)}/documents`, { method: "POST", body: { title, content } }), onSuccess: async () => { setTitle(""); setContent(""); await queryClient.invalidateQueries({ queryKey: ["knowledge-documents", selectedId] }); } });
  const deleteDocument = useMutation({ mutationFn: (id: string) => api.request<{ deleted: boolean }>(`/api/v2/knowledge-bases/${encodeURIComponent(selectedId!)}/documents/${encodeURIComponent(id)}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge-documents", selectedId] }) });
  const searchKnowledge = useMutation({ mutationFn: () => api.request<ListResponse<Record<string, unknown>>>(`/api/v2/knowledge-bases/${encodeURIComponent(selectedId!)}/search`, { method: "POST", body: { query: search, limit: 20 } }), onSuccess: (response) => { setResults(response.data); } });
  const active = bases.data?.data.find((base) => base.id === selectedId);
  const error = createBase.error ?? deleteBase.error ?? addDocument.error ?? deleteDocument.error ?? searchKnowledge.error;
  function submitBase(event: FormEvent<HTMLFormElement>) { event.preventDefault(); createBase.mutate(); }
  function submitDocument(event: FormEvent<HTMLFormElement>) { event.preventDefault(); addDocument.mutate(); }
  return <div className="page"><section className="page-intro"><div><p className="eyebrow">Retrieval index</p><h2>Knowledge with a visible boundary.</h2><p>Each base owns its documents and search index. Hub verifies tenant and base ownership on every operation.</p></div></section>
    {error ? <RequestError error={error} /> : null}
    <div className="knowledge-layout"><aside className="panel knowledge-bases"><form onSubmit={submitBase}><TextInput label="New knowledge base" value={baseName} onChange={setBaseName} placeholder="Workspace notes" /><Button type="submit" label="Create" variant="primary" size="sm" isDisabled={!baseName.trim()} isLoading={createBase.isPending} /></form><div>{bases.isPending ? <p className="muted-copy">Loading bases…</p> : bases.data?.data.map((base) => <button className={selectedId === base.id ? "knowledge-base knowledge-base--active" : "knowledge-base"} key={base.id} onClick={() => { setSelectedId(base.id); setResults(undefined); }}><span>K</span><span><strong>{base.name}</strong><small>revision {base.revision}</small></span></button>)}</div></aside>
      <section className="panel knowledge-detail">{!active ? <div className="detail-empty"><span>K</span><h3>Select a knowledge base</h3><p>Add documents and test retrieval against the same API used by agents.</p></div> : <><header className="detail-panel__header"><div><p className="eyebrow">Knowledge base</p><h3>{active.name}</h3><p>{active.id}</p></div><Button label="Delete base" variant="destructive" size="sm" onClick={() => { if (window.confirm(`Delete “${active.name}” and all indexed documents?`)) deleteBase.mutate(active.id); }} /></header>
        <form className="knowledge-search" onSubmit={(event) => { event.preventDefault(); searchKnowledge.mutate(); }}><TextInput label="Search this base" isLabelHidden value={search} onChange={setSearch} placeholder="Test retrieval…" /><Button type="submit" label="Search" variant="secondary" isLoading={searchKnowledge.isPending} isDisabled={!search.trim()} /></form>
        {results ? <div className="search-results"><header><strong>Search results</strong><button onClick={() => { setResults(undefined); }}>Close</button></header>{results.length ? results.map((result, index) => <article key={String(result.id ?? index)}><strong>{String(result.title ?? result.documentId ?? `Result ${index + 1}`)}</strong><p>{String(result.snippet ?? result.content ?? "")}</p></article>) : <p className="muted-copy">No matching document passages.</p>}</div> : null}
        <form className="document-form" onSubmit={submitDocument}><TextInput label="Document title" value={title} onChange={setTitle} isRequired /><label className="native-field"><span>Document content</span><textarea rows={5} value={content} onChange={(event) => { setContent(event.target.value); }} required /></label><Button type="submit" label="Add document" variant="primary" isLoading={addDocument.isPending} isDisabled={!title.trim() || !content.trim()} /></form>
        <div className="document-list"><header><h4>Documents</h4><Badge variant="neutral" label={String(documents.data?.data.length ?? 0)} /></header>{documents.isPending ? <p className="muted-copy">Loading documents…</p> : documents.data?.data.length ? documents.data.data.map((document) => <article key={document.id}><div><strong>{document.title}</strong><small>{document.id} · {document.content.length.toLocaleString()} characters</small></div><p>{document.content.slice(0, 240)}{document.content.length > 240 ? "…" : ""}</p><Button label="Delete" variant="destructive" size="sm" onClick={() => { if (window.confirm(`Delete “${document.title}”?`)) deleteDocument.mutate(document.id); }} /></article>) : <p className="muted-copy">No documents in this base.</p>}</div>
      </>}</section></div>
  </div>;
}
