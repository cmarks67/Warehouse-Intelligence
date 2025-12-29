import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";
import { supabase } from "../lib/supabaseClient";

/**
 * Mirrors the old dashboard.html password section:
 * - change own password (auth.updateUser)
 * - admin "send reset email" uses auth.resetPasswordForEmail with redirectTo
 * Ref: dashboard.html :contentReference[oaicite:12]{index=12}
 */

function shortAccountId(raw) {
  if (!raw) return "WI-UNKNOWN";
  return "WI-" + raw.slice(0, 8).toUpperCase();
}

export function PasswordPage() {
  const navigate = useNavigate();

  const [headerEmail, setHeaderEmail] = useState("");
  const [profile, setProfile] = useState(null);

  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");

  const [adminEmail, setAdminEmail] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [adminMsg, setAdminMsg] = useState({ type: "", text: "" });

  const isAdmin = profile?.role === "admin";
  const accountIdDisplay = useMemo(
    () => shortAccountId(profile?.business_owner_id || profile?.id),
    [profile]
  );

  const onSelectNav = (key) => {
    if (key === "overview") navigate("/app/dashboard");
    if (key === "users") navigate("/app/users");
    if (key === "password") navigate("/app/password");
  };

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData?.user;

      if (!u) {
        navigate("/login", { replace: true });
        return;
      }

      setHeaderEmail(u.email || "");

      const { data: p } = await supabase.from("users").select("*").eq("id", u.id).single();
      setProfile(p || null);
    })().catch((e) => {
      console.error(e);
      setMsg({ type: "error", text: e?.message || "Init failed." });
    });
  }, [navigate]);

  async function changeOwnPassword(e) {
    e.preventDefault();
    setMsg({ type: "", text: "" });

    if (p1 !== p2) {
      setMsg({ type: "error", text: "Passwords do not match." });
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) throw error;

      setMsg({
        type: "success",
        text: "Password updated. You may be asked to sign in again on other devices.",
      });
      setP1("");
      setP2("");
    } catch (e) {
      console.error(e);
      setMsg({ type: "error", text: e?.message || "Unable to update password." });
    } finally {
      setBusy(false);
    }
  }

  async function adminSendReset(e) {
    e.preventDefault();
    setAdminMsg({ type: "", text: "" });

    if (!isAdmin) {
      setAdminMsg({ type: "error", text: "Admin access required." });
      return;
    }

    const target = (adminEmail || "").trim();
    if (!target) {
      setAdminMsg({ type: "error", text: "Please enter an email address." });
      return;
    }

    setBusy(true);
    try {
      // Match old dashboard: direct resetPasswordForEmail with redirectTo :contentReference[oaicite:13]{index=13}
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: "https://warehouseintelligence.co.uk/password-reset.html",
      });
      if (error) throw error;

      setAdminMsg({
        type: "success",
        text: `If an account exists, a reset email has been sent to ${target}.`,
      });
      setAdminEmail("");
    } catch (e) {
      console.error(e);
      setAdminMsg({ type: "error", text: e?.message || "Unable to send reset email." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout headerEmail={headerEmail} activeNav="password" onSelectNav={onSelectNav}>
      {/* Account card (parity with old dashboard) :contentReference[oaicite:14]{index=14} */}
      <Card title="Account" subtitle="">
        <div className="wi-muted">{profile?.full_name || ""}</div>
        <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className={`wi-badge ${profile?.role === "admin" ? "admin" : "standard"}`}>
            {profile?.role === "admin" ? "Admin" : "Standard"}
          </span>
          <span className={`wi-badge ${profile?.account_type || ""}`}>
            {profile?.account_type === "business" ? "Business" : "Single user"}
          </span>
        </div>

        <div className="wi-muted" style={{ marginTop: 8 }}>
          Account ID: <span className="wi-mono">{accountIdDisplay}</span>
        </div>
        <div className="wi-muted" style={{ marginTop: 6 }}>
          All users and tools are scoped to this account.
        </div>
      </Card>

      <Card title="Password reset" subtitle="">
        <h3 style={{ marginTop: 0 }}>Change your password</h3>
        <p className="wi-muted">This updates the password for your own user only.</p>

        {msg.text && (
          <div style={{ marginBottom: 10, color: msg.type === "error" ? "#b91c1c" : "#166534" }}>
            {msg.text}
          </div>
        )}

        <form onSubmit={changeOwnPassword} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <div>
            <label style={{ fontSize: ".85rem" }}>New password</label>
            <input type="password" value={p1} onChange={(e) => setP1(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: ".85rem" }}>Confirm new password</label>
            <input type="password" value={p2} onChange={(e) => setP2(e.target.value)} required />
          </div>
          <div>
            <Button variant="primary" disabled={busy}>
              Update password
            </Button>
          </div>
        </form>
      </Card>

      {/* Admin reset card (parity with old dashboard) :contentReference[oaicite:15]{index=15} */}
      {isAdmin && (
        <Card title="Admin: send a password reset email" subtitle="This sends a reset link to the email address.">
          {adminMsg.text && (
            <div style={{ marginBottom: 10, color: adminMsg.type === "error" ? "#b91c1c" : "#166534" }}>
              {adminMsg.text}
            </div>
          )}

          <form onSubmit={adminSendReset} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <div>
              <label style={{ fontSize: ".85rem" }}>User email</label>
              <input
                type="email"
                placeholder="name@company.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Button variant="primary" disabled={busy}>
                Send reset email
              </Button>
            </div>
          </form>
        </Card>
      )}
    </AppLayout>
  );
}
