// /src/pages/Login.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "./login.css";

function evaluateStrength(value) {
  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/[0-9]/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  return score;
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

  // Allow deep-linking:
  // /login -> Sign in
  // /login?tab=create OR /login?tab=signup -> Create account
  const getInitialTab = () => {
    const sp = new URLSearchParams(loc.search || "");
    const t = (sp.get("tab") || "").toLowerCase();
    if (t === "create" || t === "signup" || t === "sign-up") return "create";
    return "signin";
  };

  const [tab, setTab] = useState(getInitialTab);

  useEffect(() => {
    // If the query string changes, keep the UI in sync.
    // This does NOT remove any functionality; it only enables the deep-link behaviour.
    setTab(getInitialTab());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.search]);

  // Sign in
  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");

  // Create account
  const [fullName, setFullName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountType, setAccountType] = useState("business");

  const goToHome = () => {
    window.location.href = "https://www.warehouseintelligence.co.uk/";
  };

  // Busy states
  const [busySignIn, setBusySignIn] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);
  const [busyReset, setBusyReset] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const from = loc.state?.from || "/app";
  const strength = useMemo(() => strengthUI(createPassword), [createPassword]);

  const clearAlerts = () => {
    setError("");
    setMessage("");
  };

  const onSignIn = async (e) => {
    e.preventDefault();
    clearAlerts();

    const email = signinEmail.trim();
    if (!email || !signinPassword) {
      setError("Enter your email and password to sign in.");
      return;
    }

    setBusySignIn(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: signinPassword,
    });
    setBusySignIn(false);

    if (error) {
      setError(`Sign in failed: ${error.message}`);
      return;
    }

    nav(from, { replace: true });
  };

  const onCreateAccount = async (e) => {
    e.preventDefault();
    clearAlerts();

    const email = createEmail.trim();
    const name = fullName.trim();

    if (!name || !email) {
      setError("Full name and email are required.");
      return;
    }
    if (!createPassword || createPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (createPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const emailRedirectTo = "https://www.warehouseintelligence.co.uk/";

    setBusyCreate(true);
    const { error } = await supabase.auth.signUp({
      email,
      password: createPassword,
      options: {
        emailRedirectTo,
        data: {
          full_name: name,
          account_type: accountType,
        },
      },
    });
    setBusyCreate(false);

    if (error) {
      setError(`Account creation failed: ${error.message}`);
      return;
    }

    setMessage("Account created. Check your email to confirm, then sign in.");
    setTab("signin");
  };

  const onForgotPassword = async (e) => {
    e.preventDefault();
    clearAlerts();

    const email = signinEmail.trim();
    if (!email) {
      setError("Enter your email first.");
      return;
    }

    // Redirect to site root so Supabase can append recovery tokens in the hash.
    const redirectTo = window.location.origin;

    setBusyReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setBusyReset(false);

    if (error) {
      setError(`Password reset failed: ${error.message}`);
      return;
    }

    setMessage("Password reset email sent.");
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

        <div className="tab-toggle">
          <button
            type="button"
            className={`tab-button ${tab === "signin" ? "active" : ""}`}
            onClick={() => {
              clearAlerts();
              setTab("signin");
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`tab-button ${tab === "create" ? "active" : ""}`}
            onClick={() => {
              clearAlerts();
              setTab("create");
            }}
          >
            Create account
          </button>
        </div>

        {(error || message) && (
          <div className={`auth-alert ${error ? "error" : "ok"}`}>{error || message}</div>
        )}

        <section className={`tab-panel ${tab === "signin" ? "active" : ""}`}>
          <form onSubmit={onSignIn}>
            <div className="form-grid">
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  className="input"
                  required
                  value={signinEmail}
                  onChange={(e) => setSigninEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  className="input"
                  required
                  value={signinPassword}
                  onChange={(e) => setSigninPassword(e.target.value)}
                />

                <div className="inline-row">
                  <div className="helper-text">Use your registered password.</div>
                  <button
                    type="button"
                    className="linklike"
                    onClick={onForgotPassword}
                    disabled={busyReset || busySignIn}
                  >
                    {busyReset ? "Sending..." : "Forgot password?"}
                  </button>
                </div>
              </div>
            </div>

            <button className="primary-btn" disabled={busySignIn || busyReset}>
              {busySignIn ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>

        <section className={`tab-panel ${tab === "create" ? "active" : ""}`}>
          <form onSubmit={onCreateAccount}>
            <div className="form-grid">
              <div className="form-group">
                <label>Full name</label>
                <input
                  type="text"
                  className="input"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  className="input"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  className="input"
                  required
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                />

                <div className="strength-wrapper">
                  <div className="strength-meter">
                    <div className={`strength-bar ${strength.tone}`} style={{ width: strength.width }} />
                  </div>
                  <div className="strength-text">{strength.label}</div>
                </div>
              </div>

              <div className="form-group">
                <label>Confirm password</label>
                <input
                  type="password"
                  className="input"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Account type</label>
                <select value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                  <option value="business">Business (multiple users)</option>
                  <option value="single_user">Single user</option>
                </select>
              </div>
            </div>

            <button className="primary-btn" disabled={busyCreate}>
              {busyCreate ? "Creating..." : "Create account"}
            </button>
          </form>

          <div className="footnote">The first user for an account is always created as an Administrator.</div>
        </section>
      </div>
    </div>
  );
}
