import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";
import { supabase } from "../lib/supabaseClient";

/**
 * Mirrors the behaviour from the original dashboard.html:
 * - account card with WI-XXXX account id
 * - users list scoped by business_owner_id
 * - admin actions: reset/promote/deactivate
 * - add user uses a transient client (persistSession:false) to avoid replacing admin session
 * - single_user vs business gating + upgrade card
 * Ref: dashboard.html :contentReference[oaicite:4]{index=4}
 */

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function shortAccountId(raw) {
  if (!raw) return "WI-UNKNOWN";
  return "WI-" + raw.slice(0, 8).toUpperCase();
}

export function UsersPage() {
  const navigate = useNavigate();

  const [headerEmail, setHeaderEmail] = useState("");
  const [profile, setProfile] = useState(null);

  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  // Add user form
  const [fullName, setFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");

  const isAdmin = profile?.role === "admin";
  const isBusiness = profile?.account_type === "business";
  const businessOwnerId = useMemo(
    () => profile?.business_owner_id || profile?.id,
    [profile]
  );

  const accountIdDisplay = useMemo(
    () => shortAccountId(profile?.business_owner_id || profile?.id),
    [profile]
  );

  // ✅ navigation must go to /app/* routes
  const onSelectNav = (key) => {
    if (key === "overview") navigate("/app/dashboard");
    if (key === "users") navigate("/app/users");
    if (key === "password") navigate("/app/password");
    if (key === "scheduling-tool") navigate("/app/dashboard");
  };

  async function loadUsers(p) {
    const owner = p.business_owner_id || p.id;
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("business_owner_id", owner)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) throw error;
    setUsers(data || []);
  }

  async function init() {
    const { data: userData } = await supabase.auth.getUser();
    const authUser = userData?.user;

    if (!authUser) {
      navigate("/login", { replace: true });
      return;
    }

    setHeaderEmail(authUser.email || "");

    // Load profile from users table
    const { data: p, error: pe } = await supabase
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .single();

    if (pe || !p) {
      // If profile is missing, mirror old behaviour: create one (admin + single_user)
      // This matches the old dashboard's “create profile if missing” approach. :contentReference[oaicite:5]{index=5}
      const fallback = {
        id: authUser.id,
        email: authUser.email,
        full_name: authUser.user_metadata?.full_name || authUser.email,
        role: "admin",
        account_type: "single_user",
        business_owner_id: authUser.id,
        is_active: true,
      };
      const { error: ue } = await supabase.from("users").upsert(fallback);
      if (ue) {
        setMsg({ type: "error", text: "Unable to load/create profile: " + ue.message });
        return;
      }
      setProfile(fallback);
      await loadUsers(fallback);
      return;
    }

    if (p.is_active === false) {
      alert("This user has been deactivated. Please contact your administrator.");
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
      return;
    }

    setProfile(p);
    await loadUsers(p);
  }

  useEffect(() => {
    init().catch((e) => {
      console.error(e);
      setMsg({ type: "error", text: e?.message || "Init failed." });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function adminResetEmail(targetEmail) {
    setMsg({ type: "", text: "" });
    setBusy(true);
    try {
      // Match old dashboard: direct resetPasswordForEmail with redirectTo :contentReference[oaicite:6]{index=6}
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: "https://warehouseintelligence.co.uk/password-reset.html",
      });
      if (error) throw error;

      setMsg({
        type: "success",
        text: `If an account exists, a reset email has been sent to ${targetEmail}.`,
      });
    } catch (e) {
      console.error(e);
      setMsg({ type: "error", text: "Reset failed: " + (e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  async function adminPromote(userId) {
    if (!confirm("Promote this user to admin?")) return;
    setBusy(true);
    setMsg({ type: "", text: "" });
    try {
      const { error } = await supabase.from("users").update({ role: "admin" }).eq("id", userId);
      if (error) throw error;

      setMsg({ type: "success", text: "User promoted." });
      await loadUsers(profile);
    } catch (e) {
      console.error(e);
      setMsg({ type: "error", text: "Promote failed: " + (e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  async function adminDeactivate(userId) {
    if (!confirm("Delete this user? They will be deactivated and unable to access the account.")) return;
    setBusy(true);
    setMsg({ type: "", text: "" });
    try {
      const { error } = await supabase.from("users").update({ is_active: false }).eq("id", userId);
      if (error) throw error;

      setMsg({ type: "success", text: "User deactivated." });
      await loadUsers(profile);
    } catch (e) {
      console.error(e);
      setMsg({ type: "error", text: "Deactivate failed: " + (e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  async function createUser(e) {
    e.preventDefault();
    setMsg({ type: "", text: "" });

    if (!profile || profile.account_type !== "business" || profile.role !== "admin") {
      setMsg({ type: "error", text: "You are not allowed to add users." });
      return;
    }
    if (pw1 !== pw2) {
      setMsg({ type: "error", text: "Passwords do not match." });
      return;
    }

    setBusy(true);
    try {
      // Match old dashboard: transient client signUp (persistSession:false) :contentReference[oaicite:7]{index=7}
      const url = import.meta.env.VITE_SUPABASE_URL;
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!url || !anon) {
        throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
      }

      const transient = createClient(url, anon, { auth: { persistSession: false } });

      const { data, error } = await transient.auth.signUp({
        email: newEmail.trim(),
        password: pw1,
        options: { data: { full_name: fullName.trim() } },
      });
      if (error) throw error;

      const newUser = data?.user;
      if (!newUser?.id) {
        throw new Error(
          "User created in Auth but no user id returned. Check Supabase Auth settings (email confirmations)."
        );
      }

      const { error: upsertErr } = await supabase.from("users").upsert({
        id: newUser.id,
        email: newEmail.trim(),
        full_name: fullName.trim(),
        role: "standard",
        account_type: "business",
        business_owner_id: businessOwnerId,
        is_active: true,
      });
      if (upsertErr) throw upsertErr;

      setMsg({ type: "success", text: "User created successfully." });
      setFullName("");
      setNewEmail("");
      setPw1("");
      setPw2("");

      await loadUsers(profile);
    } catch (e) {
      console.error(e);
      setMsg({ type: "error", text: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout headerEmail={headerEmail} activeNav="users" onSelectNav={onSelectNav}>
      {/* Account card (parity with old dashboard) :contentReference[oaicite:8]{index=8} */}
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

      <Card
        title="Users"
        subtitle={
          profile?.account_type === "single_user"
            ? "This is a single-user account."
            : isAdmin
              ? "Manage users under this business account."
              : "You can view users in your business. Only admins can manage them."
        }
      >
        {msg.text && (
          <div style={{ marginBottom: 10, color: msg.type === "error" ? "#b91c1c" : "#166534" }}>
            {msg.text}
          </div>
        )}

        {/* Single-user gating + upgrade card (parity with old dashboard) :contentReference[oaicite:9]{index=9} */}
        {profile?.account_type === "single_user" && (
          <>
            <p className="wi-muted">
              This account is configured as <strong>Single user</strong>. Additional users cannot be added.
            </p>
            <div style={{ marginTop: 12, border: "1px dashed var(--wi-border)", borderRadius: 12, padding: 14 }}>
              <h3 style={{ margin: "0 0 6px" }}>Upgrade your account</h3>
              <p className="wi-muted" style={{ marginTop: 0 }}>
                You are currently using a single-user plan. Upgrade to enable multiple users, admin controls and
                additional features.
              </p>
              <Button variant="primary" onClick={() => navigate("/pricing")}>
                Upgrade account
              </Button>
            </div>
          </>
        )}

        {/* Users table (parity with old dashboard) :contentReference[oaicite:10]{index=10} */}
        <div style={{ marginTop: 12, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 4px" }}>Email</th>
                <th style={{ textAlign: "left", padding: "6px 4px" }}>Name</th>
                <th style={{ textAlign: "left", padding: "6px 4px" }}>Role</th>
                <th style={{ textAlign: "left", padding: "6px 4px" }}>Created</th>
                <th style={{ textAlign: "left", padding: "6px 4px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === profile?.id;
                const canManage = isAdmin && !isSelf;

                return (
                  <tr key={u.id}>
                    <td style={{ padding: "6px 4px", borderBottom: "1px solid var(--wi-border)" }}>{u.email}</td>
                    <td style={{ padding: "6px 4px", borderBottom: "1px solid var(--wi-border)" }}>{u.full_name || ""}</td>
                    <td style={{ padding: "6px 4px", borderBottom: "1px solid var(--wi-border)" }}>{u.role}</td>
                    <td style={{ padding: "6px 4px", borderBottom: "1px solid var(--wi-border)" }}>{fmtDate(u.created_at)}</td>
                    <td style={{ padding: "6px 4px", borderBottom: "1px solid var(--wi-border)" }}>
                      {canManage ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Button variant="secondary" disabled={busy} onClick={() => adminResetEmail(u.email)}>
                            Reset
                          </Button>
                          {u.role !== "admin" && (
                            <Button variant="secondary" disabled={busy} onClick={() => adminPromote(u.id)}>
                              Promote
                            </Button>
                          )}
                          <Button variant="danger" disabled={busy} onClick={() => adminDeactivate(u.id)}>
                            Delete
                          </Button>
                        </div>
                      ) : (
                        <span className="wi-muted">{isSelf ? "This is you" : ""}</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!users.length && (
                <tr>
                  <td colSpan={5} className="wi-muted" style={{ padding: 8 }}>
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add user form: only business + admin (parity with old dashboard) :contentReference[oaicite:11]{index=11} */}
        {isBusiness && isAdmin && (
          <div style={{ marginTop: 18 }}>
            <h3 style={{ margin: "0 0 8px" }}>Add a standard user</h3>
            <form onSubmit={createUser} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
              <div>
                <label style={{ fontSize: ".85rem" }}>Full name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div>
                <label style={{ fontSize: ".85rem" }}>Email</label>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
              </div>
              <div>
                <label style={{ fontSize: ".85rem" }}>Password</label>
                <input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} required />
              </div>
              <div>
                <label style={{ fontSize: ".85rem" }}>Confirm password</label>
                <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
              </div>

              <div>
                <Button variant="primary" disabled={busy}>
                  Create user
                </Button>
              </div>
            </form>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
