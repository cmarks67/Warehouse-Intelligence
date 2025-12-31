// /src/pages/MasterData.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import "./MasterData.css";

export default function MasterData() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  // Tenant context (membership)
  const [me, setMe] = useState(null); // { id, email, account_id, role, account_type }

  // Companies (scoped by me.account_id)
  const [companyName, setCompanyName] = useState("");
  const [companies, setCompanies] = useState([]); // [{id,name,created_at}]

  // Sites (scoped by me.account_id)
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [sites, setSites] = useState([]); // [{id, company_id, name, code, address, company_name}]

  const companyOptions = useMemo(() => companies || [], [companies]);

  const setOk = (text) => setStatus({ text, isError: false });
  const setErr = (text) => setStatus({ text, isError: true });

  /* -----------------------------------------
     AUTH + TENANT HELPER
  ------------------------------------------ */
  const requireAuthUser = async () => {
    const { data, error } = await supabase.auth.getUser();
    const user = data?.user;
    if (error || !user) {
      console.error("Auth error:", error);
      setErr("You are not signed in. Please sign in again.");
      return null;
    }
    return user;
  };

  const loadMe = async () => {
    const authUser = await requireAuthUser();
    if (!authUser) return null;

    const { data, error } = await supabase
      .from("users")
      .select("id, email, account_id, role, account_type")
      .eq("id", authUser.id)
      .single();

    if (error) {
      console.error("Load me error:", error);
      setErr(`Unable to load user profile: ${error.message}`);
      return null;
    }

    if (!data?.account_id) {
      // With your RLS policies, a missing account_id will block everything.
      setErr(
        "Your user profile has no membership (account_id). Please assign an account_id to this user in public.users."
      );
      return null;
    }

    setMe(data);
    return data;
  };

  /* -----------------------------------------
     LOAD COMPANIES (tenant: account_id)
  ------------------------------------------ */
  const loadCompanies = async (accountId) => {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Load companies error:", error);
      setErr(error.message);
      return [];
    }

    const rows = data || [];
    setCompanies(rows);

    // Default selected company for site creation
    if (!selectedCompanyId && rows.length > 0) {
      setSelectedCompanyId(rows[0].id);
    } else if (selectedCompanyId && rows.length > 0) {
      // Keep selection if still valid; otherwise reset
      const stillExists = rows.some((c) => c.id === selectedCompanyId);
      if (!stillExists) setSelectedCompanyId(rows[0].id);
    } else if (rows.length === 0) {
      setSelectedCompanyId("");
    }

    return rows;
  };

  /* -----------------------------------------
     CREATE COMPANY (tenant: account_id)
  ------------------------------------------ */
  const createCompany = async () => {
    if (!companyName.trim()) return setErr("Company name is required.");

    setLoading(true);
    setStatus(null);

    const meRow = me || (await loadMe());
    if (!meRow) {
      setLoading(false);
      return;
    }

    const payload = {
      name: companyName.trim(),
      account_id: meRow.account_id,
      created_by: meRow.id,
    };

    const { error } = await supabase.from("companies").insert(payload);

    if (error) {
      console.error("Create company error:", error);
      setErr(error.message);
      setLoading(false);
      return;
    }

    setCompanyName("");
    setOk("Company created. Next step: create sites under the company.");
    await loadCompanies(meRow.account_id);
    await loadSites(meRow.account_id);
    setLoading(false);
  };

  /* -----------------------------------------
     LOAD SITES (tenant: account_id)
  ------------------------------------------ */
  const loadSites = async (accountId) => {
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
      .eq("account_id", accountId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Load sites error:", error);
      setErr(error.message);
      return [];
    }

    const mapped = (data || []).map((s) => ({
      id: s.id,
      company_id: s.company_id,
      name: s.name,
      code: s.code,
      address: s.address,
      created_at: s.created_at,
      company_name: s.companies?.name || "",
    }));

    setSites(mapped);
    return mapped;
  };

  /* -----------------------------------------
     CREATE SITE (tenant: account_id)
  ------------------------------------------ */
  const createSite = async () => {
    if (!selectedCompanyId) return setErr("Please select a company.");
    if (!siteName.trim()) return setErr("Site name is required.");
    if (!siteCode.trim()) return setErr("Site code is required.");

    setLoading(true);
    setStatus(null);

    const meRow = me || (await loadMe());
    if (!meRow) {
      setLoading(false);
      return;
    }

    const payload = {
      company_id: selectedCompanyId,
      name: siteName.trim(),
      code: siteCode.trim(),
      address: siteAddress.trim() || null,
      account_id: meRow.account_id,
      created_by: meRow.id,
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
    await loadSites(meRow.account_id);
    setLoading(false);
  };

  /* -----------------------------------------
     DELETE SITE (tenant enforced by RLS)
  ------------------------------------------ */
  const deleteSite = async (siteId) => {
    if (!siteId) return;

    setLoading(true);
    setStatus(null);

    const meRow = me || (await loadMe());
    if (!meRow) {
      setLoading(false);
      return;
    }

    // Optional extra guard: include account_id filter (not required, but clearer)
    const { error } = await supabase
      .from("sites")
      .delete()
      .eq("id", siteId)
      .eq("account_id", meRow.account_id);

    if (error) {
      console.error("Delete site error:", error);
      setErr(error.message);
      setLoading(false);
      return;
    }

    setOk("Site deleted.");
    await loadSites(meRow.account_id);
    setLoading(false);
  };

  /* -----------------------------------------
     RELOAD ALL
  ------------------------------------------ */
  const reloadAll = async () => {
    setStatus(null);
    setLoading(true);

    const meRow = await loadMe();
    if (!meRow) {
      setLoading(false);
      return;
    }

    await loadCompanies(meRow.account_id);
    await loadSites(meRow.account_id);

    setOk("Reloaded.");
    setLoading(false);
  };

  /* -----------------------------------------
     INIT
  ------------------------------------------ */
  useEffect(() => {
    (async () => {
      setLoading(true);
      const meRow = await loadMe();
      if (meRow) {
        await loadCompanies(meRow.account_id);
        await loadSites(meRow.account_id);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -----------------------------------------
     RENDER
  ------------------------------------------ */
  return (
    <div className="wi-page">
      <div className="wi-md-actions" style={{ alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0 }}>Company & site setup</h1>
          <div className="wi-md-muted" style={{ marginTop: 6 }}>
            Create a company, then add sites under it.
            {me?.account_id ? (
              <span style={{ marginLeft: 8 }}>
                Membership: <strong>{me.account_id}</strong>
              </span>
            ) : null}
          </div>
        </div>

        <button onClick={reloadAll} disabled={loading}>
          Reload
        </button>
      </div>

      {status && (
        <div className={`wi-md-status ${status.isError ? "wi-md-status--error" : ""}`}>
          {status.text}
        </div>
      )}

      <div className="wi-md-two" style={{ marginTop: 12 }}>
        {/* CREATE COMPANY */}
        <section className="wi-md-cardlet">
          <h3 className="wi-md-h3">Create company</h3>

          <label className="wi-md-label">Company name</label>
          <input
            className="wi-md-input"
            type="text"
            placeholder="e.g., XPO"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            disabled={loading}
          />

          <div className="wi-md-right">
            <button onClick={createCompany} disabled={loading}>
              Create company
            </button>
          </div>

          <hr className="wi-md-hr" />

          <div className="wi-md-muted">
            Next step: <strong>Sites</strong> — create one or more sites under the company.
          </div>
        </section>

        {/* CREATE SITE */}
        <section className="wi-md-cardlet">
          <h3 className="wi-md-h3">Create site</h3>

          <label className="wi-md-label">Company</label>
          <select
            className="wi-md-input"
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            disabled={loading || companyOptions.length === 0}
          >
            {companyOptions.length === 0 ? (
              <option value="">No companies yet</option>
            ) : (
              companyOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>

          <div className="wi-md-twoInner">
            <div>
              <label className="wi-md-label">Site name</label>
              <input
                className="wi-md-input"
                type="text"
                placeholder="e.g., Daventry DC"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                disabled={loading}
              />
            </div>

            <div>
              <label className="wi-md-label">Site code</label>
              <input
                className="wi-md-input"
                type="text"
                placeholder="e.g., DIRFT"
                value={siteCode}
                onChange={(e) => setSiteCode(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <label className="wi-md-label">Address (optional)</label>
          <input
            className="wi-md-input"
            type="text"
            placeholder="e.g., NN11 0XG"
            value={siteAddress}
            onChange={(e) => setSiteAddress(e.target.value)}
            disabled={loading}
          />

          <div className="wi-md-right">
            <button onClick={createSite} disabled={loading || companyOptions.length === 0}>
              Create site
            </button>
          </div>
        </section>
      </div>

      {/* SITES LIST */}
      <section className="wi-md-cardlet" style={{ marginTop: 12 }}>
        <h3 className="wi-md-h3">Sites</h3>

        {sites.length === 0 ? (
          <div className="wi-md-muted">No sites yet.</div>
        ) : (
          <div className="wi-md-tableWrap">
            <table className="wi-md-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Site</th>
                  <th>Code</th>
                  <th>Address</th>
                  <th style={{ width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id}>
                    <td>{s.company_name}</td>
                    <td>{s.name}</td>
                    <td>{s.code}</td>
                    <td>{s.address || ""}</td>
                    <td>
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
