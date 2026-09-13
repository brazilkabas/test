"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { api } from "@/components/api";
import { EmptyState, Skeleton, StatusBadge, useToast } from "@/components/design-system";

type User = { id: string; displayName?: string; userPrincipalName?: string; mail?: string; accountEnabled?: boolean; connectionId: string | null; connectionStatus: string; mailboxStatus: string; capabilities: string[] };

export function OrganizationUsers() {
  const { notify } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [nextLink, setNextLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionRequired, setPermissionRequired] = useState(false);

  async function load(append = false) {
    setLoading(true);
    const params = new URLSearchParams();
    if (append && nextLink) params.set("nextLink", nextLink);
    else if (search) params.set("search", search);
    try {
      const data = await api<{ users: User[]; nextLink: string | null }>(`/microsoft/users?${params}`);
      setUsers((current) => append ? [...current, ...data.users] : data.users); setNextLink(data.nextLink); setPermissionRequired(false);
    } catch (error) {
      if (error instanceof Error && error.message.includes("User.Read")) setPermissionRequired(true);
      else notify({ title: "Directory unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" });
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <>
    <div className="page-header"><div><h1>Organization users</h1><p className="muted">Tenant directory records available through approved delegated permissions</p></div></div>
    <section className="panel"><form className="table-toolbar" onSubmit={(event: FormEvent) => { event.preventDefault(); void load(); }}><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or UPN" /><button className="button-sm">Search directory</button></form>
      {loading ? <div className="panel-body"><Skeleton lines={8} /></div> : permissionRequired ? <EmptyState icon="◇" title="Directory permission required" description="Add and consent User.ReadBasic.All for basic profiles or User.Read.All only when account state is required, then reconnect the Microsoft account." /> : !users.length ? <EmptyState title="No directory users" description="Microsoft returned no users for this search." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>UPN / email</th><th>Microsoft object ID</th><th>Account state</th><th>Connection</th><th>Mailbox</th><th>Capabilities</th><th /></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.displayName ?? "Unnamed user"}</strong></td><td>{user.mail ?? user.userPrincipalName}</td><td><small>{user.id}</small></td><td>{user.accountEnabled == null ? "Permission not granted" : <StatusBadge status={user.accountEnabled ? "Enabled" : "Disabled"} />}</td><td><StatusBadge status={user.connectionStatus} /></td><td>{user.mailboxStatus.replaceAll("_", " ")}</td><td>{user.capabilities.join(", ")}</td><td>{user.connectionId ? <Link className="button secondary button-sm" href={`/profiles/${user.connectionId}`}>Open profile</Link> : "Not connected"}</td></tr>)}</tbody></table></div>}
      {nextLink && <footer className="panel-header"><span /><button className="secondary button-sm" onClick={() => void load(true)}>Load more</button></footer>}
    </section>
  </>;
}
