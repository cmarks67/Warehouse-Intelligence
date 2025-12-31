import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function MasterData() {
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [companyName, setCompanyName] = useState("");
  const [siteCompanyId, setSiteCompanyId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [status, setStatus] = useState({ text: "Ready.", isError: false });
  const [loading, setLoading] = useState(false);

  /* ----------------------------
     Load companies
  ----------------------------- */
  const loadCompanies = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("companies")
      .select("id, name")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Load companies error:", error);
      setStatus({ text: error.message, isError: true });
      setLoading(false);
      return;
    }

    setCompanies(data ?? []);
    setLoading(false);
  };

  /* ----------------------------
     Load sites (with company)
  ----------------------------- */
  const loadSites = async () => {
    const { data, error } = await supabase
      .from("sites")
      .select(
        `
        id,
        name,
        code,
        address,
        company_id,
        companies (
          name
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Load sites error:", error);
      setStatus({ text: error.message, isError: true });
      return;
    }

    setSites(data ?? []);
  };

  /* ----------------------------
     Initial load
  ----------------------------- */
  useEffect(() => {
    loadCompanies();
    loadSites();
  }, []);

  /* ----------------------------
     Create company
  ----------------------------- */
  const createCompany = async () => {
    if (!companyName.trim()) {
      setStatus({ text: "Company name is required.", isError: true });
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("companies").insert({
      name: companyName.trim(),
    });

    if (error) {
      console.error("Create company error:", error);
      setStatus({ text: error.message, isError: true });
      setLoading(false);
      return;
    }

    setCompanyName("");
    setStatus({ text: "Company created.", isError: false });
    await loadCompanies();
    setLoading(false);
  };

  /* ----------------------------
     Create site
  ----------------------------- */
  const createSite = async () => {
    if (!siteCompanyId || !siteName.trim()) {
      setStatus({
        text: "Company and site name are required.",
        isError: true,
      });
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("sites").insert({
      company_id: siteCompanyId,
      name: siteName.trim(),
      code: siteCode.trim() || null,
      address: siteAddress.trim() || null,
    });

    if (error) {
      console.error("Create site error:", error);
      setStatus({ text: error.message, isError: true });
      setLoading(false);
      return;
    }

    setSiteName("");
    setSiteCode("");
    setSiteAddress("");
    setStatus({ text: "Site created.", isError: false });
    await loadSites();
    setLoading(false);
  };

  /* ----------------------------
     Delete site (dev only)
  ----------------------------- */
  const deleteSite = async (id) => {
    const { error } = await supabase.from("sites").delete().eq("id", id);

    if (error) {
      console.error("Delete site error:", error);
      setStatus({ text: error.message, isError: true });
      return;
    }

    await loadSites();
  };

  /* ----------------------------
     Render
  ----------------------------- */
  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Company &amp; site setup</h1>
        <button onClick={() => { loadCompanies(); loadSites(); }}>
          Reload
        </button>
      </div>

      <div className={`status ${status.isError ? "error" : ""}`}>
        {status.text}
      </div>

      <div className="card-grid">
        {/* Create company */}
        <div className="card">
          <h2>Create company</h2>
          <input
            type="text"
            placeholder="e.g., XPO Logistics"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
          <button disabled={loading} onClick={createCompany}>
            Create company
          </button>
        </div>

        {/* Create site */}
        <div className="card">
          <h2>Create site</h2>

          <select
            value={siteCompanyId}
            onChange={(e) => setSiteCompanyId(e.target.value)}
          >
            <option value="">
              {companies.length ? "Select company" : "No companies yet"}
            </option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="e.g., Daventry DC"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
          />

          <input
            type="text"
            placeholder="e.g., DIRFT"
            value={siteCode}
            onChange={(e) => setSiteCode(e.target.value)}
          />

          <input
            type="text"
            placeholder="Address (optional)"
            value={siteAddress}
            onChange={(e) => setSiteAddress(e.target.value)}
          />

          <button disabled={loading} onClick={createSite}>
            Create site
          </button>
        </div>
      </div>

      {/* Sites list */}
      <div className="card">
        <h2>Sites</h2>

        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Site</th>
              <th>Code</th>
              <th>Address</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id}>
                <td>{s.companies?.name ?? "-"}</td>
                <td>{s.name}</td>
                <td>{s.code}</td>
                <td>{s.address}</td>
                <td>
                  <button onClick={() => deleteSite(s.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {!sites.length && (
              <tr>
                <td colSpan="5">No sites yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
