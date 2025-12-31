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
  // Tabs
  const [tab, setTab] = useState("register"); // register | history

  // Hover tooltip
  const [hoverTip, setHoverTip] = useState({ open: false, x: 0, y: 0, colleagueId: "" });

  // Global state
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState({ type: "", message: "" });

  // Company enforcement
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [mheTypes, setMheTypes] = useState([]);

  const [lockedCompanyId, setLockedCompanyId] = useState("");
  const [lockedCompanyName, setLockedCompanyName] = useState("");

  // Site + filters
  const [siteId, setSiteId] = useState("");
  const [mheTypeFilter, setMheTypeFilter] = useState("ALL");
  const [nameFilter, setNameFilter] = useState("");

  // Data sets
  const [siteColleagues, setSiteColleagues] = useState([]); // active colleagues on site
  const [currentAuths, setCurrentAuths] = useState([]); // v_mhe_authorisations_current for site

  // Audit history tab inputs
  const [historyColleagueId, setHistoryColleagueId] = useState("");
  const [historyMheTypeId, setHistoryMheTypeId] = useState("ALL");
  const [historyRows, setHistoryRows] = useState([]);

  // Inline action state (upload cert for existing record)
  const fileInputRef = useRef(null);
  const [pendingUpload, setPendingUpload] = useState({ authId: "", colleagueId: "", mheTypeId: "" });

  // Upload during retrain/add
  const retrainFileRef = useRef(null);
  const addFileRef = useRef(null);

  // Retrain modal (Option B history preserving)
  const [retrainModal, setRetrainModal] = useState({
    open: false,
    auth: null, // row from currentAuths
    trained_on: "",
    next_training_due: "",
    notes: "",
    fileName: "",
    certificatePath: "",
  });

  // Add record modal
  const [addModal, setAddModal] = useState({
    open: false,
    colleague_id: "",
    mhe_type_id: "",
    trained_on: "",
    next_training_due: "",
    notes: "",
    fileName: "",
    certificatePath: "",
  });

  // ---------- Initialise: company lock + ref data ----------
  useEffect(() => {
    (async () => {
      setLoading(true);
      setNotice({ type: "", message: "" });

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const userId = authData?.user?.id;
        if (!userId) throw new Error("Not signed in.");

        // Company enforcement: company_users must map user -> company
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

        // Default site selection (first site in company)
        const firstSite = (siteData || []).find((s) => s.company_id === cu.company_id);
        if (firstSite?.id) setSiteId(firstSite.id);
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to initialise MHE Training." });
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

  // ---------- Refresh: colleagues + current auths for site ----------
  const refreshRegisterData = useCallback(async () => {
    if (!siteId) {
      setSiteColleagues([]);
      setCurrentAuths([]);
      return;
    }

    // Colleagues on site (active only)
    const { data: cData, error: cErr } = await supabase
      .from("colleagues")
      .select("id, first_name, last_name, employment_type, active")
      .eq("site_id", siteId)
      .order("last_name", { ascending: true });

    if (cErr) throw cErr;

    const activeOnly = (cData || []).filter((c) => c.active === true);
    setSiteColleagues(activeOnly);

    // Current authorisations for site
    // NOTE: this view MUST expose: id, site_id, colleague_id, mhe_type_id, mhe_type, trained_on,
    //       certificate_path, and ideally next_training_due (or expires_on).
    const { data: aData, error: aErr } = await supabase
      .from("v_mhe_authorisations_current")
      .select("*")
      .eq("site_id", siteId)
      .order("last_name", { ascending: true });

    if (aErr) throw aErr;

    // Normalise + compute a single "due date" used for ordering and due-soon:
    const normalised = (aData || []).map((a) => {
      const due = a.next_training_due || a.expires_on || null;
      const dte = due ? daysUntil(due) : null;
      return {
        ...a,
        _due_date: due,
        _days_to_due: dte,
      };
    });

    setCurrentAuths(normalised);

    // Default history colleague if empty and we have colleagues
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

  // ---------- Group current auths by colleague ----------
  const authsByColleague = useMemo(() => {
    const map = new Map();
    (currentAuths || []).forEach((a) => {
      const arr = map.get(a.colleague_id) || [];
      arr.push(a);
      map.set(a.colleague_id, arr);
    });

    // Sort each colleague’s list by due date asc (nulls last)
    map.forEach((arr, key) => {
      arr.sort((x, y) => {
        const ax = x._days_to_due ?? 999999;
        const ay = y._days_to_due ?? 999999;
        return ax - ay;
      });
      map.set(key, arr);
    });

    return map;
  }, [currentAuths]);

  // ---------- Compute register colleague rows ----------
  const colleagueRows = useMemo(() => {
    const nf = safeLower(nameFilter);

    let rows = (siteColleagues || [])
      .map((c) => {
        const list = authsByColleague.get(c.id) || [];
        const dueSoonAny = list.some((a) => (a._days_to_due ?? 999999) <= 30);
        const minDays = list.length ? Math.min(...list.map((a) => a._days_to_due ?? 999999)) : 999999;

        return {
          ...c,
          _auths: list,
          _dueSoon: dueSoonAny,
          _minDays: minDays,
        };
      })
      // REQUIRED: do NOT show colleagues with 0 training
      .filter((c) => (c._auths || []).length > 0)
      // Name filter
      .filter((c) => {
        if (!nf) return true;
        const full = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
        const rev = `${c.last_name || ""} ${c.first_name || ""}`.toLowerCase();
        return full.includes(nf) || rev.includes(nf);
      })
      // Apply MHE filter to visible auths
      .map((c) => {
        const filtered =
          mheTypeFilter === "ALL" ? c._auths : c._auths.filter((a) => a.mhe_type_id === mheTypeFilter);
        return { ...c, _visibleAuths: filtered };
      })
      // If filtering by MHE type, hide colleagues without matches
      .filter((c) => (mheTypeFilter === "ALL" ? true : c._visibleAuths.length > 0));

    // Sort: due soon top, then earliest due, then name
    rows.sort((a, b) => {
      if (a._dueSoon !== b._dueSoon) return a._dueSoon ? -1 : 1;
      if (a._minDays !== b._minDays) return a._minDays - b._minDays;
      const ln = (a.last_name || "").localeCompare(b.last_name || "");
      if (ln !== 0) return ln;
      return (a.first_name || "").localeCompare(b.first_name || "");
    });

    return rows;
  }, [siteColleagues, authsByColleague, nameFilter, mheTypeFilter]);

  // Hover tooltip data
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

  // ---------- Certificate upload (inline: existing record) ----------
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

  // ---------- Add training record ----------
  const openAdd = () => {
    setNotice({ type: "", message: "" });
    setAddModal({
      open: true,
      colleague_id: siteColleagues?.[0]?.id || "",
      mhe_type_id: mheTypes?.[0]?.id || "",
      trained_on: "",
      next_training_due: "",
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
      next_training_due: "",
      notes: "",
      fileName: "",
      certificatePath: "",
    });
  };

  const pickAddFile = () => addFileRef.current?.click();

  const handleAddFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setNotice({ type: "", message: "" });
    setLoading(true);

    try {
      if (!lockedCompanyId) throw new Error("No company assigned.");
      if (!addModal.colleague_id || !addModal.mhe_type_id) throw new Error("Select colleague and MHE type first.");

      const path = `company/${lockedCompanyId}/colleague/${addModal.colleague_id}/mhe/${addModal.mhe_type_id}/${Date.now()}_${file.name}`;

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

  const submitAdd = async () => {
    setNotice({ type: "", message: "" });

    if (!siteId) {
      setNotice({ type: "error", message: "Select a site first." });
      return;
    }
    if (!addModal.colleague_id) {
      setNotice({ type: "error", message: "Colleague is required." });
      return;
    }
    if (!addModal.mhe_type_id) {
      setNotice({ type: "error", message: "MHE type is required." });
      return;
    }
    if (!addModal.trained_on || !isValidYMD(addModal.trained_on)) {
      setNotice({ type: "error", message: "Trained on date is required (YYYY-MM-DD)." });
      return;
    }
    if (!addModal.next_training_due || !isValidYMD(addModal.next_training_due)) {
      setNotice({ type: "error", message: "Next training due is required (YYYY-MM-DD)." });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        site_id: siteId,
        colleague_id: addModal.colleague_id,
        mhe_type_id: addModal.mhe_type_id,
        trained_on: addModal.trained_on,
        next_training_due: addModal.next_training_due,
        status: "ACTIVE",
        certificate_path: addModal.certificatePath || null,
        notes: addModal.notes.trim() || null,
      };

      const { error: insErr } = await supabase.from("colleague_mhe_authorisations").insert(payload);
      if (insErr) {
        // Common: duplicate colleague_id + mhe_type_id (unique constraint)
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

  // ---------- Retrain (Option B history preserving) ----------
  const openRetrain = (authRow) => {
    setNotice({ type: "", message: "" });
    setRetrainModal({
      open: true,
      auth: authRow,
      trained_on: "",
      next_training_due: "",
      notes: "",
      fileName: "",
      certificatePath: "",
    });
  };

  const closeRetrain = () => {
    setRetrainModal({ open: false, auth: null, trained_on: "", next_training_due: "", notes: "", fileName: "", certificatePath: "" });
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
    if (!a) {
      setNotice({ type: "error", message: "No authorisation selected." });
      return;
    }
    if (!retrainModal.trained_on || !isValidYMD(retrainModal.trained_on)) {
      setNotice({ type: "error", message: "Trained on date is required (YYYY-MM-DD)." });
      return;
    }
    if (!retrainModal.next_training_due || !isValidYMD(retrainModal.next_training_due)) {
      setNotice({ type: "error", message: "Next training due is required (YYYY-MM-DD)." });
      return;
    }

    setLoading(true);
    try {
      // 1) Mark the current ACTIVE record as EXPIRED (valid enum in your table)
      const { error: expErr } = await supabase
        .from("colleague_mhe_authorisations")
        .update({ status: "EXPIRED" })
        .eq("id", a.id);

      if (expErr) throw expErr;

      // 2) Insert new ACTIVE record
      const payload = {
        site_id: siteId,
        colleague_id: a.colleague_id,
        mhe_type_id: a.mhe_type_id,
        trained_on: retrainModal.trained_on,
        next_training_due: retrainModal.next_training_due,
        status: "ACTIVE",
        certificate_path: retrainModal.certificatePath || null,
        notes: retrainModal.notes.trim() || null,
      };

      const { error: insErr } = await supabase.from("colleague_mhe_authorisations").insert(payload);
      if (insErr) throw insErr;

      setNotice({ type: "success", message: "Retraining recorded. Previous record preserved in history." });
      closeRetrain();

      await refreshRegisterData();
      if (historyColleagueId === a.colleague_id) {
        await refreshHistory();
      }
    } catch (e) {
      setNotice({ type: "error", message: e?.message || "Failed to record retraining." });
    } finally {
      setLoading(false);
    }
  };

  // ---------- History tab ----------
  const refreshHistory = useCallback(async () => {
    if (!historyColleagueId) {
      setHistoryRows([]);
      return;
    }

    let q = supabase
      .from("colleague_mhe_authorisations")
      .select(
        "id, colleague_id, mhe_type_id, trained_on, next_training_due, expires_on, status, certificate_path, notes, created_at"
      )
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

  const historyColleagueName = useMemo(() => {
    const c = (siteColleagues || []).find((x) => x.id === historyColleagueId);
    if (!c) return "";
    return `${c.first_name} ${c.last_name}`;
  }, [siteColleagues, historyColleagueId]);

  const mheTypeNameById = useMemo(() => {
    const map = new Map();
    (mheTypes || []).forEach((t) => map.set(t.id, t.type_name));
    return map;
  }, [mheTypes]);

  // --------- Render ---------
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

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,jpg,jpeg,png"
          style={{ display: "none" }}
          onChange={handleUploadFile}
        />
        <input
          ref={retrainFileRef}
          type="file"
          accept=".pdf,jpg,jpeg,png"
          style={{ display: "none" }}
          onChange={handleRetrainFile}
        />
        <input
          ref={addFileRef}
          type="file"
          accept=".pdf,jpg,jpeg,png"
          style={{ display: "none" }}
          onChange={handleAddFile}
        />

        {/* REGISTER TAB */}
        {tab === "register" && (
          <div className="wi-mheRegisterGrid">
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
                  <select
                    className="wi-input"
                    value={mheTypeFilter}
                    onChange={(e) => setMheTypeFilter(e.target.value)}
                    disabled={loading}
                  >
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
                    <div
                      key={c.id}
                      className={`wi-colleagueBlock ${c._dueSoon ? "is-dueSoon" : ""}`}
                    >
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

              {/* Floating tooltip */}
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
                            <strong>{a._due_date || "—"}</strong> •{" "}
                            <strong>{a._days_to_due ?? "—"}d</strong> • Cert:{" "}
                            <strong>{a.certificate_path ? "Yes" : "No"}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === "history" && (
          <div className="wi-mheHistoryGrid">
            <Card title="Audit history" subtitle="Full training record per colleague (includes expired).">
              <div className="wi-formGrid">
                <div className="wi-field wi-span2">
                  <label className="wi-label">Site</label>
                  <select
                    className="wi-input"
                    value={siteId}
                    onChange={(e) => setSiteId(e.target.value)}
                    disabled={loading || !lockedCompanyId}
                  >
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
                  <select
                    className="wi-input"
                    value={historyColleagueId}
                    onChange={(e) => setHistoryColleagueId(e.target.value)}
                    disabled={loading || !siteId}
                  >
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
                  <select
                    className="wi-input"
                    value={historyMheTypeId}
                    onChange={(e) => setHistoryMheTypeId(e.target.value)}
                    disabled={loading}
                  >
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
                  <div className="wi-muted">No training records found for {historyColleagueName || "this colleague"}.</div>
                ) : (
                  <div className="wi-tableWrap wi-tableWrap--tall">
                    <table className="wi-table">
                      <thead>
                        <tr>
                          <th>MHE type</th>
                          <th>Trained on</th>
                          <th>Next due</th>
                          <th>Days</th>
                          <th>Status</th>
                          <th>Certificate</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyRows.map((r) => {
                          const typeName = mheTypeNameById.get(r.mhe_type_id) || r.mhe_type_id;
                          const due = r.next_training_due || r.expires_on || null;
                          const dte = due ? daysUntil(due) : null;
                          const cert = r.certificate_path ? "Yes" : "No";
                          const status = r.status || "—";

                          return (
                            <tr key={r.id} className={status === "ACTIVE" ? "" : "wi-rowHistory"}>
                              <td>{typeName}</td>
                              <td>{r.trained_on}</td>
                              <td>{due || "—"}</td>
                              <td>{dte ?? "—"}</td>
                              <td>{status}</td>
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
          </div>
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
                      value={addModal.next_training_due}
                      onChange={(e) => setAddModal((m) => ({ ...m, next_training_due: e.target.value }))}
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

        {/* Retrain modal */}
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
                      value={retrainModal.next_training_due}
                      onChange={(e) => setRetrainModal((m) => ({ ...m, next_training_due: e.target.value }))}
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
