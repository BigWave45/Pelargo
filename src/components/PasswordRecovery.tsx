import React, { useState } from "react";

type Props = {
  resetToken?: string;
  onBack: () => void;
};

export function PasswordRecovery({ resetToken, onBack }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    if (resetToken && password !== confirmation) {
      setError("The passwords do not match.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(
        resetToken ? "/api/auth/password-reset" : "/api/auth/password-reset-request",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(resetToken ? { token: resetToken, password } : { email }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      setMessage(data.message || "Request completed.");
      if (!resetToken) setEmail("");
      else {
        setPassword("");
        setConfirmation("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Password recovery failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="auth-shell">
    <div className="auth-card">
      <a className="workspace-brand auth-brand" href="/"><span className="workspace-brand-mark">p</span><span>pelargo</span></a>
      <div className="eyebrow">MERCHANT ACCOUNT RECOVERY</div>
      <h1>{resetToken ? "Choose a new password" : "Reset your password"}</h1>
      <p className="workspace-subtitle">
        {resetToken
          ? "Set a new password for your merchant account. The reset link can only be used once."
          : "Enter the email address on your merchant account. If it matches, a one-time reset link will be written to the restricted Cloudflare Pages Preview logs."}
      </p>
      <form onSubmit={submit}>
        {!resetToken ? <>
          <label className="field-label" htmlFor="recovery-email">Email address</label>
          <input id="recovery-email" className="workspace-input" type="email" value={email}
            onChange={e => setEmail(e.target.value)} autoComplete="email" required maxLength={254} />
        </> : <>
          <label className="field-label" htmlFor="recovery-password">New password</label>
          <input id="recovery-password" className="workspace-input" type="password" value={password}
            onChange={e => setPassword(e.target.value)} autoComplete="new-password" required minLength={12} maxLength={128} />
          <label className="field-label" htmlFor="recovery-confirmation">Confirm new password</label>
          <input id="recovery-confirmation" className="workspace-input" type="password" value={confirmation}
            onChange={e => setConfirmation(e.target.value)} autoComplete="new-password" required minLength={12} maxLength={128} />
          <p className="field-hint">Use 12–128 characters. Resetting your password signs out all existing sessions.</p>
        </>}
        {error && <div className="notice-panel auth-error" role="alert">{error}</div>}
        {message && <div className="notice-panel auth-success" role="status">{message}</div>}
        <button className="primary-button auth-submit" disabled={busy}>
          {busy ? "Please wait…" : resetToken ? "Update password" : "Send reset link"}
        </button>
      </form>
      <p className="auth-switch"><button type="button" onClick={onBack}>Back to sign in</button></p>
      <p className="auth-footnote">This recovery route is restricted to the Pelargo testnet Preview environment. It is not enabled on Production.</p>
    </div>
  </div>;
}
