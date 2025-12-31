import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

export default function MasterData() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  // Companies (via membership)
  const [companyName, setCompanyName] = useState("");
  const [companies, setCompanies] = useState([]); // [{id,name,role}]

  // Sites
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [sites, setSites] = useState([]); // [{id, company_id, name, code, address, company_name}]

  const companyIds = useMemo(() => companies.map((c) => c.id), [companies]);

  const setOk = (text) => setStatus({ text, isError: false });
  const setErr = (text) => setStatus({ text, isError: true });

  /* -----------------------------------------
     AUTH HELPER
  ------------------------------------------ */
  const requireUser = async () => {
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;

    if (userErr || !user) {
      console.error("Auth error:", userErr);
      setErr("You are not signed in. Please sign in again.");
      return null;
    }
    return user;
  };

  /* -----------------------------------------
     LOAD COMPANIES (via membership model)
  ------------------------------------------ */
  const loadCompanies = async () => {
    const user = await requireUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("company_users")
      .select(
        `
        company_id,
        role,
        companies (
          id,
          name
        )
      `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Load companies error:", error);
      setErr(error.message);
      return;
    }

    const mapped = (data || [])
      .filter((row) => row.companies) // defensive
      .map((row) => ({
        id: row.companies.id,
        name: row.companies.name,
        role: row.role,
      }));

    setCompanies(mapped);

    // Default selected company for site creation
    if (!selectedCompanyId && mapped.length > 0) {
      setSelectedCompanyId(mapped[0].id);
    }
  };

  /* -----------------------------------------
     CREATE COMPANY + MEMBERSHIP
  ------------------------------------------ */
  const createCompany = async () => {
    if (!companyName.trim()) return setErr("Company name is required.");

    setLoading(true);
    setOk("Creating company...");

    const user = await requireUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: company, error: cErr } = await supabase
      .from("companies")
      .insert({ name: companyName.trim() })
      .select("id, name")
      .single();

    if (cErr) {
      console.error("Create company error:", cErr);
      setErr(cErr.message);
      setLoading(false);
      return;
    }

    const { error: mErr } = await supabase.from("company_users").insert({
      company_id: company.id,
      user_id: user.id,
      role: "admin",
    });

    if (mErr) {
      console.error("Create membership error:", mErr);
      setErr(`Company created, but membership failed: ${mErr.message}`);
      setLoading(false);
      return;
    }

    setCompanyName("");
    setOk("Company created (membership added).");

    await loadCompanies();
    await loadSites(); // refresh sites in case you filter by membership
    setLoading(false);
  };

  /* -----------------------------------------
     LOAD SITES (for companies user belongs to)
  ------------------------------------------ */
  const loadSites = async () => {
    const user = await requireUser();
    if (!user) return;

    // If no companies, then no sites to show
    if (!companyIds || companyIds.length === 0) {
      setSites([]);
      return;
    }

    const { data, error } = await supabase
      .from("sites")
      .select(
        `
        id,
        company_id,
        name,
        code,
        address,
        created_at,
        companies ( name )
      `
      )
      .in("company_id", companyIds)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Load sites error:", error);
      setErr(error.message);
      return;
    }

    const mapped = (data || []).map((s) => ({
      id: s.id,
      company_id: s.company_id,
      name: s.name,
      code: s.code,
      address: s.address,
      company_name: s.companies?.name || "",
    }));

    setSites(mapped);
  };

  /* -----------------------------------------
     CREATE SITE
  ------------------------------------------ */
  const createSite = async () => {
    if (!selectedCompanyId) return setErr("Please select a company.");
    if (!siteName.trim()) return setErr("Site name is required.");
    if (!siteCode.trim()) return setErr("Site code is required.");

    setLoading(true);
    setOk("Creating site...");

    const user = await requireUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const payload = {
      company_id: selectedCompanyId,
      name: siteName.trim(),
      code: siteCode.trim(),
      address: siteAddress.trim() || null,
    };

    const { error } = await supabase.from("sites").insert(payload);

    if (error) {
      console.error("Create site error:", error);
      setErr(error.message);
      setLoading(false);
      return;
    }

    setSiteName("");
    setSiteCode("");
    setSiteAddress("");
    setOk("Site created.");

    await loadSites();
    setLoading(false);
  };

  /* -----------------------------------------
     DELETE SITE (optional but useful)
  ------------------------------------------ */
  const deleteSite = async (siteId) => {
    if (!siteId) return;

    setLoading(true);
    setOk("Deleting site...");

    const user = await requireUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("sites").delete().eq("id", siteId);

    if (error) {
      console.error("Delete site error:", error);
      setErr(error.message);
      setLoading(false);
      return;
    }

    setOk("Site deleted.");
    await loadSites();
    setLoading(false);
  };

  /* -----------------------------------------
     INIT
  ------------------------------------------ */
  useEffect(() => {
    (async () => {
      await loadCompanies();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When companies list changes, refresh sites (membership filter depends on it)
  useEffect(() => {
    if (companies.length > 0) loadSites();
    else setSites([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies.map((c) => c.id).join("|")]);

  /* -----------------------------------------
     RENDER
  ------------------------------------------ */
  return (
    <div className="wi-page">
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Company & site setup</h1>
        <button
          onClick={async () => {
            setStatus(null);
            await loadCompanies();
            await loadSites();
            setOk("Reloaded.");
          }}
          disabled={loading}
        >
          Reload
        </button>
      </div>

      {status && (
        <div
          className={`wi-alert ${status.isError ? "wi-alert--error" : "wi-alert--success"}`}
          style={{ marginTop: 12 }}
        >
          {status.text}
        </div>
      )}

      {/* CREATE COMPANY */}
      <section className="wi-card" style={{ marginTop: 16 }}>
        <h2>Create company</h2>

        <label style={{ display: "block", marginBottom: 6 }}>Company name</label>
        <input
          type="text"
          placeholder="e.g., XPO"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          disabled={loading}
        />

        <div style={{ marginTop: 12 }}>
          <button onClick={createCompany} disabled={loading}>
            Create company
          </button>
        </div>
      </section>

      {/* CREATE SITE */}
      <section className="wi-card" style={{ marginTop: 16 }}>
        <h2>Create site</h2>

        <label style={{ display: "block", marginBottom: 6 }}>Company</label>
        <select
          value={selectedCompanyId}
          onChange={(e) => setSelectedCompanyId(e.target.value)}
          disabled={loading || companies.length === 0}
        >
          {companies.length === 0 ? (
            <option value="">No companies yet</option>
          ) : (
            companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))
          )}
        </select>

        <label style={{ display: "block", marginTop: 10, marginBottom: 6 }}>Site name</label>
        <input
          type="text"
          placeholder="e.g., Daventry DC"
          value={siteName}
          onChange={(e) => setSiteName(e.target.value)}
          disabled={loading}
        />

        <label style={{ display: "block", marginTop: 10, marginBottom: 6 }}>Site code</label>
        <input
          type="text"
          placeholder="e.g., DIRFT"
          value={siteCode}
          onChange={(e) => setSiteCode(e.target.value)}
          disabled={loading}
        />

        <label style={{ display: "block", marginTop: 10, marginBottom: 6 }}>Address (optional)</label>
        <input
          type="text"
          placeholder="e.g., NN11 0XG"
          value={siteAddress}
          onChange={(e) => setSiteAddress(e.target.value)}
          disabled={loading}
        />

        <div style={{ marginTop: 12 }}>
          <button onClick={createSite} disabled={loading || companies.length === 0}>
            Create site
          </button>
        </div>
      </section>

      {/* SITES LIST */}
      <section className="wi-card" style={{ marginTop: 16 }}>
        <h2>Sites</h2>

        {sites.length === 0 ? (
          <p>No sites yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="wi-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Company</th>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Site</th>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Code</th>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Address</th>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}></th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id}>
                    <td style={{ padding: "10px 8px" }}>{s.company_name}</td>
                    <td style={{ padding: "10px 8px" }}>{s.name}</td>
                    <td style={{ padding: "10px 8px" }}>{s.code}</td>
                    <td style={{ padding: "10px 8px" }}>{s.address || ""}</td>
                    <td style={{ padding: "10px 8px" }}>
                      <button onClick={() => deleteSite(s.id)} disabled={loading}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
