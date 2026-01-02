import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";
import { supabase } from "../lib/supabaseClient";

/* ---------- helpers ---------- */

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
  return "WI-" + String(raw).slice(0, 8).toUpperCase();
}

/* ---------- page ---------- */

export function UsersPage() {
  const navigate = useNavigate();

  const [headerEmail, setHeaderEmail] = useState("");
  const [profile, setProfile] = useState(null);

  const [users, setUsers] = useState([]);
  const [userCount, setUserCount] = useState(0);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  // Invite form
  const [fullName, setFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const isAdmin = profile?.role === "admin";

  // ✅ Source of truth: account_type, with fallback for legacy data
  const isBusinessDerived =
    profile?.account_type === "business" || userCount > 1;

  const accountIdDisplay = useMemo(
    () => shortAccountId(profile?.account_id),
    [profile]
  );

  /* ---------- navigation ---------- */

  const onSelectNav = (key) => {
    if (key === "overview") navigate("/app/dashboard");
    if (key === "users") navigate("/app/users");
    if (key === "password") navigate("/app/password");
    if (key === "scheduling-tool") navigate("/app/dashboard");
  };

  /* ---------- data ---------- */

  async function loadUsersByAccount(accountId) {
    if (!accountId) {
      setUsers([]);
      setUserCount(0);
      return;
    }

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("account_id", accountId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const list = data || [];
    setUsers(list);
    setUserCount(list.length);
  }

  async function init() {
    const { data: userData } = await supabase.auth.getUser();
    const authUser = userData?.user;

    if (!authUser) {
      navigate("/login", { replace: true });
      return;
    }

    setHeaderEmail(authUser.email || "");

    const { data: p, error: pe } = await supabase
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .single();

    if (pe || !p) {
      const fallback = {
        id: authUser.id,
        email: authUser.email,
        full_name:
          authUser.user_metadata?.full_name || authUser.email,
        role: "admin",
        account_type:
          authUser.user_metadata?.account_type === "business"
            ? "business"
            : "single_user",
        account_id: authUser.id,
        business_owner_id: authUser.id,
        is_active: true,
      };

      const { error: ue } = await supabase
        .from("users")
        .upsert(fallback);

      if (ue) {
        setMsg({
          type: "error",
          text: "Unable to load/create profile: " + ue.message,
        });
        return;
      }

      setProfile(fallback);
      await loadUsersByAccount(fallback.account_id);
      return;
    }

    if (p.is_active === false) {
      alert("This user has been deactivated.");
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
      return;
    }

    setProfile(p);
    await loadUsersByAccount(p.account_id);
  }

  useEffect(() => {
    init().catch((e) => {
      console.error(e);
      setMsg({ type: "error", text: e?.message || "Init failed." });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- admin actions ---------- */

  async function adminResetEmail(targetEmail) {
    setBusy(true);
    setMsg({ type: "", text: "" });
    try {
      const { error } =
        await supabase.auth.resetPasswordForEmail(targetEmail, {
          redirectTo:
            "https://warehouseintelligence.co.uk/password-reset.html",
        });
      if (error) throw error;

      setMsg({
        type: "success",
        text: `Password reset email sent to ${targetEmail}.`,
      });
    } catch (e) {
      setMsg({
        type: "error",
        text: "Reset failed: " + (e?.message || e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function adminPromote(userId) {
    if (!confirm("Promote this user to admin?")) return;
    setBusy(true);
    setMsg({ type: "", text: "" });
    try {
      const { error } = await supabase
        .from("users")
        .update({ role: "admin" })
        .eq("id", userId);
      if (error) throw error;

      await loadUsersByAccount(profile.account_id);
    } catch (e) {
      setMsg({
        type: "error",
        text: "Promote failed: " + (e?.message || e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function adminDeactivate(userId) {
    if (!confirm("Deactivate this user?")) return;
    setBusy(true);
    setMsg({ type: "", text: "" });
    try {
      const { error } = await supabase
        .from("users")
        .update({ is_active: false })
        .eq("id", userId);
      if (error) throw error;

      await loadUsersByAccount(profile.account_id);
    } catch (e) {
      setMsg({
        type: "error",
        text: "Deactivate failed: " + (e?.message || e),
      });
    } finally {
      setBusy(false);
    }
  }

  /* ---------- invite ---------- */

  async function createUser(e) {
    e.preventDefault();
    setMsg({ type: "", text: "" });

    const email = newEmail.trim().toLowerCase();
    const name = fullName.trim();

    if (!email || !email.includes("@")) {
      setMsg({
        type: "error",
        text: `Email address "${email}" is invalid`,
      });
      return;
    }

    if (!name) {
      setMsg({ type: "error", text: "Full name is required." });
      return;
    }

    if (!isAdmin || !isBusinessDerived) {
      setMsg({
        type: "error",
        text: "You are not allowed to add users.",
      });
      return;
    }

    setBusy(true);
    try {
      const { data, error } =
        await supabase.functions.invoke("invite-user", {
          body: { email, full_name: name },
        });

      if (error) throw error;
      if (!data?.ok) throw new Error("Invite failed.");

      setMsg({
        type: "success",
        text: `Invite sent to ${email}.`,
      });
      setFullName("");
      setNewEmail("");

      await loadUsersByAccount(profile.account_id);
    } catch (e) {
      setMsg({
        type: "error",
        text: e?.message || "Invite failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  /* ---------- render ---------- */

  return (
    <AppLayout
      headerEmail={headerEmail}
      activeNav="users"
      onSelectNav={onSelectNav}
    >
      <Card title="Account">
        <div className="wi-muted">{profile?.full_name || ""}</div>

        <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
          <span className={`wi-badge ${isAdmin ? "admin" : "standard"}`}>
            {isAdmin ? "Admin" : "Standard"}
          </span>
          <span
            className={`wi-badge ${
              isBusinessDerived ? "business" : "single_user"
            }`}
          >
            {isBusinessDerived ? "Business" : "Single user"}
          </span>
        </div>

        <div className="wi-muted" style={{ marginTop: 8 }}>
          Account ID: <span className="wi-mono">{accountIdDisplay}</span>
        </div>
      </Card>

      <Card
        title="Users"
        subtitle={
          isBusinessDerived
            ? "Manage users under this business account."
            : "This is a single-user account."
        }
      >
        {msg.text && (
          <div
            style={{
              marginBottom: 10,
              color: msg.type === "error" ? "#b91c1c" : "#166534",
            }}
          >
            {msg.text}
          </div>
        )}

        <table className="wi-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === profile?.id;
              const canManage = isAdmin && !isSelf;

              return (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.full_name}</td>
                  <td>{u.role}</td>
                  <td>{fmtDate(u.created_at)}</td>
                  <td>
                    {canManage ? (
                      <>
                        <Button
                          variant="secondary"
                          onClick={() => adminResetEmail(u.email)}
                        >
                          Reset
                        </Button>
                        {u.role !== "admin" && (
                          <Button
                            variant="secondary"
                            onClick={() => adminPromote(u.id)}
                          >
                            Promote
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          onClick={() => adminDeactivate(u.id)}
                        >
                          Delete
                        </Button>
                      </>
                    ) : (
                      <span className="wi-muted">This is you</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {isBusinessDerived && isAdmin && (
  <Card
    title="Invite a user"
    subtitle="The user will receive an email invitation and set their own password."
  >
    <form onSubmit={createUser} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
      <div>
        <label className="wi-label">Full name</label>
        <input
          className="wi-input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="wi-label">Email</label>
        <input
          className="wi-input"
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          required
        />
      </div>

      <div className="wi-muted" style={{ fontSize: "0.85rem" }}>
        An invitation email will be sent. The user will set their own password.
      </div>

      <div>
        <Button
          variant="primary"
          disabled={busy}
          type="submit"
          onClick={createUser}
        >
          Send invite
        </Button>
      </div>
    </form>
  </Card>
)}

    </AppLayout>
  );
}

export default UsersPage;
