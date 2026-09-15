"use client";

import { Bot, CheckCircle2, Code2, KeyRound, RotateCcw, Send, Settings2, ShieldCheck, Trash2, UserRound, XCircle } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

import { api } from "@/components/api";
import { ConfirmDialog, Modal, Skeleton, StatusBadge, useToast } from "@/components/design-system";

type Status = {
  configured: boolean;
  enabled: boolean;
  endpoint: string | null;
  hostname: string | null;
  model: string | null;
  updatedAt: string | null;
};

type Message = {
  role: "user" | "assistant";
  content: string;
};

type CodeActivity = {
  tool: string;
  summary: string;
  success: boolean;
};

const curlExample = `curl https://api.example.com/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"your-model","messages":[{"role":"user","content":"Hello"}]}'`;

export function AiApiChat() {
  const { notify } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [curl, setCurl] = useState("");
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [codeAccess, setCodeAccess] = useState(true);
  const [activities, setActivities] = useState<CodeActivity[]>([]);
  const [error, setError] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Status>("/ai/configuration")
      .then((value) => {
        setStatus(value);
        if (!value.configured) setConfigurationOpen(true);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "AI API configuration is unavailable"));
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function saveConfiguration(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const next = await api<Status>("/ai/configuration", {
        method: "POST",
        body: JSON.stringify({ curl }),
      });
      setStatus(next);
      setCurl("");
      setConfigurationOpen(false);
      notify({ title: "AI API connected", message: "The curl request was encrypted and saved.", tone: "success" });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Configuration could not be saved";
      setError(message);
      notify({ title: "AI API connection failed", message, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const content = prompt.trim();
    if (!content || sending || !status?.configured) return;
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setPrompt("");
    setSending(true);
    setError("");
    try {
      const result = await api<{ content: string; model: string | null; activities?: CodeActivity[] }>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({ messages: nextMessages, codeAccess }),
      });
      setMessages((current) => [...current, { role: "assistant", content: result.content }]);
      setActivities((current) => [...current, ...(result.activities ?? [])]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The AI API request failed";
      setError(message);
      notify({ title: "Message not sent", message, tone: "error" });
    } finally {
      setSending(false);
    }
  }

  function composerShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  async function removeConfiguration() {
    try {
      await api("/ai/configuration", { method: "DELETE" });
      setStatus({ configured: false, enabled: false, endpoint: null, hostname: null, model: null, updatedAt: null });
      setMessages([]);
      setActivities([]);
      setConfirmDelete(false);
      setConfigurationOpen(true);
      notify({ title: "AI API configuration removed", tone: "success" });
    } catch (caught) {
      notify({ title: "Configuration not removed", message: caught instanceof Error ? caught.message : undefined, tone: "error" });
    }
  }

  if (!status && !error) return <section className="panel panel-body"><Skeleton lines={10} /></section>;

  return <div className="ai-chat-page">
    <div className="page-header ai-chat-header">
      <div>
        <div className="eyebrow">Encrypted API workspace</div>
        <h1>AI API Chat</h1>
        <p className="muted">Chat through your own API using its curl request. Credentials stay encrypted on the server.</p>
      </div>
      <div className="page-actions">
        {status && <StatusBadge status={status.configured ? "API connected" : "Configuration required"} />}
        {messages.length > 0 && <button className="secondary" onClick={() => { setMessages([]); setActivities([]); }}><RotateCcw size={15} />New chat</button>}
        <button className="secondary" onClick={() => setConfigurationOpen(true)}><Settings2 size={15} />Configure API</button>
      </div>
    </div>

    {error && <div className="inline-alert error" role="alert">{error}</div>}

    <section className="ai-chat-shell panel">
      <header className="ai-chat-toolbar">
        <div><span className="ai-provider-mark"><Bot size={17} /></span><span><strong>{status?.model ?? "Custom AI API"}</strong><small>{status?.hostname ?? "Paste a curl request to connect"}</small></span></div>
        <div className="ai-toolbar-controls">
          <label className="code-access-toggle" title="Allows scoped repository edits, approved checks, commits, and pushes on the current feature branch">
            <input type="checkbox" checked={codeAccess} onChange={(event) => setCodeAccess(event.target.checked)} />
            <Code2 size={14} />Code access
          </label>
          <span className="ai-security-note"><ShieldCheck size={14} />Scoped workspace</span>
        </div>
      </header>

      <div className="ai-transcript" ref={transcriptRef} aria-live="polite">
        {messages.length === 0 ? <div className="ai-empty">
          <span><Bot size={28} /></span>
          <h2>{status?.configured ? "Start a conversation" : "Connect your AI API"}</h2>
          <p>{status?.configured
            ? "Messages are sent through your saved curl request. Code access can edit this repository, run approved checks, commit, and push the current feature branch."
            : "Paste the curl example supplied by your AI provider. The endpoint, headers, API key, and body template will be encrypted."}</p>
          {!status?.configured && <button onClick={() => setConfigurationOpen(true)}><KeyRound size={15} />Add API with curl</button>}
        </div> : messages.map((message, index) => <article className={`ai-message ai-message-${message.role}`} key={`${message.role}-${index}`}>
          <span className="ai-message-avatar">{message.role === "assistant" ? <Bot size={16} /> : <UserRound size={16} />}</span>
          <div><strong>{message.role === "assistant" ? status?.model ?? "AI" : "You"}</strong><p>{message.content}</p></div>
        </article>)}
        {sending && <article className="ai-message ai-message-assistant">
          <span className="ai-message-avatar"><Bot size={16} /></span>
          <div><strong>{status?.model ?? "AI"}</strong><span className="ai-thinking"><i /><i /><i /></span></div>
        </article>}
        {activities.length > 0 && <aside className="ai-tool-activity">
          <strong>Repository activity</strong>
          {activities.map((activity, index) => <div key={`${activity.tool}-${index}`}>
            {activity.success ? <CheckCircle2 className="tool-success" size={13} /> : <XCircle className="tool-failure" size={13} />}
            <code>{activity.tool}</code><span>{activity.summary}</span>
          </div>)}
        </aside>}
      </div>

      <form className="ai-composer" onSubmit={send}>
        <textarea
          aria-label="Message"
          placeholder={status?.configured ? "Message your AI API…" : "Configure an API before chatting"}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={composerShortcut}
          disabled={!status?.configured || sending}
          rows={2}
          maxLength={20_000}
        />
        <button aria-label="Send message" disabled={!prompt.trim() || !status?.configured || sending}><Send size={17} /></button>
        <small>Enter to send · Shift+Enter for a new line</small>
      </form>
    </section>

    <Modal
      open={configurationOpen}
      title={status?.configured ? "Replace AI API configuration" : "Connect an AI API"}
      onClose={() => setConfigurationOpen(false)}
      footer={<>
        {status?.configured && <button className="secondary danger-text" onClick={() => setConfirmDelete(true)}><Trash2 size={14} />Remove</button>}
        <button className="secondary" onClick={() => setConfigurationOpen(false)}>Cancel</button>
        <button form="ai-curl-form" disabled={saving || !curl.trim()}>{saving ? "Encrypting…" : "Encrypt and connect"}</button>
      </>}
    >
      <form id="ai-curl-form" className="stack" onSubmit={saveConfiguration}>
        <div className="success-callout ai-security-callout"><ShieldCheck size={16} /><span><strong>Secrets stay server-side.</strong> The complete request is encrypted at rest and is never returned to the browser.</span></div>
        <label>Provider curl request
          <textarea
            className="ai-curl-input"
            value={curl}
            onChange={(event) => setCurl(event.target.value)}
            placeholder={curlExample}
            rows={10}
            spellCheck={false}
            autoComplete="off"
            required
          />
        </label>
        <p className="muted ai-config-help">Use a POST request with an HTTPS URL and JSON body. OpenAI-compatible <code>messages</code>, Anthropic <code>messages</code>, Gemini <code>contents</code>, and prompt/input APIs are supported.</p>
      </form>
    </Modal>

    <ConfirmDialog
      open={confirmDelete}
      title="Remove AI API configuration?"
      description="The encrypted curl request and credentials will be permanently deleted. Your browser conversation will also be cleared."
      confirmLabel="Remove configuration"
      destructive
      onClose={() => setConfirmDelete(false)}
      onConfirm={() => void removeConfiguration()}
    />
  </div>;
}
