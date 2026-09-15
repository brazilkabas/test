"use client";

import { FormEvent, useEffect, useState } from "react";

import { api } from "@/components/api";
import { EmptyState, Skeleton, StatusBadge, useToast } from "@/components/design-system";

type Account = { id: string; displayName: string | null; userPrincipalName: string | null; authorizationStatus: string };
type Result = { id: string; label: string; status: string; requiredScope: string; error?: string; microsoftCode?: string };
type ClientProbe = {
  clientId: string | null;
  accountFound: boolean;
  ownTokenState: boolean;
  refreshTokenPresent: boolean;
  authentication: "PASS" | "FAIL" | "NOT_CONFIGURED";
  silentAcquisition: "PASS" | "FAIL" | "NOT_RUN";
  interactionRequired: boolean;
  graph: "PASS" | "FAIL" | "NOT_RUN";
  audience: string;
  grantedScopes: string[];
  mailRead: boolean;
  errorCode: string | null;
  aadstsCode: string | null;
};
type ClientMatrix = {
  clientA: ClientProbe;
  clientB: ClientProbe | null;
  foci: {
    familyRefreshTokenPresent: boolean;
    actualMicrosoftFamilyMembership: string[];
    familyLookupEligible: boolean;
    note: string;
  };
};

export function MicrosoftDiagnostics() {
  const { notify } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [comparisonClientId, setComparisonClientId] = useState("");
  const [matrix, setMatrix] = useState<ClientMatrix | null>(null);
  const [matrixRunning, setMatrixRunning] = useState(false);

  useEffect(() => {
    api<{ accounts: Account[] }>("/microsoft/accounts").then((data) => {
      setAccounts(data.accounts);
      setAccountId(data.accounts[0]?.id ?? "");
    }).catch((error) => notify({ title: "Connections unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" }));
  }, [notify]);

  async function run() {
    if (!accountId) return;
    setRunning(true);
    setResults([]);
    try {
      const data = await api<{ results: Result[] }>(`/diagnostics/${accountId}`);
      setResults(data.results);
      notify({ title: "Microsoft diagnostics finished", message: `${data.results.filter((result) => result.status === "PASS").length} checks passed`, tone: "success" });
    } catch (error) {
      notify({ title: "Diagnostics failed", message: error instanceof Error ? error.message : undefined, tone: "error" });
    } finally {
      setRunning(false);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const recipient = String(new FormData(event.currentTarget).get("recipient"));
    if (!window.confirm(`Send one diagnostics email to ${recipient}?`)) return;
    try {
      await api(`/diagnostics/${accountId}`, { method: "POST", body: JSON.stringify({ recipient }) });
      notify({ title: "Test message sent", message: recipient, tone: "success" });
    } catch (error) {
      notify({ title: "Test send failed", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }

  async function runClientMatrix() {
    if (!accountId) return;
    setMatrixRunning(true);
    setMatrix(null);
    try {
      const data = await api<ClientMatrix>(`/diagnostics/${accountId}/client-matrix`, {
        method: "POST",
        body: JSON.stringify({
          ...(comparisonClientId.trim()
            ? { comparisonClientId: comparisonClientId.trim() }
            : {}),
        }),
      });
      setMatrix(data);
    } catch (error) {
      notify({
        title: "Client comparison failed",
        message: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    } finally {
      setMatrixRunning(false);
    }
  }

  return (
    <>
      <div className="page-header"><div><h1>Live Microsoft diagnostics</h1><p className="muted">Run safe checks against the real tenant. Tokens and message content are never displayed.</p></div></div>
      <section className="panel">
        <div className="panel-header"><div className="row" style={{ flex: 1 }}><select style={{ maxWidth: 360 }} value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Select a connected account</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.displayName ?? account.userPrincipalName}</option>)}</select><button disabled={!accountId || running} onClick={() => void run()}>{running ? "Running checks…" : "Run live tests"}</button></div></div>
        {running ? <div className="panel-body"><Skeleton lines={6} /></div> : !results.length ? <EmptyState icon="⌁" title="No diagnostics run yet" description="Select a connected Microsoft account and run the live checks. Missing optional permissions are reported, not treated as fake success." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Test</th><th>Required permission</th><th>Status</th><th>Safe error</th></tr></thead><tbody>{results.map((result) => <tr key={result.id}><td>{result.label}</td><td><code>{result.requiredScope}</code></td><td><StatusBadge status={result.status} /></td><td>{result.microsoftCode && <code>{result.microsoftCode}: </code>}{result.error ?? "—"}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="panel" style={{ marginTop: "1rem" }}>
        <header className="panel-header">
          <div>
            <h2>MSAL client and FOCI diagnostics</h2>
            <p className="muted">Compare the configured client cache with another public client ID. No tokens or cache secrets are displayed or persisted.</p>
          </div>
        </header>
        <div className="panel-body stack">
          <div className="row">
            <label style={{ flex: 1 }}>
              Client B ID (optional)
              <input
                value={comparisonClientId}
                onChange={(event) => setComparisonClientId(event.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </label>
            <button
              type="button"
              disabled={!accountId || matrixRunning}
              onClick={() => void runClientMatrix()}
            >
              {matrixRunning ? "Comparing…" : "Compare clients"}
            </button>
          </div>
          {matrixRunning && <Skeleton lines={5} />}
          {matrix && (
            <div className="stack">
              <ClientProbeTable label="Client A" probe={matrix.clientA} />
              {matrix.clientB && <ClientProbeTable label="Client B" probe={matrix.clientB} />}
              <div className="card stack">
                <h3>FOCI</h3>
                <p><strong>Family refresh token:</strong> {yesNo(matrix.foci.familyRefreshTokenPresent)}</p>
                <p><strong>Actual Microsoft family membership:</strong> {matrix.foci.actualMicrosoftFamilyMembership.join(", ") || "NONE"}</p>
                <p><strong>Family lookup eligible:</strong> {yesNo(matrix.foci.familyLookupEligible)}</p>
                <p className="muted">{matrix.foci.note}</p>
              </div>
            </div>
          )}
        </div>
      </section>
      <section className="panel" style={{ marginTop: "1rem" }}><header className="panel-header"><h2>Explicit send test</h2></header><form className="panel-body row" onSubmit={send}><label style={{ flex: 1 }}>Approved recipient<input type="email" name="recipient" required placeholder="test-recipient@company.com" /></label><button disabled={!accountId}>Confirm and send</button></form></section>
    </>
  );
}

function ClientProbeTable({ label, probe }: { label: string; probe: ClientProbe }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th colSpan={2}>{label}</th></tr></thead>
        <tbody>
          <tr><td>Client ID</td><td><code>{probe.clientId ?? "NOT CONFIGURED"}</code></td></tr>
          <tr><td>Authentication</td><td><StatusBadge status={probe.authentication} /></td></tr>
          <tr><td>Account found</td><td>{yesNo(probe.accountFound)}</td></tr>
          <tr><td>Own token state</td><td>{yesNo(probe.ownTokenState)}</td></tr>
          <tr><td>Refresh token</td><td>{yesNo(probe.refreshTokenPresent)}</td></tr>
          <tr><td>Silent acquisition</td><td><StatusBadge status={probe.silentAcquisition} /></td></tr>
          <tr><td>Interaction required</td><td>{yesNo(probe.interactionRequired)}</td></tr>
          <tr><td>Graph</td><td><StatusBadge status={probe.graph} /></td></tr>
          <tr><td>Audience</td><td><code>{probe.audience}</code></td></tr>
          <tr><td>Granted scopes</td><td>{probe.grantedScopes.join(", ") || "NONE"}</td></tr>
          <tr><td>Mail.Read</td><td>{yesNo(probe.mailRead)}</td></tr>
          <tr><td>Safe error</td><td>{probe.aadstsCode ?? probe.errorCode ?? "—"}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function yesNo(value: boolean) {
  return value ? "YES" : "NO";
}
