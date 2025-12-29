import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "./login.css";

function evaluateStrength(value) {
  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/[0-9]/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  return score; // 0..4
}

function strengthUI(password) {
  const score = evaluateStrength(password);

  if (!password) return { width: "0%", label: "Password strength:", tone: "none" };

  switch (score) {
    case 1:
      return { width: "25%", label: "Password strength: Weak", tone: "weak" };
    case 2:
      return { width: "55%", label: "Password strength: Fair", tone: "fair" };
    case 3:
      return { width: "80%", label: "Password strength: Good", tone: "good" };
    case 4:
      return { width: "100%", label: "Password strength: Strong", tone: "strong" };
    default:
      return { width: "0%", label: "Password strength:", tone: "none" };
  }
}

export function Login() {
  const nav = useNavigate();
  const loc = useLocation();

  const [tab, setTab] = useState("signin"); // signin | create

  // Sign in
  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");

  // Create
  const [fullName, setFullName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountType, setAccountType] = useState("business");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const from = loc.state?.from || "/app";

  const strength = useMemo(() => strengthUI(createPassword), [createPassword]);

  const onSignIn = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: signinEmail,
      password: signinPassword,
    });

    setBusy(false);

    if (error) {
      setError(`Sign in failed: ${error.message}`);
      return;
    }

    nav(from, { replace: true });
  };

  const onCreateAccount = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    if (createPassword !== confirmPassword) {
      setBusy(false);
      setError("Passwords do not match. Please check and try again.");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: createEmail,
      password: createPassword,
      options: {
        data: {
          full_name: fullName,
          account_type: accountType,
        },
      },
    });

    setBusy(false);

    if (error) {
      setError(`Account creation failed: ${error.message}`);
      return;
    }

    setMessage("Account created. Check your email to confirm. Then sign in.");
    setTab("signin");
  };

  const onForgotPassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    if (!signinEmail) {
      setBusy(false);
      setError("Enter your email first, then click “Forgot password?”.");
      return;
    }

    // NOTE: ensure this URL is present in Supabase Auth Redirect URLs (Dashboard → Authentication)
    const { error } = await supabase.auth.resetPasswordForEmail(signinEmail, {
      redirectTo: `${window.location.origin}/password-reset`,
    });

    setBusy(false);

    if (error) {
      setError(`Password reset failed: ${error.message}`);
      return;
    }

    setMessage("Password reset email sent. Please check your inbox.");
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <header className="auth-header">
          <div className="auth-title-row">
            <div>
              <h1 className="auth-title">Warehouse Intelligence</h1>
              <div className="auth-subtitle">Sign in or create a new account.</div>
            </div>
            <div className="back-link">
              <Link to="/">← Back to home</Link>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div className="tab-toggle" role="tablist" aria-label="Authentication tabs">
          <button
            type="button"
            className={`tab-button ${tab === "signin" ? "active" : ""}`}
            onClick={() => setTab("signin")}
            role="tab"
            aria-selected={tab === "signin"}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`tab-button ${tab === "create" ? "active" : ""}`}
            onClick={() => setTab("create")}
            role="tab"
            aria-selected={tab === "create"}
          >
            Create account
          </button>
        </div>

        {(error || message) && (
          <div className={`auth-alert ${error ? "error" : "ok"}`}>
            {error || message}
          </div>
        )}

        {/* SIGN IN */}
        <section className={`tab-panel ${tab === "signin" ? "active" : ""}`} role="tabpanel">
          <form onSubmit={onSignIn}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="signin-email">Email</label>
                <input
                  id="signin-email"
                  name="email"
                  type="email"
                  className="input"
                  autoComplete="email"
                  required
                  value={signinEmail}
                  onChange={(e) => setSigninEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="signin-password">Password</label>
                <input
                  id="signin-password"
                  name="password"
                  type="password"
                  className="input"
                  autoComplete="current-password"
                  required
                  value={signinPassword}
                  onChange={(e) => setSigninPassword(e.target.value)}
                />

                <div className="inline-row">
                  <div className="helper-text">Use your registered password to access your account.</div>
                  <div className="forgot-password">
                    <a href="#" onClick={onForgotPassword}>
                      Forgot password?
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <button className="primary-btn" type="submit" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>

        {/* CREATE ACCOUNT */}
        <section className={`tab-panel ${tab === "create" ? "active" : ""}`} role="tabpanel">
          <form onSubmit={onCreateAccount}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="full-name">Full name</label>
                <input
                  id="full-name"
                  name="fullName"
                  type="text"
                  className="input"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="create-email">Email</label>
                <input
                  id="create-email"
                  name="email"
                  type="email"
                  className="input"
                  autoComplete="email"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="create-password">Password</label>
                <input
                  id="create-password"
                  name="password"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  required
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                />

                <div className="strength-wrapper">
                  <div className="strength-meter">
                    <div
                      className={`strength-bar ${strength.tone}`}
                      style={{ width: strength.width }}
                    />
                  </div>
                  <div className="strength-text">{strength.label}</div>
                </div>

                <div className="helper-text">
                  Use at least 8 characters, including upper &amp; lower case, numbers and a symbol.
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="confirm-password">Confirm password</label>
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="account-type">Account type</label>
                <select
                  id="account-type"
                  name="accountType"
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                >
                  <option value="business">Business (multiple users)</option>
                  <option value="single">Single user</option>
                </select>
              </div>
            </div>

            <button className="primary-btn" type="submit" disabled={busy}>
              {busy ? "Creating..." : "Create account"}
            </button>
          </form>

          <div className="footnote">
            The first user for an account is always created as an Administrator.
          </div>
        </section>
      </div>
    </div>
  );
}
