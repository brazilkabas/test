"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/components/api";

type Message = {
  id: string;
  subject: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  webLink?: string;
  hasAttachments?: boolean;
};

type Attachment = { id: string; name: string; contentType: string; size: number };

export function MailClient({ connectionId }: { connectionId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Message | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [nextLink, setNextLink] = useState<string | null>(null);
  const [tab, setTab] = useState<"mail" | "compose" | "settings" | "rules">("mail");
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [rules, setRules] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadMessages = useCallback(async (append = false) => {
    setBusy(true);
    try {
      const query = append && nextLink ? `?nextLink=${encodeURIComponent(nextLink)}` : "";
      const data = await api<{ messages: Message[]; nextLink: string | null }>(`/mail/${connectionId}/messages${query}`);
      setMessages((current) => append ? [...current, ...data.messages] : data.messages);
      setNextLink(data.nextLink);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Inbox");
    } finally {
      setBusy(false);
    }
  }, [connectionId, nextLink]);

  useEffect(() => { void loadMessages(); }, [connectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openMessage(message: Message) {
    setError("");
    try {
      const [messageData, attachmentData] = await Promise.all([
        api<{ message: Message }>(`/mail/${connectionId}/messages/${encodeURIComponent(message.id)}`),
        message.hasAttachments
          ? api<{ attachments: Attachment[] }>(`/mail/${connectionId}/messages/${encodeURIComponent(message.id)}/attachments`)
          : Promise.resolve({ attachments: [] }),
      ]);
      setSelected(messageData.message);
      setAttachments(attachmentData.attachments);
      setTab("mail");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open message");
    }
  }

  async function showSettings() {
    setTab("settings");
    try {
      const data = await api<{ settings: Record<string, unknown> }>(`/mail/${connectionId}/settings`);
      setSettings(data.settings);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load settings");
    }
  }

  async function showRules() {
    setTab("rules");
    try {
      const data = await api<{ rules: Array<Record<string, unknown>> }>(`/mail/${connectionId}/rules`);
      setRules(data.rules);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load rules");
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api(`/mail/${connectionId}/send`, {
        method: "POST",
        body: JSON.stringify({
          toRecipients: String(form.get("to")).split(",").map((value) => value.trim()),
          ccRecipients: [],
          subject: form.get("subject"),
          body: form.get("body"),
          contentType: "Text",
        }),
      });
      setTab("mail");
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send message");
    } finally {
      setBusy(false);
    }
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api(`/mail/${connectionId}/messages/${encodeURIComponent(selected.id)}/reply`, {
        method: "POST",
        body: JSON.stringify({ comment: form.get("comment") }),
      });
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reply");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <header className="row between">
        <div><Link href="/admin">← Dashboard</Link><h1>Mailbox</h1></div>
        <div className="row">
          <button className="secondary" onClick={() => setTab("mail")}>Inbox</button>
          <button className="secondary" onClick={() => setTab("compose")}>Compose</button>
          <button className="secondary" onClick={showSettings}>Settings</button>
          <button className="secondary" onClick={showRules}>Inbox rules</button>
        </div>
      </header>
      {error && <div className="card error" role="alert">{error}</div>}
      {tab === "mail" && (
        <div className="mail-layout">
          <section className="card" style={{ padding: 0, overflow: "hidden" }}>
            {messages.map((message) => (
              <article className="message-item" key={message.id} onClick={() => void openMessage(message)}>
                <strong>{message.from?.emailAddress?.name ?? message.from?.emailAddress?.address ?? "Unknown sender"}</strong>
                <div>{message.subject || "(no subject)"}</div>
                <small className="muted">{new Date(message.receivedDateTime).toLocaleString()}</small>
                <p className="muted">{message.bodyPreview}</p>
              </article>
            ))}
            {nextLink && <button disabled={busy} style={{ margin: "1rem" }} onClick={() => void loadMessages(true)}>Load more</button>}
            {!busy && messages.length === 0 && <p className="muted" style={{ padding: "1rem" }}>Inbox is empty.</p>}
          </section>
          <section className="card">
            {!selected ? <p className="muted">Select a message to read it.</p> : (
              <div className="stack">
                <div className="row between"><div><h2>{selected.subject || "(no subject)"}</h2><p className="muted">{selected.from?.emailAddress?.address}</p></div>{selected.webLink && <a className="button secondary" target="_blank" rel="noopener noreferrer" href={selected.webLink}>Open in Outlook</a>}</div>
                {selected.body?.contentType.toLowerCase() === "html"
                  ? <div className="email-body" dangerouslySetInnerHTML={{ __html: selected.body.content }} />
                  : <pre style={{ whiteSpace: "pre-wrap" }}>{selected.body?.content}</pre>}
                {attachments.length > 0 && <div><h3>Attachments</h3>{attachments.map((attachment) => <a key={attachment.id} className="button secondary" href={`/api/v1/mail/${connectionId}/messages/${encodeURIComponent(selected.id)}/attachments/${encodeURIComponent(attachment.id)}`}>{attachment.name} ({Math.ceil(attachment.size / 1024)} KB)</a>)}</div>}
                <form className="stack" onSubmit={reply}><label>Reply<textarea name="comment" required rows={5} /></label><button disabled={busy}>Send reply</button></form>
              </div>
            )}
          </section>
        </div>
      )}
      {tab === "compose" && <form className="card stack" onSubmit={send}><h2>New message</h2><label>To<input name="to" type="text" placeholder="person@example.com" required /></label><label>Subject<input name="subject" required /></label><label>Message<textarea name="body" rows={12} required /></label><button disabled={busy}>Send message</button></form>}
      {tab === "settings" && <section className="card"><h2>Mailbox settings</h2>{settings ? <dl>{Object.entries(settings).map(([key, value]) => <div key={key}><dt><strong>{key}</strong></dt><dd><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(value, null, 2)}</pre></dd></div>)}</dl> : <p>Loading…</p>}</section>}
      {tab === "rules" && <section className="card"><h2>User Inbox rules</h2><p className="muted">These are mailbox Inbox rules, not organization-wide Exchange transport rules.</p>{rules.length ? <table><thead><tr><th>Name</th><th>Enabled</th><th>Sequence</th></tr></thead><tbody>{rules.map((rule) => <tr key={String(rule.id)}><td>{String(rule.displayName)}</td><td>{String(rule.isEnabled)}</td><td>{String(rule.sequence)}</td></tr>)}</tbody></table> : <p className="muted">No Inbox rules.</p>}</section>}
    </div>
  );
}
