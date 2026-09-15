"use client";

import { ArrowLeft, Menu } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { api, csrfToken } from "@/components/api";
import { ConfirmDialog, Drawer, EmptyState, Modal, Skeleton, useToast } from "@/components/design-system";

type Folder = { id: string; displayName: string; unreadItemCount: number; totalItemCount: number; depth?: number };
type Message = {
  id: string;
  subject: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  receivedDateTime: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  webLink?: string;
  hasAttachments?: boolean;
  isRead?: boolean;
  importance?: string;
  flag?: { flagStatus: string };
};
type Attachment = { id: string; name: string; contentType: string; size: number; isInline?: boolean };
type Filters = { sender: string; recipient: string; subject: string; keyword: string; read: string; hasAttachments: boolean; flagged: boolean; importance: string; fromDate: string; toDate: string };
type MailCapabilities = {
  canReadMail: boolean;
  canModifyMail: boolean;
  canSendMail: boolean;
  canReadMailboxSettings: boolean;
  canModifyMailboxSettings: boolean;
};
type MailAccount = {
  displayName: string | null;
  email: string | null;
  userPrincipalName: string | null;
  capabilities: MailCapabilities;
  mailAuthorizationStatus: string;
  mailAuthorization: {
    status: string;
    errorCode: string | null;
    requestedScopes: string[];
    createdAt: string;
    expiresAt: string;
  } | null;
};
const emptyFilters: Filters = { sender: "", recipient: "", subject: "", keyword: "", read: "", hasAttachments: false, flagged: false, importance: "", fromDate: "", toDate: "" };

const wellKnown = [
  ["inbox", "Inbox", "✉"],
  ["drafts", "Drafts", "▤"],
  ["sentitems", "Sent", "➤"],
  ["archive", "Archive", "▣"],
  ["deleteditems", "Deleted", "⌫"],
  ["junkemail", "Junk", "⊘"],
] as const;

