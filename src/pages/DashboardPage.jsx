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

const CERT_BUCKET = "mhe-certificates";

function fileNameFromPath(p) {
  if (!p) return "certificate";
  const last = String(p).split("/").pop() || "certificate";
  const idx = last.indexOf("_");
  return idx > 0 ? last.slice(idx + 1) : last;
}

export function DashboardPage() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [accountId, setAccountId] = useState("");

  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  const [sites, setSites] = useState([]);

  // Equipment alerts
  const [alerts, setAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  // Company load
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [companyErr, setCompanyErr] = useState("");

  // Page errors
  const [pageErr, setPageErr] = useState("");

  // Dashboard tabs
  const [dashTab, setDashTab] = useState("alerts"); // alerts | analytics

  // MHE summaries
  const [mheDueRows, setMheDueRows] = useState([]);
  const [mheMissingRows, setMheMissingRows] = useState([]);
  const [loadingMhe, setLoadingMhe] = useState(false);
  const [mheErr, setMheErr] = useState("");

  // Collapsible + order
  const [collapsed, setCollapsed] = useState({});
  const [sections, setSections] = useState([]);

  const storageKey = useMemo(() => {
    const uid = user?.id || "anon";
    return `wi.selectedCompanyId.${uid}`;
  }, [user?.id]);

  const layoutKey = useMemo(() => {
    const uid = user?.id || "anon";
    return `wi.dashboard.layout.${uid}`;
  }, [user?.id]);

  // Load saved layout state (once per user)
  useEffect(() => {
    const raw = localStorage.getItem(layoutKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.sections) && parsed.sections.length) setSections(parsed.sections);
      if (parsed.collapsed && typeof parsed.collapsed === "object") setCollapsed(parsed.collapsed);
    } catch {
      // ignore
    }
  }, [layoutKey]);

  // Persist layout
  useEffect(() => {
    if (!sections.length) return;
    localStorage.setItem(layoutKey, JSON.stringify({ sections, collapsed }));
  }, [sections, collapsed, layoutKey]);

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

    const { data: urow, error: uerr } = await supabase.from("users").select("account_id").eq("id", u.id).single();
    if (uerr) throw uerr;

    setAccountId(urow?.account_id || "");
  }, []);

  const loadCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    setCompanyErr("");
    try {
      const { data, error } = await supabase.from("companies").select("id, name, created_at").order("name", {
        ascending: true,
      });

      if (error) throw error;

      const list = data || [];
      setCompanies(list);

      const saved = localStorage.getItem(storageKey) || "";
      const savedExists = saved && list.some((c) => c.id === saved);
      const initial = savedExists ? saved : list[0]?.id || "";

      setSelectedCompanyId(initial);
      if (initial) localStorage.setItem(storageKey, initial);

      // Default section order ONLY if no saved order
      setSections((prev) => {
        if (prev && prev.length) return prev;
        return ["account", "company", "mhe_due", "mhe_missing", "equipment", "scheduling"];
      });
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

  // Certificates (same behaviour as MHE Training)
  const getSignedCertUrl = useCallback(async (path, expiresIn = 300) => {
    if (!path) throw new Error("No certificate path found.");
    const { data, error } = await supabase.storage.from(CERT_BUCKET).createSignedUrl(path, expiresIn);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("Could not generate certificate URL.");
    return data.signedUrl;
  }, []);

  const viewCertificate = useCallback(
    async (path) => {
      const url = await getSignedCertUrl(path, 300);
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [getSignedCertUrl]
  );

  const downloadCertificate = useCallback(
    async (path) => {
      const url = await getSignedCertUrl(path, 300);

      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to download certificate file.");

      const blob = await res.blob();
      const objUrl = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = objUrl;
      a.download = fileNameFromPath(path);
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(objUrl);
    },
    [getSignedCertUrl]
  );

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
          const earliest = pickEarliestDue(a);
          if (!earliest) continue;

          const days = daysBetween(today, earliest.date);
          const status = days < 0 ? "overdue" : days <= 30 ? "due_soon" : "ok";
          if (status === "ok") continue;

          const site = companySites.find((s) => s.id === a.site_id);

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

  // NEW: MHE summaries - robust (no reliance on relationship naming)
  const loadMheSummaries = useCallback(
    async (companyId) => {
      if (!companyId) return;

      setLoadingMhe(true);
      setMheErr("");

      try {
        const companySites = await loadSitesForCompany(companyId);
        const siteIds = (companySites || []).map((s) => s.id);

        if (!siteIds.length) {
          setMheDueRows([]);
          setMheMissingRows([]);
          return;
        }

        // 1) Base authorisations rows (ACTIVE only)
        const { data: auths, error: aErr } = await withTimeout(
          supabase
            .from("colleague_mhe_authorisations")
            .select("id, site_id, colleague_id, mhe_type_id, trained_on, expires_on, status, certificate_path")
            .in("site_id", siteIds)
            .eq("status", "ACTIVE"),
          12000,
          "mhe auths select"
        );

        if (aErr) throw aErr;

        const list = auths || [];
        if (!list.length) {
          setMheDueRows([]);
          setMheMissingRows([]);
          return;
        }

        // 2) Load colleagues for those ids
        const colleagueIds = Array.from(new Set(list.map((r) => r.colleague_id).filter(Boolean)));
        const typeIds = Array.from(new Set(list.map((r) => r.mhe_type_id).filter(Boolean)));

        const [{ data: colleagues, error: cErr }, { data: types, error: tErr }] = await Promise.all([
          colleagueIds.length
            ? supabase
                .from("colleagues")
                .select("id, first_name, last_name, employment_type, active")
                .in("id", colleagueIds)
            : Promise.resolve({ data: [], error: null }),
          typeIds.length ? supabase.from("mhe_types").select("id, type_name").in("id", typeIds) : Promise.resolve({ data: [], error: null }),
        ]);

        if (cErr) throw cErr;
        if (tErr) throw tErr;

        const colleagueMap = new Map((colleagues || []).map((c) => [c.id, c]));
        const typeMap = new Map((types || []).map((t) => [t.id, t]));

        const today = new Date();
        const dueRows = [];
        const missingRows = [];

        for (const r of list) {
          const c = colleagueMap.get(r.colleague_id);
          const t = typeMap.get(r.mhe_type_id);

          const colleagueName = `${c?.last_name || ""}, ${c?.first_name || ""}`.trim() || "—";
          const employmentType = c?.employment_type || "";
          const mheType = t?.type_name || "—";

          const dueDt = toDateSafe(r.expires_on);
          const days = dueDt ? daysBetween(today, dueDt) : null;

          const hasCert = !!r.certificate_path;

          // Missing cert: ACTIVE and no certificate_path
          if (!hasCert) {
            missingRows.push({
              id: r.id,
              colleagueName,
              employmentType,
              mheType,
              trainedOn: r.trained_on || "—",
              due: r.expires_on || "",
              days,
            });
          }

          // Due soon / overdue:
          // - include missing due date (outstanding)
          // - include days <= 30
          const isOutstanding = days == null ? true : days <= 30;
          if (isOutstanding) {
            dueRows.push({
              id: r.id,
              colleagueName,
              employmentType,
              mheType,
              trainedOn: r.trained_on || "—",
              due: r.expires_on || "",
              days,
              certificatePath: r.certificate_path || "",
            });
          }
        }

        // Sort due rows: overdue first (more negative), then nearest
        dueRows.sort((a, b) => {
          const ax = a.days == null ? -999999 : a.days;
          const bx = b.days == null ? -999999 : b.days;
          return ax - bx;
        });

        // Sort missing rows: name
        missingRows.sort((a, b) => String(a.colleagueName).localeCompare(String(b.colleagueName)));

        setMheDueRows(dueRows);
        setMheMissingRows(missingRows);
      } catch (e) {
        setMheDueRows([]);
        setMheMissingRows([]);
        setMheErr(e?.message || "Failed to load MHE summaries.");
      } finally {
        setLoadingMhe(false);
      }
    },
    [loadSitesForCompany]
  );

  // Initial load + keep session in sync
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
        setMheDueRows([]);
        setMheMissingRows([]);
        return;
      }

      try {
        const { data: urow, error: uerr } = await supabase.from("users").select("account_id").eq("id", u.id).single();
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
    loadMheSummaries(selectedCompanyId);
  }, [selectedCompanyId, storageKey, loadEquipmentAlerts, loadMheSummaries]);

  const resetCompanySelection = async () => {
    localStorage.removeItem(storageKey);
    await loadCompanies();
  };

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || null;

  // Drag & drop reorder
  const onDragStart = (e, key) => {
    e.dataTransfer.setData("wi.section", key);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = (e, targetKey) => {
    e.preventDefault();
    const sourceKey = e.dataTransfer.getData("wi.section");
    if (!sourceKey || sourceKey === targetKey) return;

    setSections((prev) => {
      const next = [...(prev || [])];
      const from = next.indexOf(sourceKey);
      const to = next.indexOf(targetKey);
      if (from < 0 || to < 0) return prev;
      next.splice(from, 1);
      next.splice(to, 0, sourceKey);
      return next;
    });
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const toggleCollapse = (key) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderCardShell = (key, title, subtitle, rightActions, body) => {
    const isCollapsed = !!collapsed[key];

    return (
      <div className="wi-dragWrap" draggable onDragStart={(e) => onDragStart(e, key)} onDragOver={onDragOver} onDrop={(e) => onDrop(e, key)}>
        <Card>
          <div className="wi-card__titleRow">
            <div>
              <div className="wi-card__title">{title}</div>
              {subtitle ? <div className="wi-card__sub">{subtitle}</div> : null}
            </div>

            <div className="wi-card__actionsRight">
              {rightActions}
              {/* Minimise ALWAYS present */}
              <button
                type="button"
                className="wi-minBtn"
                aria-label={isCollapsed ? "Expand" : "Minimise"}
                title={isCollapsed ? "Expand" : "Minimise"}
                onClick={() => toggleCollapse(key)}
              >
                –
              </button>
            </div>
          </div>

          {!isCollapsed ? body : null}
        </Card>
      </div>
    );
  };

  const mheDueBody = (
    <>
      {mheErr ? <div className="wi-error">{mheErr}</div> : null}

      {!selectedCompanyId ? (
        <div className="wi-muted">Select a company to view training.</div>
      ) : loadingMhe ? (
        <div className="wi-muted">Loading...</div>
      ) : mheDueRows.length === 0 ? (
        <div className="wi-muted">No training due soon or overdue. Good position.</div>
      ) : (
        <div className="wi-tableWrap">
          <table className="wi-table">
            <thead>
              <tr>
                <th>Colleague</th>
                <th>MHE type</th>
                <th>Trained on</th>
                <th>Training due</th>
                <th>Days</th>
                <th>Certificate</th>
              </tr>
            </thead>
            <tbody>
              {mheDueRows.map((r) => (
                <tr key={r.id} className={r.days == null || r.days <= 30 ? "wi-row--warn" : ""}>
                  <td>
                    {r.colleagueName} {r.employmentType ? <span className="wi-muted">({r.employmentType})</span> : null}
                  </td>
                  <td>{r.mheType || "—"}</td>
                  <td>{r.trainedOn || "—"}</td>
                  <td>{r.due || "—"}</td>
                  <td>{r.days == null ? "—" : r.days}</td>
                  <td>
                    {r.certificatePath ? (
                      <span className="wi-certHover">
                        <span className="wi-certYes">Yes</span>
                        <span className="wi-certPop">
                          <button type="button" className="wi-certPopLink" onClick={() => viewCertificate(r.certificatePath)}>
                            View
                          </button>
                          <span className="wi-certSep">•</span>
                          <button type="button" className="wi-certPopLink" onClick={() => downloadCertificate(r.certificatePath)}>
                            Download
                          </button>
                        </span>
                      </span>
                    ) : (
                      "No"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  const mheMissingBody = (
    <>
      {mheErr ? <div className="wi-error">{mheErr}</div> : null}

      {!selectedCompanyId ? (
        <div className="wi-muted">Select a company to view missing certificates.</div>
      ) : loadingMhe ? (
        <div className="wi-muted">Loading...</div>
      ) : mheMissingRows.length === 0 ? (
        <div className="wi-muted">No missing certificates. Good position.</div>
      ) : (
        <div className="wi-tableWrap">
          <table className="wi-table">
            <thead>
              <tr>
                <th>Colleague</th>
                <th>MHE type</th>
                <th>Trained on</th>
                <th>Training due</th>
                <th>Days</th>
              </tr>
            </thead>
            <tbody>
              {mheMissingRows.map((r) => (
                <tr key={r.id} className="wi-row--warn">
                  <td>
                    {r.colleagueName} {r.employmentType ? <span className="wi-muted">({r.employmentType})</span> : null}
                  </td>
                  <td>{r.mheType || "—"}</td>
                  <td>{r.trainedOn || "—"}</td>
                  <td>{r.due || "—"}</td>
                  <td>{r.days == null ? "—" : r.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  const equipmentBody = (
    <>
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
                <tr key={idx} className={r.status === "overdue" ? "wi-row--bad" : "wi-row--warn"}>
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
    </>
  );

  const schedulingBody = (
    <>
      <div className="wi-card__sub">Plan MHE and labour, track indirect time, and compare plan vs actual by shift.</div>
      <Button onClick={() => navigate("/app/tools/scheduling")}>Open scheduling tool</Button>
    </>
  );

  const renderSection = (key) => {
    switch (key) {
      case "account":
        return renderCardShell(
          key,
          "Account",
          "Account scope",
          null,
          <>
            <div className="wi-muted">Account ID: {accountId || "—"}</div>
            <div className="wi-muted">Signed in as: {user?.email || "—"}</div>
          </>
        );

      case "company":
        return renderCardShell(
          key,
          "Company",
          "Select a company to view data across all sites under that company.",
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={loadCompanies} disabled={loadingCompanies}>
              Reload
            </Button>
            <Button onClick={resetCompanySelection} disabled={loadingCompanies}>
              Reset
            </Button>
          </div>,
          <>
            {companyErr && <div className="wi-error">{companyErr}</div>}

            <div className="wi-formRow">
              <label className="wi-label">Company</label>
              <select className="wi-select" value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)} disabled={loadingCompanies}>
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
          </>
        );

      case "mhe_due":
        return renderCardShell(
          key,
          "MHE training due soon or overdue",
          "Overdue and due within 30 days (includes missing due dates).",
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={() => selectedCompanyId && loadMheSummaries(selectedCompanyId)} disabled={!selectedCompanyId || loadingMhe}>
              {loadingMhe ? "Loading..." : "Reload"}
            </Button>
            <Button onClick={() => navigate("/app/setup/mhe-training")}>Open MHE training</Button>
          </div>,
          mheDueBody
        );

      case "mhe_missing":
        return renderCardShell(
          key,
          "Training records missing certificates",
          "Active training records with no certificate uploaded.",
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={() => selectedCompanyId && loadMheSummaries(selectedCompanyId)} disabled={!selectedCompanyId || loadingMhe}>
              {loadingMhe ? "Loading..." : "Reload"}
            </Button>
            <Button onClick={() => navigate("/app/setup/mhe-training")}>Resolve in MHE training</Button>
          </div>,
          mheMissingBody
        );

      case "equipment":
        return renderCardShell(
          key,
          "Equipment alerts",
          "Overdue and due within 30 days (earliest of Inspection / LOLER / Service / PUWER).",
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={() => selectedCompanyId && loadEquipmentAlerts(selectedCompanyId)} disabled={!selectedCompanyId || loadingAlerts}>
              {loadingAlerts ? "Loading..." : "Reload"}
            </Button>
            <Button onClick={() => navigate("/app/setup/mhe")}>Open MHE setup</Button>
          </div>,
          equipmentBody
        );

      case "scheduling":
        return renderCardShell(key, "Scheduling tool", "", null, schedulingBody);

      default:
        return null;
    }
  };

  const effectiveSections =
    sections && sections.length ? sections : ["account", "company", "mhe_due", "mhe_missing", "equipment", "scheduling"];

  return (
    <AppLayout>
      <div className="wi-page">
        <div className="wi-pageHeader">
          <h1 className="wi-pageTitle">Dashboard</h1>
        </div>

        <div className="wi-tabsRow">
          <button className={`wi-tabPill ${dashTab === "alerts" ? "active" : ""}`} type="button" onClick={() => setDashTab("alerts")}>
            Alerts
          </button>
          <button className={`wi-tabPill ${dashTab === "analytics" ? "active" : ""}`} type="button" onClick={() => setDashTab("analytics")}>
            Analytics
          </button>
        </div>

        {pageErr && <div className="wi-error">{pageErr}</div>}

        {dashTab === "analytics" ? (
          <Card>
            <div className="wi-card__titleRow">
              <div>
                <div className="wi-card__title">Analytics</div>
                <div className="wi-card__sub">Placeholder (to be configured).</div>
              </div>
            </div>
            <div className="wi-muted">—</div>
          </Card>
        ) : (
          <>
            {effectiveSections.map((key) => (
              <div key={key}>{renderSection(key)}</div>
            ))}
          </>
        )}
      </div>
    </AppLayout>
  );
}

export default DashboardPage;
