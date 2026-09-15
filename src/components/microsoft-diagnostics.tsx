"use client";

import { FormEvent, useEffect, useState } from "react";

import { api } from "@/components/api";
import { EmptyState, Skeleton, StatusBadge, useToast } from "@/components/design-system";

type Account = {
  id: string;
  displayName: string | null;
  userPrincipalName: string | null;
  authorizationStatus: string;
  capabilities: { canSendMail: boolean };
};
type Result = { id: string; label: string; status: string; requiredScope: string; error?: string; microsoftCode?: string };

export function MicrosoftDiagnostics() {
  const { notify } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const selectedAccount = accounts.find((account) => account.id === accountId);

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

  return (
    <>
      <div className="page-header"><div><h1>Live Microsoft diagnostics</h1><p className="muted">Run safe checks against the real tenant. Tokens and message content are never displayed.</p></div></div>
      <section className="panel">
        <div className="panel-header"><div className="row" style={{ flex: 1 }}><select style={{ maxWidth: 360 }} value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Select a connected account</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.displayName ?? account.userPrincipalName}</option>)}</select><button disabled={!accountId || running} onClick={() => void run()}>{running ? "Running checks…" : "Run live tests"}</button></div></div>
        {running ? <div className="panel-body"><Skeleton lines={6} /></div> : !results.length ? <EmptyState icon="⌁" title="No diagnostics run yet" description="Select a connected Microsoft account and run the live checks. Missing optional permissions are reported, not treated as fake success." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Test</th><th>Required permission</th><th>Status</th><th>Safe error</th></tr></thead><tbody>{results.map((result) => <tr key={result.id}><td>{result.label}</td><td><code>{result.requiredScope}</code></td><td><StatusBadge status={result.status} /></td><td>{result.microsoftCode && <code>{result.microsoftCode}: </code>}{result.error ?? "—"}</td></tr>)}</tbody></table></div>}
      </section>
      {selectedAccount?.capabilities.canSendMail && <section className="panel" style={{ marginTop: "1rem" }}><header className="panel-header"><h2>Explicit send test</h2></header><form className="panel-body row" onSubmit={send}><label style={{ flex: 1 }}>Approved recipient<input type="email" name="recipient" required placeholder="test-recipient@company.com" /></label><button>Confirm and send</button></form></section>}
    </>
  );
}
