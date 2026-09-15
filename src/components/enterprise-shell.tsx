"use client";

import {
  Activity, BookOpenCheck, Boxes, ChevronDown, ChevronLeft, ChevronRight,
  CircleUserRound, Cloud, FilePenLine, FolderKanban, Inbox, KeyRound,
  LayoutDashboard, Menu, Search, Settings, ShieldCheck, UsersRound, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/components/api";
import { ThemeToggle, ToastProvider } from "@/components/design-system";

const staticNavigation = [
  { href: "/admin", icon: LayoutDashboard, label: "Overview" },
  { href: "/admin/accounts", icon: CircleUserRound, label: "Microsoft Accounts" },
  { href: "/admin/directory", icon: UsersRound, label: "Users" },
  { href: "/admin/exchange", icon: Boxes, label: "Shared Mailboxes" },
  { href: "/admin/html-projects", icon: FilePenLine, label: "Page Builder" },
  { href: "/admin/deployments", icon: Cloud, label: "Deployments" },
  { href: "/admin/access-codes", icon: KeyRound, label: "Access Codes" },
  { href: "/admin/audit", icon: BookOpenCheck, label: "Audit" },
  { href: "/admin/security", icon: Settings, label: "Settings" },
];

const breadcrumbNames: Record<string, string> = {
  admin: "Overview", accounts: "Microsoft Accounts", directory: "Users",
  exchange: "Shared Mailboxes", "html-projects": "Page Builder",
  deployments: "Deployments", "access-codes": "Access Codes",
  audit: "Audit", security: "Settings", diagnostics: "Diagnostics",
  rules: "Rules", settings: "Mailbox Settings", mail: "Mail",
};

export function EnterpriseShell({ user, children }: { user: { email: string; displayName: string | null }; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<Array<{
    id: string;
    displayName: string | null;
    userPrincipalName: string | null;
    authorizationStatus?: string;
    capabilities?: { canReadMail?: boolean };
  }>>([]);

  useEffect(() => {
    setCollapsed(localStorage.getItem("company-sidebar-collapsed") === "true");
    api<{ accounts: typeof accounts }>("/microsoft/accounts").then((result) => {
      const connectedAccounts = result.accounts.filter((account) => account.authorizationStatus === "CONNECTED");
      setAccounts(connectedAccounts);
      const routeAccountId = pathname.match(/^\/mail\/([^/]+)/)?.[1];
      setAccountId((current) =>
        connectedAccounts.some((account) => account.id === routeAccountId)
          ? routeAccountId!
          : connectedAccounts.some((account) => account.id === current)
            ? current
            : connectedAccounts[0]?.id || "",
      );
    }).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const deleted = (event: Event) => {
      const connectionId = (event as CustomEvent<{ connectionId?: string }>).detail?.connectionId;
      if (!connectionId) return;
      setAccounts((current) => {
        const next = current.filter((account) => account.id !== connectionId);
        setAccountId((selected) => {
          if (selected !== connectionId) return selected;
          const replacement = next[0]?.id ?? "";
          if (pathname.startsWith(`/mail/${connectionId}`)) {
            router.push(replacement ? `/mail/${replacement}` : "/mail");
          }
          return replacement;
        });
        return next;
      });
    };
    window.addEventListener("microsoft-account-deleted", deleted);
    return () => window.removeEventListener("microsoft-account-deleted", deleted);
  }, [pathname, router]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  const navigation = useMemo(() => {
    return [
      ...staticNavigation.slice(0, 2),
      { href: "/mail", icon: Inbox, label: "Mail" },
      ...staticNavigation.slice(2, 4),
      { href: accountId ? `/mail/${accountId}/rules` : "/admin/accounts", icon: FolderKanban, label: "Rules" },
      ...staticNavigation.slice(4),
    ];
  }, [accountId]);
  const pathParts = pathname.split("/").filter(Boolean);
  const currentName = breadcrumbNames[pathParts.at(-1) ?? ""] ?? (pathname.startsWith("/profiles") ? "Account Profile" : "Workspace");
  const healthyCount = accounts.filter((account) => account.authorizationStatus === "CONNECTED").length;

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("company-sidebar-collapsed", String(next));
  }
  function search(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim()) router.push(`/admin/accounts?q=${encodeURIComponent(query.trim())}`);
  }
  async function logout() {
    await api("/auth/logout", { method: "POST", body: "{}" });
    router.replace("/login");
    router.refresh();
  }

  return <ToastProvider>
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`app-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark"><ShieldCheck size={19} strokeWidth={2.2} /></span>
          <div><strong>Company Control</strong><small>Operations workspace</small></div>
          <button className="sidebar-collapse" onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}</button>
        </div>
        <div className="nav-section-label">Workspace</div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {navigation.map((item, index) => {
            const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href) && !(item.href === "/admin/accounts" && pathname !== item.href);
            const Icon = item.icon;
            return <Link className={active ? "active" : ""} href={item.href} key={`${item.label}-${index}`} onClick={() => setMobileOpen(false)} title={collapsed ? item.label : undefined}><Icon size={17} strokeWidth={1.9} aria-hidden /><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="sidebar-security"><ShieldCheck size={15} /><span><strong>Secure workspace</strong><small>RBAC & audit enabled</small></span></div>
        <div className="sidebar-footer">
          <span className="avatar">{(user.displayName ?? user.email).slice(0, 1).toUpperCase()}</span>
          <div><strong>{user.displayName ?? "Administrator"}</strong><small>{user.email}</small></div>
          <button className="icon-button" title="Sign out" aria-label="Sign out" onClick={() => void logout()}><ChevronRight size={15} /></button>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X /></button>}
      <div className="app-main">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={18} /></button>
          <div className="breadcrumb"><span>Company Control</span><ChevronRight size={13} /><strong>{currentName}</strong></div>
          <form className="global-search" onSubmit={search}><Search size={15} aria-hidden /><input ref={searchRef} aria-label="Search accounts" placeholder="Search accounts, users, mail…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></form>
          <div className="topbar-actions">
            <div className={`system-health ${healthyCount > 0 ? "is-healthy" : ""}`}><Activity size={14} /><span>{healthyCount > 0 ? "Systems healthy" : "Setup required"}</span></div>
            <select className="account-switcher" aria-label="Active Microsoft account" value={accountId} onChange={(event) => { setAccountId(event.target.value); if (event.target.value) router.push(`/mail/${event.target.value}`); }}>
              <option value="">Select mailbox</option>
              {accounts.map((account) => <option value={account.id} key={account.id}>{account.displayName ?? account.userPrincipalName} — {account.capabilities?.canReadMail ? "Mail ready" : "Mail unavailable"}</option>)}
            </select>
            <ThemeToggle />
            <details className="admin-menu"><summary><span className="avatar">{(user.displayName ?? user.email).slice(0, 1).toUpperCase()}</span><ChevronDown size={14} /></summary><div><strong>{user.displayName ?? "Administrator"}</strong><small>{user.email}</small><Link href="/admin/security"><Settings size={14} /> Settings</Link><button onClick={() => void logout()}><ChevronRight size={14} /> Sign out</button></div></details>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  </ToastProvider>;
}
