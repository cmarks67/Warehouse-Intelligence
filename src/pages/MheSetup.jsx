// /src/pages/MheSetup.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";

import "./MheSetup.css";

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

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function parseYMD(ymd) {
  if (!ymd) return null;
  const d = new Date(ymd + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}
function daysUntil(ymd) {
  const d = parseYMD(ymd);
  if (!d) return null;
  return Math.floor((d.getTime() - startOfToday().getTime()) / (1000 * 60 * 60 * 24));
}
function ymdOrDash(v) {
  return v ? safe(v) : "—";
}
function duePill(ymd) {
  if (!ymd) return { label: "—", cls: "wi-mhe-duePill" };
  const d = daysUntil(ymd);
  if (d === null) return { label: "—", cls: "wi-mhe-duePill" };
  if (d < 0) return { label: "OVERDUE", cls: "wi-mhe-duePill wi-mhe-duePill--over" };
  if (d < 30) return { label: `${d}d`, cls: "wi-mhe-duePill wi-mhe-duePill--soon" };
  return { label: `${d}d`, cls: "wi-mhe-duePill" };
}
function nextDueReason(asset) {
  const options = [
    { label: "Inspection", ymd: asset.next_inspection_due },
    { label: "LOLER", ymd: asset.next_loler_due },
    { label: "Service", ymd: asset.next_service_due },
    { label: "PUWER", ymd: asset.next_puwer_due },
  ]
    .map((x) => ({ ...x, date: parseYMD(x.ymd) }))
    .filter((x) => x.date);

  if (!options.length) return { label: "No dates", ymd: null, date: null, days: null };

  options.sort((a, b) => a.date.getTime() - b.date.getTime());
  const top = options[0];
  return { label: top.label, ymd: top.ymd, date: top.date, days: daysUntil(top.ymd) };
}

export default function MheSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeNav = useMemo(() => activeFromPath(location.pathname), [location.pathname]);

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ text: "Ready.", isError: false });

  const [tab, setTab] = useState("table"); // table | add | types

  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [types, setTypes] = useState([]);

  const [assetSite, setAssetSite] = useState("");
  const [assets, setAssets] = useState([]);

  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeRequiresLoler, setNewTypeRequiresLoler] = useState(false);
  const [newTypeRequiresPuwer, setNewTypeRequiresPuwer] = useState(true);

  const [editingAssetId, setEditingAssetId] = useState(null);

  const [assetType, setAssetType] = useState("");
  const [assetTag, setAssetTag] = useState("");
  const [assetSerial, setAssetSerial] = useState("");
  const [assetMfr, setAssetMfr] = useState("");
  const [assetModel, setAssetModel] = useState("");
  const [assetPurchase, setAssetPurchase] = useState("");
  const [assetStatus, setAssetStatus] = useState("active");
  const [assetNextInspection, setAssetNextInspection] = useState("");
  const [assetNextLoler, setAssetNextLoler] = useState("");
  const [assetNextService, setAssetNextService] = useState("");
  const [assetNextPuwer, setAssetNextPuwer] = useState("");

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

  const loadCompaniesSites = useCallback(async () => {
    const { data: c, error: ec } = await supabase.from("companies").select("id, name").order("name");
    if (ec) throw ec;
    const companiesList = c || [];
    setCompanies(companiesList);

    const { data: s, error: es } = await supabase
      .from("sites")
      .select("id, company_id, name, code, created_at")
      .order("created_at", { ascending: false });
    if (es) throw es;

    const sitesList = s || [];
    setSites(sitesList);

    if (sitesList.length) {
      if (!assetSite || !sitesList.some((x) => x.id === assetSite)) setAssetSite(sitesList[0].id);
    } else {
      setAssetSite("");
    }
  }, [assetSite]);

  const loadTypes = useCallback(async () => {
    const { data, error } = await supabase
      .from("mhe_types")
      .select("id, type_name, requires_loler, requires_puwer, created_at")
      .order("type_name", { ascending: true });

    if (error) throw error;

    const list = data || [];
    setTypes(list);

    if (list.length) {
      if (!assetType || !list.some((t) => t.id === assetType)) setAssetType(list[0].id);
    } else {
      setAssetType("");
    }
  }, [assetType]);

  const loadAssets = useCallback(async () => {
    if (!assetSite) {
      setAssets([]);
      return;
    }

    const { data, error } = await supabase
      .from("mhe_assets")
      .select(
        "id, site_id, mhe_type_id, asset_tag, serial_number, manufacturer, model, purchase_date, status, created_at, next_inspection_due, next_loler_due, next_service_due, next_puwer_due"
      )
      .eq("site_id", assetSite);

    if (error) throw error;

    const site = sites.find((s) => s.id === assetSite);
    const company = companies.find((c) => c.id === site?.company_id);

    const rows = (data || []).map((a) => {
      const t = types.find((x) => x.id === a.mhe_type_id);
      const due = nextDueReason(a);

      let rowClass = "";
      let sortBucket = 2; // 0 overdue, 1 has dates, 2 no dates
      let sortKey = Number.POSITIVE_INFINITY;

      if (due.date) {
        sortBucket = 1;
        sortKey = due.date.getTime();
      }
      if (due.days !== null && due.days < 0) {
        sortBucket = 0;
        rowClass = "wi-mhe-row--overdue";
      } else if (due.days !== null && due.days < 30) {
        rowClass = "wi-mhe-row--soon";
      }

      return {
        ...a,
        _companyLabel: `${safe(company?.name)} – ${safe(site?.name)}`,
        _typeLabel: safe(t?.type_name),
        _dueLabel: due.label,
        _dueDate: due.ymd,
        _sortBucket: sortBucket,
        _sortKey: sortKey,
        _rowClass: rowClass,
      };
    });

    rows.sort((a, b) => a._sortBucket - b._sortBucket || a._sortKey - b._sortKey);
    setAssets(rows);
  }, [assetSite, sites, companies, types]);

  const clearAssetForm = useCallback(() => {
    setEditingAssetId(null);

    setAssetTag("");
    setAssetSerial("");
    setAssetMfr("");
    setAssetModel("");
    setAssetPurchase("");
    setAssetStatus("active");

    setAssetNextInspection("");
    setAssetNextLoler("");
    setAssetNextService("");
    setAssetNextPuwer("");
  }, []);

  const addType = useCallback(async () => {
    try {
      const type_name = newTypeName.trim();
      if (!type_name) return setStatus({ text: "Type name is required.", isError: true });

      const user = await requireSession();
      if (!user) return;

      const { error } = await supabase.from("mhe_types").insert([
        { type_name, requires_loler: newTypeRequiresLoler, requires_puwer: newTypeRequiresPuwer },
      ]);
      if (error) throw error;

      setNewTypeName("");
      setNewTypeRequiresLoler(false);
      setNewTypeRequiresPuwer(true);

      setStatus({ text: "MHE type added.", isError: false });
      await loadTypes();
      await loadAssets();
    } catch (e) {
      setStatus({ text: e?.message || String(e), isError: true });
    }
  }, [newTypeName, newTypeRequiresLoler, newTypeRequiresPuwer, requireSession, loadTypes, loadAssets]);

  const saveTypeName = useCallback(
    async (id, type_name) => {
      try {
        if (!type_name.trim()) return setStatus({ text: "Type name cannot be blank.", isError: true });

        const user = await requireSession();
        if (!user) return;

        const { error } = await supabase.from("mhe_types").update({ type_name: type_name.trim() }).eq("id", id);
        if (error) throw error;

        setStatus({ text: "Type updated.", isError: false });
        await loadTypes();
        await loadAssets();
      } catch (e) {
        setStatus({ text: e?.message || String(e), isError: true });
      }
    },
    [requireSession, loadTypes, loadAssets]
  );

  const deleteType = useCallback(
    async (id) => {
      try {
        const user = await requireSession();
        if (!user) return;

        if (!window.confirm("Delete this MHE type?")) return;

        const { error } = await supabase.from("mhe_types").delete().eq("id", id);
        if (error) throw error;

        setStatus({ text: "Type deleted.", isError: false });
        await loadTypes();
        await loadAssets();
      } catch (e) {
        setStatus({ text: e?.message || String(e), isError: true });
      }
    },
    [requireSession, loadTypes, loadAssets]
  );

  const saveAsset = useCallback(async () => {
    try {
      const user = await requireSession();
      if (!user) return;

      const site_id = assetSite;
      const mhe_type_id = assetType || null;
      if (!site_id) return setStatus({ text: "Select a site (Assets table tab).", isError: true });
      if (!mhe_type_id) return setStatus({ text: "Select an MHE type.", isError: true });

      const payload = {
        site_id,
        mhe_type_id,
        asset_tag: assetTag.trim() || null,
        serial_number: assetSerial.trim() || null,
        manufacturer: assetMfr.trim() || null,
        model: assetModel.trim() || null,
        purchase_date: assetPurchase || null,
        status: assetStatus,
        next_inspection_due: assetNextInspection || null,
        next_loler_due: assetNextLoler || null,
        next_service_due: assetNextService || null,
        next_puwer_due: assetNextPuwer || null,
      };

      if (!payload.asset_tag && !payload.serial_number) {
        return setStatus({ text: "Provide at least an Asset Tag or Serial Number.", isError: true });
      }

      if (!editingAssetId) {
        const { error } = await supabase.from("mhe_assets").insert([payload]);
        if (error) throw error;
        setStatus({ text: "Asset added.", isError: false });
      } else {
        const { error } = await supabase.from("mhe_assets").update(payload).eq("id", editingAssetId);
        if (error) throw error;
        setStatus({ text: "Asset updated.", isError: false });
        clearAssetForm();
      }

      await loadAssets();
      setTab("table");
    } catch (e) {
      setStatus({ text: e?.message || String(e), isError: true });
    }
  }, [
    requireSession,
    assetSite,
    assetType,
    assetTag,
    assetSerial,
    assetMfr,
    assetModel,
    assetPurchase,
    assetStatus,
    assetNextInspection,
    assetNextLoler,
    assetNextService,
    assetNextPuwer,
    editingAssetId,
    clearAssetForm,
    loadAssets,
  ]);

  const editAsset = useCallback(async (id) => {
    try {
      const user = await requireSession();
      if (!user) return;

      const { data, error } = await supabase.from("mhe_assets").select("*").eq("id", id).single();
      if (error) throw error;

      setEditingAssetId(data.id);

      setAssetSite(data.site_id);
      setAssetType(data.mhe_type_id || "");
      setAssetTag(data.asset_tag || "");
      setAssetSerial(data.serial_number || "");
      setAssetMfr(data.manufacturer || "");
      setAssetModel(data.model || "");
      setAssetPurchase(data.purchase_date || "");
      setAssetStatus(data.status || "active");

      setAssetNextInspection(data.next_inspection_due || "");
      setAssetNextLoler(data.next_loler_due || "");
      setAssetNextService(data.next_service_due || "");
      setAssetNextPuwer(data.next_puwer_due || "");

      setTab("add");
      setStatus({ text: "Editing asset. Make changes and click Save.", isError: false });
    } catch (e) {
      setStatus({ text: e?.message || String(e), isError: true });
    }
  }, [requireSession]);

  const deleteAsset = useCallback(async (id) => {
    try {
      const user = await requireSession();
      if (!user) return;

      if (!window.confirm("Delete this asset?")) return;

      const { error } = await supabase.from("mhe_assets").delete().eq("id", id);
      if (error) throw error;

      if (editingAssetId === id) clearAssetForm();
      setStatus({ text: "Asset deleted.", isError: false });
      await loadAssets();
    } catch (e) {
      setStatus({ text: e?.message || String(e), isError: true });
    }
  }, [requireSession, editingAssetId, clearAssetForm, loadAssets]);

  useEffect(() => {
    (async () => {
      const user = await requireSession();
      if (!user) return;

      try {
        await loadCompaniesSites();
        await loadTypes();
        setStatus({ text: "Ready.", isError: false });
      } catch (e) {
        setStatus({ text: e?.message || String(e), isError: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (!supabase) return;
        await loadAssets();
      } catch (e) {
        setStatus({ text: e?.message || String(e), isError: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetSite, types, sites, companies]);

  const siteOptions = useMemo(() => {
    return sites.map((site) => {
      const comp = companies.find((x) => x.id === site.company_id);
      const label = `${safe(comp?.name)} – ${safe(site.name)}${site.code ? " (" + safe(site.code) + ")" : ""}`;
      return { id: site.id, label };
    });
  }, [sites, companies]);

  return (
    <AppLayout activeNav={activeNav} onSelectNav={onSelectNav} headerEmail={email}>
      <Card
        title="MHE setup"
        subtitle="Manage equipment types and assets (compliance dates, status, and site allocation)."
        actions={
          <div className="wi-mhe-actions">
            <Button
              variant="primary"
              onClick={async () => {
                await loadCompaniesSites();
                await loadTypes();
                await loadAssets();
              }}
            >
              Reload
            </Button>
          </div>
        }
      >
        <div className={status.isError ? "wi-mhe-status wi-mhe-status--error" : "wi-mhe-status"}>
          {status.text}
        </div>

        <div className="wi-mhe-tabs">
          <button className={tab === "table" ? "wi-mhe-tab wi-mhe-tab--active" : "wi-mhe-tab"} onClick={() => setTab("table")}>
            Assets table
          </button>
          <button className={tab === "add" ? "wi-mhe-tab wi-mhe-tab--active" : "wi-mhe-tab"} onClick={() => setTab("add")}>
            Add / edit asset
          </button>
          <button className={tab === "types" ? "wi-mhe-tab wi-mhe-tab--active" : "wi-mhe-tab"} onClick={() => setTab("types")}>
            Asset types
          </button>
        </div>

        {tab === "table" && (
          <div className="wi-mhe-section">
            <label className="wi-mhe-label">Site</label>
            <select
              className="wi-mhe-control"
              value={assetSite}
              onChange={(e) => {
                if (editingAssetId) clearAssetForm();
                setAssetSite(e.target.value);
              }}
            >
              {siteOptions.length ? (
                siteOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))
              ) : (
                <option value="">No sites yet</option>
              )}
            </select>

            <div className="wi-mhe-tableWrap">
              <table className="wi-mhe-table">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Type</th>
                    <th>Asset tag</th>
                    <th>Serial</th>
                    <th>Manufacturer / Model</th>
                    <th>Next due (reason)</th>
                    <th>Next inspection</th>
                    <th>Next LOLER</th>
                    <th>Next service</th>
                    <th>Next PUWER</th>
                    <th>Status</th>
                    <th className="num">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!assetSite ? (
                    <tr>
                      <td colSpan={12} className="wi-mhe-muted" style={{ padding: 10 }}>
                        Create/select a site first.
                      </td>
                    </tr>
                  ) : assets.length ? (
                    assets.map((a) => {
                      const pillMain = duePill(a._dueDate);
                      const p1 = duePill(a.next_inspection_due);
                      const p2 = duePill(a.next_loler_due);
                      const p3 = duePill(a.next_service_due);
                      const p4 = duePill(a.next_puwer_due);

                      return (
                        <tr key={a.id} className={a._rowClass}>
                          <td>{a._companyLabel}</td>
                          <td>{a._typeLabel}</td>
                          <td>{safe(a.asset_tag)}</td>
                          <td>{safe(a.serial_number)}</td>
                          <td>
                            {safe(a.manufacturer)}
                            {a.model ? " / " + safe(a.model) : ""}
                          </td>

                          <td>
                            <span className="wi-mhe-reasonPill">{safe(a._dueLabel)}</span>
                            <div>{a._dueDate ? safe(a._dueDate) : "—"}</div>
                            <div>
                              <span className={pillMain.cls}>{pillMain.label}</span>
                            </div>
                          </td>

                          <td>
                            {ymdOrDash(a.next_inspection_due)}
                            <div>
                              <span className={p1.cls}>{p1.label}</span>
                            </div>
                          </td>
                          <td>
                            {ymdOrDash(a.next_loler_due)}
                            <div>
                              <span className={p2.cls}>{p2.label}</span>
                            </div>
                          </td>
                          <td>
                            {ymdOrDash(a.next_service_due)}
                            <div>
                              <span className={p3.cls}>{p3.label}</span>
                            </div>
                          </td>
                          <td>
                            {ymdOrDash(a.next_puwer_due)}
                            <div>
                              <span className={p4.cls}>{p4.label}</span>
                            </div>
                          </td>

                          <td>{safe(a.status)}</td>
                          <td className="num">
                            <div className="wi-mhe-actionBtns">
                              <Button variant="primary" onClick={() => editAsset(a.id)}>
                                Edit
                              </Button>
                              <Button variant="primary" onClick={() => deleteAsset(a.id)}>
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={12} className="wi-mhe-muted" style={{ padding: 10 }}>
                        No assets for this site yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "add" && (
          <div className="wi-mhe-section">
            <div className="wi-mhe-muted">Site is selected on the Assets table tab.</div>

            <label className="wi-mhe-label">MHE type</label>
            <select className="wi-mhe-control" value={assetType} onChange={(e) => setAssetType(e.target.value)}>
              {types.length ? (
                types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {safe(t.type_name)}
                  </option>
                ))
              ) : (
                <option value="">No types yet.</option>
              )}
            </select>

            <div className="wi-mhe-grid2">
              <div>
                <label className="wi-mhe-label">Asset tag</label>
                <input className="wi-mhe-control" value={assetTag} onChange={(e) => setAssetTag(e.target.value)} placeholder="e.g., FLT-001" />
              </div>
              <div>
                <label className="wi-mhe-label">Serial number</label>
                <input className="wi-mhe-control" value={assetSerial} onChange={(e) => setAssetSerial(e.target.value)} placeholder="e.g., JH-123456" />
              </div>
            </div>

            <div className="wi-mhe-grid2">
              <div>
                <label className="wi-mhe-label">Manufacturer</label>
                <input className="wi-mhe-control" value={assetMfr} onChange={(e) => setAssetMfr(e.target.value)} placeholder="e.g., Toyota" />
              </div>
              <div>
                <label className="wi-mhe-label">Model</label>
                <input className="wi-mhe-control" value={assetModel} onChange={(e) => setAssetModel(e.target.value)} placeholder="e.g., 8FBEK16T" />
              </div>
            </div>

            <div className="wi-mhe-grid2">
              <div>
                <label className="wi-mhe-label">Purchase date</label>
                <input className="wi-mhe-control" type="date" value={assetPurchase} onChange={(e) => setAssetPurchase(e.target.value)} />
              </div>
              <div>
                <label className="wi-mhe-label">Status</label>
                <select className="wi-mhe-control" value={assetStatus} onChange={(e) => setAssetStatus(e.target.value)}>
                  <option value="active">active</option>
                  <option value="out_of_service">out_of_service</option>
                  <option value="sold">sold</option>
                </select>
              </div>
            </div>

            <div className="wi-mhe-grid2">
              <div>
                <label className="wi-mhe-label">Next inspection due</label>
                <input className="wi-mhe-control" type="date" value={assetNextInspection} onChange={(e) => setAssetNextInspection(e.target.value)} />
              </div>
              <div>
                <label className="wi-mhe-label">Next LOLER due</label>
                <input className="wi-mhe-control" type="date" value={assetNextLoler} onChange={(e) => setAssetNextLoler(e.target.value)} />
              </div>
            </div>

            <div className="wi-mhe-grid2">
              <div>
                <label className="wi-mhe-label">Next service due</label>
                <input className="wi-mhe-control" type="date" value={assetNextService} onChange={(e) => setAssetNextService(e.target.value)} />
              </div>
              <div>
                <label className="wi-mhe-label">Next PUWER due</label>
                <input className="wi-mhe-control" type="date" value={assetNextPuwer} onChange={(e) => setAssetNextPuwer(e.target.value)} />
              </div>
            </div>

            <div className="wi-mhe-actionsRow">
              {editingAssetId ? (
                <>
                  <span className="wi-mhe-chip">Editing asset…</span>
                  <Button variant="primary" onClick={clearAssetForm}>
                    Cancel
                  </Button>
                </>
              ) : null}
              <Button variant="primary" onClick={saveAsset}>
                {editingAssetId ? "Save changes" : "Add asset"}
              </Button>
            </div>
          </div>
        )}

        {tab === "types" && (
          <div className="wi-mhe-section">
            <h3 className="wi-mhe-h3">Add new type</h3>

            <label className="wi-mhe-label">Type name</label>
            <input
              className="wi-mhe-control"
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder="e.g., Counterbalance, Reach Truck, PPT..."
            />

            <div className="wi-mhe-checkRow">
              <label className="wi-mhe-check">
                <input type="checkbox" checked={newTypeRequiresLoler} onChange={(e) => setNewTypeRequiresLoler(e.target.checked)} /> Requires LOLER
              </label>
              <label className="wi-mhe-check">
                <input type="checkbox" checked={newTypeRequiresPuwer} onChange={(e) => setNewTypeRequiresPuwer(e.target.checked)} /> Requires PUWER
              </label>
            </div>

            <div className="wi-mhe-actionsRow">
              <Button variant="primary" onClick={addType}>
                Add type
              </Button>
            </div>

            <hr className="wi-mhe-hr" />

            <div className="wi-mhe-tableWrap">
              <table className="wi-mhe-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>LOLER</th>
                    <th>PUWER</th>
                    <th className="num">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {types.length ? (
                    types.map((t) => (
                      <TypeRow key={t.id} t={t} onSave={(name) => saveTypeName(t.id, name)} onDelete={() => deleteType(t.id)} />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="wi-mhe-muted" style={{ padding: 10 }}>
                        No MHE types yet.
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

function TypeRow({ t, onSave, onDelete }) {
  const [name, setName] = useState(t.type_name || "");
  useEffect(() => setName(t.type_name || ""), [t.type_name]);

  return (
    <tr>
      <td>
        <input className="wi-mhe-control" value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td>{t.requires_loler ? "Yes" : "No"}</td>
      <td>{t.requires_puwer ? "Yes" : "No"}</td>
      <td className="num">
        <div className="wi-mhe-actionBtns">
          <Button variant="primary" onClick={() => onSave(name)}>
            Save
          </Button>
          <Button variant="primary" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}
