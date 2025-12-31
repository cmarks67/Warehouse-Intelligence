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
}

export default function MheTrainingSetup() {
  const [tab, setTab] = useState("register"); // register | history
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState({ type: "", message: "" });

  // Company enforcement
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [mheTypes, setMheTypes] = useState([]);

  const [lockedCompanyId, setLockedCompanyId] = useState("");
  const [lockedCompanyName, setLockedCompanyName] = useState("");

  // Filters
  const [siteId, setSiteId] = useState("");
  const [mheTypeFilter, setMheTypeFilter] = useState("ALL");
  const [nameFilter, setNameFilter] = useState("");

  // Datasets
  const [siteColleagues, setSiteColleagues] = useState([]);
  const [currentAuths, setCurrentAuths] = useState([]);

  // Hover box
  const [hoverTip, setHoverTip] = useState({ open: false, x: 0, y: 0, colleagueId: "" });

  // History tab
  const [historyColleagueId, setHistoryColleagueId] = useState("");
  const [historyMheTypeId, setHistoryMheTypeId] = useState("ALL");
  const [historyRows, setHistoryRows] = useState([]);

  // Upload refs
  const inlineFileRef = useRef(null);
  const addFileRef = useRef(null);
  const retrainFileRef = useRef(null);

  const [pendingInlineUpload, setPendingInlineUpload] = useState({ authId: "", colleagueId: "", mheTypeId: "" });

  // Add modal
  const [addModal, setAddModal] = useState({
    open: false,
    colleague_id: "",
    mhe_type_id: "",
    trained_on: "",
    expires_on: "",
    notes: "",
    fileName: "",
    certificatePath: "",
  });

  // Retrain modal
  const [retrainModal, setRetrainModal] = useState({
    open: false,
    auth: null, // row from current auth view
    trained_on: "",
    expires_on: "",
    notes: "",
    fileName: "",
    certificatePath: "",
  });

  // ---------- Init (company lock + ref data) ----------
  useEffect(() => {
    (async () => {
      setLoading(true);
      setNotice({ type: "", message: "" });

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const userId = authData?.user?.id;
        if (!userId) throw new Error("Not signed in.");

        const { data: cu, error: cuErr } = await supabase
          .from("company_users")
          .select("company_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

        if (cuErr) throw cuErr;
        if (!cu?.company_id) throw new Error("No company assigned to this user (company_users).");

        setLockedCompanyId(cu.company_id);

        const [{ data: compData, error: compErr }, { data: siteData, error: siteErr }, { data: typesData, error: typeErr }] =
          await Promise.all([
            supabase.from("companies").select("id, name").order("name", { ascending: true }),
            supabase.from("sites").select("id, name, company_id").order("name", { ascending: true }),
            supabase.from("mhe_types").select("id, type_name").order("type_name", { ascending: true }),
          ]);

        if (compErr) throw compErr;
        if (siteErr) throw siteErr;
        if (typeErr) throw typeErr;

        setCompanies(compData || []);
        setSites(siteData || []);
        setMheTypes(typesData || []);

        const compName = (compData || []).find((c) => c.id === cu.company_id)?.name || "";
        setLockedCompanyName(compName);

        const firstSite = (siteData || []).find((s) => s.company_id === cu.company_id);
        if (firstSite?.id) setSiteId(firstSite.id);
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to initialise MHE training." });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sitesForCompany = useMemo(() => {
    if (!lockedCompanyId) return [];
    return (sites || []).filter((s) => s.company_id === lockedCompanyId);
  }, [sites, lockedCompanyId]);

  const siteName = useMemo(() => {
    return sitesForCompany.find((s) => s.id === siteId)?.name || "";
  }, [sitesForCompany, siteId]);

  // ---------- Register refresh ----------
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

    const { data: aData, error: aErr } = await supabase
      .from("v_mhe_authorisations_current")
      .select("*")
      .eq("site_id", siteId)
      .order("last_name", { ascending: true });

    if (aErr) throw aErr;

    // Use expires_on as "next training due"
    const normalised = (aData || []).map((a) => {
      const due = a.expires_on || null;
      const dte = due ? daysUntil(due) : null;
      return { ...a, _due_date: due, _days_to_due: dte };
    });

    setCurrentAuths(normalised);

    if (!historyColleagueId && activeOnly.length) setHistoryColleagueId(activeOnly[0].id);
  }, [siteId, historyColleagueId]);

  useEffect(() => {
    (async () => {
      try {
        await refreshRegisterData();
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to load training data." });
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

    map.forEach((arr, k) => {
      arr.sort((x, y) => (x._days_to_due ?? 999999) - (y._days_to_due ?? 999999));
      map.set(k, arr);
    });

    return map;
  }, [currentAuths]);

  const colleagueRows = useMemo(() => {
    const nf = safeLower(nameFilter);

    let rows = (siteColleagues || [])
      .map((c) => {
        const list = authsByColleague.get(c.id) || [];
        const dueSoonAny = list.some((a) => (a._days_to_due ?? 999999) <= 30);
        const minDays = list.length ? Math.min(...list.map((a) => a._days_to_due ?? 999999)) : 999999;

        return { ...c, _auths: list, _dueSoon: dueSoonAny, _minDays: minDays };
      })
      // Hide colleagues with 0 training (as requested)
      .filter((c) => (c._auths || []).length > 0)
      // Name filter
      .filter((c) => {
        if (!nf) return true;
        const full = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
        const rev = `${c.last_name || ""} ${c.first_name || ""}`.toLowerCase();
        return full.includes(nf) || rev.includes(nf);
      })
      // Apply MHE filter at list level
      .map((c) => {
        const filtered =
          mheTypeFilter === "ALL" ? c._auths : c._auths.filter((a) => a.mhe_type_id === mheTypeFilter);
        return { ...c, _visibleAuths: filtered };
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

  // Hover contents (all auths, regardless of filter)
  const hoverAuths = useMemo(() => {
    if (!hoverTip.colleagueId) return [];
    return authsByColleague.get(hoverTip.colleagueId) || [];
  }, [hoverTip.colleagueId, authsByColleague]);

  const moveHoverTip = (e, colleagueId) => {
    const boxW = 440;
    const boxH = 240;
    const pad = 12;

    const vw = window.innerWidth || 1200;
    const vh = window.innerHeight || 800;

    let x = e.clientX + 12;
    let y = e.clientY + 12;

    if (x + boxW + pad > vw) x = vw - boxW - pad;
    if (y + boxH + pad > vh) y = vh - boxH - pad;

    setHoverTip({ open: true, x, y, colleagueId });
  };

  // ---------- Storage helpers ----------
  const uploadCertificate = async ({ colleagueId, mheTypeId, file }) => {
    if (!file) return { path: null };

    if (!lockedCompanyId) throw new Error("No company assigned.");
    const path = `company/${lockedCompanyId}/colleague/${colleagueId}/mhe/${mheTypeId}/${Date.now()}_${file.name}`;

    const { error: upErr } = await supabase.storage.from("mhe-certificates").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (upErr) throw upErr;

    return { path };
  };

  // ---------- Inline upload for existing auth ----------
  const beginInlineUpload = (authRow) => {
    setNotice({ type: "", message: "" });
    setPendingInlineUpload({ authId: authRow.id, colleagueId: authRow.colleague_id, mheTypeId: authRow.mhe_type_id });
    inlineFileRef.current?.click();
  };

  const handleInlineFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setNotice({ type: "", message: "" });

    try {
      if (!pendingInlineUpload.authId) throw new Error("No authorisation selected.");
      const { path } = await uploadCertificate({
        colleagueId: pendingInlineUpload.colleagueId,
        mheTypeId: pendingInlineUpload.mheTypeId,
        file,
      });

      const { error: dbErr } = await supabase
        .from("colleague_mhe_authorisations")
        .update({ certificate_path: path })
        .eq("id", pendingInlineUpload.authId);

      if (dbErr) throw dbErr;

      setNotice({ type: "success", message: "Certificate uploaded." });
      await refreshRegisterData();
    } catch (err) {
      setNotice({ type: "error", message: err?.message || "Failed to upload certificate." });
    } finally {
      setLoading(false);
      setPendingInlineUpload({ authId: "", colleagueId: "", mheTypeId: "" });
      if (inlineFileRef.current) inlineFileRef.current.value = "";
    }
  };

  // ---------- Add training ----------
  const openAdd = () => {
    setNotice({ type: "", message: "" });
    setAddModal({
      open: true,
      colleague_id: siteColleagues?.[0]?.id || "",
      mhe_type_id: mheTypes?.[0]?.id || "",
      trained_on: "",
      expires_on: "",
      notes: "",
      fileName: "",
      certificatePath: "",
    });
  };

  const closeAdd = () => {
    setAddModal({
      open: false,
      colleague_id: "",
      mhe_type_id: "",
      trained_on: "",
      expires_on: "",
      notes: "",
      fileName: "",
      certificatePath: "",
    });
  };

  const pickAddFile = () => addFileRef.current?.click();

  const handleAddFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setNotice({ type: "", message: "" });

    try {
      if (!addModal.colleague_id || !addModal.mhe_type_id) throw new Error("Select colleague and MHE type first.");
      const { path } = await uploadCertificate({
        colleagueId: addModal.colleague_id,
        mheTypeId: addModal.mhe_type_id,
        file,
      });

      setAddModal((m) => ({ ...m, fileName: file.name, certificatePath: path }));
    } catch (err) {
      setNotice({ type: "error", message: err?.message || "Failed to upload certificate." });
    } finally {
      setLoading(false);
      if (addFileRef.current) addFileRef.current.value = "";
    }
  };

  const submitAdd = async () => {
    setNotice({ type: "", message: "" });

    if (!siteId) return setNotice({ type: "error", message: "Select a site first." });
    if (!addModal.colleague_id) return setNotice({ type: "error", message: "Colleague is required." });
    if (!addModal.mhe_type_id) return setNotice({ type: "error", message: "MHE type is required." });

    if (!addModal.trained_on || !isValidYMD(addModal.trained_on)) {
      return setNotice({ type: "error", message: "Trained on date is required." });
    }
    if (!addModal.expires_on || !isValidYMD(addModal.expires_on)) {
      return setNotice({ type: "error", message: "Next training due date is required." });
    }

    setLoading(true);
    try {
      const payload = {
        site_id: siteId,
        colleague_id: addModal.colleague_id,
        mhe_type_id: addModal.mhe_type_id,
        trained_on: addModal.trained_on,
        expires_on: addModal.expires_on, // ✅ manual next training due stored here
        status: "ACTIVE",
        certificate_path: addModal.certificatePath || null,
        notes: addModal.notes.trim() || null,
      };

      const { error: insErr } = await supabase.from("colleague_mhe_authorisations").insert(payload);
      if (insErr) {
        if (String(insErr.code) === "23505") {
          throw new Error("A training record already exists for this colleague + MHE type. Use Retrain instead.");
        }
        throw insErr;
      }

      setNotice({ type: "success", message: "Training record added." });
      closeAdd();
      await refreshRegisterData();
    } catch (e) {
      setNotice({ type: "error", message: e?.message || "Failed to add training record." });
    } finally {
      setLoading(false);
    }
  };

  // ---------- Retrain (history preserving) ----------
  const openRetrain = (authRow) => {
    setNotice({ type: "", message: "" });
    setRetrainModal({
      open: true,
      auth: authRow,
      trained_on: "",
      expires_on: "",
      notes: "",
      fileName: "",
      certificatePath: "",
    });
  };

  const closeRetrain = () => {
    setRetrainModal({ open: false, auth: null, trained_on: "", expires_on: "", notes: "", fileName: "", certificatePath: "" });
  };

  const pickRetrainFile = () => retrainFileRef.current?.click();

  const handleRetrainFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setNotice({ type: "", message: "" });

    try {
      if (!retrainModal.auth) throw new Error("No authorisation selected.");
      const a = retrainModal.auth;

      const { path } = await uploadCertificate({
        colleagueId: a.colleague_id,
        mheTypeId: a.mhe_type_id,
        file,
      });

      setRetrainModal((m) => ({ ...m, fileName: file.name, certificatePath: path }));
    } catch (err) {
      setNotice({ type: "error", message: err?.message || "Failed to upload certificate." });
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
    if (!retrainModal.expires_on || !isValidYMD(retrainModal.expires_on)) {
      return setNotice({ type: "error", message: "Next training due date is required." });
    }

    setLoading(true);
    try {
      // mark existing record as EXPIRED (valid enum)
      const { error: expErr } = await supabase
        .from("colleague_mhe_authorisations")
        .update({ status: "EXPIRED" })
        .eq("id", a.id);

      if (expErr) throw expErr;

      const payload = {
        site_id: siteId,
        colleague_id: a.colleague_id,
        mhe_type_id: a.mhe_type_id,
        trained_on: retrainModal.trained_on,
        expires_on: retrainModal.expires_on,
        status: "ACTIVE",
        certificate_path: retrainModal.certificatePath || null,
        notes: retrainModal.notes.trim() || null,
      };

      const { error: insErr } = await supabase.from("colleague_mhe_authorisations").insert(payload);
      if (insErr) throw insErr;

      setNotice({ type: "success", message: "Retraining recorded. Previous record preserved in history." });
      closeRetrain();

      await refreshRegisterData();
      if (tab === "history") await refreshHistory();
    } catch (e) {
      setNotice({ type: "error", message: e?.message || "Failed to record retraining." });
    } finally {
      setLoading(false);
    }
  };

  // ---------- History ----------
  const refreshHistory = useCallback(async () => {
    if (!historyColleagueId) {
      setHistoryRows([]);
      return;
    }

    let q = supabase
      .from("colleague_mhe_authorisations")
      .select("id, colleague_id, mhe_type_id, trained_on, expires_on, status, certificate_path, notes, created_at")
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

  const mheTypeNameById = useMemo(() => {
    const map = new Map();
    (mheTypes || []).forEach((t) => map.set(t.id, t.type_name));
    return map;
  }, [mheTypes]);

  // ---------- Render ----------
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
          <button
            className={`wi-tabPill ${tab === "register" ? "active" : ""}`}
            onClick={() => setTab("register")}
            type="button"
          >
            Training register
          </button>
          <button
            className={`wi-tabPill ${tab === "history" ? "active" : ""}`}
            onClick={() => setTab("history")}
            type="button"
          >
            Audit history
          </button>
        </div>

        {/* hidden inputs */}
        <input ref={inlineFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={handleInlineFile} />
        <input ref={addFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={handleAddFile} />
        <input ref={retrainFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={handleRetrainFile} />

        {tab === "register" && (
          <Card
            title="Training register"
            subtitle="Due soon colleagues (≤ 30 days to next training due) are shown at the top. Hover a colleague to see all current authorisations."
            actions={
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button variant="primary" onClick={refreshRegisterData} disabled={loading}>
                  Refresh
                </Button>
                <Button variant="primary" onClick={openAdd} disabled={loading || !siteId}>
                  Add training record
                </Button>
              </div>
            }
          >
            <div className="wi-formGrid">
              <div className="wi-field wi-span2">
                <label className="wi-label">Site</label>
                <select className="wi-input" value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={loading}>
                  <option value="">{lockedCompanyId ? "Select site…" : "Loading company…"}</option>
                  {sitesForCompany.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="wi-field">
                <label className="wi-label">Search colleague</label>
                <input
                  className="wi-input"
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  placeholder="Name…"
                  disabled={loading}
                />
              </div>

              <div className="wi-field">
                <label className="wi-label">Filter MHE type</label>
                <select className="wi-input" value={mheTypeFilter} onChange={(e) => setMheTypeFilter(e.target.value)} disabled={loading}>
                  <option value="ALL">All types</option>
                  {mheTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.type_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="wi-registerList">
              {colleagueRows.length === 0 ? (
                <div className="wi-muted">No trained colleagues match the current filters.</div>
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
                      </div>
                    </div>

                    <div className="wi-tableWrap">
                      <table className="wi-table">
                        <thead>
                          <tr>
                            <th>MHE type</th>
                            <th>Trained on</th>
                            <th>Next training due</th>
                            <th>Days</th>
                            <th>Certificate</th>
                            <th style={{ width: 240 }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c._visibleAuths.map((a) => {
                            const dueSoon = (a._days_to_due ?? 999999) <= 30;
                            const hasCert = !!a.certificate_path;

                            return (
                              <tr key={a.id} className={dueSoon ? "wi-rowDueSoon" : ""}>
                                <td>{a.mhe_type}</td>
                                <td>{a.trained_on}</td>
                                <td>{a._due_date || "—"}</td>
                                <td>{a._days_to_due ?? "—"}</td>
                                <td>{hasCert ? "Yes" : "No"}</td>
                                <td>
                                  <div className="wi-actionsRow">
                                    <Button variant="primary" onClick={() => beginInlineUpload(a)} disabled={loading}>
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
                          Trained: <strong>{a.trained_on}</strong> • Next due:{" "}
                          <strong>{a.expires_on || "—"}</strong> •{" "}
                          <strong>{daysUntil(a.expires_on) ?? "—"}d</strong> • Cert:{" "}
                          <strong>{a.certificate_path ? "Yes" : "No"}</strong>
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
          <Card title="Audit history" subtitle="Full training record per colleague (includes expired).">
            <div className="wi-formGrid">
              <div className="wi-field wi-span2">
                <label className="wi-label">Site</label>
                <select className="wi-input" value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={loading}>
                  <option value="">{lockedCompanyId ? "Select site…" : "Loading company…"}</option>
                  {sitesForCompany.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="wi-field wi-span2">
                <label className="wi-label">Colleague</label>
                <select className="wi-input" value={historyColleagueId} onChange={(e) => setHistoryColleagueId(e.target.value)} disabled={loading || !siteId}>
                  <option value="">{siteId ? "Select colleague…" : "Select site first…"}</option>
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
                    <option key={t.id} value={t.id}>
                      {t.type_name}
                    </option>
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
                <div className="wi-muted">No training records found for this colleague.</div>
              ) : (
                <div className="wi-tableWrap wi-tableWrap--tall">
                  <table className="wi-table">
                    <thead>
                      <tr>
                        <th>MHE type</th>
                        <th>Trained on</th>
                        <th>Next training due</th>
                        <th>Days</th>
                        <th>Status</th>
                        <th>Certificate</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((r) => {
                        const typeName = mheTypeNameById.get(r.mhe_type_id) || r.mhe_type_id;
                        const due = r.expires_on || null;
                        const dte = due ? daysUntil(due) : null;
                        const cert = r.certificate_path ? "Yes" : "No";

                        return (
                          <tr key={r.id} className={r.status === "ACTIVE" ? "" : "wi-rowHistory"}>
                            <td>{typeName}</td>
                            <td>{r.trained_on}</td>
                            <td>{due || "—"}</td>
                            <td>{dte ?? "—"}</td>
                            <td>{r.status || "—"}</td>
                            <td>{cert}</td>
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

        {/* ADD modal */}
        {addModal.open && (
          <div className="wi-modalOverlay" role="dialog" aria-modal="true">
            <div className="wi-modal">
              <div className="wi-modalHeader">
                <div className="wi-modalTitle">Add training record</div>
                <button className="wi-modalClose" onClick={closeAdd} type="button">
                  ×
                </button>
              </div>

              <div className="wi-modalBody">
                <div className="wi-formGrid">
                  <div className="wi-field wi-span2">
                    <label className="wi-label">Colleague</label>
                    <select
                      className="wi-input"
                      value={addModal.colleague_id}
                      onChange={(e) => setAddModal((m) => ({ ...m, colleague_id: e.target.value }))}
                      disabled={loading}
                    >
                      <option value="">{siteId ? "Select colleague…" : "Select site first…"}</option>
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
                      value={addModal.mhe_type_id}
                      onChange={(e) => setAddModal((m) => ({ ...m, mhe_type_id: e.target.value }))}
                      disabled={loading}
                    >
                      <option value="">Select MHE type…</option>
                      {mheTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.type_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="wi-field">
                    <label className="wi-label">Trained on</label>
                    <input
                      className="wi-input"
                      type="date"
                      value={addModal.trained_on}
                      onChange={(e) => setAddModal((m) => ({ ...m, trained_on: e.target.value }))}
                      disabled={loading}
                    />
                  </div>

                  <div className="wi-field">
                    <label className="wi-label">Next training due</label>
                    <input
                      className="wi-input"
                      type="date"
                      value={addModal.expires_on}
                      onChange={(e) => setAddModal((m) => ({ ...m, expires_on: e.target.value }))}
                      disabled={loading}
                    />
                  </div>

                  <div className="wi-field wi-span2">
                    <label className="wi-label">Certificate (optional)</label>
                    <div className="wi-uploadRow">
                      <Button variant="primary" onClick={pickAddFile} disabled={loading}>
                        Upload file
                      </Button>
                      <div className="wi-muted">{addModal.fileName ? addModal.fileName : "PDF/JPG/PNG"}</div>
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
                <Button variant="primary" onClick={submitAdd} disabled={loading}>
                  {loading ? "Saving…" : "Save"}
                </Button>
                <Button variant="secondary" onClick={closeAdd} disabled={loading}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* RETRAIN modal */}
        {retrainModal.open && retrainModal.auth && (
          <div className="wi-modalOverlay" role="dialog" aria-modal="true">
            <div className="wi-modal">
              <div className="wi-modalHeader">
                <div className="wi-modalTitle">Record retraining (history preserved)</div>
                <button className="wi-modalClose" onClick={closeRetrain} type="button">
                  ×
                </button>
              </div>

              <div className="wi-modalBody">
                <div className="wi-muted" style={{ marginBottom: 10 }}>
                  This will mark the current record as EXPIRED and create a new ACTIVE authorisation.
                </div>

                <div className="wi-formGrid">
                  <div className="wi-field wi-span2">
                    <label className="wi-label">MHE type</label>
                    <input className="wi-input" value={retrainModal.auth.mhe_type} disabled />
                  </div>

                  <div className="wi-field">
                    <label className="wi-label">Trained on</label>
                    <input
                      className="wi-input"
                      type="date"
                      value={retrainModal.trained_on}
                      onChange={(e) => setRetrainModal((m) => ({ ...m, trained_on: e.target.value }))}
                      disabled={loading}
                    />
                  </div>

                  <div className="wi-field">
                    <label className="wi-label">Next training due</label>
                    <input
                      className="wi-input"
                      type="date"
                      value={retrainModal.expires_on}
                      onChange={(e) => setRetrainModal((m) => ({ ...m, expires_on: e.target.value }))}
                      disabled={loading}
                    />
                  </div>

                  <div className="wi-field wi-span2">
                    <label className="wi-label">Certificate (optional)</label>
                    <div className="wi-uploadRow">
                      <Button variant="primary" onClick={pickRetrainFile} disabled={loading}>
                        Upload file
                      </Button>
                      <div className="wi-muted">{retrainModal.fileName ? retrainModal.fileName : "PDF/JPG/PNG"}</div>
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
                  {loading ? "Saving…" : "Save"}
                </Button>
                <Button variant="secondary" onClick={closeRetrain} disabled={loading}>
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
