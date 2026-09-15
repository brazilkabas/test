"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/components/api";
import { isSafeRedirectUrl, pageDocumentSchema, renderPageDocument, type PageDocument } from "@/lib/page-document";

type Authorization = {
  publicId: string;
  userCode: string | null;
  verificationUri: string | null;
  message: string | null;
  requestedScopes: string[];
  status: string;
  expiresAt: string;
  connectionId: string | null;
  errorCode: string | null;
  errorDescription: string | null;
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
    if (authorization?.status === "EXPIRED" && !isMailboxSettingsAuthorization(authorization.requestedScopes)) void restart();
  }, [authorization?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authorization?.status === "FAILED" && isAdminApprovalRequired(authorization.errorCode)) {
    return <main className="center-page"><div className="card auth-card stack">
      <h1>Administrator approval required</h1>
      <p className="muted">Your Microsoft 365 organization requires an administrator to approve this app’s requested permissions. The application will not retry or request broader permissions automatically.</p>
      {authorization.errorDescription && <p className="error">{authorization.errorDescription}</p>}
    </div></main>;
  }
  const customDocumentResult = pageDocumentSchema.safeParse(authorization?.pageProject?.versions[0]?.document);
  if (authorization && customDocumentResult.success) {
    const destination = authorization.verificationUri ?? "#";
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
  if (authorization.status === "EXPIRED" && isMailboxSettingsAuthorization(authorization.requestedScopes)) {
    return <main className="center-page"><div className="card auth-card stack">
      <h1>Microsoft verification expired</h1>
      <p className="muted">Return to mailbox settings and start the optional permission request again.</p>
    </div></main>;
  }
  if (["EXPIRED", "FAILED", "CANCELLED"].includes(authorization.status)) {
    return (
      <main className="center-page">
        <div className="card auth-card stack">
          <h1>Microsoft verification</h1>
          <p className="muted">{authorization.errorDescription ?? "Waiting for Microsoft…"}</p>
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
            href={authorization.verificationUri ?? "#"}
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

function isAdminApprovalRequired(errorCode: string | null) {
  return Boolean(errorCode && /^AADSTS(?:90094|90095|900941)$/i.test(errorCode));
}

function isMailboxSettingsAuthorization(scopes: string[]) {
  return scopes.some((scope) => scope.toLowerCase().endsWith("/mailboxsettings.readwrite"))
    && !scopes.some((scope) => scope.toLowerCase().endsWith("/mail.readwrite"));
}
