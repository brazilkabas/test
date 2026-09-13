"use client";

import { FormEvent, useEffect, useState } from "react";

import { api } from "@/components/api";
import { ConfirmDialog, EmptyState, Modal, Skeleton, StatusBadge, useToast } from "@/components/design-system";

type CodeRecord = {
  id: string;
  createdAt: string;
  expiresAt: string;
  maximumUses: number;
  usedCount: number;
  allowedRole: string | null;
  allowedIpRange: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  description: string | null;
  purpose: string;
  createdBy: { displayName: string | null; email: string };
};

const roles = ["SUPER_ADMIN", "MICROSOFT_ADMIN", "MAIL_OPERATOR", "MAIL_VIEWER", "DEPLOYMENT_ADMIN", "HTML_DESIGNER", "AUDITOR", "SUPPORT_OPERATOR"];

export function AccessCodeAdmin() {
  const { notify } = useToast();
  const [codes, setCodes] = useState<CodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [plaintext, setPlaintext] = useState("");
  const [revoke, setRevoke] = useState<CodeRecord | null>(null);
  const [defaultExpiry] = useState(() => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16));

  async function load() {
    try {
      setCodes((await api<{ codes: CodeRecord[] }>("/access-codes")).codes);
    } catch (error) {
      notify({ title: "Access codes unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ code: string }>("/access-codes", {
        method: "POST",
        body: JSON.stringify({
          description: data.get("description") || undefined,
          expiresAt: new Date(String(data.get("expiresAt"))).toISOString(),
          maximumUses: Number(data.get("maximumUses")),
          allowedRole: data.get("allowedRole") || undefined,
          allowedIpRange: data.get("allowedIpRange") || undefined,
        }),
      });
      setCreateOpen(false);
      setPlaintext(result.code);
      await load();
    } catch (error) {
      notify({ title: "Code was not created", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }

  async function revokeCode() {
    if (!revoke) return;
    try {
      await api(`/access-codes/${revoke.id}`, { method: "DELETE" });
      notify({ title: "Access code revoked", tone: "success" });
      setRevoke(null);
      await load();
    } catch (error) {
      notify({ title: "Revoke failed", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }

  return (
    <>
      <div className="page-header"><div><h1>Access codes</h1><p className="muted">Temporary internal application access. These codes are never Microsoft credentials.</p></div><button onClick={() => setCreateOpen(true)}>+ Generate code</button></div>
      <section className="panel">
        {loading ? <div className="panel-body"><Skeleton lines={6} /></div> : codes.length === 0 ? <EmptyState icon="⌁" title="No access codes" description="Generate a one-time or temporary reusable access code." action={<button onClick={() => setCreateOpen(true)}>Generate code</button>} /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Description</th><th>Purpose</th><th>Status</th><th>Role</th><th>Usage</th><th>Expires</th><th>IP restriction</th><th>Last used</th><th /></tr></thead><tbody>{codes.map((code) => {
          const state = code.revokedAt ? "Revoked" : new Date(code.expiresAt) <= new Date() ? "Expired" : code.usedCount >= code.maximumUses ? "Exhausted" : "Active";
          return <tr key={code.id}><td><strong>{code.description ?? "Temporary access"}</strong><br /><small className="muted">Created by {code.createdBy.displayName ?? code.createdBy.email}</small></td><td>{code.purpose}</td><td><StatusBadge status={state} /></td><td>{code.purpose === "APPLICATION" ? code.allowedRole?.replaceAll("_", " ") ?? "Creator role" : "Deployment only"}</td><td>{code.usedCount} / {code.maximumUses}</td><td>{new Date(code.expiresAt).toLocaleString()}</td><td>{code.allowedIpRange ?? "Any"}</td><td>{code.lastUsedAt ? new Date(code.lastUsedAt).toLocaleString() : "Never"}</td><td>{state === "Active" && <button className="secondary button-sm" onClick={() => setRevoke(code)}>Revoke</button>}</td></tr>;
        })}</tbody></table></div>}
      </section>
      <Modal open={createOpen} title="Generate access code" onClose={() => setCreateOpen(false)}>
        <form className="stack" onSubmit={create}>
          <label>Description<input name="description" maxLength={200} placeholder="Contractor audit access" /></label>
          <label>Expires<input name="expiresAt" type="datetime-local" required defaultValue={defaultExpiry} /></label>
          <label>Maximum uses<input name="maximumUses" type="number" min={1} max={100} defaultValue={1} required /></label>
          <label>Role<select name="allowedRole" defaultValue="MAIL_VIEWER">{roles.map((role) => <option value={role} key={role}>{role.replaceAll("_", " ")}</option>)}</select></label>
          <label>Allowed IP or IPv4 CIDR (optional)<input name="allowedIpRange" placeholder="203.0.113.0/24" /></label>
          <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="secondary" onClick={() => setCreateOpen(false)}>Cancel</button><button>Generate securely</button></div>
        </form>
      </Modal>
      <Modal open={Boolean(plaintext)} title="Copy this code now" onClose={() => setPlaintext("")}>
        <div className="stack"><p className="muted">The plaintext is shown once and cannot be recovered later.</p><div className="device-code" style={{ fontSize: "1.55rem" }}>{plaintext}</div><button onClick={() => { void navigator.clipboard.writeText(plaintext); notify({ title: "Code copied", tone: "success" }); }}>Copy code</button></div>
      </Modal>
      <ConfirmDialog open={Boolean(revoke)} title="Revoke access code?" description="This code will immediately stop creating new application sessions. Existing sessions remain separately revocable." confirmLabel="Revoke code" destructive onClose={() => setRevoke(null)} onConfirm={() => void revokeCode()} />
    </>
  );
}
