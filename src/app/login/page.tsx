"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      router.replace("/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center-page">
      <form className="card auth-card stack" onSubmit={submit}>
        <div>
          <div className="badge">Internal access</div>
          <h1>Company Control</h1>
          <p className="muted">Enter an administrator-issued 15-character access code.</p>
        </div>
        <label>
          Access code
          <input
            autoComplete="one-time-code"
            autoFocus
            maxLength={15}
            pattern="[A-Za-z0-9]{15}"
            required
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={busy || code.length !== 15}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="muted">This code authenticates only to the internal application. Microsoft authentication always occurs on Microsoft&apos;s website.</p>
      </form>
    </main>
  );
}
