"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/components/api";

type Account = {
  id: string;
  displayName: string | null;
  userPrincipalName: string | null;
  tenantId: string;
  microsoftUserId: string;
  authorizationStatus: string;
  lastSuccessfulGraphAt: string | null;
  grantedScopes: string[];
};

type AuditEvent = {
  id: string;
  action: string;
  targetType: string;
  result: string;
  createdAt: string;
};

export function AdminDashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [accountData, auditData] = await Promise.all([
        api<{ accounts: Account[] }>("/microsoft/accounts"),
        api<{ events: AuditEvent[] }>("/audit"),
      ]);
      setAccounts(accountData.accounts);
      setEvents(auditData.events);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load dashboard");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function startConnection() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ connectUrl: string }>("/microsoft/device/start", {
        method: "POST",
        body: "{}",
      });
      window.location.assign(result.connectUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start authorization");
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1>Administration</h1>
          <p className="muted">Microsoft connections and security activity</p>
        </div>
        <button disabled={busy} onClick={startConnection}>
          {busy ? "Requesting code…" : "Connect Microsoft account"}
        </button>
      </div>
      {error && <div className="card error" role="alert">{error}</div>}
      <section className="grid">
        <div className="card"><strong>{accounts.length}</strong><div className="muted">Connected accounts</div></div>
        <div className="card"><strong>{accounts.filter((account) => account.authorizationStatus === "CONNECTED").length}</strong><div className="muted">Healthy connections</div></div>
        <div className="card"><strong>{events.length}</strong><div className="muted">Recent audit events</div></div>
      </section>
      <section className="card">
        <h2>Microsoft accounts</h2>
        {accounts.length === 0 ? (
          <p className="muted">No accounts are connected yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Account</th><th>Status</th><th>Tenant / object ID</th><th>Last Graph activity</th><th /></tr></thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td><strong>{account.displayName ?? "Unnamed account"}</strong><br /><span className="muted">{account.userPrincipalName}</span></td>
                    <td><span className="badge">{account.authorizationStatus.replaceAll("_", " ")}</span></td>
                    <td><small>{account.tenantId}<br />{account.microsoftUserId}</small></td>
                    <td>{account.lastSuccessfulGraphAt ? new Date(account.lastSuccessfulGraphAt).toLocaleString() : "Never"}</td>
                    <td><Link className="button secondary" href={`/mail/${account.id}`}>Open mailbox</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card">
        <h2>Audit log</h2>
        <table>
          <thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Result</th></tr></thead>
          <tbody>
            {events.slice(0, 20).map((event) => (
              <tr key={event.id}><td>{new Date(event.createdAt).toLocaleString()}</td><td>{event.action}</td><td>{event.targetType}</td><td>{event.result}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
