// /src/pages/ResetPassword.jsx
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "./login.css";

export default function ResetPassword() {
  const nav = useNavigate();
  const loc = useLocation();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const clearAlerts = () => {
    setError("");
    setMessage("");
  };

  useEffect(() => {
    (async () => {
      clearAlerts();

      // With HashRouter we normalize Supabase hash into:
      //   #/reset-password?access_token=...&refresh_token=...&type=recovery
      const qs = new URLSearchParams(loc.search || "");

      // If Supabase returned an error payload, show it clearly.
      const err = qs.get("error") || qs.get("error_code");
      const errDesc = qs.get("error_description");
      if (err) {
        setError(errDesc ? `${err}: ${errDesc}` : err);
        return;
      }

      const access_token = qs.get("access_token");
      const refresh_token = qs.get("refresh_token");

      if (access_token && refresh_token) {
        const { error: sessErr } = await supabase.auth.setSession({ access_token, refresh_token });
        if (sessErr) {
          setError(`This password reset link is invalid or has expired. (${sessErr.message})`);
          return;
        }
        return;
      }

      // If there are no tokens, fall back to session check (covers navigation without link).
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        setError("This password reset link is invalid or has expired. Please request a new one.");
      }
    })().catch((e) => {
      console.error(e);
      setError(e?.message || "Unable to validate reset link.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onReset = async (e) => {
    e.preventDefault();
    clearAlerts();

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setError(`Password reset failed: ${error.message}`);
      return;
    }

    setMessage("Password updated. Redirecting to login…");
    setTimeout(() => nav("/login", { replace: true }), 1200);
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <header className="auth-header">
          <div className="auth-title-row">
            <div>
              <h1 className="auth-title">Reset password</h1>
              <div className="auth-subtitle">Enter a new password for your account.</div>
            </div>
            <div className="back-link">
              <Link to="/login">← Back to login</Link>
            </div>
          </div>
        </header>

        {(error || message) && (
          <div className={`auth-alert ${error ? "error" : "ok"}`}>{error || message}</div>
        )}

        <section className="tab-panel active">
          <form onSubmit={onReset}>
            <div className="form-grid">
              <div className="form-group">
                <label>New password</label>
                <input
                  type="password"
                  className="input"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Confirm new password</label>
                <input
                  type="password"
                  className="input"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            </div>

            <button className="primary-btn" disabled={busy}>
              {busy ? "Updating..." : "Update password"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
