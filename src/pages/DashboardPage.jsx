import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";

import { createClient } from "@supabase/supabase-js";
import "./Dashboard.css";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function daysBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function toDateSafe(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function Dashboard() {
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

  // DEBUG STATE (visible in UI)
  const [dbg, setDbg] = useState({
    step: "init",
    userEmail: "",
    userId: "",
    accountId: "",
    session: "unknown", // yes/no/unknown
    companiesCount: 0,
    selectedCompanyId: "",
    lastCompanyErr: "",
    lastPageErr: "",
    lastAlertsErr: "",
    ts: "",
  });

  const stampDbg = useCallback((patch) => {
    setDbg((prev) => ({
      ...prev,
      ...patch,
      ts: new Date().toISOString(),
    }));
  }, []);

  const storageKey = useMemo(() => {
    // user-specific so one mobile browser can switch users safely
    const uid = user?.id || "anon";
    return `wi.selectedCompanyId.${uid}`;
  }, [user?.id]);

  const loadUserAndAccount = useCallback(async () => {
    stampDbg({ step: "loadUserAndAccount:start" });

    // Confirm session exists (helps diagnose race conditions)
    const { data: sessData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) {
      stampDbg({ step: "loadUserAndAccount:sessionError" });
      throw sessErr;
    }

    const hasSession = !!sessData?.session;
    stampDbg({ session: hasSession ? "yes" : "no" });

    const { data, error } = await supabase.auth.getUser();
    if (error) {
      stampDbg({ step: "loadUserAndAccount:getUserError" });
      throw error;
    }

    const u = data?.user || null;
    setUser(u);

    stampDbg({
      step: "loadUserAndAccount:gotUser",
      userEmail: u?.email || "",
      userId: u?.id || "",
    });

    if (!u) {
      setAccountId("");
      stampDbg({ step: "loadUserAndAccount:noUser", accountId: "" });
      return;
    }

    // Pull account_id from your public.users row (same pattern as my_account_id())
    const { data: urow, error: uerr } = await supabase
      .from("users")
      .select("account_id")
      .eq("id", u.id)
      .single();

    if (uerr) {
      stampDbg({ step: "loadUserAndAccount:usersTableError" });
      throw uerr;
    }

    const aid = urow?.account_id || "";
    setAccountId(aid);

    stampDbg({ step: "loadUserAndAccount:done", accountId: aid });
  }, [stampDbg]);

  const loadCompanies = useCallback(async () => {
    stampDbg({ step: "loadCompanies:start" });

    setLoadingCompanies(true);
    setCompanyErr("");

    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, created_at")
        .order("name", { ascending: true });

      stampDbg({
        step: "loadCompanies:response",
        companiesCount: Array.isArray(data) ? data.length : 0,
      });

      if (error) throw error;

      const list = data || [];
      setCompanies(list);

      // Determine initial selection
      const saved = localStorage.getItem(storageKey) || "";
      const savedExists = saved && list.some((c) => c.id === saved);
      const initial = savedExists ? saved : list[0]?.id || "";

      setSelectedCompanyId(initial);
      stampDbg({ selectedCompanyId: initial });

      if (initial) localStorage.setItem(storageKey, initial);

      stampDbg({ step: "loadCompanies:done" });
    } catch (e) {
      setCompanies([]);
      setSelectedCompanyId("");

      const msg = e?.message || "Failed to load companies.";
      setCompanyErr(msg);

      stampDbg({
        step: "loadCompanies:error",
        lastCompanyErr: msg,
      });
    } finally {
      setLoadingCompanies(false);
      stampDbg({ step: "loadCompanies:finally" });
    }
  }, [storageKey, stampDbg]);

  const loadSitesForCompany = useCallback(
    async (companyId) => {
      stampDbg({ step: "loadSitesForCompany:start" });

      if (!companyId) {
        setSites([]);
        stampDbg({ step: "loadSitesForCompany:noCompany" });
        return [];
      }

      const { data, error } = await supabase
        .from("sites")
        .select("id, company_id, name, code")
        .eq("company_id", companyId)
        .order("name", { ascending: true });

      if (error) {
        stampDbg({ step: "loadSitesForCompany:error" });
        throw error;
      }

      const list = data || [];
      setSites(list);

      stampDbg({
        step: "loadSitesForCompany:done",
      });

      return list;
    },
    [stampDbg]
  );

  const loadEquipmentAlerts = useCallback(
    async (companyId) => {
      stampDbg({ step: "loadEquipmentAlerts:start" });

      if (!companyId) return;

      setLoadingAlerts(true);
      setPageErr("");

      try {
        const companySites = await loadSitesForCompany(companyId);
        const siteIds = companySites.map((s) => s.id);

        if (siteIds.length === 0) {
          setAlerts([]);
          stampDbg({ step: "loadEquipmentAlerts:noSites" });
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
          stampDbg({ step: "loadEquipmentAlerts:noAssets" });
          return;
        }

        const assetIds = assetList.map((a) => a.id);

        const { data: inspRows, error: inspErr } = await supabase
          .from("mhe_inspections")
          .select("asset_id, inspection_type, next_due_date")
          .in("asset_id", assetIds);

        if (inspErr) throw inspErr;

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

        for (const a of assetList) {
          const nd = nextDueByAsset.get(a.id);
          if (!nd) continue;

          const days = daysBetween(today, nd.due);
          const status = days < 0 ? "overdue" : days <= 30 ? "due_soon" : "ok";
          if (status === "ok") continue;

          const site = companySites.find((s) => s.id === a.site_id);
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

        stampDbg({
          step: "loadEquipmentAlerts:done",
          lastAlertsErr: "",
        });
      } catch (e) {
        setAlerts([]);
        const msg = e?.message || "Failed to load equipment alerts.";
        setPageErr(msg);

        stampDbg({
          step: "loadEquipmentAlerts:error",
          lastAlertsErr: msg,
        });
      } finally {
        setLoadingAlerts(false);
        stampDbg({ step: "loadEquipmentAlerts:finally" });
      }
    },
    [loadSitesForCompany, stampDbg]
  );

  // Initial load
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setPageErr("");
        stampDbg({ step: "initialLoad:start" });

        await loadUserAndAccount();
        if (!alive) return;

        await loadCompanies();
        if (!alive) return;

        stampDbg({ step: "initialLoad:done" });
      } catch (e) {
        if (!alive) return;

        const msg = e?.message || "Failed to load dashboard.";
        setPageErr(msg);

        stampDbg({
          step: "initialLoad:error",
          lastPageErr: msg,
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, [loadUserAndAccount, loadCompanies, stampDbg]);

  // When company changes
  useEffect(() => {
    if (!selectedCompanyId) return;

    localStorage.setItem(storageKey, selectedCompanyId);
    stampDbg({ selectedCompanyId });

    loadEquipmentAlerts(selectedCompanyId);
  }, [selectedCompanyId, storageKey, loadEquipmentAlerts, stampDbg]);

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

        {/* DEBUG CARD (remove once resolved) */}
        <Card>
          <div className="wi-card__title">Debug</div>
          <div className="wi-muted">Step: {dbg.step}</div>
          <div className="wi-muted">Timestamp: {dbg.ts}</div>
          <div className="wi-muted">Session: {dbg.session}</div>
          <div className="wi-muted">User: {dbg.userEmail || "—"}</div>
          <div className="wi-muted">User ID: {dbg.userId || "—"}</div>
          <div className="wi-muted">Account ID: {dbg.accountId || accountId || "—"}</div>
          <div className="wi-muted">Companies count: {dbg.companiesCount}</div>
          <div className="wi-muted">Selected company: {dbg.selectedCompanyId || selectedCompanyId || "—"}</div>
          {dbg.lastCompanyErr ? (
            <div className="wi-error">Companies error: {dbg.lastCompanyErr}</div>
          ) : null}
          {dbg.lastPageErr ? (
            <div className="wi-error">Page error: {dbg.lastPageErr}</div>
          ) : null}
          {dbg.lastAlertsErr ? (
            <div className="wi-error">Alerts error: {dbg.lastAlertsErr}</div>
          ) : null}
        </Card>

        <Card>
          <div className="wi-card__titleRow">
            <div>
              <div className="wi-card__title">Company</div>
              <div className="wi-card__sub">
                Select a company to view data across all sites under that
                company.
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
                      className={
                        r.status === "overdue" ? "wi-row--bad" : "wi-row--warn"
                      }
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
            Plan MHE and labour, track indirect time, and compare plan vs actual
            by shift.
          </div>
          <Button onClick={() => navigate("/scheduling-tool")}>
            Open scheduling tool
          </Button>
        </Card>
      </div>
    </AppLayout>
  );
}
