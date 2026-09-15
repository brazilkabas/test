"use client";

import { FormEvent, useEffect, useState } from "react";

import { api } from "@/components/api";
import { Skeleton, StatusBadge, useToast } from "@/components/design-system";

type Account = { id: string; name: string };
type Zone = { id: string; name: string; account: { id: string; name: string }; status: string };
type Status = { configured: boolean; credentialsSaved: boolean; authType: "API_TOKEN" | "GLOBAL_API_KEY" | null; email: string | null; accountId: string | null; accountName: string | null; zoneId: string | null; zoneName: string | null; baseDomain: string | null; credential: string };

export function CloudflareConfiguration() {
  const { notify } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [authType, setAuthType] = useState<"API_TOKEN" | "GLOBAL_API_KEY">("API_TOKEN");
  const [credential, setCredential] = useState("");
  const [email, setEmail] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [accountId, setAccountId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [baseDomain, setBaseDomain] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => { void api<Status>("/cloudflare/configuration").then((value) => { setStatus(value); setAuthType(value.authType ?? "API_TOKEN"); setAccountId(value.accountId ?? ""); setZoneId(value.zoneId ?? ""); setBaseDomain(value.baseDomain ?? ""); }).catch(() => undefined); }, []);

  async function test(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setTesting(true);
    try {
      const result = await api<{ accounts: Account[]; zones: Zone[] }>("/cloudflare/configuration", { method: "POST", body: JSON.stringify({ action: "TEST", authType, email: authType === "GLOBAL_API_KEY" ? email : undefined, credential }) });
      setAccounts(result.accounts); setZones(result.zones);
      if (result.accounts.length === 1) setAccountId(result.accounts[0].id);
      notify({ title: "Cloudflare connection successful", message: `${result.accounts.length} account(s) and ${result.zones.length} zone(s) discovered.`, tone: "success" });
    } catch (error) { notify({ title: "Cloudflare connection failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
    finally { setTesting(false); }
  }
  async function save() {
    try {
      const account = accounts.find((item) => item.id === accountId);
      const zone = zones.find((item) => item.id === zoneId);
      const value = await api<Status>("/cloudflare/configuration", { method: "POST", body: JSON.stringify({ action: "SAVE", authType, email: authType === "GLOBAL_API_KEY" ? email : undefined, credential, accountId, accountName: account?.name, zoneId, zoneName: zone?.name, baseDomain }) });
      setStatus(value); setCredential(""); setEmail(""); setAccounts([]); setZones([]);
      notify({ title: "Cloudflare configuration encrypted and saved", tone: "success" });
    } catch (error) { notify({ title: "Configuration not saved", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }

  if (!status) return <section className="panel panel-body"><Skeleton lines={8} /></section>;
  const availableZones = zones.filter((zone) => !accountId || zone.account.id === accountId);
  return <div className="stack">
    <div className="page-header"><div><h1>Cloudflare connection</h1><p className="muted">Configure the wildcard page router without exposing credentials to generated pages or browser storage.</p></div><StatusBadge status={status.configured ? "Configured" : "Configuration required"} /></div>
    <section className="panel panel-body"><div className="definition-grid"><div><span>Authentication</span><strong>{status.authType?.replaceAll("_", " ") ?? "Not configured"}</strong></div><div><span>Credential</span><strong>{status.credential}</strong></div><div><span>Account</span><strong>{status.accountName ?? status.accountId ?? "Not selected"}</strong></div><div><span>Zone</span><strong>{status.zoneName ?? status.zoneId ?? "Not selected"}</strong></div><div><span>Base domain</span><strong>{status.baseDomain ?? "Not selected"}</strong></div><div><span>Stored email</span><strong>{status.email ?? "Not used"}</strong></div></div></section>
    <section className="panel panel-body"><div className="section-heading"><div><h2>{status.credentialsSaved ? "Rotate Cloudflare credentials" : "Connect Cloudflare"}</h2><p>Credentials are sent once to the backend, encrypted at rest, and never returned.</p></div></div>
      <form className="form-grid" onSubmit={test}>
        <label>Authentication type<select value={authType} onChange={(event) => { setAuthType(event.target.value as typeof authType); setAccounts([]); setZones([]); }}><option value="API_TOKEN">API Token — recommended</option><option value="GLOBAL_API_KEY">Legacy Global API Key + Email</option></select></label>
        {authType === "GLOBAL_API_KEY" && <label>Cloudflare email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>}
        <label>{authType === "API_TOKEN" ? "Cloudflare API Token" : "Cloudflare Global API Key"}<input type="password" value={credential} onChange={(event) => setCredential(event.target.value)} autoComplete="new-password" required minLength={20} /></label>
        <div className="row align-end"><button disabled={testing}>{testing ? "Testing…" : "Test connection & discover"}</button></div>
      </form>
      {accounts.length > 0 && <div className="stack discovery-result"><div className="success-callout"><strong>Connection verified.</strong> Select the account and zone used by the wildcard Worker.</div><div className="form-grid"><label>Account<select value={accountId} onChange={(event) => { setAccountId(event.target.value); setZoneId(""); }}><option value="">Select account</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label><label>Zone<select value={zoneId} onChange={(event) => { const id = event.target.value; setZoneId(id); const zone = zones.find((item) => item.id === id); if (zone) setBaseDomain(zone.name); }}><option value="">Select zone</option>{availableZones.map((zone) => <option value={zone.id} key={zone.id}>{zone.name} ({zone.status})</option>)}</select></label><label>Base domain<input value={baseDomain} onChange={(event) => setBaseDomain(event.target.value)} placeholder="connect.company.example" /></label></div><div className="row"><button onClick={() => void save()} disabled={!accountId || !zoneId || !baseDomain}>Encrypt and save configuration</button></div></div>}
    </section>
    <section className="panel panel-body"><h2>Required Cloudflare architecture</h2><p className="muted">Deploy one Worker/router on <code>*.{status.baseDomain ?? "connect.company.example"}</code>. The application stores each hostname and publishes rendered page payloads into the central KV namespace. It does not create one Worker per page.</p></section>
  </div>;
}