export function MailClient({ connectionId }: { connectionId: string }) {
  const { notify } = useToast();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [wellKnownFolders, setWellKnownFolders] = useState<Record<string, Folder>>({});
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [folder, setFolder] = useState("inbox");
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Message | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [nextLink, setNextLink] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [quickSearch, setQuickSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyMode, setReplyMode] = useState<"reply" | "reply-all" | "forward" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [preview, setPreview] = useState<{ url: string; attachment: Attachment } | null>(null);
  const [capabilities, setCapabilities] = useState<MailCapabilities | null>(null);
  const [account, setAccount] = useState<MailAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);
  const [mailAuthorizationStarting, setMailAuthorizationStarting] = useState(false);

  useEffect(() => {
    localStorage.setItem("company-last-mail-connection", connectionId);
  }, [connectionId]);

  const loadFolders = useCallback(async () => {
    try {
      const result = await api<{ folders: Array<Folder & { isHidden?: boolean }>; wellKnownFolders: Record<string, Folder> }>(`/mail/${connectionId}/folders`);
      const defaultIds = new Set(Object.values(result.wellKnownFolders).map((item) => item.id));
      setWellKnownFolders(result.wellKnownFolders);
      setFolders(result.folders.filter((item) => !item.isHidden && !defaultIds.has(item.id)));
    } catch (error) {
      notify({ title: "Folders unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }, [connectionId, notify]);

  const loadMessages = useCallback(async (append = false, overrides?: Filters) => {
    setLoading(true);
    const active = overrides ?? filters;
    const params = new URLSearchParams({ folder });
    if (append && nextLink) params.set("nextLink", nextLink);
    else Object.entries({ ...active, keyword: quickSearch || active.keyword }).forEach(([key, value]) => {
      if (value === true || (typeof value === "string" && value)) params.set(key, String(value));
    });
    try {
      const data = await api<{ messages: Message[]; nextLink: string | null }>(`/mail/${connectionId}/messages?${params}`);
      setMessages((current) => append ? [...current, ...data.messages] : data.messages);
      setNextLink(data.nextLink);
      if (!append) setSelected(null);
    } catch (error) {
      notify({ title: "Messages unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [connectionId, filters, folder, nextLink, notify, quickSearch]);

  const loadCapabilities = useCallback(() => {
    return api<{ account: MailAccount }>(`/microsoft/accounts/${connectionId}`)
      .then(({ account }) => {
        setAccount(account);
        setCapabilities(account.capabilities);
      })
      .catch((error) => notify({ title: "Account unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" }));
  }, [connectionId, notify]);
  useEffect(() => { void loadCapabilities(); }, [loadCapabilities]);
  useEffect(() => { if (capabilities?.canReadMail) void loadFolders(); }, [capabilities?.canReadMail, loadFolders]);
  useEffect(() => { if (capabilities?.canReadMail) void loadMessages(false); }, [capabilities?.canReadMail, folder]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function openMessage(message: Message) {
    setMessageLoading(true);
    try {
      const [messageData, attachmentData] = await Promise.all([
        api<{ message: Message }>(`/mail/${connectionId}/messages/${encodeURIComponent(message.id)}`),
        message.hasAttachments ? api<{ attachments: Attachment[] }>(`/mail/${connectionId}/messages/${encodeURIComponent(message.id)}/attachments`) : Promise.resolve({ attachments: [] }),
      ]);
      setSelected(messageData.message);
      setAttachments(attachmentData.attachments.filter((attachment) => !attachment.isInline));
      if (!message.isRead && capabilities?.canModifyMail) {
        void api(`/mail/${connectionId}/messages/${encodeURIComponent(message.id)}`, { method: "PATCH", body: JSON.stringify({ isRead: true }) });
        setMessages((items) => items.map((item) => item.id === message.id ? { ...item, isRead: true } : item));
      }
    } catch (error) {
      notify({ title: "Message could not open", message: error instanceof Error ? error.message : undefined, tone: "error" });
    } finally {
      setMessageLoading(false);
    }
  }

  async function updateMessage(input: Record<string, unknown>) {
    if (!selected) return;
    try {
      await api(`/mail/${connectionId}/messages/${encodeURIComponent(selected.id)}`, { method: "PATCH", body: JSON.stringify(input) });
      setSelected({ ...selected, ...input });
      setMessages((items) => items.map((item) => item.id === selected.id ? { ...item, ...input } : item));
      notify({ title: "Message updated", tone: "success" });
    } catch (error) {
      notify({ title: "Message update failed", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }

  async function move(destinationId: string) {
    if (!selected) return;
    try {
      await api(`/mail/${connectionId}/messages/${encodeURIComponent(selected.id)}/move`, { method: "POST", body: JSON.stringify({ destinationId }) });
      setMessages((items) => items.filter((item) => item.id !== selected.id));
      setSelected(null);
      notify({ title: destinationId === "archive" ? "Message archived" : "Message moved", tone: "success" });
    } catch (error) {
      notify({ title: "Move failed", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }

  async function deleteMessage() {
    if (!selected) return;
    try {
      await api(`/mail/${connectionId}/messages/${encodeURIComponent(selected.id)}`, { method: "DELETE" });
      setMessages((items) => items.filter((item) => item.id !== selected.id));
      setSelected(null);
      setDeleteOpen(false);
      notify({ title: "Message deleted", tone: "success" });
    } catch (error) {
      notify({ title: "Delete failed", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }

  async function openAttachment(attachment: Attachment) {
    try {
      const response = await fetch(`/api/v1/mail/${connectionId}/messages/${encodeURIComponent(selected!.id)}/attachments/${encodeURIComponent(attachment.id)}`, { headers: { "X-CSRF-Token": csrfToken() } });
      if (!response.ok) throw new Error("Attachment download failed");
      const url = URL.createObjectURL(await response.blob());
      setPreview({ url, attachment });
    } catch (error) {
      notify({ title: "Attachment unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }

  async function openInDesktop() {
    if (!selected) return;
    try {
      const result = await api<{ protocolUrl: string }>(`/outlook-launch`, { method: "POST", body: JSON.stringify({ connectionId, messageId: selected.id }) });
      window.location.href = result.protocolUrl;
      notify({ title: "Opening Company Mail Launcher", message: "Approve the browser prompt if it appears. The launch ID expires in 60 seconds.", tone: "success" });
    } catch (error) {
      notify({ title: "Desktop launch unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }

  async function startMailboxAuthorization() {
    setMailAuthorizationStarting(true);
    try {
      const result = await api<{ connectUrl: string }>(`/microsoft/accounts/${connectionId}/mail-auth/start`, {
        method: "POST",
      });
      window.location.assign(result.connectUrl);
    } catch (error) {
      notify({
        title: "Mailbox authorization could not start",
        message: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
      setMailAuthorizationStarting(false);
    }
  }

  const folderTitle = useMemo(() => wellKnown.find(([id]) => id === folder)?.[1] ?? folders.find((item) => item.id === folder)?.displayName ?? "Mailbox", [folder, folders]);

  if (capabilities === null) return <section className="panel panel-body"><Skeleton lines={9} /></section>;
  if (!capabilities.canReadMail) {
    const accountLabel = account?.displayName ?? account?.email ?? account?.userPrincipalName ?? "This Microsoft account";
    const authorization = account?.mailAuthorization;
    const authorizationState = authorization?.status ?? account?.mailAuthorizationStatus ?? "NOT_CONNECTED";
    const errorCode = authorization?.errorCode;
    return <section className="panel panel-body">
      <EmptyState
        icon="✉"
        title={authorizationState === "PENDING" ? "Mailbox authorization waiting" : "Mailbox authorization incomplete"}
        description={mailAuthorizationDescription(accountLabel, authorizationState, errorCode)}
        action={<button disabled={mailAuthorizationStarting} onClick={() => void startMailboxAuthorization()}>
          {mailAuthorizationStarting ? "Starting…" : authorizationState === "PENDING" ? "Restart mailbox authorization" : "Authorize mailbox"}
        </button>}
      />
      <div className="panel-body stack" style={{ maxWidth: 680, margin: "0 auto" }}>
        <p><strong>Status:</strong> {authorizationState}</p>
        {errorCode && <p><strong>Microsoft error:</strong> <code>{errorCode}</code></p>}
        <p><strong>Requested permissions:</strong> User.Read, Mail.Read</p>
        <p className="muted">Mail.Read includes reading normal Outlook folders and messages. No additional folder permission is required.</p>
      </div>
    </section>;
  }
  return (
    <div className="mail-workspace">
      <aside className={`mail-folders ${foldersOpen ? "is-mobile-open" : ""}`}>
        <div className="mail-brand-row"><Link href="/admin">← Control panel</Link></div>
        {capabilities.canModifyMail && capabilities.canSendMail && <button className="compose-button" onClick={() => setComposeOpen(true)}>＋ New message</button>}
        <nav aria-label="Mailbox folders">{wellKnown.map(([id, label, icon]) => <button className={folder === id ? "active" : ""} key={id} onClick={() => { setFolder(id); setFoldersOpen(false); }}><span>{icon}</span>{label}<small>{wellKnownFolders[id]?.unreadItemCount || ""}</small></button>)}</nav>
        {folders.length > 0 && <><h3>Custom folders</h3><nav>{folders.map((item) => <button className={folder === item.id ? "active" : ""} style={{ paddingLeft: `${14 + (item.depth ?? 0) * 16}px` }} key={item.id} onClick={() => { setFolder(item.id); setFoldersOpen(false); }}><span>□</span><span>{item.displayName}</span><small>{item.unreadItemCount || ""}</small></button>)}</nav></>}
        <h3>Shared mailboxes</h3><div className="mailbox-disabled">No verified shared access</div>
        {capabilities.canModifyMailboxSettings && <><h3>Manage</h3><nav><Link href={`/mail/${connectionId}/rules`}>⇢ Inbox rules</Link><Link href={`/mail/${connectionId}/settings`}>⚙ Mailbox settings</Link></nav></>}
      </aside>
      {foldersOpen && <button className="mail-folder-scrim" aria-label="Close folders" onClick={() => setFoldersOpen(false)} />}
      <section className="message-column">
        <header className="mail-column-header"><button className="icon-button mobile-folder-toggle" onClick={() => setFoldersOpen(true)} aria-label="Open folders"><Menu size={17} /></button><div><h1>{folderTitle}</h1><small>{messages.length} loaded</small></div><button className="icon-button" onClick={() => void loadMessages(false)} aria-label="Refresh">↻</button></header>
        <form className="mail-search" onSubmit={(event) => { event.preventDefault(); void loadMessages(false); }}><span>⌕</span><input value={quickSearch} onChange={(event) => setQuickSearch(event.target.value)} placeholder={`Search ${folderTitle}`} aria-label={`Search ${folderTitle}`} /><button className="secondary button-sm">Search</button><button type="button" className="secondary button-sm" onClick={() => setFiltersOpen(true)}>Filters</button></form>
        <div className="message-list" aria-label={`${folderTitle} messages`}>
          {loading ? <div className="panel-body"><Skeleton lines={9} /></div> : messages.length === 0 ? <EmptyState icon="✉" title={`No messages in ${folderTitle}`} description="There are no messages matching the selected folder and filters." /> : messages.map((message) => (
            <button className={`message-row ${selected?.id === message.id ? "selected" : ""} ${message.isRead ? "" : "unread"}`} key={message.id} onClick={() => void openMessage(message)}>
              <span className="unread-dot" aria-label={message.isRead ? "Read" : "Unread"} />
              <div><strong>{message.from?.emailAddress?.name ?? message.from?.emailAddress?.address ?? "Unknown sender"}</strong><span>{message.subject || "(no subject)"}</span><small>{message.bodyPreview}</small></div>
              <aside><time>{formatMessageTime(message.receivedDateTime)}</time><span>{message.hasAttachments ? "⌕" : ""} {message.flag?.flagStatus === "flagged" ? "⚑" : ""} {message.importance === "high" ? "!" : ""}</span></aside>
            </button>
          ))}
          {nextLink && !loading && <button className="load-more secondary" onClick={() => void loadMessages(true)}>Load more messages</button>}
        </div>
      </section>
      <section className={`reading-pane ${selected ? "has-message" : ""}`}>
        {messageLoading ? <div className="panel-body"><Skeleton lines={8} /></div> : !selected ? <EmptyState icon="✉" title="Select a message" description="Choose a message from the list to read it here." /> : (
          <>
            <header className="reading-toolbar">
              <button className="icon-button mobile-reading-back" aria-label="Back to message list" onClick={() => setSelected(null)}><ArrowLeft size={17} /></button>
              {capabilities.canSendMail && <><button onClick={() => setReplyMode("reply")}>↩ Reply</button><button className="secondary" onClick={() => setReplyMode("reply-all")}>Reply all</button><button className="secondary" onClick={() => setReplyMode("forward")}>Forward</button></>}
              {capabilities.canModifyMail && <><button className="icon-button" title="Archive" aria-label="Archive" onClick={() => void move("archive")}>▣</button>
              <select aria-label="Move message" defaultValue="" onChange={(event) => { if (event.target.value) void move(event.target.value); }}><option value="" disabled>Move…</option>{wellKnown.filter(([id]) => id !== folder).map(([id, label]) => <option value={id} key={id}>{label}</option>)}{folders.map((item) => <option value={item.id} key={item.id}>{item.displayName}</option>)}</select>
              <button className="icon-button" title="Mark unread" aria-label="Mark unread" onClick={() => void updateMessage({ isRead: false })}>◉</button>
              <button className="icon-button" title="Flag" aria-label="Flag" onClick={() => void updateMessage({ flag: { flagStatus: selected.flag?.flagStatus === "flagged" ? "notFlagged" : "flagged" } })}>⚑</button>
              <button className="icon-button" title="Delete" aria-label="Delete" onClick={() => setDeleteOpen(true)}>⌫</button></>}
              {selected.webLink && <button onClick={() => void openInDesktop()}>Open in Outlook ↗</button>}
              {selected.webLink && <a className="button secondary" target="_blank" rel="noopener noreferrer" href={selected.webLink}>Open in browser</a>}
            </header>
            <article className="reading-content">
              <h1>{selected.subject || "(no subject)"}</h1>
              <div className="sender-line"><span className="avatar">{(selected.from?.emailAddress?.name ?? "?")[0]}</span><div><strong>{selected.from?.emailAddress?.name ?? selected.from?.emailAddress?.address}</strong><small>From: {selected.from?.emailAddress?.address}<br />To: {selected.toRecipients?.map((item) => item.emailAddress?.address).join(", ") || "Undisclosed"}{selected.ccRecipients?.length ? <><br />Cc: {selected.ccRecipients.map((item) => item.emailAddress?.address).join(", ")}</> : null}</small></div><time>{new Date(selected.receivedDateTime).toLocaleString()}</time></div>
              {selected.body?.contentType.toLowerCase() === "html" ? <div className="email-body" dangerouslySetInnerHTML={{ __html: selected.body.content }} /> : <pre className="plain-body">{selected.body?.content}</pre>}
              {attachments.length > 0 && <div className="attachment-grid">{attachments.map((attachment) => <button className="attachment-card" key={attachment.id} onClick={() => void openAttachment(attachment)}><span>{attachment.contentType === "application/pdf" ? "PDF" : attachment.contentType.startsWith("image/") ? "IMG" : "FILE"}</span><div><strong>{attachment.name}</strong><small>{formatBytes(attachment.size)}</small></div></button>)}</div>}
            </article>
          </>
        )}
      </section>
      {capabilities.canModifyMail && capabilities.canSendMail && <ComposeDrawer connectionId={connectionId} open={composeOpen} onClose={() => setComposeOpen(false)} onSent={() => void loadMessages(false)} />}
      <Drawer open={filtersOpen} title="Search filters" onClose={() => setFiltersOpen(false)}><FilterForm filters={filters} onApply={(next) => { setFilters(next); setFiltersOpen(false); void loadMessages(false, next); }} /></Drawer>
      {capabilities.canSendMail && <ReplyModal connectionId={connectionId} message={selected} mode={replyMode} onClose={() => setReplyMode(null)} />}
      <AttachmentPreview preview={preview} onClose={() => setPreview(null)} />
      {capabilities.canModifyMail && <ConfirmDialog open={deleteOpen} title="Delete message?" description="The message will be moved according to Microsoft mailbox deletion behavior." confirmLabel="Delete message" destructive onClose={() => setDeleteOpen(false)} onConfirm={() => void deleteMessage()} />}
    </div>
  );
}

function mailAuthorizationDescription(accountLabel: string, status: string, errorCode: string | null | undefined) {
  if (status === "PENDING") {
    return `${accountLabel} still needs to complete the separate Microsoft Graph device-code sign-in for mailbox access.`;
  }
  if (errorCode === "AADSTS65002") {
    return "Microsoft rejected this Graph client because it is a Microsoft-owned application that is not preauthorized for this resource. Configure your own Entra Application client ID.";
  }
  if (errorCode === "device_code_expired" || status === "EXPIRED") {
    return "The Microsoft Graph mailbox device code expired before authorization completed. Start a fresh mailbox authorization.";
  }
  if (errorCode) {
    return `Microsoft mailbox authorization failed with error ${errorCode}.`;
  }
  return `${accountLabel} has primary sign-in, but Microsoft Graph mailbox authorization has not completed.`;
}

function ComposeDrawer({ connectionId, open, onClose, onSent }: { connectionId: string; open: boolean; onClose: () => void; onSent: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  async function submit(form: HTMLFormElement, draft = false) {
    const data = new FormData(form);
    setBusy(true);
    try {
      const files = Array.from(data.getAll("attachments")).filter((value): value is File => value instanceof File && value.size > 0);
      const attachments = await Promise.all(files.map(async (file) => {
        if (file.size > 3_000_000) throw new Error(`${file.name} exceeds the 3 MB compose limit`);
        return { name: file.name, contentType: file.type || "application/octet-stream", contentBytes: await fileToBase64(file) };
      }));
      const payload = {
        toRecipients: emails(data.get("to")),
        ccRecipients: emails(data.get("cc")),
        bccRecipients: emails(data.get("bcc")),
        subject: String(data.get("subject") ?? ""),
        body: String(data.get("body") ?? ""),
        contentType: "HTML",
        attachments,
      };
      await api(`/mail/${connectionId}/${draft ? "drafts" : "send"}`, { method: "POST", body: JSON.stringify(payload) });
      notify({ title: draft ? "Draft saved" : "Message sent", tone: "success" });
      form.reset();
      onClose();
      onSent();
    } catch (error) {
      notify({ title: draft ? "Draft not saved" : "Message not sent", message: error instanceof Error ? error.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  return <Drawer open={open} title="New message" onClose={onClose}><form className="stack compose-form" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}><label>To<input type="text" name="to" required placeholder="name@company.com" /></label><div className="grid"><label>Cc<input name="cc" /></label><label>Bcc<input name="bcc" /></label></div><label>Subject<input name="subject" required /></label><label>Message<div className="rich-toolbar" aria-label="Formatting help"><strong>B</strong><em>I</em><span>Use safe HTML formatting</span></div><textarea name="body" rows={15} required placeholder="<p>Write your message…</p>" /></label><label>Attachments<input type="file" name="attachments" multiple /></label><small className="muted">Up to 10 files, 3 MB each in this compose flow. Files are sent directly as Graph message attachments.</small><div className="row"><button disabled={busy}>{busy ? "Sending…" : "Send"}</button><button type="button" className="secondary" disabled={busy} onClick={(event) => void submit(event.currentTarget.form!, true)}>Save draft</button><button type="button" className="secondary" onClick={onClose}>Discard</button></div></form></Drawer>;
}

function FilterForm({ filters, onApply }: { filters: Filters; onApply: (filters: Filters) => void }) {
  const [draft, setDraft] = useState(filters);
  const field = (key: keyof Filters, label: string, type = "text") => <label>{label}<input type={type} value={String(draft[key])} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>;
  return <form className="stack" onSubmit={(event) => { event.preventDefault(); onApply(draft); }}>{field("sender", "Sender")}{field("recipient", "Recipient")}{field("subject", "Subject")}{field("keyword", "Keyword")}{field("fromDate", "From date", "date")}{field("toDate", "To date", "date")}<label>Read state<select value={draft.read} onChange={(event) => setDraft({ ...draft, read: event.target.value })}><option value="">Any</option><option value="false">Unread</option><option value="true">Read</option></select></label><label>Importance<select value={draft.importance} onChange={(event) => setDraft({ ...draft, importance: event.target.value })}><option value="">Any</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label><label className="check-row"><input type="checkbox" checked={draft.hasAttachments} onChange={(event) => setDraft({ ...draft, hasAttachments: event.target.checked })} />Has attachments</label><label className="check-row"><input type="checkbox" checked={draft.flagged} onChange={(event) => setDraft({ ...draft, flagged: event.target.checked })} />Flagged</label><div className="row"><button>Apply filters</button><button type="button" className="secondary" onClick={() => setDraft(emptyFilters)}>Clear</button></div></form>;
}

function ReplyModal({ connectionId, message, mode, onClose }: { connectionId: string; message: Message | null; mode: "reply" | "reply-all" | "forward" | null; onClose: () => void }) {
  const { notify } = useToast();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message || !mode) return;
    const data = new FormData(event.currentTarget);
    try {
      await api(`/mail/${connectionId}/messages/${encodeURIComponent(message.id)}/${mode}`, { method: "POST", body: JSON.stringify(mode === "forward" ? { comment: data.get("comment"), toRecipients: emails(data.get("to")) } : { comment: data.get("comment") }) });
      notify({ title: mode === "forward" ? "Message forwarded" : "Reply sent", tone: "success" });
      onClose();
    } catch (error) {
      notify({ title: "Message not sent", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }
  return <Modal open={Boolean(mode)} title={mode === "reply-all" ? "Reply all" : mode === "forward" ? "Forward message" : "Reply"} onClose={onClose}>{message && <form className="stack" onSubmit={submit}>{mode === "forward" && <label>To<input name="to" required /></label>}<label>Message<textarea name="comment" rows={8} required autoFocus /></label><div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="secondary" onClick={onClose}>Cancel</button><button>Send</button></div></form>}</Modal>;
}

function AttachmentPreview({ preview, onClose }: { preview: { url: string; attachment: Attachment } | null; onClose: () => void }) {
  // Blob URLs are local authenticated attachment data and cannot use Next's optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <Modal open={Boolean(preview)} title={preview?.attachment.name ?? "Attachment"} onClose={onClose}>{preview && <div className="stack"><div className="attachment-preview">{preview.attachment.contentType.startsWith("image/") ? <img src={preview.url} alt={preview.attachment.name} /> : preview.attachment.contentType === "application/pdf" ? <iframe src={preview.url} title={preview.attachment.name} sandbox="" /> : <EmptyState icon="FILE" title="Preview unavailable" description={`${preview.attachment.contentType} files are offered only as downloads and are never executed.`} />}</div><div className="row between"><span>{formatBytes(preview.attachment.size)} · {preview.attachment.contentType}</span><a className="button" href={preview.url} download={preview.attachment.name}>Download</a></div></div>}</Modal>;
}

function emails(value: FormDataEntryValue | null) {
  return String(value ?? "").split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
}
function formatMessageTime(value: string) {
  const date = new Date(value);
  return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString([], { month: "short", day: "numeric" });
}
function formatBytes(value: number) {
  return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}
