"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@/components/api";

type AuthorizationStatus = {
  status: string;
  connectionId: string | null;
  errorCode: string | null;
};

export function MailboxSettingsConsent({
  connectionId,
  onGranted,
}: {
  connectionId: string;
  onGranted: () => void;
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
          onGranted();
        } else if (authorization.status === "FAILED" || authorization.status === "CANCELLED" || authorization.status === "EXPIRED") {
          window.clearInterval(poll);
          setSession(null);
          setError(authorization.status === "EXPIRED"
            ? "Microsoft verification expired. Start the optional permission request again."
            : isAdminApprovalRequired(authorization.errorCode)
            ? "Your Microsoft 365 organization requires an administrator to approve mailbox-settings access."
            : "Microsoft authorization was not completed. Retry without changing the requested permissions.");
        }
      }).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(poll);
  }, [connectionId, onGranted, session]);

  async function enable() {
    setError("");
    popup.current = window.open("", "microsoft-settings-consent", "width=620,height=760,resizable=yes,scrollbars=yes");
    if (!popup.current) {
      setError("Allow popups, then try again.");
      return;
    }
    try {
      const result = await api<{ sessionId: string; statusToken: string; connectUrl: string }>("/microsoft/device/start", {
        method: "POST",
        body: JSON.stringify({ purpose: "mailbox-settings", connectionId }),
      });
      popup.current.location.href = result.connectUrl;
      setSession({ sessionId: result.sessionId, statusToken: result.statusToken });
    } catch (caught) {
      try { popup.current.close(); } catch {}
      setError(caught instanceof Error ? caught.message : "Unable to start Microsoft authorization");
    }
  }

  return <section className="panel panel-body stack">
    <h1>Additional Microsoft permission required</h1>
    <p className="muted">Editing mailbox settings and Inbox rules is optional. Normal webmail does not request this permission.</p>
    {error && <p className="error">{error}</p>}
    <div><button type="button" disabled={Boolean(session)} onClick={() => void enable()}>{session ? "Waiting for Microsoft…" : "Enable mailbox settings"}</button></div>
  </section>;
}

function isAdminApprovalRequired(errorCode: string | null) {
  return Boolean(errorCode && /^AADSTS(?:90094|90095|900941)$/i.test(errorCode));
}
