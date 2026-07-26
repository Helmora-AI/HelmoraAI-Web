import { Badge, Button, TextInput } from "@astryxdesign/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { InlineAlert, RequestError } from "../components/InlineAlert";
import { api } from "../lib/api/client";
import type { ApiKeyReceipt, ApiKeyRecord, ListResponse, ModelDefinition } from "../lib/api/types";

const SCOPES = ["inference", "conversations:read", "conversations:write", "tools:use", "files:read", "files:write", "tasks:read", "tasks:write"] as const;

export function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["inference"]);
  const [restrictModels, setRestrictModels] = useState(false);
  const [modelAllowlist, setModelAllowlist] = useState<string[]>([]);
  const [rpm, setRpm] = useState("");
  const [tpm, setTpm] = useState("");
  const [receipt, setReceipt] = useState<ApiKeyReceipt>();
  const [acknowledged, setAcknowledged] = useState(false);
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => api.request<ListResponse<ApiKeyRecord>>("/api/v2/admin/api-keys") });
  const models = useQuery({ queryKey: ["models"], queryFn: () => api.request<ListResponse<ModelDefinition>>("/api/v2/models"), enabled: showForm });
  const create = useMutation({ mutationFn: () => api.request<ApiKeyReceipt>("/api/v2/admin/api-keys", { method: "POST", body: { name, scopes, ...(restrictModels ? { modelAllowlist } : {}), limits: { ...(rpm ? { rpm: Number(rpm) } : {}), ...(tpm ? { tpm: Number(tpm) } : {}) } } }), onSuccess: async (value) => { setReceipt(value); setAcknowledged(false); await queryClient.invalidateQueries({ queryKey: ["api-keys"] }); } });
  const revoke = useMutation({ mutationFn: (id: string) => api.request<{ revoked: boolean }>(`/api/v2/admin/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }) });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); create.mutate(); }
  function toggleScope(scope: string) { setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]); }
  function toggleModel(id: string) { setModelAllowlist((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function closeReceipt() { if (!acknowledged) return; setReceipt(undefined); setShowForm(false); setName(""); setScopes(["inference"]); setRestrictModels(false); setModelAllowlist([]); setRpm(""); setTpm(""); }
  return <div className="page"><section className="page-intro"><div><p className="eyebrow">Client access</p><h2>Credentials with the smallest useful boundary.</h2><p>Issue scoped client keys for IDEs, CLIs, and external integrations. Raw secrets appear once and are never retained by Helmora Web.</p></div><Button label={showForm ? "Close form" : "Create API key"} variant={showForm ? "secondary" : "primary"} onClick={() => { if (!receipt) setShowForm((value) => !value); }} /></section>
    {showForm && !receipt ? <section className="panel create-panel"><form className="key-form" onSubmit={submit}><TextInput label="Key name" value={name} onChange={setName} placeholder="VS Code on workstation" isRequired /><div className="scope-picker"><span>Scopes</span><div>{SCOPES.map((scope) => <label key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={() => { toggleScope(scope); }} /><code>{scope}</code></label>)}</div></div><label className="check-row"><input type="checkbox" checked={restrictModels} onChange={(event) => { setRestrictModels(event.target.checked); if (!event.target.checked) setModelAllowlist([]); }} /> Restrict this key to selected models</label>{restrictModels ? <div className="scope-picker"><span>Model allowlist</span><div>{models.isPending ? <small>Loading models…</small> : models.data?.data.length ? models.data.data.map((model) => <label key={model.id}><input type="checkbox" checked={modelAllowlist.includes(model.id)} onChange={() => { toggleModel(model.id); }} /><code>{model.id}</code></label>) : <small>No enabled models are available. Register a model before issuing a restricted key.</small>}</div></div> : null}<div className="form-grid"><TextInput label="Requests per minute" value={rpm} onChange={(value) => { setRpm(value.replace(/\D/gu, "")); }} placeholder="Unlimited" isOptional /><TextInput label="Tokens per minute" value={tpm} onChange={(value) => { setTpm(value.replace(/\D/gu, "")); }} placeholder="Unlimited" isOptional /></div><Button type="submit" label="Issue one-time key" variant="primary" isLoading={create.isPending} isDisabled={!name.trim() || !scopes.length || (restrictModels && !modelAllowlist.length)} /></form></section> : null}
    {receipt ? <section className="panel key-receipt"><InlineAlert title="API key created" tone="success">Copy this credential now. Closing this receipt destroys the only browser-held copy.</InlineAlert><div className="secret-field"><div><span>{receipt.hint}</span><code data-sensitive="true">{receipt.key}</code></div><Button label="Copy key" variant="secondary" onClick={() => { void navigator.clipboard.writeText(receipt.key); }} /></div><label className="acknowledgement"><input type="checkbox" checked={acknowledged} onChange={(event) => { setAcknowledged(event.target.checked); }} /><span>I saved this key in a secure secret store.</span></label><Button label="Close one-time receipt" variant="primary" isDisabled={!acknowledged} onClick={closeReceipt} /></section> : null}
    {create.error || revoke.error ? <RequestError error={create.error ?? revoke.error} /> : null}
    <section className="panel data-panel"><header className="panel__header"><div><p className="eyebrow">Tenant clients</p><h3>API keys</h3></div><Badge variant="neutral" label={`${keys.data?.data.length ?? 0} keys`} /></header>{keys.error ? <RequestError error={keys.error} /> : keys.isPending ? <p className="muted-copy">Loading API keys…</p> : keys.data?.data.length ? <div className="key-list">{keys.data.data.map((key) => <article key={key.id}><div><strong>{key.name}</strong><code>{key.key_hint}</code></div><div className="tag-row">{key.scopes.map((scope) => <Badge key={scope} variant="neutral" label={scope} />)}</div><div><small>{key.last_used_at ? `Last used ${formatDate(key.last_used_at)}` : "Never used"}</small><small>{Object.keys(key.limits).length ? JSON.stringify(key.limits) : "No rate limits"}</small><small>{key.model_allowlist?.length ? `Models: ${key.model_allowlist.join(", ")}` : "All models"}</small></div><Badge variant={key.disabled ? "error" : "success"} label={key.disabled ? "Revoked" : "Active"} />{!key.disabled ? <Button label="Revoke" variant="destructive" size="sm" onClick={() => { if (window.confirm(`Revoke “${key.name}”? Existing clients will stop working.`)) revoke.mutate(key.id); }} /> : <span />}</article>)}</div> : <p className="muted-copy">No API keys.</p>}</section>
  </div>;
}

function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date); }
