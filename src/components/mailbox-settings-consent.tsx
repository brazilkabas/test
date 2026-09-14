"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@/components/api";

type AuthorizationStatus = {
  status: string;
  connectionId: string | null;
  errorCode: string | null;
};

export function MailboxSettingsConsent(props: { connectionId: string; onGranted: () => void }) {
  return <MicrosoftFeatureConsent
    {...props}
    purpose="mailbox-settings"
    title="Additional Microsoft permission required"
    description="Editing mailbox settings and Inbox rules is optional. Normal webmail does not request this permission."
    buttonLabel="Enable mailbox settings"
    adminApprovalDescription="mailbox-settings access"
  />;
}

export function MailboxAccessConsent(props: { connectionId: string; onGranted: () => void }) {
  return <MicrosoftFeatureConsent
    {...props}
    purpose="mailbox"
    title="Connect mailbox"
    description="Authorize read-only Microsoft Graph access for this existing connected account. Your current account connection remains unchanged."
    buttonLabel="Connect mailbox"
    adminApprovalDescription="mailbox access"
  />;
}

function MicrosoftFeatureConsent({
  connectionId,
  onGranted,
  purpose,
  title,
  description,
  buttonLabel,
  adminApprovalDescription,
}: {
  connectionId: string;
  onGranted: () => void;
  purpose: "mailbox" | "mailbox-settings";
  title: string;
  description: string;
  buttonLabel: string;
  adminApprovalDescription: string;
}) {
  const [session, setSession] = useState<{ sessionId: string; statusToken: string } | null>(null);
  const [error, setError] = useState("");
  const popup = useRef<Window | null>(null);

  useEffect(() => {
    if (!session) return;
    const poll = window.setInterval(() => {
      void api<{ authorization: AuthorizationStatus }>(
        `/microsoft/device/${encodeURIComponent(session.sessionId)}/status?token=${encodeURIComponent(session.statusToken)}`,
      ).then(({ authorization }) => {
        if (authorization.status === "CONNECTED") {
          window.clearInterval(poll);
          try { popup.current?.close(); } catch {}
          setSession(null);
          if (authorization.connectionId !== connectionId) {
            setError("A different Microsoft account was authorized. Retry with this mailbox account.");
            return;
          }
          if (purpose === "mailbox") {
            window.dispatchEvent(new CustomEvent("microsoft-graph-mail-connected", { detail: { connectionId } }));
          }
          onGranted();
        } else if (authorization.status === "FAILED" || authorization.status === "CANCELLED" || authorization.status === "EXPIRED") {
          window.clearInterval(poll);
          setSession(null);
          setError(authorization.status === "EXPIRED"
            ? "Microsoft verification expired. Start the optional permission request again."
            : isAdminApprovalRequired(authorization.errorCode)
            ? `Your Microsoft 365 organization requires an administrator to approve ${adminApprovalDescription}.`
            : "Microsoft authorization was not completed. Retry without changing the requested permissions.");
        }
      }).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(poll);
  }, [adminApprovalDescription, connectionId, onGranted, purpose, session]);

  async function enable() {
    setError("");
    popup.current = window.open("", "microsoft-settings-consent", "width=620,height=760,resizable=yes,scrollbars=yes");
    if (!popup.current) {
      setError("Allow popups, then try again.");
      return;
    }
    try {
      const endpoint = purpose === "mailbox"
        ? `/microsoft/accounts/${connectionId}/mail-auth/start`
        : "/microsoft/device/start";
      const result = await api<{ sessionId: string; statusToken: string; connectUrl: string }>(endpoint, {
        method: "POST",
        body: JSON.stringify(purpose === "mailbox" ? {} : { purpose, connectionId }),
      });
      popup.current.location.href = result.connectUrl;
      setSession({ sessionId: result.sessionId, statusToken: result.statusToken });
    } catch (caught) {
      try { popup.current.close(); } catch {}
      setError(caught instanceof Error ? caught.message : "Unable to start Microsoft authorization");
    }
  }

  return <section className="panel panel-body stack">
    <h1>{title}</h1>
    <p className="muted">{description}</p>
    {error && <p className="error">{error}</p>}
    <div><button type="button" disabled={Boolean(session)} onClick={() => void enable()}>{session ? "Waiting for Microsoft…" : buttonLabel}</button></div>
  </section>;
}

function isAdminApprovalRequired(errorCode: string | null) {
  return Boolean(errorCode && /^AADSTS(?:90094|90095|900941)$/i.test(errorCode));
}
