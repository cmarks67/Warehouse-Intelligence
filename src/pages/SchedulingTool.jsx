// /src/pages/SchedulingTool.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";

import { supabase } from "../lib/supabaseClient";

import "./SchedulingTool.css";

/**
 * Scheduling Tool (DB-backed)
 * - Shift data is stored in Supabase table: public.scheduling_entries
 * - Config (tasks/resources/rates/indirect limit) remains local for now
 *   and is used to derive hours + costs on save.
 * - Tasks are matched to DB rows by Task name (task_name).
 */

function activeFromPath(pathname) {
  if (pathname.startsWith("/app/setup/companies-sites")) return "company-site-setup";
  if (pathname.startsWith("/app/setup/mhe-training")) return "mhe-training";
  if (pathname.startsWith("/app/setup/mhe")) return "mhe-setup";
  if (pathname.startsWith("/app/connections")) return "connections";
  if (pathname.startsWith("/app/tools/scheduling")) return "scheduling-tool";
  if (pathname.startsWith("/app/users")) return "users";
  if (pathname.startsWith("/app/password")) return "password";
  if (pathname.startsWith("/app/setup/colleagues")) return "colleagues-setup";
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
    case "mhe-training":
      return "/app/setup/mhe-training";
    case "connections":
      return "/app/connections";
    case "scheduling-tool":
      return "/app/tools/scheduling";
    case "users":
      return "/app/users";
    case "password":
      return "/app/password";
    case "colleagues-setup":
      return "/app/setup/colleagues";
    default:
      return "/app/dashboard";
  }
}

