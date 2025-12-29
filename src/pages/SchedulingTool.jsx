// /src/pages/SchedulingTool.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";

import { createClient } from "@supabase/supabase-js";

import "./SchedulingTool.css";

/**
 * IMPORTANT:
 * - This page is intentionally built to behave like Users / Password pages:
 *   AppLayout controls header + sidebar + content spacing.
 * - We avoid redefining colours/tokens here. All branding comes from global CSS.
 */

// Supabase (if you already export supabase from ../lib/supabaseClient, import that instead)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

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

// Local storage (kept simple and safe)
const LS_CFG_TASKS = "wi_sched_cfg_tasks_v1";
const LS_CFG_MHE = "wi_sched_cfg_mhe_v1";
const LS_DATA = "wi_sched_data_v1";

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function uid() {
  return `id_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function defaultMhe() {
  return [
    { id: uid(), label: "PPT fleet", type: "PPT", count: 4 },
    { id: uid(), label: "CB fleet", type: "CB", count: 3 },
    { id: uid(), label: "VNA trucks", type: "VNA", count: 2 },
    { id: uid(), label: "Manual labour", type: "Manual", count: 10 },
    { id: uid(), label: "Admin", type: "Admin", count: 2 },
  ];
}
function defaultTasks() {
  return [
    { id: "trailer_unload", name: "Trailer unload (rear tip)", area: "Inbound – BAYM", resource: "PPT", unit: "Pallets", minutesPerUnit: 2.0, category: "Direct" },
    { id: "container_20", name: "Container unload (20ft)", area: "Inbound", resource: "PPT", unit: "Pallets", minutesPerUnit: 2.5, category: "Direct" },
    { id: "container_40", name: "Container unload (40ft)", area: "Inbound", resource: "PPT", unit: "Pallets", minutesPerUnit: 3.0, category: "Direct" },
    { id: "putaway_vna", name: "Putaway – VNA", area: "High bay", resource: "VNA", unit: "Pallets", minutesPerUnit: 3.0, category: "Direct" },
    { id: "replenishment", name: "Replenishment move", area: "Replen", resource: "CB", unit: "Pallets", minutesPerUnit: 2.2, category: "Direct" },
    { id: "picking_manual", name: "Case picking", area: "Pick face", resource: "Manual", unit: "Units", minutesPerUnit: 0.1, category: "Direct" },
    { id: "admin_inbound", name: "Admin – inbound", area: "Office", resource: "Admin", unit: "Units", minutesPerUnit: 0.6, category: "Indirect" },
  ];
}

export default function SchedulingTool() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeNav = useMemo(() => activeFromPath(location.pathname), [location.pathname]);

  const [email, setEmail] = useState("");

  const onSelectNav = (key) => {
    navigate(pathFromKey(key));
  };

  // Header email (same as Dashboard)
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email || ""));
  }, []);

  // Page state
  const [tab, setTab] = useState("capability"); // capability | pva | config | daily
  const [status, setStatus] = useState({ text: "Ready.", isError: false });

  // Context
  const [companyId, setCompanyId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [date, setDate] = useState(isoToday());
  const [shift, setShift] = useState("AM");

  // DB dropdown data
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);

  // Local config/data
  const [cfgMhe, setCfgMhe] = useState(() => loadJson(LS_CFG_MHE, defaultMhe()));
  const [cfgTasks, setCfgTasks] = useState(() => loadJson(LS_CFG_TASKS, defaultTasks()));
  const [dataStore, setDataStore] = useState(() => loadJson(LS_DATA, {}));

  // Persist local
  useEffect(() => saveJson(LS_CFG_MHE, cfgMhe), [cfgMhe]);
  useEffect(() => saveJson(LS_CFG_TASKS, cfgTasks), [cfgTasks]);
  useEffect(() => saveJson(LS_DATA, dataStore), [dataStore]);

  // Load companies
  useEffect(() => {
    (async () => {
      if (!supabase) {
        setStatus({
          text: "Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
          isError: true,
        });
        return;
      }
      const { data, error } = await supabase.from("companies").select("id,name").order("name");
      if (error) {
        setStatus({ text: `Failed to load companies: ${error.message}`, isError: true });
        return;
      }
      setCompanies(data || []);
    })();
  }, []);

  // Load sites for company
  useEffect(() => {
    (async () => {
      setSites([]);
      setSiteId("");
      if (!supabase || !companyId) return;

      const { data, error } = await supabase
        .from("sites")
        .select("id,name")
        .eq("company_id", companyId)
        .order("name");

      if (error) {
        setStatus({ text: `Failed to load sites: ${error.message}`, isError: true });
        return;
      }
      setSites(data || []);
    })();
  }, [companyId]);

  // Derived context store
  const ctx = useMemo(() => {
    const d = dataStore?.[date] || {};
    const s = d?.[shift] || {};
    return s;
  }, [dataStore, date, shift]);

  const availableByMhe = useMemo(() => ctx.__availableByMhe || {}, [ctx]);

  const mheTypes = useMemo(() => {
    const types = (cfgMhe || [])
      .map((r) => (r.type || "").trim())
      .filter(Boolean);
    const uniq = Array.from(new Set(types));
    return uniq.length ? uniq : ["PPT", "CB", "VNA"];
  }, [cfgMhe]);

  const volumesByTaskId = useMemo(() => {
    const m = {};
    for (const t of cfgTasks) {
      const row = ctx?.[t.id] || {};
      m[t.id] = { planVolume: row.planVolume ?? "", actualVolume: row.actualVolume ?? "" };
    }
    return m;
  }, [cfgTasks, ctx]);

  const calcByTaskId = useMemo(() => {
    const out = {};
    for (const t of cfgTasks) {
      const mp = safeNum(t.minutesPerUnit);
      const pv = safeNum(volumesByTaskId[t.id]?.planVolume);
      const av = safeNum(volumesByTaskId[t.id]?.actualVolume);
      out[t.id] = {
        planHours: mp > 0 ? (pv * mp) / 60 : 0,
        actualHours: mp > 0 ? (av * mp) / 60 : 0,
      };
    }
    return out;
  }, [cfgTasks, volumesByTaskId]);

  const summary = useMemo(() => {
    const byMhe = {};
    let planDirect = 0,
      planIndirect = 0,
      actDirect = 0,
      actIndirect = 0;

    for (const t of cfgTasks) {
      const cat = (t.category || "Direct").trim();
      const mhe = (t.resource || "").trim();
      const ph = safeNum(calcByTaskId[t.id]?.planHours);
      const ah = safeNum(calcByTaskId[t.id]?.actualHours);

      if (mhe) {
        if (!byMhe[mhe]) byMhe[mhe] = { plan: 0, actual: 0 };
        byMhe[mhe].plan += ph;
        byMhe[mhe].actual += ah;
      }

      if (cat === "Indirect") {
        planIndirect += ph;
        actIndirect += ah;
      } else {
        planDirect += ph;
        actDirect += ah;
      }
    }

    let totalAvail = 0;
    for (const mt of mheTypes) totalAvail += safeNum(availableByMhe?.[mt]);

    const totalPlan = planDirect + planIndirect;
    const totalActual = actDirect + actIndirect;

    return {
      byMhe,
      planDirect,
      planIndirect,
      actDirect,
      actIndirect,
      totalAvail,
      totalPlan,
      totalActual,
    };
  }, [cfgTasks, calcByTaskId, mheTypes, availableByMhe]);

  // Mutators
  const setAvail = (mheType, value) => {
    setDataStore((prev) => {
      const next = structuredClone(prev || {});
      next[date] = next[date] || {};
      next[date][shift] = next[date][shift] || {};
      const s = next[date][shift];
      s.__availableByMhe = { ...(s.__availableByMhe || {}) };
      s.__availableByMhe[mheType] = value;
      return next;
    });
  };

  const setTask = (taskId, patch) => {
    setDataStore((prev) => {
      const next = structuredClone(prev || {});
      next[date] = next[date] || {};
      next[date][shift] = next[date][shift] || {};
      next[date][shift][taskId] = { ...(next[date][shift][taskId] || {}), ...patch };
      return next;
    });
  };

  const saveToDb = useCallback(async () => {
    if (!supabase) {
      setStatus({
        text: "Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
        isError: true,
      });
      return;
    }
    if (!siteId) {
      setStatus({ text: "Select a Site before saving.", isError: true });
      return;
    }

    const rows = [];

    // Capability rows
    for (const mt of mheTypes) {
      const avail = safeNum(availableByMhe?.[mt]);
      const planned = safeNum(summary.byMhe?.[mt]?.plan);
      const actual = safeNum(summary.byMhe?.[mt]?.actual);

      if (avail === 0 && planned === 0 && actual === 0) continue;

      rows.push({
        site_id: siteId,
        scheduled_date: date,
        shift_code: shift,
        mhe_id: mt,
        task_name: "__capability__",
        headcount_expected: avail,
        hours_direct_plan: planned,
        hours_direct_actual: actual,
      });
    }

    // Task rows
    for (const t of cfgTasks) {
      const pv = Number(volumesByTaskId[t.id]?.planVolume);
      const av = Number(volumesByTaskId[t.id]?.actualVolume);
      const ph = safeNum(calcByTaskId[t.id]?.planHours);
      const ah = safeNum(calcByTaskId[t.id]?.actualHours);

      const hasAny =
        (Number.isFinite(pv) && pv > 0) ||
        (Number.isFinite(av) && av > 0) ||
        ph > 0 ||
        ah > 0;

      if (!hasAny) continue;

      const category = (t.category || "Direct").trim();
      const isIndirect = category === "Indirect";

      rows.push({
        site_id: siteId,
        scheduled_date: date,
        shift_code: shift,
        mhe_id: (t.resource || "").trim() || null,
        task_name: (t.name || "").trim(),
        units_planned: Number.isFinite(pv) ? pv : null,
        units_actual: Number.isFinite(av) ? av : null,
        hours_direct_plan: isIndirect ? 0 : ph,
        hours_indirect_plan: isIndirect ? ph : 0,
        hours_direct_actual: isIndirect ? 0 : ah,
        hours_indirect_actual: isIndirect ? ah : 0,
      });
    }

    if (rows.length === 0) {
      setStatus({ text: "Nothing to save for this date/shift.", isError: true });
      return;
    }

    const { error } = await supabase.from("scheduling_entries").upsert(rows);
    if (error) {
      setStatus({ text: `DB write failed: ${error.message}`, isError: true });
      return;
    }

    setStatus({ text: `Saved ${rows.length} row(s) to scheduling_entries.`, isError: false });
  }, [
    availableByMhe,
    calcByTaskId,
    cfgTasks,
    date,
    mheTypes,
    shift,
    siteId,
    summary.byMhe,
    volumesByTaskId,
  ]);

  // Daily summary
  const [dailyRows, setDailyRows] = useState([]);
  const refreshDaily = useCallback(async () => {
    if (!supabase) {
      setStatus({ text: "Supabase not configured.", isError: true });
      return;
    }
    if (!siteId) {
      setStatus({ text: "Select a Site to view daily summary.", isError: true });
      return;
    }

    const { data, error } = await supabase
      .from("scheduling_entries")
      .select(
        "shift_code, task_name, hours_direct_plan, hours_indirect_plan, hours_direct_actual, hours_indirect_actual, hours_direct_expected, hours_indirect_expected"
      )
      .eq("site_id", siteId)
      .eq("scheduled_date", date);

    if (error) {
      setStatus({ text: `Daily summary read failed: ${error.message}`, isError: true });
      return;
    }

    const shifts = ["AM", "PM", "Nights"];
    const map = {};
    for (const s of shifts) map[s] = { shift: s, pd: 0, pi: 0, ad: 0, ai: 0, exp: 0 };

    for (const r of data || []) {
      const s = (r.shift_code || "AM").trim();
      if (!map[s]) map[s] = { shift: s, pd: 0, pi: 0, ad: 0, ai: 0, exp: 0 };

      if ((r.task_name || "").startsWith("__")) continue;

      map[s].pd += safeNum(r.hours_direct_plan);
      map[s].pi += safeNum(r.hours_indirect_plan);
      map[s].ad += safeNum(r.hours_direct_actual);
      map[s].ai += safeNum(r.hours_indirect_actual);
      map[s].exp += safeNum(r.hours_direct_expected) + safeNum(r.hours_indirect_expected);
    }

    setDailyRows(shifts.map((s) => map[s]));
    setStatus({ text: "Daily summary refreshed.", isError: false });
  }, [date, siteId]);

  // Auto refresh daily when opening tab
  const prevTab = useRef(tab);
  useEffect(() => {
    const was = prevTab.current;
    prevTab.current = tab;
    if (tab === "daily" && was !== "daily") refreshDaily();
  }, [tab, refreshDaily]);

  return (
    <AppLayout activeNav={activeNav} onSelectNav={onSelectNav} headerEmail={email}>
      <Card
        title="Scheduling tool"
        subtitle="Plan capability, enter volumes, compare plan vs actual, and save shift outputs."
        actions={
          <div className="wi-sched-actions">
            <Button variant="primary" onClick={saveToDb}>
              Save to database
            </Button>
          </div>
        }
      >
        <div className="wi-sched-tabs">
          <button
            className={tab === "capability" ? "wi-sched-tab wi-sched-tab--active" : "wi-sched-tab"}
            onClick={() => setTab("capability")}
          >
            Capability plan
          </button>
          <button
            className={tab === "pva" ? "wi-sched-tab wi-sched-tab--active" : "wi-sched-tab"}
            onClick={() => setTab("pva")}
          >
            Plan vs Actual
          </button>
          <button
            className={tab === "config" ? "wi-sched-tab wi-sched-tab--active" : "wi-sched-tab"}
            onClick={() => setTab("config")}
          >
            Configuration
          </button>
          <button
            className={tab === "daily" ? "wi-sched-tab wi-sched-tab--active" : "wi-sched-tab"}
            onClick={() => setTab("daily")}
          >
            Daily summary
          </button>
        </div>

        <div className={status.isError ? "wi-sched-status wi-sched-status--error" : "wi-sched-status"}>
          {status.text}
        </div>

        {/* Context controls */}
        <div className="wi-sched-grid">
          <label className="wi-sched-label">
            Company
            <select className="wi-sched-control" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">{supabase ? "Select company" : "Supabase not configured"}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="wi-sched-label">
            Site
            <select
              className="wi-sched-control"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              disabled={!companyId || sites.length === 0}
            >
              <option value="">{!companyId ? "Select a company first" : "Select site"}</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="wi-sched-label">
            Date
            <input className="wi-sched-control" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label className="wi-sched-label">
            Shift
            <div className="wi-sched-seg">
              {["AM", "PM", "Nights"].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={shift === s ? "wi-sched-segBtn wi-sched-segBtn--active" : "wi-sched-segBtn"}
                  onClick={() => setShift(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </label>
        </div>

        {/* Capability tab */}
        {tab === "capability" && (
          <div className="wi-sched-section">
            <h3 className="wi-sched-h3">Capability</h3>
            <div className="wi-sched-muted">
              Enter hours available per MHE type. Planned hours are calculated from planned volumes.
            </div>

            <div className="wi-sched-kpis">
              <div className="wi-sched-kpi">
                <div className="wi-sched-kpiK">Hours available</div>
                <div className="wi-sched-kpiV">{summary.totalAvail.toFixed(2)}h</div>
              </div>
              <div className="wi-sched-kpi">
                <div className="wi-sched-kpiK">Hours planned</div>
                <div className="wi-sched-kpiV">{summary.totalPlan.toFixed(2)}h</div>
              </div>
              <div className="wi-sched-kpi">
                <div className="wi-sched-kpiK">Variance (avail − plan)</div>
                <div className="wi-sched-kpiV">{(summary.totalAvail - summary.totalPlan).toFixed(2)}h</div>
              </div>
            </div>

            <div className="wi-sched-tableWrap">
              <table className="wi-sched-table">
                <thead>
                  <tr>
                    <th>MHE Type</th>
                    <th className="num">Hours available</th>
                    <th className="num">Hours planned</th>
                    <th className="num">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {mheTypes.map((mt) => {
                    const avail = safeNum(availableByMhe?.[mt]);
                    const planned = safeNum(summary.byMhe?.[mt]?.plan);
                    const variance = avail - planned;
                    return (
                      <tr key={mt}>
                        <td>{mt}</td>
                        <td className="num">
                          <input
                            className="wi-sched-cellInput"
                            type="number"
                            min="0"
                            step="0.25"
                            value={availableByMhe?.[mt] ?? ""}
                            onChange={(e) => setAvail(mt, e.target.value === "" ? "" : Number(e.target.value))}
                          />
                        </td>
                        <td className="num">{planned.toFixed(2)}</td>
                        <td className="num">{variance.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h3 className="wi-sched-h3" style={{ marginTop: 16 }}>
              Planned volumes
            </h3>
            <div className="wi-sched-tableWrap">
              <table className="wi-sched-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Area</th>
                    <th>MHE</th>
                    <th className="num">Min/unit</th>
                    <th className="num">Plan volume</th>
                    <th className="num">Plan hours</th>
                  </tr>
                </thead>
                <tbody>
                  {cfgTasks.map((t) => {
                    const pv = volumesByTaskId[t.id]?.planVolume ?? "";
                    const ph = safeNum(calcByTaskId[t.id]?.planHours);
                    return (
                      <tr key={t.id}>
                        <td>{t.name}</td>
                        <td>{t.area || ""}</td>
                        <td>{t.resource || ""}</td>
                        <td className="num">{safeNum(t.minutesPerUnit).toFixed(2)}</td>
                        <td className="num">
                          <input
                            className="wi-sched-cellInput"
                            type="number"
                            min="0"
                            step="1"
                            value={pv}
                            onChange={(e) =>
                              setTask(t.id, { planVolume: e.target.value === "" ? "" : Number(e.target.value) })
                            }
                          />
                        </td>
                        <td className="num">{ph.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Plan vs Actual tab */}
        {tab === "pva" && (
          <div className="wi-sched-section">
            <h3 className="wi-sched-h3">Actual volumes</h3>
            <div className="wi-sched-muted">
              Enter actual volumes to calculate actual hours and compare to plan.
            </div>

            <div className="wi-sched-tableWrap">
              <table className="wi-sched-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>MHE</th>
                    <th className="num">Plan hrs</th>
                    <th className="num">Actual volume</th>
                    <th className="num">Actual hrs</th>
                  </tr>
                </thead>
                <tbody>
                  {cfgTasks.map((t) => {
                    const av = volumesByTaskId[t.id]?.actualVolume ?? "";
                    const ph = safeNum(calcByTaskId[t.id]?.planHours);
                    const ah = safeNum(calcByTaskId[t.id]?.actualHours);
                    return (
                      <tr key={t.id}>
                        <td>{t.name}</td>
                        <td>{t.resource || ""}</td>
                        <td className="num">{ph.toFixed(2)}</td>
                        <td className="num">
                          <input
                            className="wi-sched-cellInput"
                            type="number"
                            min="0"
                            step="1"
                            value={av}
                            onChange={(e) =>
                              setTask(t.id, { actualVolume: e.target.value === "" ? "" : Number(e.target.value) })
                            }
                          />
                        </td>
                        <td className="num">{ah.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Configuration tab */}
        {tab === "config" && (
          <div className="wi-sched-section">
            <h3 className="wi-sched-h3">Configuration</h3>
            <div className="wi-sched-muted">
              This is a minimal “reset” configuration view. We can expand it later, but keeping it aligned to Users/Password styling.
            </div>

            <div className="wi-sched-configGrid">
              <div>
                <h4 className="wi-sched-h4">Resources</h4>
                {(cfgMhe || []).map((r, idx) => (
                  <div key={r.id} className="wi-sched-row">
                    <input
                      className="wi-sched-control"
                      value={r.label || ""}
                      onChange={(e) => {
                        const next = [...cfgMhe];
                        next[idx] = { ...next[idx], label: e.target.value };
                        setCfgMhe(next);
                      }}
                      placeholder="Label"
                    />
                    <input
                      className="wi-sched-control"
                      value={r.type || ""}
                      onChange={(e) => {
                        const next = [...cfgMhe];
                        next[idx] = { ...next[idx], type: e.target.value };
                        setCfgMhe(next);
                      }}
                      placeholder="Type (e.g. PPT)"
                    />
                    <input
                      className="wi-sched-control"
                      type="number"
                      min="0"
                      step="1"
                      value={safeNum(r.count)}
                      onChange={(e) => {
                        const next = [...cfgMhe];
                        next[idx] = { ...next[idx], count: Number(e.target.value) };
                        setCfgMhe(next);
                      }}
                      placeholder="Count"
                    />
                  </div>
                ))}

                <div className="wi-sched-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
                  <Button
                    variant="primary"
                    onClick={() => setCfgMhe((prev) => [...prev, { id: uid(), label: "New resource", type: "", count: 0 }])}
                  >
                    Add resource
                  </Button>
                </div>
              </div>

              <div>
                <h4 className="wi-sched-h4">Tasks</h4>
                {(cfgTasks || []).map((t, idx) => (
                  <div key={t.id} className="wi-sched-row">
                    <input
                      className="wi-sched-control"
                      value={t.name || ""}
                      onChange={(e) => {
                        const next = [...cfgTasks];
                        next[idx] = { ...next[idx], name: e.target.value };
                        setCfgTasks(next);
                      }}
                      placeholder="Task name"
                    />
                    <input
                      className="wi-sched-control"
                      value={t.resource || ""}
                      onChange={(e) => {
                        const next = [...cfgTasks];
                        next[idx] = { ...next[idx], resource: e.target.value };
                        setCfgTasks(next);
                      }}
                      placeholder="MHE type"
                    />
                    <input
                      className="wi-sched-control"
                      type="number"
                      min="0"
                      step="0.1"
                      value={safeNum(t.minutesPerUnit)}
                      onChange={(e) => {
                        const next = [...cfgTasks];
                        next[idx] = { ...next[idx], minutesPerUnit: Number(e.target.value) };
                        setCfgTasks(next);
                      }}
                      placeholder="Min/unit"
                    />
                  </div>
                ))}

                <div className="wi-sched-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
                  <Button
                    variant="primary"
                    onClick={() =>
                      setCfgTasks((prev) => [
                        ...prev,
                        {
                          id: uid(),
                          name: "New task",
                          area: "",
                          resource: mheTypes[0] || "",
                          unit: "Units",
                          minutesPerUnit: 1,
                          category: "Direct",
                        },
                      ])
                    }
                  >
                    Add task
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Daily tab */}
        {tab === "daily" && (
          <div className="wi-sched-section">
            <div className="wi-sched-actions" style={{ justifyContent: "flex-start" }}>
              <Button variant="primary" onClick={refreshDaily}>
                Refresh daily summary
              </Button>
            </div>

            <div className="wi-sched-tableWrap" style={{ marginTop: 10 }}>
              <table className="wi-sched-table">
                <thead>
                  <tr>
                    <th>Shift</th>
                    <th className="num">Planned direct (h)</th>
                    <th className="num">Planned indirect (h)</th>
                    <th className="num">Actual direct (h)</th>
                    <th className="num">Actual indirect (h)</th>
                  </tr>
                </thead>
                <tbody>
                  {(dailyRows || []).map((r) => (
                    <tr key={r.shift}>
                      <td>{r.shift}</td>
                      <td className="num">{safeNum(r.pd).toFixed(2)}</td>
                      <td className="num">{safeNum(r.pi).toFixed(2)}</td>
                      <td className="num">{safeNum(r.ad).toFixed(2)}</td>
                      <td className="num">{safeNum(r.ai).toFixed(2)}</td>
                    </tr>
                  ))}
                  {(!dailyRows || dailyRows.length === 0) && (
                    <tr>
                      <td colSpan={5} className="wi-sched-muted" style={{ padding: 10 }}>
                        No daily rows returned (select site/date then refresh).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
