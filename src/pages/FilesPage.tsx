import { Badge, Button } from "@astryxdesign/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { InlineAlert, RequestError } from "../components/InlineAlert";
import { api } from "../lib/api/client";
import type { FileRecord, ListResponse } from "../lib/api/types";

export function FilesPage() {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File>();
  const files = useQuery({ queryKey: ["files"], queryFn: () => api.request<ListResponse<FileRecord>>("/api/v2/files?limit=200") });
  const upload = useMutation({ mutationFn: async (file: File) => api.request<FileRecord>("/api/v2/files", { method: "POST", body: { filename: file.name, mediaType: file.type || "application/octet-stream", data: await fileToBase64(file) } }), onSuccess: async () => { setSelected(undefined); if (input.current) input.current.value = ""; await queryClient.invalidateQueries({ queryKey: ["files"] }); } });
  const remove = useMutation({ mutationFn: (id: string) => api.request<void>(`/api/v2/files/${encodeURIComponent(id)}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["files"] }) });
  async function download(file: FileRecord) { const response = await api.blob(`/api/v2/files/${encodeURIComponent(file.id)}/content`); const url = URL.createObjectURL(response.data); const link = document.createElement("a"); link.href = url; link.download = response.filename ?? file.filename; link.click(); URL.revokeObjectURL(url); }
  const invalid = selected && selected.size > 32 * 1024 * 1024;
  return <div className="page"><section className="page-intro"><div><p className="eyebrow">Tenant storage</p><h2>Files enter once, then stay addressable.</h2><p>Uploads are tenant-scoped, content-hashed, and capped at 32 MiB before they can be attached to knowledge or model workflows.</p></div></section>
    <section className="panel upload-panel"><label className="file-drop"><input ref={input} type="file" onChange={(event) => { setSelected(event.target.files?.[0]); }} /><span>↑</span><div><strong>{selected?.name ?? "Choose a file to upload"}</strong><small>{selected ? `${formatBytes(selected.size)} · ${selected.type || "application/octet-stream"}` : "Maximum 32 MiB per file"}</small></div></label><Button label="Upload to Hub" variant="primary" isLoading={upload.isPending} isDisabled={!selected || Boolean(invalid)} onClick={() => { if (selected) upload.mutate(selected); }} /></section>
    {invalid ? <InlineAlert title="File is larger than 32 MiB">Choose a smaller file before uploading.</InlineAlert> : null}{upload.error || remove.error ? <RequestError error={upload.error ?? remove.error} /> : null}
    <section className="panel data-panel"><header className="panel__header"><div><p className="eyebrow">Stored objects</p><h3>Files</h3></div><Badge variant="neutral" label={`${files.data?.data.length ?? 0} files`} /></header>{files.error ? <RequestError error={files.error} /> : files.isPending ? <p className="muted-copy">Loading files…</p> : files.data?.data.length ? <div className="file-list">{files.data.data.map((file) => <article key={file.id}><span className="file-type">{extension(file.filename)}</span><div><strong>{file.filename}</strong><small>{file.mediaType} · {formatBytes(file.bytes)} · {file.sha256.slice(0, 12)}…</small></div><Badge variant={file.status === "ready" ? "success" : "warning"} label={file.status} /><Button label="Download" variant="secondary" size="sm" onClick={() => { void download(file); }} /><Button label="Delete" variant="destructive" size="sm" onClick={() => { if (window.confirm(`Delete “${file.filename}”?`)) remove.mutate(file.id); }} /></article>)}</div> : <p className="muted-copy">No files uploaded.</p>}</section>
  </div>;
}

async function fileToBase64(file: File): Promise<string> { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ""; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length))); return btoa(binary); }
function formatBytes(value: number): string { if (value < 1024) return `${value} B`; if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`; return `${(value / 1024 ** 2).toFixed(1)} MiB`; }
function extension(name: string): string { return name.includes(".") ? name.split(".").at(-1)!.slice(0, 4).toUpperCase() : "FILE"; }