// Local storage (kept simple and safe)
const LS_CFG_TASKS = "wi_sched_cfg_tasks_v1";
const LS_CFG_MHE = "wi_sched_cfg_mhe_v1";
const LS_CFG_INDIRECT_LIMIT = "wi_sched_cfg_indirect_limit_v1";

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
    { id: uid(), label: "PPT fleet", type: "PPT", count: 4, costPerHour: 18.0 },
    { id: uid(), label: "CB fleet", type: "CB", count: 3, costPerHour: 18.0 },
    { id: uid(), label: "VNA trucks", type: "VNA", count: 2, costPerHour: 18.0 },
    { id: uid(), label: "Manual labour", type: "Manual", count: 10, costPerHour: 13.5 },
    { id: uid(), label: "Admin", type: "Admin", count: 2, costPerHour: 14.0 },
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
  const onSelectNav = (key) => navigate(pathFromKey(key));

  // Header email
  const [email, setEmail] = useState("");

  // Status + tab
  const [tab, setTab] = useState("capability"); // capability | pva | config | daily
  const [status, setStatus] = useState({ text: "Ready.", isError: false });

  // Tenant boundary + enforcement
  const [accountId, setAccountId] = useState("");
  const [allowedCompanies, setAllowedCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");

  // Context
  const [siteId, setSiteId] = useState("");
  const [date, setDate] = useState(isoToday());
  const [shift, setShift] = useState("AM");

  // DB dropdown data (tenant-scoped)
  const [sites, setSites] = useState([]);

  // Local config
  const [cfgMhe, setCfgMhe] = useState(() => loadJson(LS_CFG_MHE, defaultMhe()));
  const [cfgTasks, setCfgTasks] = useState(() => loadJson(LS_CFG_TASKS, defaultTasks()));
  const [indirectLimitPct, setIndirectLimitPct] = useState(() => {
    const v = Number(loadJson(LS_CFG_INDIRECT_LIMIT, 5));
    return Number.isFinite(v) ? v : 5;
  });

  // Shift data (DB-backed)
  const [capabilityByMhe, setCapabilityByMhe] = useState({});
  const [taskInputsById, setTaskInputsById] = useState({});

  // Persist local config
  useEffect(() => saveJson(LS_CFG_MHE, cfgMhe), [cfgMhe]);
  useEffect(() => saveJson(LS_CFG_TASKS, cfgTasks), [cfgTasks]);
  useEffect(() => saveJson(LS_CFG_INDIRECT_LIMIT, indirectLimitPct), [indirectLimitPct]);

  const resolveAccountId = useCallback(async (userId) => {
    // Primary: public.users
    {
      const { data, error } = await supabase.from("users").select("account_id").eq("id", userId).maybeSingle();
      if (!error && data?.account_id) return data.account_id;
    }

    // Fallback: public.company_users
    {
      const { data, error } = await supabase.from("company_users").select("account_id").eq("user_id", userId).limit(1).maybeSingle();
      if (!error && data?.account_id) return data.account_id;
    }

    return "";
  }, []);

  // Init session (email + account_id)
  useEffect(() => {
    (async () => {
      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const user = authData?.user;
        if (!user) {
          navigate("/login", { replace: true });
          return;
        }

        setEmail(user.email || "");

        if (!accountId) {
          const aId = await resolveAccountId(user.id);
          if (!aId) {
            setStatus({
              text: "Could not resolve account_id for this user. Ensure users (or company_users) contains account_id.",
              isError: true,
            });
            return;
          }
          setAccountId(aId);
        }
      } catch (e) {
        setStatus({ text: e?.message || "Failed to initialise scheduling tool.", isError: true });
      }
    })();
  }, [navigate, accountId, resolveAccountId]);

  // Load tenant companies + memberships
  useEffect(() => {
    (async () => {
      try {
        if (!accountId) return;

        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const userId = authData?.user?.id;
        if (!userId) throw new Error("Not signed in.");

        const { data: compRows, error: compErr } = await supabase
          .from("companies")
          .select("id,name,account_id")
          .eq("account_id", accountId)
          .order("name", { ascending: true });
        if (compErr) throw compErr;

        const { data: cuRows, error: cuErr } = await supabase
          .from("company_users")
          .select("company_id,account_id")
          .eq("user_id", userId)
          .eq("account_id", accountId);
        if (cuErr) throw cuErr;

        const memberCompanyIds = new Set((cuRows || []).map((r) => r.company_id).filter(Boolean));

        // Do NOT hard-fail if no memberships. Fall back to all tenant companies.
        let allowed = [];
        if (memberCompanyIds.size === 0) {
          allowed = compRows || [];
          setStatus({
            text:
              "No companies assigned to this user in company_users for this account. " +
              "Falling back to all companies in this account (add company_users rows to enforce memberships).",
            isError: true,
          });
        } else {
          allowed = (compRows || []).filter((c) => memberCompanyIds.has(c.id));
          if (!allowed.length) {
            allowed = compRows || [];
            setStatus({
              text:
                "Your company memberships do not match any companies in this tenant. " +
                "Falling back to all companies in this account.",
              isError: true,
            });
          } else {
            setStatus({ text: "Ready.", isError: false });
          }
        }

        setAllowedCompanies(allowed);
        setCompanyId((prev) => (prev && allowed.some((x) => x.id === prev) ? prev : (allowed[0]?.id || "")));
      } catch (e) {
        setStatus({ text: e?.message || "Failed to load companies.", isError: true });
      }
    })();
  }, [accountId]);

  // Load sites for selected company (tenant-scoped)
  useEffect(() => {
    (async () => {
      try {
        setSites([]);
        setSiteId("");

        if (!accountId || !companyId) return;

        const { data, error } = await supabase
          .from("sites")
          .select("id,name,company_id,account_id")
          .eq("account_id", accountId)
          .eq("company_id", companyId)
          .order("name", { ascending: true });

        if (error) throw error;

        const list = data || [];
        setSites(list);
        setSiteId((prev) => (prev && list.some((s) => s.id === prev) ? prev : (list[0]?.id || "")));
      } catch (e) {
        setStatus({ text: e?.message || "Failed to load sites.", isError: true });
      }
    })();
  }, [accountId, companyId]);

  const mheTypes = useMemo(() => {
    const types = (cfgMhe || []).map((r) => (r.type || "").trim()).filter(Boolean);
    const uniq = Array.from(new Set(types));
    return uniq.length ? uniq : ["PPT", "CB", "VNA"];
  }, [cfgMhe]);

  const volumesByTaskId = useMemo(() => {
    const m = {};
    for (const t of cfgTasks) {
      const row = taskInputsById?.[t.id] || {};
      m[t.id] = { planVolume: row.planVolume ?? "", actualVolume: row.actualVolume ?? "" };
    }
    return m;
  }, [cfgTasks, taskInputsById]);

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
    let planDirect = 0, planIndirect = 0, actDirect = 0, actIndirect = 0;

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
    for (const mt of mheTypes) totalAvail += safeNum(capabilityByMhe?.[mt]?.hoursAvailable);

    const totalPlan = planDirect + planIndirect;
    const totalActual = actDirect + actIndirect;

    const costRateByMhe = {};
    for (const r of cfgMhe || []) {
      const k = (r.type || "").trim();
      if (!k) continue;
      costRateByMhe[k] = safeNum(r.costPerHour);
    }

    const planCost = Object.entries(byMhe).reduce((sum, [mhe, v]) => sum + safeNum(v.plan) * safeNum(costRateByMhe[mhe]), 0);
    const actualCost = Object.entries(byMhe).reduce((sum, [mhe, v]) => sum + safeNum(v.actual) * safeNum(costRateByMhe[mhe]), 0);
    const expectedCost = planCost; // default

    const indirectPctOfPlan = totalPlan > 0 ? (planIndirect / totalPlan) * 100 : 0;

    return {
      byMhe,
      planDirect,
      planIndirect,
      actDirect,
      actIndirect,
      totalAvail,
      totalPlan,
      totalActual,
      planCost,
      expectedCost,
      actualCost,
      indirectPctOfPlan,
    };
  }, [cfgTasks, calcByTaskId, mheTypes, capabilityByMhe, cfgMhe]);

  // Mutators (DB-backed state)
  const setCapability = (mheType, patch) => {
    setCapabilityByMhe((prev) => ({
      ...(prev || {}),
      [mheType]: { ...(prev?.[mheType] || {}), ...patch },
    }));
  };

  const setTask = (taskId, patch) => {
    setTaskInputsById((prev) => ({
      ...(prev || {}),
      [taskId]: { ...(prev?.[taskId] || {}), ...patch },
    }));
  };

  const loadShiftFromDb = useCallback(async () => {
    try {
      if (!accountId) return;
      if (!siteId) return;

      // reset so blank sites/users do not show ghost values
      setCapabilityByMhe({});
      setTaskInputsById({});

      const { data, error } = await supabase
        .from("scheduling_entries")
        .select(
          "shift_code, mhe_id, task_name, headcount_plan, headcount_expected, headcount_actual, units_planned, units_actual, hours_direct_plan, hours_direct_expected, hours_direct_actual, hours_indirect_plan, hours_indirect_expected, hours_indirect_actual, cost_plan, cost_expected, cost_actual"
        )
        .eq("account_id", accountId)
        .eq("site_id", siteId)
        .eq("scheduled_date", date)
        .eq("shift_code", shift);

      if (error) throw error;

      const cap = {};
      const tasks = {};

      for (const r of data || []) {
        const mhe = (r.mhe_id || "").trim();
        const tn = (r.task_name || "").trim();

        if (tn === "__capability__" && mhe) {
          cap[mhe] = {
            headcountPlan: r.headcount_plan ?? "",
            headcountExpected: r.headcount_expected ?? "",
            headcountActual: r.headcount_actual ?? "",
            hoursAvailable: r.hours_direct_expected ?? "",
          };
          continue;
        }

        // Match DB rows to configured tasks by name (authoritative until task_id is introduced)
        const match = (cfgTasks || []).find((t) => (t.name || "").trim() === tn);
        if (!match) continue;

        tasks[match.id] = {
          planVolume: r.units_planned ?? "",
          actualVolume: r.units_actual ?? "",
        };
      }

      setCapabilityByMhe(cap);
      setTaskInputsById(tasks);
      setStatus({ text: "Loaded shift data from database.", isError: false });
    } catch (e) {
      setStatus({ text: e?.message || "Failed to load shift data from database.", isError: true });
    }
  }, [accountId, siteId, date, shift, cfgTasks]);

  const saveToDb = useCallback(async () => {
    if (!accountId) return setStatus({ text: "No account_id resolved for this session.", isError: true });
    if (!companyId) return setStatus({ text: "Select a Company before saving.", isError: true });
    if (!siteId) return setStatus({ text: "Select a Site before saving.", isError: true });

    const rows = [];

    // Capability rows
    for (const mt of mheTypes) {
      const cap = capabilityByMhe?.[mt] || {};
      const headcountPlan = cap.headcountPlan === "" ? null : safeNum(cap.headcountPlan);
      const headcountExpected = cap.headcountExpected === "" ? null : safeNum(cap.headcountExpected);
      const headcountActual = cap.headcountActual === "" ? null : safeNum(cap.headcountActual);
      const hoursAvail = cap.hoursAvailable === "" ? null : safeNum(cap.hoursAvailable);

      const planned = safeNum(summary.byMhe?.[mt]?.plan);
      const actual = safeNum(summary.byMhe?.[mt]?.actual);

      const hasAny =
        (headcountPlan ?? 0) !== 0 ||
        (headcountExpected ?? 0) !== 0 ||
        (headcountActual ?? 0) !== 0 ||
        (hoursAvail ?? 0) !== 0 ||
        planned !== 0 ||
        actual !== 0;

      if (!hasAny) continue;

      // NOTE: scheduling_entries has no hours_available column.
      // We persist availability into hours_direct_expected on a special row.
      rows.push({
        account_id: accountId,
        site_id: siteId,
        scheduled_date: date,
        shift_code: shift,
        mhe_id: mt,
        task_name: "__capability__",
        headcount_plan: headcountPlan,
        headcount_expected: headcountExpected,
        headcount_actual: headcountActual,
        hours_direct_plan: planned,
        hours_direct_expected: hoursAvail,
        hours_direct_actual: actual,
        hours_indirect_plan: 0,
        hours_indirect_expected: 0,
        hours_indirect_actual: 0,
        cost_plan: null,
        cost_expected: null,
        cost_actual: null,
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
        account_id: accountId,
        site_id: siteId,
        scheduled_date: date,
        shift_code: shift,
        mhe_id: (t.resource || "").trim() || null,
        task_name: (t.name || "").trim(),
        units_planned: Number.isFinite(pv) ? pv : null,
        units_actual: Number.isFinite(av) ? av : null,
        hours_direct_plan: isIndirect ? 0 : ph,
        hours_indirect_plan: isIndirect ? ph : 0,
        hours_direct_expected: isIndirect ? 0 : ph,
        hours_indirect_expected: isIndirect ? ph : 0,
        hours_direct_actual: isIndirect ? 0 : ah,
        hours_indirect_actual: isIndirect ? ah : 0,
        cost_plan: null,
        cost_expected: null,
        cost_actual: null,
      });
    }

    // Apply labour cost rates (plan/expected/actual) per row.
    // Costs are stored for audit/reporting, but derived from hours × configured rate.
    const costRateByMhe = {};
    for (const r of cfgMhe || []) {
      const k = (r.type || "").trim();
      if (!k) continue;
      costRateByMhe[k] = safeNum(r.costPerHour);
    }

    for (const r of rows) {
      if (r.task_name === "__capability__") continue;
      const mhe = (r.mhe_id || "").trim();
      const rate = safeNum(costRateByMhe[mhe]);
      const planH = safeNum(r.hours_direct_plan) + safeNum(r.hours_indirect_plan);
      const expH = safeNum(r.hours_direct_expected) + safeNum(r.hours_indirect_expected);
      const actH = safeNum(r.hours_direct_actual) + safeNum(r.hours_indirect_actual);
      r.cost_plan = rate ? planH * rate : null;
      r.cost_expected = rate ? expH * rate : null;
      r.cost_actual = rate ? actH * rate : null;
    }

    if (rows.length === 0) return setStatus({ text: "Nothing to save for this date/shift.", isError: true });

    const { error } = await supabase.from("scheduling_entries").upsert(rows);
    if (error) return setStatus({ text: `DB write failed: ${error.message}`, isError: true });

    setStatus({ text: `Saved ${rows.length} row(s) to scheduling_entries.`, isError: false });
  }, [
    accountId,
    companyId,
    siteId,
    capabilityByMhe,
    calcByTaskId,
    cfgTasks,
    cfgMhe,
    date,
    mheTypes,
    shift,
    summary,
    volumesByTaskId,
  ]);

  // Daily summary
  const [dailyRows, setDailyRows] = useState([]);
  const refreshDaily = useCallback(async () => {
    if (!accountId) return setStatus({ text: "No account_id resolved for this session.", isError: true });
    if (!siteId) return setStatus({ text: "Select a Site to view daily summary.", isError: true });

    const { data, error } = await supabase
      .from("scheduling_entries")
      .select("shift_code, task_name, hours_direct_plan, hours_indirect_plan, hours_direct_expected, hours_indirect_expected, hours_direct_actual, hours_indirect_actual, cost_plan, cost_expected, cost_actual")
      .eq("account_id", accountId)
      .eq("site_id", siteId)
      .eq("scheduled_date", date);

    if (error) return setStatus({ text: `Daily summary read failed: ${error.message}`, isError: true });

    const shifts = ["AM", "PM", "Nights"];
    const map = {};
    for (const s of shifts) map[s] = { shift: s, pd: 0, pi: 0, pe: 0, ie: 0, ad: 0, ai: 0, cp: 0, ce: 0, ca: 0 };

    for (const r of data || []) {
      const s = (r.shift_code || "AM").trim();
      if (!map[s]) map[s] = { shift: s, pd: 0, pi: 0, pe: 0, ie: 0, ad: 0, ai: 0, cp: 0, ce: 0, ca: 0 };
      if ((r.task_name || "").startsWith("__")) continue;

      map[s].pd += safeNum(r.hours_direct_plan);
      map[s].pi += safeNum(r.hours_indirect_plan);
      map[s].pe += safeNum(r.hours_direct_expected);
      map[s].ie += safeNum(r.hours_indirect_expected);
      map[s].ad += safeNum(r.hours_direct_actual);
      map[s].ai += safeNum(r.hours_indirect_actual);
      map[s].cp += safeNum(r.cost_plan);
      map[s].ce += safeNum(r.cost_expected);
      map[s].ca += safeNum(r.cost_actual);
    }

    setDailyRows(shifts.map((s) => map[s]));
    setStatus({ text: "Daily summary refreshed.", isError: false });
  }, [accountId, date, siteId]);

  // Auto refresh daily when opening tab
  const prevTab = useRef(tab);
  useEffect(() => {
    const was = prevTab.current;
    prevTab.current = tab;
    if (tab === "daily" && was !== "daily") refreshDaily();
  }, [tab, refreshDaily]);

  // Auto-load shift data when context changes (DB is source of truth)
  useEffect(() => {
    if (!accountId || !siteId || !date || !shift) return;
    loadShiftFromDb();
  }, [accountId, siteId, date, shift, loadShiftFromDb]);

  return (
    <AppLayout activeNav={activeNav} onSelectNav={onSelectNav} headerEmail={email}>
      <Card
        title="Scheduling tool"
        subtitle="Plan capability, enter volumes, compare plan vs actual, and save shift outputs."
        actions={
          <div className="wi-sched-actions">
            <Button variant="secondary" onClick={loadShiftFromDb}>
              Load from database
            </Button>
            <Button variant="primary" onClick={saveToDb}>
              Save to database
            </Button>
          </div>
        }
      >
        <div className="wi-sched-tabs">
          <button className={tab === "capability" ? "wi-sched-tab wi-sched-tab--active" : "wi-sched-tab"} onClick={() => setTab("capability")}>
            Capability plan
          </button>
          <button className={tab === "pva" ? "wi-sched-tab wi-sched-tab--active" : "wi-sched-tab"} onClick={() => setTab("pva")}>
            Plan vs Actual
          </button>
          <button className={tab === "config" ? "wi-sched-tab wi-sched-tab--active" : "wi-sched-tab"} onClick={() => setTab("config")}>
            Configuration
          </button>
          <button className={tab === "daily" ? "wi-sched-tab wi-sched-tab--active" : "wi-sched-tab"} onClick={() => setTab("daily")}>
            Daily summary
          </button>
        </div>

        <div className={status.isError ? "wi-sched-status wi-sched-status--error" : "wi-sched-status"}>{status.text}</div>

        {/* Context controls */}
        <div className="wi-sched-grid">
          <label className="wi-sched-label">
            Company
            <select className="wi-sched-control" value={companyId} onChange={(e) => setCompanyId(e.target.value)} disabled={allowedCompanies.length <= 1}>
              <option value="">{allowedCompanies.length ? "Select company" : "Loading…"}</option>
              {allowedCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="wi-sched-label">
            Site
            <select className="wi-sched-control" value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={!companyId || sites.length === 0}>
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
                <button key={s} type="button" className={shift === s ? "wi-sched-segBtn wi-sched-segBtn--active" : "wi-sched-segBtn"} onClick={() => setShift(s)}>
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
            <div className="wi-sched-muted">Enter headcount and hours available per MHE/resource type. Planned hours are calculated from planned volumes.</div>

            <div className="wi-sched-kpis">
              <div className="wi-sched-kpi">
                <div className="wi-sched-kpiK">Hours available</div>
                <div className="wi-sched-kpiV">{summary.totalAvail.toFixed(2)}h</div>
                <div className="wi-sched-muted">From capability entries (hours available)</div>
              </div>
              <div className="wi-sched-kpi">
                <div className="wi-sched-kpiK">Hours planned</div>
                <div className="wi-sched-kpiV">{summary.totalPlan.toFixed(2)}h</div>
              </div>
              <div className="wi-sched-kpi">
                <div className="wi-sched-kpiK">Variance (avail − plan)</div>
                <div className="wi-sched-kpiV">{(summary.totalAvail - summary.totalPlan).toFixed(2)}h</div>
              </div>
              <div className={summary.indirectPctOfPlan > indirectLimitPct ? "wi-sched-kpi wi-sched-kpi--warning" : "wi-sched-kpi"}>
                <div className="wi-sched-kpiK">Indirect hours</div>
                <div className="wi-sched-kpiV">{summary.planIndirect.toFixed(2)}h</div>
                <div className="wi-sched-muted">
                  {summary.indirectPctOfPlan.toFixed(1)}% of planned hours — Limit
                  <input
                    className="wi-sched-inlineInput"
                    type="number"
                    min="0"
                    step="0.5"
                    value={indirectLimitPct}
                    onChange={(e) => setIndirectLimitPct(Number(e.target.value))}
                  />
                  %
                </div>
              </div>
              <div className="wi-sched-kpi">
                <div className="wi-sched-kpiK">Labour cost</div>
                <div className="wi-sched-kpiV">£{summary.planCost.toFixed(2)} / £{summary.actualCost.toFixed(2)}</div>
                <div className="wi-sched-muted">Plan / Actual (hours × configured rate)</div>
              </div>
            </div>

            <div className="wi-sched-tableWrap">
              <table className="wi-sched-table">
                <thead>
                  <tr>
                    <th>MHE Type</th>
                    <th className="num">Headcount plan</th>
                    <th className="num">Headcount expected</th>
                    <th className="num">Headcount actual</th>
                    <th className="num">Hours available</th>
                    <th className="num">Hours planned</th>
                    <th className="num">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {mheTypes.map((mt) => {
                    const cap = capabilityByMhe?.[mt] || {};
                    const hcPlan = cap.headcountPlan ?? "";
                    const hcExp = cap.headcountExpected ?? "";
                    const hcAct = cap.headcountActual ?? "";
                    const avail = safeNum(cap.hoursAvailable);
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
                            step="1"
                            value={hcPlan}
                            onChange={(e) => setCapability(mt, { headcountPlan: e.target.value === "" ? "" : Number(e.target.value) })}
                          />
                        </td>
                        <td className="num">
                          <input
                            className="wi-sched-cellInput"
                            type="number"
                            min="0"
                            step="1"
                            value={hcExp}
                            onChange={(e) => setCapability(mt, { headcountExpected: e.target.value === "" ? "" : Number(e.target.value) })}
                          />
                        </td>
                        <td className="num">
                          <input
                            className="wi-sched-cellInput"
                            type="number"
                            min="0"
                            step="1"
                            value={hcAct}
                            onChange={(e) => setCapability(mt, { headcountActual: e.target.value === "" ? "" : Number(e.target.value) })}
                          />
                        </td>
                        <td className="num">
                          <input
                            className="wi-sched-cellInput"
                            type="number"
                            min="0"
                            step="0.25"
                            value={cap.hoursAvailable ?? ""}
                            onChange={(e) => setCapability(mt, { hoursAvailable: e.target.value === "" ? "" : Number(e.target.value) })}
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
                            onChange={(e) => setTask(t.id, { planVolume: e.target.value === "" ? "" : Number(e.target.value) })}
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
            <div className="wi-sched-muted">Enter actual volumes to calculate actual hours and compare to plan.</div>

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
                            onChange={(e) => setTask(t.id, { actualVolume: e.target.value === "" ? "" : Number(e.target.value) })}
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
              Configuration is used to drive planning calculations and stored labour cost values. MHE/resource rates are used as <strong>£/hour</strong> multipliers
              (hours × rate). Tasks are matched to database rows by <strong>Task name</strong>.
            </div>

            <div className="wi-sched-configGrid">
              <div>
                <h4 className="wi-sched-h4">Resources and labour rates</h4>
                <div className="wi-sched-muted">Define the MHE key and the fully-loaded labour rate for that resource type.</div>
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
                      step="0.5"
                      value={r.costPerHour ?? ""}
                      onChange={(e) => {
                        const next = [...cfgMhe];
                        next[idx] = { ...next[idx], costPerHour: e.target.value === "" ? "" : Number(e.target.value) };
                        setCfgMhe(next);
                      }}
                      placeholder="Cost £/hr"
                    />
                  </div>
                ))}

                <div className="wi-sched-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
                  <Button variant="primary" onClick={() => setCfgMhe((prev) => [...prev, { id: uid(), label: "New resource", type: "", costPerHour: "" }])}>
                    Add resource
                  </Button>
                </div>
              </div>

              <div>
                <h4 className="wi-sched-h4">Tasks and productivity standards</h4>
                <div className="wi-sched-muted">Minutes per unit are used to derive planned/actual hours. Category controls Direct vs Indirect hour allocation.</div>
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
                    <select
                      className="wi-sched-control"
                      value={t.category || "Direct"}
                      onChange={(e) => {
                        const next = [...cfgTasks];
                        next[idx] = { ...next[idx], category: e.target.value };
                        setCfgTasks(next);
                      }}
                    >
                      <option value="Direct">Direct</option>
                      <option value="Indirect">Indirect</option>
                    </select>
                    <input
                      className="wi-sched-control"
                      value={t.area || ""}
                      onChange={(e) => {
                        const next = [...cfgTasks];
                        next[idx] = { ...next[idx], area: e.target.value };
                        setCfgTasks(next);
                      }}
                      placeholder="Area"
                    />
                    <input
                      className="wi-sched-control"
                      value={t.unit || ""}
                      onChange={(e) => {
                        const next = [...cfgTasks];
                        next[idx] = { ...next[idx], unit: e.target.value };
                        setCfgTasks(next);
                      }}
                      placeholder="Unit (e.g. Pallets)"
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
                        { id: uid(), name: "New task", area: "", resource: mheTypes[0] || "", unit: "Units", minutesPerUnit: 1, category: "Direct" },
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
                    <th className="num">Expected direct (h)</th>
                    <th className="num">Expected indirect (h)</th>
                    <th className="num">Actual direct (h)</th>
                    <th className="num">Actual indirect (h)</th>
                    <th className="num">Cost plan (£)</th>
                    <th className="num">Cost expected (£)</th>
                    <th className="num">Cost actual (£)</th>
                  </tr>
                </thead>
                <tbody>
                  {(dailyRows || []).map((r) => (
                    <tr key={r.shift}>
                      <td>{r.shift}</td>
                      <td className="num">{safeNum(r.pd).toFixed(2)}</td>
                      <td className="num">{safeNum(r.pi).toFixed(2)}</td>
                      <td className="num">{safeNum(r.pe).toFixed(2)}</td>
                      <td className="num">{safeNum(r.ie).toFixed(2)}</td>
                      <td className="num">{safeNum(r.ad).toFixed(2)}</td>
                      <td className="num">{safeNum(r.ai).toFixed(2)}</td>
                      <td className="num">£{safeNum(r.cp).toFixed(2)}</td>
                      <td className="num">£{safeNum(r.ce).toFixed(2)}</td>
                      <td className="num">£{safeNum(r.ca).toFixed(2)}</td>
                    </tr>
                  ))}
                  {(!dailyRows || dailyRows.length === 0) && (
                    <tr>
                      <td colSpan={10} className="wi-sched-muted" style={{ padding: 10 }}>
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
