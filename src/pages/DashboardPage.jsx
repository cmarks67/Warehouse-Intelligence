// src/pages/DashboardPage.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";

import supabase from "../lib/supabaseClient";
import "./Dashboard.css";

function daysBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function toDateSafe(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// IMPORTANT: declare ONLY ONCE
function withTimeout(promise, ms, label = "request") {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

// Your schema stores due dates on mhe_assets, so pick earliest from those columns
function pickEarliestDue(asset) {
  const candidates = [
    { key: "Inspection", date: toDateSafe(asset.next_inspection_due) },
    { key: "LOLER", date: toDateSafe(asset.next_loler_due) },
    { key: "Service", date: toDateSafe(asset.next_service_due) },
    { key: "PUWER", date: toDateSafe(asset.next_puwer_due) },
  ].filter((x) => !!x.date);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.date.getTime() - b.date.getTime());
  return candidates[0]; // { key, date }
}

export function DashboardPage() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [accountId, setAccountId] = useState("");

  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  const [sites, setSites] = useState([]);

  const [alerts, setAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [companyErr, setCompanyErr] = useState("");

  const [pageErr, setPageErr] = useState("");

  const storageKey = useMemo(() => {
    const uid = user?.id || "anon";
    return `wi.selectedCompanyId.${uid}`;
  }, [user?.id]);

  const loadUserAndAccount = useCallback(async () => {
    // Use session so it works reliably on refresh
    const { data: sess, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw sessErr;

    const u = sess?.session?.user || null;
    setUser(u);

    if (!u) {
      setAccountId("");
      return;
    }

    const { data: urow, error: uerr } = await supabase
      .from("users")
      .select("account_id")
      .eq("id", u.id)
      .single();

    if (uerr) throw uerr;
    setAccountId(urow?.account_id || "");
  }, []);

  const loadCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    setCompanyErr("");
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, created_at")
        .order("name", { ascending: true });

      if (error) throw error;

      const list = data || [];
      setCompanies(list);

      const saved = localStorage.getItem(storageKey) || "";
      const savedExists = saved && list.some((c) => c.id === saved);
      const initial = savedExists ? saved : list[0]?.id || "";

      setSelectedCompanyId(initial);
      if (initial) localStorage.setItem(storageKey, initial);
    } catch (e) {
      setCompanies([]);
      setSelectedCompanyId("");
      setCompanyErr(e?.message || "Failed to load companies.");
    } finally {
      setLoadingCompanies(false);
    }
  }, [storageKey]);

  const loadSitesForCompany = useCallback(async (companyId) => {
    if (!companyId) {
      setSites([]);
      return [];
    }

    const { data, error } = await supabase
      .from("sites")
      .select("id, company_id, name, code")
      .eq("company_id", companyId)
      .order("name", { ascending: true });

    if (error) throw error;

    const list = data || [];
    setSites(list);
    return list;
  }, []);

  const loadEquipmentAlerts = useCallback(
    async (companyId) => {
      if (!companyId) return;

      setLoadingAlerts(true);
      setPageErr("");

      try {
        const companySites = await loadSitesForCompany(companyId);
        const siteIds = (companySites || []).map((s) => s.id);

        if (siteIds.length === 0) {
          setAlerts([]);
          return;
        }

        // OPTION B (Robust):
        // Due dates are stored on mhe_assets (per your schema).
        // Join mhe_types via the explicit FK constraint name to avoid relationship naming issues.
        const { data: assets, error: assetsErr } = await withTimeout(
          supabase
            .from("mhe_assets")
            .select(
              `
              id,
              site_id,
              asset_tag,
              status,
              next_inspection_due,
              next_loler_due,
              next_service_due,
              next_puwer_due,
              mhe_types:mhe_types!mhe_assets_mhe_type_id_fkey (
                type_name
              )
            `
            )
            .in("site_id", siteIds),
          12000,
          "mhe_assets select"
        );

        if (assetsErr) throw assetsErr;

        const assetList = assets || [];
        if (assetList.length === 0) {
          setAlerts([]);
          return;
        }

        const today = new Date();
        const rows = [];

        for (const a of assetList) {
          // If you later add statuses like retired, you can filter here
          // if (a.status && a.status !== "active") continue;

          const earliest = pickEarliestDue(a);
          if (!earliest) continue;

          const days = daysBetween(today, earliest.date);
          const status = days < 0 ? "overdue" : days <= 30 ? "due_soon" : "ok";
          if (status === "ok") continue;

          const site = companySites.find((s) => s.id === a.site_id);

          // relation can be object or array depending on PostgREST shape
          let typeName = "";
          const rel = a.mhe_types;
          if (rel) {
            if (Array.isArray(rel)) typeName = rel[0]?.type_name || "";
            else typeName = rel?.type_name || "";
          }

          rows.push({
            siteName: site?.name || "Unknown site",
            assetTag: a.asset_tag || "",
            typeName: typeName || "",
            nextDueType: earliest.key,
            dueDate: earliest.date.toISOString().slice(0, 10),
            days,
            status,
          });
        }

        rows.sort((x, y) => {
          const sx = x.status === "overdue" ? 0 : 1;
          const sy = y.status === "overdue" ? 0 : 1;
          if (sx !== sy) return sx - sy;
          return x.days - y.days;
        });

        setAlerts(rows);
      } catch (e) {
        setAlerts([]);
        setPageErr(e?.message || "Failed to load equipment alerts.");
      } finally {
        setLoadingAlerts(false);
      }
    },
    [loadSitesForCompany]
  );

  // Initial load + keep session in sync (prevents “Auth session missing” on refresh)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setPageErr("");
        await loadUserAndAccount();
        await loadCompanies();
      } catch (e) {
        if (!alive) return;
        setPageErr(e?.message || "Failed to load dashboard.");
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!alive) return;

      const u = session?.user || null;
      setUser(u);

      if (!u) {
        setAccountId("");
        setCompanies([]);
        setSelectedCompanyId("");
        setSites([]);
        setAlerts([]);
        return;
      }

      try {
        const { data: urow, error: uerr } = await supabase
          .from("users")
          .select("account_id")
          .eq("id", u.id)
          .single();
        if (!uerr) setAccountId(urow?.account_id || "");
      } catch {
        // ignore
      }
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [loadUserAndAccount, loadCompanies]);

  // When company changes
  useEffect(() => {
    if (!selectedCompanyId) return;
    localStorage.setItem(storageKey, selectedCompanyId);
    loadEquipmentAlerts(selectedCompanyId);
  }, [selectedCompanyId, storageKey, loadEquipmentAlerts]);

  const resetCompanySelection = async () => {
    localStorage.removeItem(storageKey);
    await loadCompanies();
  };

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || null;

  return (
    <AppLayout>
      <div className="wi-page">
        <Card>
          <div className="wi-card__title">Account</div>
          <div className="wi-muted">Account scope</div>
          <div className="wi-muted">Account ID: {accountId || "—"}</div>
          <div className="wi-muted">Signed in as: {user?.email || "—"}</div>
        </Card>

        <Card>
          <div className="wi-card__titleRow">
            <div>
              <div className="wi-card__title">Company</div>
              <div className="wi-card__sub">
                Select a company to view data across all sites under that company.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={loadCompanies} disabled={loadingCompanies}>
                Reload
              </Button>
              <Button onClick={resetCompanySelection} disabled={loadingCompanies}>
                Reset
              </Button>
            </div>
          </div>

          {companyErr && <div className="wi-error">{companyErr}</div>}

          <div className="wi-formRow">
            <label className="wi-label">Company</label>
            <select
              className="wi-select"
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              disabled={loadingCompanies}
            >
              {loadingCompanies ? (
                <option value="">Loading...</option>
              ) : companies.length === 0 ? (
                <option value="">No companies visible</option>
              ) : (
                companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {selectedCompany && (
            <div className="wi-muted">
              Showing: {selectedCompany.name} (sites: {sites.length})
            </div>
          )}
        </Card>

        {pageErr && <div className="wi-error">{pageErr}</div>}

        <Card>
          <div className="wi-card__titleRow">
            <div>
              <div className="wi-card__title">Equipment alerts</div>
              <div className="wi-card__sub">
                Overdue and due within 30 days (earliest of Inspection / LOLER / Service / PUWER).
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                onClick={() => selectedCompanyId && loadEquipmentAlerts(selectedCompanyId)}
                disabled={!selectedCompanyId || loadingAlerts}
              >
                {loadingAlerts ? "Loading..." : "Reload"}
              </Button>
              <Button onClick={() => navigate("/mhe-setup")}>Open MHE setup</Button>
            </div>
          </div>

          {!selectedCompanyId ? (
            <div className="wi-muted">Select a company to view alerts.</div>
          ) : loadingAlerts ? (
            <div className="wi-muted">Loading...</div>
          ) : alerts.length === 0 ? (
            <div className="wi-muted">No items due within 30 days. Good position.</div>
          ) : (
            <div className="wi-tableWrap">
              <table className="wi-table">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Asset tag</th>
                    <th>Type</th>
                    <th>Next due</th>
                    <th>Due date</th>
                    <th>Days</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((r, idx) => (
                    <tr
                      key={idx}
                      className={r.status === "overdue" ? "wi-row--bad" : "wi-row--warn"}
                    >
                      <td>{r.siteName}</td>
                      <td>{r.assetTag}</td>
                      <td>{r.typeName || "—"}</td>
                      <td>{r.nextDueType}</td>
                      <td>{r.dueDate}</td>
                      <td>{r.days}</td>
                      <td>{r.status === "overdue" ? "overdue" : "due soon"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <div className="wi-card__title">Scheduling tool</div>
          <div className="wi-card__sub">
            Plan MHE and labour, track indirect time, and compare plan vs actual by shift.
          </div>
          <Button onClick={() => navigate("/scheduling-tool")}>Open scheduling tool</Button>
        </Card>
      </div>
    </AppLayout>
  );
}

// Keep both exports so main.jsx can import either named or default safely
export default DashboardPage;
