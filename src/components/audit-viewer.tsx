"use client";

import { useEffect, useState } from "react";

import { api } from "@/components/api";
import { Drawer, EmptyState, Skeleton, StatusBadge, useToast } from "@/components/design-system";

type Event = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  result: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
  metadata: unknown;
  createdAt: string;
  actor?: { displayName: string | null; email: string } | null;
};

export function AuditViewer({ initialConnectionId = "" }: { initialConnectionId?: string }) {
  const { notify } = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [action, setAction] = useState("");
  const [result, setResult] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(nextPage = page) {
    setLoading(true);
    const query = new URLSearchParams({ page: String(nextPage) });
    if (action) query.set("action", action);
    if (result) query.set("result", result);
    if (initialConnectionId) query.set("connectionId", initialConnectionId);
    try {
      const data = await api<{ events: Event[]; pages: number }>(`/audit?${query}`);
      setEvents(data.events);
      setPages(Math.max(1, data.pages));
      setPage(nextPage);
    } catch (error) {
      notify({ title: "Audit log unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="page-header"><div><h1>Audit log</h1><p className="muted">Immutable-style security and operational activity</p></div><button className="secondary" onClick={() => void load()}>Refresh</button></div>
      <section className="panel">
        <form className="table-toolbar" onSubmit={(event) => { event.preventDefault(); void load(1); }}><input value={action} onChange={(event) => setAction(event.target.value)} placeholder="Filter action or module" aria-label="Filter action" /><select style={{ width: 180 }} value={result} onChange={(event) => setResult(event.target.value)} aria-label="Filter result"><option value="">All results</option><option value="SUCCESS">Success</option><option value="FAILURE">Failure</option><option value="DENIED">Denied</option></select><button className="button-sm">Apply filters</button></form>
        {loading ? <div className="panel-body"><Skeleton lines={8} /></div> : events.length === 0 ? <EmptyState icon="≡" title="No audit events found" description="No events match the selected filters." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Time</th><th>Actor</th><th>Module / action</th><th>Target</th><th>IP</th><th>Result</th><th /></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{new Date(event.createdAt).toLocaleString()}</td><td>{event.actor?.displayName ?? event.actor?.email ?? "System"}</td><td>{event.action}</td><td>{event.targetType}<br /><small className="muted">{event.targetId}</small></td><td>{event.ipAddress ?? "—"}</td><td><StatusBadge status={event.result} /></td><td><button className="secondary button-sm" onClick={() => setSelected(event)}>Details</button></td></tr>)}</tbody></table></div>}
        <footer className="panel-header"><span className="muted">Page {page} of {pages}</span><div className="row"><button className="secondary button-sm" disabled={page <= 1} onClick={() => void load(page - 1)}>Previous</button><button className="secondary button-sm" disabled={page >= pages} onClick={() => void load(page + 1)}>Next</button></div></footer>
      </section>
      <Drawer open={Boolean(selected)} title="Audit event details" onClose={() => setSelected(null)}>{selected && <div className="stack"><Info label="Event ID" value={selected.id} /><Info label="Request ID" value={selected.requestId} /><Info label="Action" value={selected.action} /><Info label="Result" value={selected.result} /><Info label="Target" value={`${selected.targetType} ${selected.targetId ?? ""}`} /><Info label="IP address" value={selected.ipAddress ?? "Not recorded"} /><Info label="User agent" value={selected.userAgent ?? "Not recorded"} /><Info label="Time" value={new Date(selected.createdAt).toISOString()} /><div><strong>Safe metadata</strong><pre>{JSON.stringify(selected.metadata, null, 2)}</pre></div></div>}</Drawer>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><small className="muted">{label}</small><div style={{ overflowWrap: "anywhere" }}>{value}</div></div>;
}
