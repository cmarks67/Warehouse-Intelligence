// /src/pages/MheTrainingSetup.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";
import { supabase } from "../lib/supabaseClient";

import "./MheTrainingSetup.css";

function safeLower(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

function isValidYMD(ymd) {
  if (!ymd) return false;
  const s = String(ymd).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

function daysUntil(ymd) {
  if (!ymd) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dt = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  const diff = dt.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));

  const addNextDue = useMemo(() => {
  const mt = mheTypes.find((t) => t.id === addModal.mheTypeId);
  const cycle = mt?.inspection_cycle_days;
  if (!addModal.trained_on || typeof cycle !== "number") return { date: "", days: null };
  const date = addDaysToYMD(addModal.trained_on, cycle);
  const days = date ? daysUntil(date) : null;
  return { date, days };
}, [addModal.trained_on, addModal.mheTypeId, mheTypes]);

}

function addDaysToYMD(ymd, days) {
  if (!isValidYMD(ymd) || typeof days !== "number") return "";
  const dt = new Date(`${ymd}T00:00:00`);
  dt.setDate(dt.getDate() + days);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}


export default function MheTrainingSetup() {
  const [tab, setTab] = useState("register"); // register | history

  // Hover tooltip
  const [hoverTip, setHoverTip] = useState({ open: false, x: 0, y: 0, colleagueId: "" });

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState({ type: "", message: "" });

  // Company enforcement
  const [sites, setSites] = useState([]);
  const [mheTypes, setMheTypes] = useState([]);

  const [lockedCompanyId, setLockedCompanyId] = useState("");
  const [lockedCompanyName, setLockedCompanyName] = useState("");

  // Site + filters
  const [siteId, setSiteId] = useState("");
  const [mheTypeFilter, setMheTypeFilter] = useState("ALL");
  const [nameFilter, setNameFilter] = useState("");

  // Data sets
  const [siteColleagues, setSiteColleagues] = useState([]);
  const [currentAuths, setCurrentAuths] = useState([]);

  // History tab
  const [historyColleagueId, setHistoryColleagueId] = useState("");
  const [historyMheTypeId, setHistoryMheTypeId] = useState("ALL");
  const [historyRows, setHistoryRows] = useState([]);

  // Upload (inline per auth)
  const fileInputRef = useRef(null);
  const [pendingUpload, setPendingUpload] = useState({ authId: "", colleagueId: "", mheTypeId: "" });

  // Retrain modal (Option B)
  const retrainFileRef = useRef(null);
  const [retrainModal, setRetrainModal] = useState({
    open: false,
    auth: null,
    trained_on: "",
    notes: "",
    fileName: "",
    certificatePath: "",
  });

  // Add training modal (new)
  const addFileRef = useRef(null);
  const [addModal, setAddModal] = useState({
    open: false,
    colleagueId: "",
    mheTypeId: "",
    trained_on: "",
    notes: "",
    fileName: "",
    certificatePath: "",
  });

  // Init company lock + reference data
  useEffect(() => {
    (async () => {
      setLoading(true);
      setNotice({ type: "", message: "" });

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        const userId = authData?.user?.id;
        if (!userId) throw new Error("No authenticated user.");

        const { data: cu, error: cuErr } = await supabase
          .from("company_users")
          .select("company_id, companies(name)")
          .eq("user_id", userId)
          .single();
        if (cuErr) throw cuErr;

        const companyId = cu?.company_id;
        if (!companyId) throw new Error("No company assigned to this user (company_users).");

        setLockedCompanyId(companyId);
        setLockedCompanyName(cu?.companies?.name || "—");

        const [{ data: st, error: es }, { data: mt, error: emt }] = await Promise.all([
          supabase.from("sites").select("id, company_id, name").eq("company_id", companyId).order("name"),
          supabase.from("mhe_types").select("id, type_name, inspection_cycle_days").order("type_name"),
        ]);

        if (es) throw es;
        if (emt) throw emt;

        setSites(st || []);
        setMheTypes(mt || []);

        setSiteId(st?.[0]?.id || "");
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to initialise MHE Training." });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const siteName = useMemo(() => sites.find((s) => s.id === siteId)?.name || "", [sites, siteId]);

  // Load colleagues + current auths
  const refreshRegisterData = useCallback(async () => {
    if (!siteId) {
      setSiteColleagues([]);
      setCurrentAuths([]);
      return;
    }

    const { data: cData, error: cErr } = await supabase
      .from("colleagues")
      .select("id, first_name, last_name, employment_type, active")
      .eq("site_id", siteId)
      .order("last_name", { ascending: true });

    if (cErr) throw cErr;

    const activeOnly = (cData || []).filter((c) => c.active === true);
    setSiteColleagues(activeOnly);

    // IMPORTANT: support BOTH view names (schema mismatch protection)
    let aData = null;

    const try1 = await supabase
      .from("v_mhe_authorisations_current")
      .select("*")
      .eq("site_id", siteId)
      .order("last_name", { ascending: true });

    if (!try1.error) {
      aData = try1.data || [];
    } else {
      const try2 = await supabase
        .from("v_mhe_authorisations_currents")
        .select("*")
        .eq("site_id", siteId)
        .order("last_name", { ascending: true });

      if (try2.error) throw try1.error; // original error is most helpful
      aData = try2.data || [];
    }

    setCurrentAuths(aData);

    if (!historyColleagueId && activeOnly.length) setHistoryColleagueId(activeOnly[0].id);
  }, [siteId, historyColleagueId]);

  useEffect(() => {
    (async () => {
      try {
        setNotice((n) => (n.type === "error" ? n : { type: "", message: "" }));
        await refreshRegisterData();
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to load site training data." });
      }
    })();
  }, [refreshRegisterData]);

  // Group auths by colleague
  const authsByColleague = useMemo(() => {
    const map = new Map();
    (currentAuths || []).forEach((a) => {
      const arr = map.get(a.colleague_id) || [];
      arr.push(a);
      map.set(a.colleague_id, arr);
    });
    map.forEach((arr, key) => {
      arr.sort((x, y) => String(x.expires_on || "").localeCompare(String(y.expires_on || "")));
      map.set(key, arr);
    });
    return map;
  }, [currentAuths]);

  // Colleague rows with ordering
  const colleagueRows = useMemo(() => {
    const nf = safeLower(nameFilter);

    const rows = (siteColleagues || [])
      .map((c) => {
        const list = authsByColleague.get(c.id) || [];
        const dueSoonAny = list.some((a) => (a.days_to_expiry ?? 999999) <= 30);
        const minDays = list.length ? Math.min(...list.map((a) => a.days_to_expiry ?? 999999)) : 999999;

        const visibleAuths =
          mheTypeFilter === "ALL" ? list : list.filter((a) => a.mhe_type_id === mheTypeFilter);

        return {
          ...c,
          _auths: list,
          _visibleAuths: visibleAuths,
          _dueSoon: dueSoonAny,
          _minDays: minDays,
        };
      })
       .filter((c) => c._auths.length > 0)  //

      .filter((c) => {
        if (!nf) return true;
        const full = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
        const rev = `${c.last_name || ""} ${c.first_name || ""}`.toLowerCase();
        return full.includes(nf) || rev.includes(nf);
      })
      .filter((c) => (mheTypeFilter === "ALL" ? true : c._visibleAuths.length > 0));

    rows.sort((a, b) => {
      if (a._dueSoon !== b._dueSoon) return a._dueSoon ? -1 : 1;
      if (a._minDays !== b._minDays) return a._minDays - b._minDays;
      const ln = (a.last_name || "").localeCompare(b.last_name || "");
      if (ln !== 0) return ln;
      return (a.first_name || "").localeCompare(b.first_name || "");
    });

    return rows;
  }, [siteColleagues, authsByColleague, nameFilter, mheTypeFilter]);

  // Hover tooltip content
  const hoverAuths = useMemo(() => {
    if (!hoverTip.open || !hoverTip.colleagueId) return [];
    return authsByColleague.get(hoverTip.colleagueId) || [];
  }, [hoverTip.open, hoverTip.colleagueId, authsByColleague]);

  const moveHoverTip = (e, colleagueId) => {
    const pad = 14;
    const boxW = 420;
    const boxH = 320;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = e.clientX + 14;
    let y = e.clientY + 14;

    if (x + boxW + pad > vw) x = e.clientX - boxW - 14;
    if (y + boxH + pad > vh) y = e.clientY - boxH - 14;

    setHoverTip({ open: true, x, y, colleagueId });
  };

  // ---- Upload certificate for existing auth ----
  const beginUpload = (authRow) => {
    setNotice({ type: "", message: "" });
    setPendingUpload({ authId: authRow.id, colleagueId: authRow.colleague_id, mheTypeId: authRow.mhe_type_id });
    fileInputRef.current?.click();
  };

  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setNotice({ type: "", message: "" });

    try {
      if (!pendingUpload.authId) throw new Error("No authorisation selected for upload.");
      if (!lockedCompanyId) throw new Error("No company assigned.");

      const path = `company/${lockedCompanyId}/colleague/${pendingUpload.colleagueId}/mhe/${pendingUpload.mheTypeId}/${Date.now()}_${file.name}`;

      const { error: upErr } = await supabase.storage.from("mhe-certificates").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase
        .from("colleague_mhe_authorisations")
        .update({ certificate_path: path })
        .eq("id", pendingUpload.authId);
      if (dbErr) throw dbErr;

      setNotice({ type: "success", message: "Certificate uploaded." });
      await refreshRegisterData();
    } catch (err) {
      setNotice({ type: "error", message: err?.message || "Failed to upload certificate." });
    } finally {
      setLoading(false);
      setPendingUpload({ authId: "", colleagueId: "", mheTypeId: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ---- Add training (NEW) ----
  const openAddTraining = (colleagueId = "") => {
    setNotice({ type: "", message: "" });
    setAddModal({
      open: true,
      colleagueId: colleagueId || (siteColleagues[0]?.id || ""),
      mheTypeId: mheTypes[0]?.id || "",
      trained_on: "",
      notes: "",
      fileName: "",
      certificatePath: "",
    });
  };

  const closeAddTraining = () => {
    setAddModal({ open: false, colleagueId: "", mheTypeId: "", trained_on: "", notes: "", fileName: "", certificatePath: "" });
  };

  const pickAddFile = () => addFileRef.current?.click();

  const handleAddFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setNotice({ type: "", message: "" });
    setLoading(true);

    try {
      if (!lockedCompanyId) throw new Error("No company assigned.");
      if (!addModal.colleagueId) throw new Error("Select a colleague first.");
      if (!addModal.mheTypeId) throw new Error("Select an MHE type first.");

      const path = `company/${lockedCompanyId}/colleague/${addModal.colleagueId}/mhe/${addModal.mheTypeId}/${Date.now()}_${file.name}`;

      const { error: upErr } = await supabase.storage.from("mhe-certificates").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;

      setAddModal((m) => ({ ...m, fileName: file.name, certificatePath: path }));
    } catch (err) {
      setNotice({ type: "error", message: err?.message || "Failed to upload certificate." });
    } finally {
      setLoading(false);
      if (addFileRef.current) addFileRef.current.value = "";
    }
  };

  const submitAddTraining = async () => {
    setNotice({ type: "", message: "" });

    if (!addModal.colleagueId) return setNotice({ type: "error", message: "Colleague is required." });
    if (!addModal.mheTypeId) return setNotice({ type: "error", message: "MHE type is required." });
    if (!addModal.trained_on || !isValidYMD(addModal.trained_on)) {
      return setNotice({ type: "error", message: "Trained on date is required." });
    }

    setLoading(true);
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const userId = authData?.user?.id || null;

      // If an ACTIVE record exists for this colleague/type, you may want to force retrain path instead.
      // For now: we allow insert; DB unique index (active) will prevent duplicates.
      const payload = {
        company_id: lockedCompanyId, // trigger will align
        site_id: siteId,             // trigger will align
        colleague_id: addModal.colleagueId,
        mhe_type_id: addModal.mheTypeId,
        trained_on: addModal.trained_on,
        status: "ACTIVE",
        signed_off_by: userId,
        certificate_path: addModal.certificatePath || null,
        notes: addModal.notes.trim() || null,
      };

      const { error: insErr } = await supabase.from("colleague_mhe_authorisations").insert(payload);
      if (insErr) throw insErr;

      setNotice({ type: "success", message: "Training record created." });
      closeAddTraining();
      await refreshRegisterData();
    } catch (e) {
      setNotice({ type: "error", message: e?.message || "Failed to create training record." });
    } finally {
      setLoading(false);
    }
  };

  // ---- Retrain (Option B) ----
  const openRetrain = (authRow) => {
    setNotice({ type: "", message: "" });
    setRetrainModal({ open: true, auth: authRow, trained_on: "", notes: "", fileName: "", certificatePath: "" });
  };

  const closeRetrain = () => {
    setRetrainModal({ open: false, auth: null, trained_on: "", notes: "", fileName: "", certificatePath: "" });
  };

  const pickRetrainFile = () => retrainFileRef.current?.click();

  const handleRetrainFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setNotice({ type: "", message: "" });
    setLoading(true);

    try {
      if (!retrainModal.auth) throw new Error("No authorisation selected.");
      const a = retrainModal.auth;

      const path = `company/${lockedCompanyId}/colleague/${a.colleague_id}/mhe/${a.mhe_type_id}/${Date.now()}_${file.name}`;

      const { error: upErr } = await supabase.storage.from("mhe-certificates").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;

      setRetrainModal((m) => ({ ...m, fileName: file.name, certificatePath: path }));
    } catch (err) {
      setNotice({ type: "error", message: err?.message || "Failed to upload retrain certificate." });
    } finally {
      setLoading(false);
      if (retrainFileRef.current) retrainFileRef.current.value = "";
    }
  };

  const submitRetrain = async () => {
    setNotice({ type: "", message: "" });

    const a = retrainModal.auth;
    if (!a) return setNotice({ type: "error", message: "No authorisation selected." });

    if (!retrainModal.trained_on || !isValidYMD(retrainModal.trained_on)) {
      return setNotice({ type: "error", message: "Trained on date is required." });
    }

    setLoading(true);
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const userId = authData?.user?.id || null;

      // 1) revoke existing
      const { error: revErr } = await supabase
        .from("colleague_mhe_authorisations")
        .update({ status: "REVOKED" })
        .eq("id", a.id);
      if (revErr) throw revErr;

      // 2) insert new ACTIVE
      const payload = {
        company_id: lockedCompanyId,
        site_id: siteId,
        colleague_id: a.colleague_id,
        mhe_type_id: a.mhe_type_id,
        trained_on: retrainModal.trained_on,
        status: "ACTIVE",
        signed_off_by: userId,
        certificate_path: retrainModal.certificatePath || null,
        notes: retrainModal.notes.trim() || null,
      };

      const { error: insErr } = await supabase.from("colleague_mhe_authorisations").insert(payload);
      if (insErr) throw insErr;

      setNotice({ type: "success", message: "Retraining recorded. History preserved." });
      closeRetrain();
      await refreshRegisterData();
      if (tab === "history") await refreshHistory();
    } catch (e) {
      setNotice({ type: "error", message: e?.message || "Failed to record retraining." });
    } finally {
      setLoading(false);
    }
  };

  // ---- History tab ----
  const mheTypeNameById = useMemo(() => {
    const map = new Map();
    (mheTypes || []).forEach((t) => map.set(t.id, t.type_name));
    return map;
  }, [mheTypes]);

  const refreshHistory = useCallback(async () => {
    if (!historyColleagueId) {
      setHistoryRows([]);
      return;
    }

    let q = supabase
      .from("colleague_mhe_authorisations")
      .select("id, mhe_type_id, trained_on, expires_on, status, certificate_path, notes, signed_off_at, created_at")
      .eq("colleague_id", historyColleagueId)
      .order("trained_on", { ascending: false });

    if (historyMheTypeId !== "ALL") q = q.eq("mhe_type_id", historyMheTypeId);

    const { data, error } = await q;
    if (error) throw error;
    setHistoryRows(data || []);
  }, [historyColleagueId, historyMheTypeId]);

  useEffect(() => {
    if (tab !== "history") return;
    (async () => {
      try {
        await refreshHistory();
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to load training history." });
      }
    })();
  }, [tab, refreshHistory]);

  return (
    <AppLayout>
      <div className="wi-page wi-mheTrainingPage">
        <div className="wi-pageHeader">
          <h1 className="wi-pageTitle">MHE training tracker</h1>
          <div className="wi-pageSubtitle">
            Company enforced: <strong>{lockedCompanyName || "—"}</strong>
            {siteName ? (
              <>
                {" "}
                • Site: <strong>{siteName}</strong>
              </>
            ) : null}
          </div>
        </div>

        {notice.message && (
          <div className={`wi-alert wi-alert--${notice.type || "info"}`}>{notice.message}</div>
        )}

        <div className="wi-tabsRow">
          <button className={`wi-tabPill ${tab === "register" ? "active" : ""}`} onClick={() => setTab("register")} type="button">
            Training register
          </button>
          <button className={`wi-tabPill ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")} type="button">
            Audit history
          </button>
        </div>

        {/* Hidden file inputs */}
        <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={handleUploadFile} />
        <input ref={retrainFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={handleRetrainFile} />
        <input ref={addFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={handleAddFile} />

        {tab === "register" && (
          <Card
            title="Training register"
            subtitle="Due soon colleagues (≤ 30 days to expiry) are shown at the top. Hover a colleague to see all current authorisations."
            actions={
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button variant="primary" onClick={() => openAddTraining("")} disabled={loading || !siteColleagues.length}>
                  Add training
                </Button>
                <Button variant="primary" onClick={refreshRegisterData} disabled={loading}>
                  Refresh
                </Button>
              </div>
            }
          >
            <div className="wi-formGrid">
              <div className="wi-field wi-span2">
                <label className="wi-label">Site</label>
                <select
                  className="wi-input"
                  value={siteId}
                  onChange={(e) => {
                    setSiteId(e.target.value);
                    setHoverTip({ open: false, x: 0, y: 0, colleagueId: "" });
                  }}
                  disabled={loading || !lockedCompanyId}
                >
                  <option value="">{lockedCompanyId ? "Select site…" : "Loading company…"}</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="wi-field">
                <label className="wi-label">Search colleague</label>
                <input className="wi-input" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="Name…" disabled={loading} />
              </div>

              <div className="wi-field">
                <label className="wi-label">Filter MHE type</label>
                <select className="wi-input" value={mheTypeFilter} onChange={(e) => setMheTypeFilter(e.target.value)} disabled={loading}>
                  <option value="ALL">All types</option>
                  {mheTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.type_name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="wi-registerList">
              {colleagueRows.length === 0 ? (
                <div className="wi-muted">No colleagues / authorisations match the current filters.</div>
              ) : (
                colleagueRows.map((c) => (
                  <div key={c.id} className={`wi-colleagueBlock ${c._dueSoon ? "is-dueSoon" : ""}`}>
                    <div
                      className="wi-colleagueHeader"
                      onMouseEnter={(e) => moveHoverTip(e, c.id)}
                      onMouseMove={(e) => moveHoverTip(e, c.id)}
                      onMouseLeave={() => setHoverTip({ open: false, x: 0, y: 0, colleagueId: "" })}
                    >
                      <div className="wi-colleagueName">
                        {c.last_name}, {c.first_name}
                        <span className="wi-colleagueMeta">({c.employment_type})</span>
                      </div>

                      <div className="wi-colleagueBadges">
                        {c._dueSoon && <span className="wi-badge wi-badge--danger">Due soon</span>}
                        <span className="wi-badge">{c._auths.length} authorisation(s)</span>
                        <Button variant="primary" onClick={() => openAddTraining(c.id)} disabled={loading}>
                          Add training
                        </Button>
                      </div>
                    </div>

                    {c._visibleAuths.length === 0 ? (
                      <div className="wi-muted" style={{ padding: "8px 0" }}>
                        No active authorisations for the selected MHE filter.
                      </div>
                    ) : (
                      <div className="wi-tableWrap">
                        <table className="wi-table">
                          <thead>
                            <tr>
                              <th>MHE type</th>
                              <th>Trained on</th>
                              <th>Expires</th>
                              <th>Days</th>
                              <th>Certificate</th>
                              <th style={{ width: 220 }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c._visibleAuths.map((a) => {
                              const dueSoon = (a.days_to_expiry ?? 999999) <= 30;
                              const hasCert = !!a.certificate_path;
                              return (
                                <tr key={a.id} className={dueSoon ? "wi-rowDueSoon" : ""}>
                                  <td>{a.mhe_type}</td>
                                  <td>{a.trained_on}</td>
                                  <td>{a.expires_on}</td>
                                  <td>{a.days_to_expiry}</td>
                                  <td>{hasCert ? "Yes" : "No"}</td>
                                  <td>
                                    <div className="wi-actionsRow">
                                      <Button variant="primary" onClick={() => beginUpload(a)} disabled={loading}>
                                        {hasCert ? "Replace cert" : "Upload cert"}
                                      </Button>
                                      <Button variant="primary" onClick={() => openRetrain(a)} disabled={loading}>
                                        Retrain
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {hoverTip.open && hoverTip.colleagueId && (
              <div className="wi-floatTip" style={{ left: hoverTip.x, top: hoverTip.y }}>
                <div className="wi-floatTip__title">Qualified to drive</div>
                {hoverAuths.length === 0 ? (
                  <div className="wi-muted">No active authorisations.</div>
                ) : (
                  <div className="wi-floatTip__list">
                    {hoverAuths.map((a) => (
                      <div key={a.id} className="wi-floatTip__row">
                        <div className="t">{a.mhe_type}</div>
                        <div className="d">
                          Trained: <strong>{a.trained_on}</strong> • Expires: <strong>{a.expires_on}</strong> •{" "}
                          {a.days_to_expiry}d • Cert: <strong>{a.certificate_path ? "Yes" : "No"}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {tab === "history" && (
          <Card title="Audit history" subtitle="Full training record per colleague (includes revoked/expired).">
            <div className="wi-formGrid">
              <div className="wi-field wi-span2">
                <label className="wi-label">Colleague</label>
                <select className="wi-input" value={historyColleagueId} onChange={(e) => setHistoryColleagueId(e.target.value)} disabled={loading}>
                  <option value="">Select colleague…</option>
                  {siteColleagues.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.last_name}, {c.first_name} ({c.employment_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="wi-field">
                <label className="wi-label">Filter MHE type</label>
                <select className="wi-input" value={historyMheTypeId} onChange={(e) => setHistoryMheTypeId(e.target.value)} disabled={loading}>
                  <option value="ALL">All types</option>
                  {mheTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.type_name}</option>
                  ))}
                </select>
              </div>

              <div className="wi-field">
                <label className="wi-label">Actions</label>
                <Button variant="primary" onClick={refreshHistory} disabled={loading || !historyColleagueId}>
                  Refresh history
                </Button>
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              {!historyColleagueId ? (
                <div className="wi-muted">Select a colleague to view their full training record.</div>
              ) : historyRows.length === 0 ? (
                <div className="wi-muted">No training records found.</div>
              ) : (
                <div className="wi-tableWrap wi-tableWrap--tall">
                  <table className="wi-table">
                    <thead>
                      <tr>
                        <th>MHE type</th>
                        <th>Trained on</th>
                        <th>Expires</th>
                        <th>Days</th>
                        <th>Status</th>
                        <th>Certificate</th>
                        <th>Signed off</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((r) => {
                        const typeName = mheTypeNameById.get(r.mhe_type_id) || r.mhe_type_id;
                        const dte = r.expires_on ? daysUntil(r.expires_on) : null;
                        return (
                          <tr key={r.id} className={r.status === "ACTIVE" ? "" : "wi-rowHistory"}>
                            <td>{typeName}</td>
                            <td>{r.trained_on}</td>
                            <td>{r.expires_on}</td>
                            <td>{dte ?? "—"}</td>
                            <td>{r.status || "—"}</td>
                            <td>{r.certificate_path ? "Yes" : "No"}</td>
                            <td>{r.signed_off_at ? String(r.signed_off_at).replace("T", " ").slice(0, 19) : "—"}</td>
                            <td className="wi-cellNotes">{r.notes || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Add Training Modal */}
        {addModal.open && (
          <div className="wi-modalOverlay" role="dialog" aria-modal="true">
            <div className="wi-modal">
              <div className="wi-modalHeader">
                <div className="wi-modalTitle">Add training record</div>
                <button className="wi-modalClose" onClick={closeAddTraining} type="button">×</button>
              </div>

              <div className="wi-modalBody">
                <div className="wi-formGrid">
                  <div className="wi-field wi-span2">
                    <label className="wi-label">Colleague</label>
                    <select
                      className="wi-input"
                      value={addModal.colleagueId}
                      onChange={(e) => setAddModal((m) => ({ ...m, colleagueId: e.target.value }))}
                      disabled={loading}
                    >
                      <option value="">Select colleague…</option>
                      {siteColleagues.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.last_name}, {c.first_name} ({c.employment_type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="wi-field wi-span2">
                    <label className="wi-label">MHE type</label>
                    <select
                      className="wi-input"
                      value={addModal.mheTypeId}
                      onChange={(e) => setAddModal((m) => ({ ...m, mheTypeId: e.target.value }))}
                      disabled={loading}
                    >
                      <option value="">Select MHE type…</option>
                      {mheTypes.map((t) => (
                        <option key={t.id} value={t.id}>{t.type_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="wi-field wi-span2">
                    <label className="wi-label">Trained on</label>
                    <input
                      type="date"
                      className="wi-input"
                      value={addModal.trained_on}
                      onChange={(e) => setAddModal((m) => ({ ...m, trained_on: e.target.value }))}
                      disabled={loading}
                    />
                  </div>

                  <div className="wi-field wi-span2">
                    <label className="wi-label">Certificate (optional)</label>
                    <div className="wi-uploadRow">
                      <Button variant="primary" onClick={pickAddFile} disabled={loading}>
                        Upload file
                      </Button>
                      <div className="wi-helper">
                        {addModal.fileName ? `Selected: ${addModal.fileName}` : "PDF/JPG/PNG"}
                        {addModal.certificatePath ? " (uploaded)" : ""}
                      </div>
                    </div>
                  </div>

                  <div className="wi-field wi-span2">
                    <label className="wi-label">Notes (optional)</label>
                    <input
                      className="wi-input"
                      value={addModal.notes}
                      onChange={(e) => setAddModal((m) => ({ ...m, notes: e.target.value }))}
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              <div className="wi-modalFooter">
                <Button variant="primary" onClick={submitAddTraining} disabled={loading}>
                  {loading ? "Saving…" : "Save"}
                </Button>
                <Button variant="primary" onClick={closeAddTraining} disabled={loading}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Retrain Modal */}
        {retrainModal.open && retrainModal.auth && (
          <div className="wi-modalOverlay" role="dialog" aria-modal="true">
            <div className="wi-modal">
              <div className="wi-modalHeader">
                <div className="wi-modalTitle">Record retraining (history preserved)</div>
                <button className="wi-modalClose" onClick={closeRetrain} type="button">×</button>
              </div>

              <div className="wi-modalBody">
                <div className="wi-muted" style={{ marginBottom: 10 }}>
                  This will revoke the current record and create a new ACTIVE authorisation.
                </div>

                <div className="wi-formGrid">
                  <div className="wi-field wi-span2">
                    <label className="wi-label">MHE type</label>
                    <input className="wi-input" value={retrainModal.auth.mhe_type} disabled />
                  </div>

                  <div className="wi-field wi-span2">
                    <label className="wi-label">Trained on</label>
                    <input
                      type="date"
                      className="wi-input"
                      value={retrainModal.trained_on}
                      onChange={(e) => setRetrainModal((m) => ({ ...m, trained_on: e.target.value }))}
                      disabled={loading}
                    />
                  </div>

                  <div className="wi-field wi-span2">
  <label className="wi-label">Next training due</label>
  <input
    className="wi-input"
    value={
      addNextDue.date
        ? `${addNextDue.date}${addNextDue.days !== null ? ` (${addNextDue.days} days)` : ""}`
        : "—"
    }
    disabled
  />
</div>


                  <div className="wi-field wi-span2">
                    <label className="wi-label">Certificate (optional)</label>
                    <div className="wi-uploadRow">
                      <Button variant="primary" onClick={pickRetrainFile} disabled={loading}>
                        Upload file
                      </Button>
                      <div className="wi-helper">
                        {retrainModal.fileName ? `Selected: ${retrainModal.fileName}` : "PDF/JPG/PNG"}
                        {retrainModal.certificatePath ? " (uploaded)" : ""}
                      </div>
                    </div>
                  </div>

                  <div className="wi-field wi-span2">
                    <label className="wi-label">Notes (optional)</label>
                    <input
                      className="wi-input"
                      value={retrainModal.notes}
                      onChange={(e) => setRetrainModal((m) => ({ ...m, notes: e.target.value }))}
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              <div className="wi-modalFooter">
                <Button variant="primary" onClick={submitRetrain} disabled={loading}>
                  {loading ? "Saving…" : "Save retraining"}
                </Button>
                <Button variant="primary" onClick={closeRetrain} disabled={loading}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
