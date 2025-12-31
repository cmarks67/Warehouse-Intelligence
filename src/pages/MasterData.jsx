// src/pages/MasterData.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";
import supabase from "../lib/supabaseClient";

import "./MasterData.css";

export default function MasterData() {
  const [loading, setLoading] = useState(false);

  const [me, setMe] = useState(null); // row from public.users
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);

  const [companyName, setCompanyName] = useState("");

  const [siteCompanyId, setSiteCompanyId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [siteAddress, setSiteAddress] = useState("");

  const [status, setStatus] = useState({ text: "", isError: false });

  const membershipId = useMemo(() => me?.account_id ?? null, [me]);

  const setOk = (text) => setStatus({ text, isError: false });
  const setErr = (text) => setStatus({ text, isError: true });

  const loadMe = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;

    if (!uid) {
      setMe(null);
      setErr("You are not signed in.");
      return null;
    }

    const { data, error } = await supabase
      .from("users")
      .select("id,email,full_name,role,account_type,account_id,is_active")
      .eq("id", uid)
      .maybeSingle();

    if (error) {
      setMe(null);
      setErr(`Failed to load user profile: ${error.message}`);
      return null;
    }

    if (!data) {
      setMe(null);
      setErr("No row found in public.users for this auth user.");
      return null;
    }

    setMe(data);

    if (!data.account_id) {
      setErr(
        "Your user has no membership (users.account_id is NULL). Set it before using Companies/Sites."
      );
    } else {
      setStatus({ text: "", isError: false });
    }

    return data;
  }, []);

  const loadCompanies = useCallback(
    async (acctId) => {
      if (!acctId) {
        setCompanies([]);
        return;
      }

      const { data, error } = await supabase
        .from("companies")
        .select("id,name,created_at,created_by,account_id")
        .order("created_at", { ascending: false });

      // RLS should filter by account_id; this query assumes policies are correct.
      if (error) {
        setCompanies([]);
        setErr(error.message);
        return;
      }

      // Defensive filter in case policies were temporarily disabled earlier
      const filtered = (data ?? []).filter((r) => r.account_id === acctId);
      setCompanies(filtered);

      // keep dropdown sensible
      if (!siteCompanyId && filtered.length) {
        setSiteCompanyId(filtered[0].id);
      }
    },
    [siteCompanyId]
  );

  const loadSites = useCallback(async (acctId) => {
    if (!acctId) {
      setSites([]);
      return;
    }

    const { data, error } = await supabase
      .from("sites")
      .select("id,name,code,address,company_id,account_id,companies(name)")
      .order("created_at", { ascending: false });

    if (error) {
      setSites([]);
      setErr(error.message);
      return;
    }

    const filtered = (data ?? []).filter((r) => r.account_id === acctId);
    setSites(filtered);
  }, []);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    try {
      const u = await loadMe();
      const acctId = u?.account_id ?? null;
      await Promise.all([loadCompanies(acctId), loadSites(acctId)]);
    } finally {
      setLoading(false);
    }
  }, [loadCompanies, loadMe, loadSites]);

  useEffect(() => {
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createCompany = async () => {
    const name = companyName.trim();
    if (!name) return setErr("Enter a company name.");
    if (!me?.id) return setErr("Not signed in.");
    if (!membershipId) return setErr("No membership set on this user (users.account_id).");

    setLoading(true);
    setStatus({ text: "", isError: false });

    // IMPORTANT: include account_id and created_by so RLS passes and row is correctly tenanted
    const { error } = await supabase.from("companies").insert({
      name,
      created_by: me.id,
      account_id: membershipId,
    });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    setCompanyName("");
    setOk("Company created. Next step: create sites under the company.");
    await loadCompanies(membershipId);
    setLoading(false);
  };

  const createSite = async () => {
    if (!me?.id) return setErr("Not signed in.");
    if (!membershipId) return setErr("No membership set on this user (users.account_id).");

    const companyId = siteCompanyId;
    const name = siteName.trim();
    const code = siteCode.trim();

    if (!companyId) return setErr("Select a company.");
    if (!name) return setErr("Enter a site name.");

    setLoading(true);
    setStatus({ text: "", isError: false });

    const { error } = await supabase.from("sites").insert({
      company_id: companyId,
      name,
      code: code || null,
      address: siteAddress.trim() || null,
      created_by: me.id,
      account_id: membershipId,
    });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    setSiteName("");
    setSiteCode("");
    setSiteAddress("");
    setOk("Site created.");
    await loadSites(membershipId);
    setLoading(false);
  };

  const deleteSite = async (id) => {
    // optional: keep/remove. RLS will enforce tenant and permissions.
    const { error } = await supabase.from("sites").delete().eq("id", id);
    if (error) return setErr(error.message);
    setOk("Site deleted.");
    await loadSites(membershipId);
  };

  return (
    <AppLayout>
      <div className="wi-md">
        <div className="wi-md__headerRow">
          <div>
            <h1 className="wi-md__title">Company &amp; site setup</h1>
            <div className="wi-md__sub">
              Create a company, then add sites under it.
              {membershipId ? (
                <>
                  {" "}
                  Membership: <span className="wi-md__mono">{membershipId}</span>
                </>
              ) : null}
            </div>
          </div>

          <Button onClick={reloadAll} disabled={loading}>
            Reload
          </Button>
        </div>

        {status.text ? (
          <div className={`wi-md__status ${status.isError ? "is-error" : "is-ok"}`}>
            {status.text}
          </div>
        ) : null}

        <div className="wi-md__grid">
          <Card>
            <div className="wi-md__cardTitle">Create company</div>

            <label className="wi-md__label">Company name</label>
            <input
              className="wi-md__input"
              type="text"
              placeholder="e.g., XPO"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />

            <div className="wi-md__actions">
              <Button onClick={createCompany} disabled={loading}>
                Create company
              </Button>
            </div>

            <div className="wi-md__hint">
              Next step: <strong>Sites</strong> — create one or more sites under the company.
            </div>
          </Card>

          <Card>
            <div className="wi-md__cardTitle">Create site</div>

            <label className="wi-md__label">Company</label>
            <select
              className="wi-md__input"
              value={siteCompanyId}
              onChange={(e) => setSiteCompanyId(e.target.value)}
            >
              <option value="">{companies.length ? "Select company" : "No companies yet"}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <div className="wi-md__row2">
              <div>
                <label className="wi-md__label">Site name</label>
                <input
                  className="wi-md__input"
                  type="text"
                  placeholder="e.g., Daventry DC"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                />
              </div>

              <div>
                <label className="wi-md__label">Site code</label>
                <input
                  className="wi-md__input"
                  type="text"
                  placeholder="e.g., DIRFT"
                  value={siteCode}
                  onChange={(e) => setSiteCode(e.target.value)}
                />
              </div>
            </div>

            <label className="wi-md__label">Address (optional)</label>
            <input
              className="wi-md__input"
              type="text"
              placeholder="e.g., NN11 0XG"
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
            />

            <div className="wi-md__actions">
              <Button onClick={createSite} disabled={loading}>
                Create site
              </Button>
            </div>
          </Card>
        </div>

        <Card>
          <div className="wi-md__cardTitle">Sites</div>

          <div className="wi-md__tableWrap">
            <table className="wi-md__table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Site</th>
                  <th>Code</th>
                  <th>Address</th>
                  <th className="wi-md__thRight">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id}>
                    <td>{s.companies?.name ?? "-"}</td>
                    <td>{s.name}</td>
                    <td>{s.code ?? ""}</td>
                    <td>{s.address ?? ""}</td>
                    <td className="wi-md__tdRight">
                      <Button onClick={() => deleteSite(s.id)} disabled={loading}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}

                {!sites.length ? (
                  <tr>
                    <td colSpan={5} className="wi-md__empty">
                      No sites yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
