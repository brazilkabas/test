"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { api } from "@/components/api";
import { ThemeToggle, ToastProvider } from "@/components/design-system";

const navigation = [
  { href: "/admin", icon: "⌂", label: "Overview" },
  { href: "/admin/accounts", icon: "◎", label: "Microsoft accounts" },
  { href: "/admin/directory", icon: "♙", label: "Organization users" },
  { href: "/admin/access-codes", icon: "⌁", label: "Access codes" },
  { href: "/admin/html-projects", icon: "▤", label: "HTML projects" },
  { href: "/admin/deployments", icon: "☁", label: "Cloudflare" },
  { href: "/admin/audit", icon: "≡", label: "Audit log" },
  { href: "/admin/diagnostics", icon: "⌁", label: "Diagnostics" },
  { href: "/admin/security", icon: "◇", label: "Security" },
];

export function EnterpriseShell({
  user,
  children,
}: {
  user: { email: string; displayName: string | null };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<Array<{ id: string; displayName: string | null; userPrincipalName: string | null }>>([]);

  useEffect(() => {
    api<{ accounts: typeof accounts }>("/microsoft/accounts")
      .then((result) => {
        setAccounts(result.accounts);
        setAccountId((current) => current || result.accounts[0]?.id || "");
      })
      .catch(() => undefined);
  }, []);

  function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    router.push(`/admin/accounts?q=${encodeURIComponent(query.trim())}`);
  }

  async function logout() {
    await api("/auth/logout", { method: "POST", body: "{}" });
    window.location.assign("/login");
  }

  return (
    <ToastProvider>
      <div className="app-shell">
        <aside className={`app-sidebar ${mobileOpen ? "is-open" : ""}`}>
          <div className="brand"><span className="brand-mark">C</span><div><strong>Company Control</strong><small>Operations console</small></div></div>
          <nav className="primary-nav" aria-label="Primary navigation">
            {navigation.map((item) => {
              const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
              return <Link className={active ? "active" : ""} href={item.href} key={item.href} onClick={() => setMobileOpen(false)}><span aria-hidden>{item.icon}</span>{item.label}</Link>;
            })}
          </nav>
          <div className="sidebar-footer"><span className="avatar">{(user.displayName ?? user.email).slice(0, 1).toUpperCase()}</span><div><strong>{user.displayName ?? "Administrator"}</strong><small>{user.email}</small></div><button className="icon-button" title="Sign out" aria-label="Sign out" onClick={() => void logout()}>↪</button></div>
        </aside>
        {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
        <div className="app-main">
          <header className="topbar">
            <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>☰</button>
            <form className="global-search" onSubmit={search}><span aria-hidden>⌕</span><input aria-label="Search accounts" placeholder="Search accounts, users, mail…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></form>
            <div className="topbar-actions">
              <select className="account-switcher" aria-label="Active Microsoft account" value={accountId} onChange={(event) => { setAccountId(event.target.value); if (event.target.value) router.push(`/mail/${event.target.value}`); }}>
                <option value="">Select mailbox</option>
                {accounts.map((account) => <option value={account.id} key={account.id}>{account.displayName ?? account.userPrincipalName}</option>)}
              </select>
              <ThemeToggle />
              <button className="icon-button" aria-label="Notifications">◔</button>
            </div>
          </header>
          <main className="app-content">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
