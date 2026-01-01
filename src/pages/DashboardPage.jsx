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

/**
 * IMPORTANT:
 * - We export BOTH named + default so main.jsx can import { DashboardPage } safely,
 *   while also allowing default import if you ever switch later.
 */
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

  /**
   * Robust auth handling:
   * - getUser() throws "Auth session missing!" when no session.
   * - We should treat that as "not signed in" and redirect to /login.
   */
  const loadUserAndAccount = useCallback(async () => {
    // Step 1: check session first (no throw)
    const { data: sessData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw sessErr;

    const session = sessData?.session || null;
    const u = session?.user || null;

    setUser(u);

    if (!u) {
      setAccountId("");
      // If your app requires auth for dashboard, push to login.
      // If you prefer a "public" dashboard shell, remove this navigate.
      navigate("/login", { replace: true });
      return;
    }

    // Step 2: pull account_id from public.users
    const { data: urow, error: uerr } = await supabase
      .from("users")
      .select("account_id")
      .eq("id", u.id)
      .single();

    if (uerr) throw uerr;
    setAccountId(urow?.account_id || "");
  }, [navigate]);

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

      // Determine initial selection
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
        const siteIds = companySites.map((s) => s.id);

        if (siteIds.length === 0) {
          setAlerts([]);
          return;
        }

        const { data: assets, error: assetsErr } = await supabase
          .from("mhe_assets")
          .select("id, site_id, asset_tag, type, status")
          .in("site_id", siteIds);

        if (assetsErr) throw assetsErr;

        const assetList = assets || [];
        if (assetList.length === 0) {
          setAlerts([]);
          return;
        }

        const assetIds = assetList.map((a) => a.id);

        const { data: inspRows, error: inspErr } = await supabase
          .from("mhe_inspections")
          .select("asset_id, inspection_type, next_due_date")
          .in("asset_id", assetIds);

        if (inspErr) throw inspErr;

        // Earliest next_due_date per asset
        const nextDueByAsset = new Map();
        for (const r of inspRows || []) {
          const due = toDateSafe(r.next_due_date);
          if (!due) continue;

          const existing = nextDueByAsset.get(r.asset_id);
          if (!existing || due.getTime() < existing.due.getTime()) {
            nextDueByAsset.set(r.asset_id, {
              due,
              inspectionType: r.inspection_type || "Inspection",
            });
          }
        }

        const today = new Date();
        const rows = [];

        // Build rows for overdue / due soon
        const siteById = new Map(companySites.map((s) => [s.id, s]));

        for (const a of assetList) {
          const nd = nextDueByAsset.get(a.id);
          if (!nd) continue;

          const days = daysBetween(today, nd.due);
          const status = days < 0 ? "overdue" : days <= 30 ? "due_soon" : "ok";
          if (status === "ok") continue;

          const site = siteById.get(a.site_id);

          rows.push({
            siteName: site?.name || "Unknown site",
            assetTag: a.asset_tag || "",
            type: a.type || "",
            nextDueType: nd.inspectionType,
            dueDate: nd.due.toISOString().slice(0, 10),
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

  // Initial load
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setPageErr("");
        await loadUserAndAccount();
        // If loadUserAndAccount redirected to /login, user will be null; still safe.
        await loadCompanies();
      } catch (e) {
        if (!alive) return;
        setPageErr(e?.message || "Failed to load dashboard.");
      }
    })();

    return () => {
      alive = false;
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

  const selectedCompany =
    companies.find((c) => c.id === selectedCompanyId) || null;

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
                Overdue and due within 30 days (earliest of Inspection / LOLER /
                Service / PUWER).
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                onClick={() =>
                  selectedCompanyId && loadEquipmentAlerts(selectedCompanyId)
                }
                disabled={!selectedCompanyId || loadingAlerts}
              >
                {loadingAlerts ? "Loading..." : "Reload"}
              </Button>
              <Button onClick={() => navigate("/mhe-setup")}>
                Open MHE setup
              </Button>
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
                      <td>{r.type}</td>
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
            Plan MHE and labour, track indirect time, and compare plan vs actual by
            shift.
          </div>
          <Button onClick={() => navigate("/scheduling-tool")}>
            Open scheduling tool
          </Button>
        </Card>
      </div>
    </AppLayout>
  );
}

export default DashboardPage;
