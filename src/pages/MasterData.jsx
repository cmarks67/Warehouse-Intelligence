// /src/pages/MasterData.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";

import "./MasterData.css";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const safe = (v) => (v === null || v === undefined ? "" : String(v));

function activeFromPath(pathname) {
  if (pathname.startsWith("/app/setup/companies-sites")) return "company-site-setup";
  if (pathname.startsWith("/app/setup/mhe")) return "mhe-setup";
  if (pathname.startsWith("/app/connections")) return "connections";
  if (pathname.startsWith("/app/tools/scheduling")) return "scheduling-tool";
  if (pathname.startsWith("/app/users")) return "users";
  if (pathname.startsWith("/app/password")) return "password";
  return "overview";
}

function pathFromKey(key) {
  switch (key) {
    case "overview":
      return "/app/dashboard";
    case "company-site-setup":
      return "/app/setup/companies-sites";
    case "mhe-setup":
      return "/app/setup/mhe";
    case "connections":
      return "/app/connections";
    case "scheduling-tool":
      return "/app/tools/scheduling";
    case "users":
      return "/app/users";
    case "password":
      return "/app/password";
    default:
      return "/app/dashboard";
  }
}

export default function MasterData() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeNav = useMemo(() => activeFromPath(location.pathname), [location.pathname]);

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ text: "Ready.", isError: false });

  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);

  const [companyName, setCompanyName] = useState("");
  const [siteCompany, setSiteCompany] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [siteAddress, setSiteAddress] = useState("");

  const companyOptions = useMemo(() => companies || [], [companies]);

  const onSelectNav = (key) => navigate(pathFromKey(key));

  const requireSession = useCallback(async () => {
    if (!supabase) {
      setStatus({
        text: "Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
        isError: true,
      });
      return null;
    }
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setStatus({ text: `Auth error: ${error.message}`, isError: true });
      return null;
    }
    const user = data?.session?.user;
    if (!user) {
      navigate("/login", { replace: true });
      return null;
    }
    setEmail(user.email || "");
    return user;
  }, [navigate]);

  const loadCompanies = useCallback(async () => {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, created_at")
      .order("name", { ascending: true });

    if (error) throw error;

    const list = data || [];
    setCompanies(list);

    if (list.length && (!siteCompany || !list.some((c) => c.id === siteCompany))) {
      setSiteCompany(list[0].id);
    }
    if (!list.length) setSiteCompany("");
  }, [siteCompany]);

  const loadSites = useCallback(async () => {
    const { data, error } = await supabase
      .from("sites")
      .select("id, company_id, name, code, address, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    setSites(data || []);
  }, []);

  const reloadAll = useCallback(async () => {
    await loadCompanies();
    await loadSites();
  }, [loadCompanies, loadSites]);

  const onCreateCompany = useCallback(async () => {
    try {
      const name = companyName.trim();
      if (!name) {
        setStatus({ text: "Company name is required.", isError: true });
        return;
      }

      const user = await requireSession();
      if (!user) return;

      const { error } = await supabase.from("companies").insert([{ name, created_by: user.id }]);
      if (error) throw error;

      setCompanyName("");
      setStatus({ text: "Company created successfully.", isError: false });
      await reloadAll();
    } catch (e) {
      setStatus({ text: e?.message || String(e), isError: true });
    }
  }, [companyName, requireSession, reloadAll]);

  const onCreateSite = useCallback(async () => {
    try {
      const user = await requireSession();
      if (!user) return;

      const company_id = siteCompany;
      const name = siteName.trim();
      const code = siteCode.trim() || null;
      const address = siteAddress.trim() || null;

      if (!company_id) return setStatus({ text: "Select a company for the site.", isError: true });
      if (!name) return setStatus({ text: "Site name is required.", isError: true });

      const { error } = await supabase
        .from("sites")
        .insert([{ company_id, name, code, address, created_by: user.id }]);

      if (error) throw error;

      setSiteName("");
      setSiteCode("");
      setSiteAddress("");
      setStatus({ text: "Site created.", isError: false });
      await loadSites();
    } catch (e) {
      setStatus({ text: e?.message || String(e), isError: true });
    }
  }, [requireSession, siteCompany, siteName, siteCode, siteAddress, loadSites]);

  const onDeleteSite = useCallback(
    async (id) => {
      try {
        if (
          !window.confirm(
            "Delete this site? This may also delete related MHE assets/inspections if cascades are enabled."
          )
        )
          return;

        const user = await requireSession();
        if (!user) return;

        const { error } = await supabase.from("sites").delete().eq("id", id);
        if (error) throw error;

        setStatus({ text: "Site deleted.", isError: false });
        await loadSites();
      } catch (e) {
        setStatus({ text: e?.message || String(e), isError: true });
      }
    },
    [requireSession, loadSites]
  );

  useEffect(() => {
    (async () => {
      const user = await requireSession();
      if (!user) return;

      try {
        await reloadAll();
        setStatus({ text: "Ready.", isError: false });
      } catch (e) {
        setStatus({ text: e?.message || String(e), isError: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppLayout activeNav={activeNav} onSelectNav={onSelectNav} headerEmail={email}>
      <Card
        title="Company & site setup"
        subtitle="Create a company, then add sites under it."
        actions={
          <div className="wi-md-actions">
            <Button variant="primary" onClick={reloadAll}>
              Reload
            </Button>
          </div>
        }
      >
        <div className={status.isError ? "wi-md-status wi-md-status--error" : "wi-md-status"}>
          {status.text}
        </div>

        <div className="wi-md-two">
          <div className="wi-md-cardlet">
            <h3 className="wi-md-h3">Create company</h3>
            <label className="wi-md-label">Company name</label>
            <input
              className="wi-md-input"
              placeholder="e.g., XPO Logistics"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
            <div className="wi-md-right">
              <Button variant="primary" onClick={onCreateCompany}>
                Create company
              </Button>
            </div>
          </div>

          <div className="wi-md-cardlet">
            <h3 className="wi-md-h3">Create site</h3>

            <label className="wi-md-label">Company</label>
            <select
              className="wi-md-input"
              value={siteCompany}
              onChange={(e) => setSiteCompany(e.target.value)}
            >
              {companyOptions.length ? (
                companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {safe(c.name)}
                  </option>
                ))
              ) : (
                <option value="">No companies yet</option>
              )}
            </select>

            <div className="wi-md-twoInner">
              <div>
                <label className="wi-md-label">Site name</label>
                <input
                  className="wi-md-input"
                  placeholder="e.g., Daventry DC"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                />
              </div>
              <div>
                <label className="wi-md-label">Site code</label>
                <input
                  className="wi-md-input"
                  placeholder="e.g., DIRFT"
                  value={siteCode}
                  onChange={(e) => setSiteCode(e.target.value)}
                />
              </div>
            </div>

            <label className="wi-md-label">Address</label>
            <input
              className="wi-md-input"
              placeholder="Optional"
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
            />

            <div className="wi-md-right">
              <Button variant="primary" onClick={onCreateSite}>
                Create site
              </Button>
            </div>
          </div>
        </div>

        <hr className="wi-md-hr" />

        <h3 className="wi-md-h3">Sites</h3>
        <div className="wi-md-muted">You can delete sites here during development.</div>

        <div className="wi-md-tableWrap">
          <table className="wi-md-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Site</th>
                <th>Code</th>
                <th>Address</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sites.length ? (
                sites.map((s) => {
                  const c = companies.find((x) => x.id === s.company_id);
                  return (
                    <tr key={s.id}>
                      <td>{safe(c?.name)}</td>
                      <td>
                        <strong>{safe(s.name)}</strong>
                      </td>
                      <td>{safe(s.code)}</td>
                      <td>{safe(s.address)}</td>
                      <td className="num">
                        <Button variant="primary" onClick={() => onDeleteSite(s.id)}>
                          Delete
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="wi-md-muted" style={{ padding: 10 }}>
                    No sites yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AppLayout>
  );
}
