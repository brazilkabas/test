"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { api } from "@/components/api";
import { ConfirmDialog, EmptyState, Modal, Skeleton, StatusBadge, useToast } from "@/components/design-system";
import { MailboxSettingsConsent } from "@/components/mailbox-settings-consent";

type Rule = { id: string; displayName: string; sequence: number; isEnabled: boolean; isReadOnly?: boolean; conditions: Record<string, unknown>; actions: Record<string, unknown>; exceptions?: Record<string, unknown> };

export function MailRulesAdmin({ connectionId }: { connectionId: string }) {
  const { notify } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionReady, setPermissionReady] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);

  const load = useCallback(async () => {
    try { setRules((await api<{ rules: Rule[] }>(`/mail/${connectionId}/rules`)).rules); }
    catch (error) { notify({ title: "Rules unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
    finally { setLoading(false); }
  }, [connectionId, notify]);
  useEffect(() => {
    void api<{ account: { grantedScopes: string[] } }>(`/microsoft/accounts/${connectionId}`)
      .then(({ account }) => {
        const granted = account.grantedScopes.map((scope) => scope.toLowerCase().replace("https://graph.microsoft.com/", ""));
        const ready = granted.includes("mailboxsettings.readwrite");
        setPermissionReady(ready);
        if (ready) void load();
        else setLoading(false);
      })
      .catch((error) => notify({ title: "Account unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" }));
  }, [connectionId, load, notify]);
  const onPermissionGranted = useCallback(() => {
    setPermissionReady(true);
    setLoading(true);
    void load();
    notify({ title: "Inbox rules enabled", tone: "success" });
  }, [load, notify]);

  async function toggle(rule: Rule) {
    try {
      await api(`/mail/${connectionId}/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ isEnabled: !rule.isEnabled }) });
      await load();
      notify({ title: `Rule ${rule.isEnabled ? "disabled" : "enabled"}`, tone: "success" });
    } catch (error) { notify({ title: "Rule update failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const current = editing === "new" ? null : editing;
    const conditions: Record<string, unknown> = {};
    if (form.get("sender")) conditions.senderContains = split(String(form.get("sender")));
    if (form.get("subject")) conditions.subjectContains = split(String(form.get("subject")));
    if (form.get("hasAttachments") === "on") conditions.hasAttachments = true;
    const actions: Record<string, unknown> = {};
    if (form.get("markAsRead") === "on") actions.markAsRead = true;
    if (form.get("stopProcessingRules") === "on") actions.stopProcessingRules = true;
    const payload = { displayName: form.get("displayName"), sequence: Number(form.get("sequence")), isEnabled: form.get("isEnabled") === "on", conditions, actions, exceptions: current?.exceptions ?? {} };
    try {
      await api(`/mail/${connectionId}/rules${current ? `/${current.id}` : ""}`, { method: current ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setEditing(null); await load(); notify({ title: current ? "Rule updated" : "Rule created", tone: "success" });
    } catch (error) { notify({ title: "Rule was not saved", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }

  async function remove() {
    if (!deleting) return;
    try { await api(`/mail/${connectionId}/rules/${deleting.id}`, { method: "DELETE" }); setDeleting(null); await load(); notify({ title: "Rule deleted", tone: "success" }); }
    catch (error) { notify({ title: "Rule delete failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }

  if (permissionReady === null) return <section className="panel panel-body"><Skeleton lines={6} /></section>;
  if (!permissionReady) return <MailboxSettingsConsent connectionId={connectionId} onGranted={onPermissionGranted} />;
  return <>
    <div className="page-header"><div><h1>Inbox rules</h1><p className="muted">User mailbox rules exposed by Microsoft Graph. These are not Exchange transport rules.</p></div><button onClick={() => setEditing("new")}>+ Create rule</button></div>
    <section className="panel">{loading ? <div className="panel-body"><Skeleton lines={6} /></div> : !rules.length ? <EmptyState icon="⇢" title="No Inbox rules" description="Create a supported user Inbox rule for this mailbox." action={<button onClick={() => setEditing("new")}>Create rule</button>} /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Priority</th><th>Name</th><th>Status</th><th>Conditions</th><th>Actions</th><th /></tr></thead><tbody>{rules.map((rule) => <tr key={rule.id}><td>{rule.sequence}</td><td><strong>{rule.displayName}</strong>{rule.isReadOnly && <><br /><small className="muted">Read-only in Graph</small></>}</td><td><StatusBadge status={rule.isEnabled ? "Enabled" : "Disabled"} /></td><td>{summary(rule.conditions)}</td><td>{summary(rule.actions)}</td><td><div className="row"><button className="secondary button-sm" disabled={rule.isReadOnly} onClick={() => void toggle(rule)}>{rule.isEnabled ? "Disable" : "Enable"}</button><button className="secondary button-sm" disabled={rule.isReadOnly} onClick={() => setEditing(rule)}>Edit</button><button className="secondary button-sm error" disabled={rule.isReadOnly} onClick={() => setDeleting(rule)}>Delete</button></div></td></tr>)}</tbody></table></div>}</section>
    <Modal open={Boolean(editing)} title={editing === "new" ? "Create Inbox rule" : "Edit Inbox rule"} onClose={() => setEditing(null)}>{editing && <form className="stack" onSubmit={save}><label>Name<input name="displayName" required defaultValue={editing === "new" ? "" : editing.displayName} /></label><label>Priority<input type="number" name="sequence" min={1} required defaultValue={editing === "new" ? rules.length + 1 : editing.sequence} /></label><label>Sender contains <input name="sender" placeholder="alerts@company.com" defaultValue={editing === "new" ? "" : arrayValue(editing.conditions.senderContains)} /></label><label>Subject contains <input name="subject" placeholder="invoice, approval" defaultValue={editing === "new" ? "" : arrayValue(editing.conditions.subjectContains)} /></label><label className="check-row"><input type="checkbox" name="hasAttachments" defaultChecked={editing !== "new" && editing.conditions.hasAttachments === true} />Message has attachments</label><label className="check-row"><input type="checkbox" name="markAsRead" defaultChecked={editing !== "new" && editing.actions.markAsRead === true} />Mark as read</label><label className="check-row"><input type="checkbox" name="stopProcessingRules" defaultChecked={editing !== "new" && editing.actions.stopProcessingRules === true} />Stop processing more rules</label><label className="check-row"><input type="checkbox" name="isEnabled" defaultChecked={editing === "new" || editing.isEnabled} />Enabled</label><p className="muted">This editor exposes only Graph-supported predicates/actions implemented here. Existing unsupported properties are not fabricated.</p><div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button><button>Save rule</button></div></form>}</Modal>
    <ConfirmDialog open={Boolean(deleting)} title="Delete Inbox rule?" description={`Delete “${deleting?.displayName ?? ""}” from the Microsoft mailbox?`} confirmLabel="Delete rule" destructive onClose={() => setDeleting(null)} onConfirm={() => void remove()} />
  </>;
}

function split(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function arrayValue(value: unknown) { return Array.isArray(value) ? value.join(", ") : ""; }
function summary(value: Record<string, unknown>) { const keys = Object.entries(value).filter(([, item]) => item !== false && item != null).map(([key]) => key.replace(/([A-Z])/g, " $1")); return keys.length ? keys.join(", ") : "None"; }
