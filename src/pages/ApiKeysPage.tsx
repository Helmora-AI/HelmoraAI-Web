import { Badge, Button, TextInput } from "@astryxdesign/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { AsyncList } from "../components/AsyncList";
import { InlineAlert, RequestError } from "../components/InlineAlert";
import { HelmoraScrollArea } from "../components/HelmoraScrollArea";
import { SecretReveal } from "../components/SecretReveal";
import { api } from "../lib/api/client";
import { filterAllowlistModels } from "../lib/apiKeyAllowlist";
import { formatDate, formatRateLimits } from "../lib/format";
import type { ApiKeyReceipt, ApiKeyRecord, ListResponse, ModelDefinition } from "../lib/api/types";

const SCOPES = ["inference", "conversations:read", "conversations:write", "tools:use", "files:read", "files:write", "tasks:read", "tasks:write"] as const;

export function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["inference"]);
  const [restrictModels, setRestrictModels] = useState(false);
  const [modelAllowlist, setModelAllowlist] = useState<string[]>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [rpm, setRpm] = useState("");
  const [tpm, setTpm] = useState("");
  const [dailyCostUsd, setDailyCostUsd] = useState("");
  const [monthlyCostUsd, setMonthlyCostUsd] = useState("");
  const [receipt, setReceipt] = useState<ApiKeyReceipt>();
  const [acknowledged, setAcknowledged] = useState(false);
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => api.request<ListResponse<ApiKeyRecord>>("/api/v2/admin/api-keys") });
  const models = useQuery({ queryKey: ["models"], queryFn: () => api.request<ListResponse<ModelDefinition>>("/api/v2/models"), enabled: showForm });
  const create = useMutation({ mutationFn: () => api.request<ApiKeyReceipt>("/api/v2/admin/api-keys", { method: "POST", body: { name, scopes, ...(restrictModels ? { modelAllowlist } : {}), limits: { ...(rpm ? { rpm: Number(rpm) } : {}), ...(tpm ? { tpm: Number(tpm) } : {}), ...(dailyCostUsd ? { dailyCostUsd: Number(dailyCostUsd) } : {}), ...(monthlyCostUsd ? { monthlyCostUsd: Number(monthlyCostUsd) } : {}) } } }), onSuccess: async (value) => { setReceipt(value); setAcknowledged(false); await queryClient.invalidateQueries({ queryKey: ["api-keys"] }); } });
  const revoke = useMutation({ mutationFn: (id: string) => api.request<{ revoked: boolean }>(`/api/v2/admin/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }) });
  const visibleModels = useMemo(() => filterAllowlistModels(models.data?.data ?? [], modelSearch), [models.data?.data, modelSearch]);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); create.mutate(); }
  function toggleScope(scope: string) { setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]); }
  function toggleModel(id: string) { setModelAllowlist((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function closeReceipt() { if (!acknowledged) return; setReceipt(undefined); setShowForm(false); setName(""); setScopes(["inference"]); setRestrictModels(false); setModelAllowlist([]); setModelSearch(""); setRpm(""); setTpm(""); setDailyCostUsd(""); setMonthlyCostUsd(""); }
  return <div className="page"><section className="page-intro"><div><p className="eyebrow">Client access</p><h2>Credentials with the smallest useful boundary.</h2><p>Issue scoped client keys for IDEs, CLIs, and external integrations. Raw secrets appear once and are never retained by Helmora Web.</p></div><Button label={showForm ? "Close form" : "Create API key"} variant={showForm ? "secondary" : "primary"} onClick={() => { if (!receipt) setShowForm((value) => !value); }} /></section>
    {showForm && !receipt ? <section className="panel create-panel"><form className="key-form" onSubmit={submit}><TextInput label="Key name" value={name} onChange={setName} placeholder="VS Code on workstation" isRequired /><div className="scope-picker"><span>Scopes</span><div>{SCOPES.map((scope) => <label key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={() => { toggleScope(scope); }} /><code>{scope}</code></label>)}</div></div><label className="check-row"><input type="checkbox" checked={restrictModels} onChange={(event) => { setRestrictModels(event.target.checked); if (!event.target.checked) { setModelAllowlist([]); setModelSearch(""); } }} /> Restrict this key to selected models</label>{restrictModels ? <div className="scope-picker"><span>Model allowlist</span><TextInput label="Search models" value={modelSearch} onChange={setModelSearch} placeholder="Model id, display name, provider…" isOptional isLabelHidden /><p className="muted-copy">{modelAllowlist.length} selected · {visibleModels.length} visible</p><HelmoraScrollArea className="allowlist-picker" aria-label="Model allowlist"><div>{models.isPending ? <small>Loading models…</small> : models.error ? <RequestError error={models.error} /> : models.data?.data.length ? visibleModels.length ? visibleModels.map((model) => <label key={model.id}><input type="checkbox" checked={modelAllowlist.includes(model.id)} onChange={() => { toggleModel(model.id); }} /><code>{model.id}</code></label>) : <small>No models match this search. Hidden selections are kept.</small> : <small>No enabled models are available. Register a model before issuing a restricted key.</small>}</div></HelmoraScrollArea></div> : null}<div className="form-grid"><TextInput label="Requests per minute" value={rpm} onChange={(value) => { setRpm(value.replace(/\D/gu, "")); }} placeholder="Unlimited" isOptional /><TextInput label="Tokens per minute" value={tpm} onChange={(value) => { setTpm(value.replace(/\D/gu, "")); }} placeholder="Unlimited" isOptional /><TextInput label="Daily cost limit (USD)" value={dailyCostUsd} onChange={(value) => { setDailyCostUsd(value.replace(/[^\d.]/gu, "")); }} placeholder="Unlimited" isOptional description="Block further requests once the key's spend crosses this ceiling in a UTC day." /><TextInput label="Monthly cost limit (USD)" value={monthlyCostUsd} onChange={(value) => { setMonthlyCostUsd(value.replace(/[^\d.]/gu, "")); }} placeholder="Unlimited" isOptional description="Block further requests once the key's spend crosses this ceiling in a UTC month." /></div><Button type="submit" label="Issue one-time key" variant="primary" isLoading={create.isPending} isDisabled={!name.trim() || !scopes.length || (restrictModels && !modelAllowlist.length)} /></form></section> : null}
    {receipt ? <section className="panel key-receipt"><InlineAlert title="API key created" tone="success">Copy this credential now. Closing this receipt destroys the only browser-held copy.</InlineAlert><SecretReveal label={receipt.hint} secret={receipt.key} copyLabel="Copy key" /><label className="acknowledgement"><input type="checkbox" checked={acknowledged} onChange={(event) => { setAcknowledged(event.target.checked); }} /><span>I saved this key in a secure secret store.</span></label><Button label="Close one-time receipt" variant="primary" isDisabled={!acknowledged} onClick={closeReceipt} /></section> : null}
    {create.error || revoke.error ? <RequestError error={create.error ?? revoke.error} /> : null}
    <section className="panel data-panel"><header className="panel__header"><div><p className="eyebrow">Tenant clients</p><h3>API keys</h3></div><Badge variant="neutral" label={`${keys.data?.data.length ?? 0} keys`} /></header><AsyncList error={keys.error} isPending={keys.isPending} loadingLabel="Loading API keys…">{keys.data?.data.length ? <div className="key-list">{keys.data.data.map((key) => <article key={key.id}><div><strong>{key.name}</strong><code>{key.key_hint}</code></div><div className="tag-row">{key.scopes.map((scope) => <Badge key={scope} variant="neutral" label={scope} />)}</div><div><small>{key.last_used_at ? `Last used ${formatDate(key.last_used_at)}` : "Never used"}</small><small>{formatRateLimits(key.limits) || "No rate limits"}</small><small>{key.model_allowlist?.length ? `Models: ${key.model_allowlist.join(", ")}` : "All models"}</small></div><Badge variant={key.disabled ? "error" : "success"} label={key.disabled ? "Revoked" : "Active"} />{!key.disabled ? <Button label="Revoke" variant="destructive" size="sm" onClick={() => { if (window.confirm(`Revoke “${key.name}”? Existing clients will stop working.`)) revoke.mutate(key.id); }} /> : <span />}</article>)}</div> : <p className="muted-copy">No API keys.</p>}</AsyncList></section>
  </div>;
}
