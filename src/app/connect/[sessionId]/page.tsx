"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/components/api";
import { isSafeRedirectUrl, pageDocumentSchema, renderPageDocument, type PageDocument } from "@/lib/page-document";

type Authorization = {
  publicId: string;
  userCode: string | null;
  verificationUri: string | null;
  verificationUriComplete: string | null;
  message: string | null;
  status: string;
  expiresAt: string;
  connectionId: string | null;
  errorCode: string | null;
  pageProject?: { versions: Array<{ document: PageDocument | null }> } | null;
};

export default function ConnectPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ token?: string }> }) {
  const { sessionId } = use(params);
  const { token = "" } = use(searchParams);
  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState("");
  const replacing = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ authorization: Authorization }>(`/microsoft/device/${encodeURIComponent(sessionId)}/status?token=${encodeURIComponent(token)}`);
      setAuthorization(data.authorization);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load authorization");
    }
  }, [sessionId, token]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(poll);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!authorization) return;
      const seconds = Math.max(0, Math.floor((new Date(authorization.expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [authorization]);

  useEffect(() => {
    if (authorization?.status !== "CONNECTED") return;
    const parsed = pageDocumentSchema.safeParse(authorization.pageProject?.versions[0]?.document);
    const behavior = parsed.success ? parsed.data.settings.builder : undefined;
    if (!behavior?.redirectUrl || behavior.redirectDelay === "never" || !isSafeRedirectUrl(behavior.redirectUrl)) return;
    const delay = behavior.redirectDelay === "immediate" ? 0 : Number(behavior.redirectDelay) * 1000;
    const timer = window.setTimeout(() => { window.location.href = behavior.redirectUrl!; }, delay);
    return () => window.clearTimeout(timer);
  }, [authorization]);

  async function restart() {
    if (replacing.current) return;
    replacing.current = true;
    const response = await fetch(`/api/v1/microsoft/device/${encodeURIComponent(sessionId)}/restart?token=${encodeURIComponent(token)}`, { method: "POST" });
    const result = await response.json() as { connectUrl?: string; error?: string };
    if (!response.ok || !result.connectUrl) throw new Error(result.error ?? "Unable to restart authorization");
    window.location.assign(result.connectUrl);
  }

  useEffect(() => {
    if (authorization?.status === "EXPIRED") void restart();
  }, [authorization?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const customDocumentResult = pageDocumentSchema.safeParse(authorization?.pageProject?.versions[0]?.document);
  if (authorization && customDocumentResult.success) {
    const destination = authorization.verificationUriComplete ?? authorization.verificationUri ?? "https://microsoft.com/devicelogin";
    const rendered = renderPageDocument(customDocumentResult.data, { deviceCode: authorization.userCode ?? "", verificationUri: destination, status: authorization.status });
    return <main className={`custom-connect-page status-${authorization.status.toLowerCase()}`} onClick={(event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      if (action === "copy-device-code") { event.preventDefault(); void navigator.clipboard.writeText(authorization.userCode ?? ""); }
      if (action === "open-microsoft") { event.preventDefault(); window.open(destination, "_blank", "noopener,noreferrer"); }
      if (action === "restart-authorization") { event.preventDefault(); void restart(); }
    }}>
      <style>{rendered.css}</style>
      <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
    </main>;
  }

  if (error) return <main className="center-page"><div className="card auth-card error">{error}</div></main>;
  if (!authorization) return <main className="center-page"><div className="card auth-card">Loading Microsoft authorization…</div></main>;
  if (authorization.status === "CONNECTED") {
    return (
      <main className="center-page">
        <div className="card auth-card stack">
          <div className="success"><strong>Connection complete</strong></div>
          <h1>Microsoft account connected</h1>
          <p>You can close this page. No password or Microsoft token was shared with this website.</p>
          <a className="button" href="/admin">Return to dashboard</a>
        </div>
      </main>
    );
  }
  if (["EXPIRED", "FAILED", "CANCELLED"].includes(authorization.status)) {
    return (
      <main className="center-page">
        <div className="card auth-card stack">
          <h1>{authorization.status === "EXPIRED" ? "Refreshing verification code…" : `Authorization ${authorization.status.toLowerCase()}`}</h1>
          <p className="muted">{authorization.status === "EXPIRED" ? "A new Microsoft code will appear automatically." : `Microsoft could not complete this device authorization. ${authorization.errorCode ?? ""}`}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="center-page">
      <div className="card auth-card stack">
        <div className="badge">Microsoft 365 connection</div>
        <h1>Connect your company account</h1>
        <p>This page displays a code issued by Microsoft. Sign-in and MFA take place only on Microsoft&apos;s official website.</p>
        <div className="device-code" aria-label={`Device code ${authorization.userCode}`}>{authorization.userCode}</div>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="secondary" onClick={() => void navigator.clipboard.writeText(authorization.userCode ?? "")}>Copy code</button>
          <a
            className="button"
            href={authorization.verificationUriComplete ?? authorization.verificationUri ?? "https://microsoft.com/devicelogin"}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Microsoft
          </a>
        </div>
        <p className="muted">Expires in {remaining} · Waiting for Microsoft authorization</p>
      </div>
    </main>
  );
}
