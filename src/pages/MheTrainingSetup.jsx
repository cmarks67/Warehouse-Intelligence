// src/pages/MheTrainingSetup.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";
import { supabase } from "../lib/supabaseClient";
import Papa from "papaparse";

import "./MheTrainingSetup.css";

function isValidYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
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
  // Tabs
  const tabs = [
    { id: "register", label: "Training register" },
    { id: "audit", label: "Audit history" },
  ];
  const [activeTab, setActiveTab] = useState("register");

  // Context
  const [session, setSession] = useState(null);
  const userId = session?.user?.id || null;

  // Locked company/site
  const [lockedCompanyId, setLockedCompanyId] = useState(null);
  const [lockedCompanyName, setLockedCompanyName] = useState("");
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("");

  // Data
  const [mheTypes, setMheTypes] = useState([]);
  const [colleagues, setColleagues] = useState([]);
  const [currentAuths, setCurrentAuths] = useState([]);
  const [historyAuths, setHistoryAuths] = useState([]);

  // Filters
  const [searchName, setSearchName] = useState("");
  const [mheTypeFilter, setMheTypeFilter] = useState("ALL");

  // Loading / errors
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");

  // Upload / modals
  const [uploading, setUploading] = useState(false);

  // Add training modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModal, setAddModal] = useState({
    colleagueId: "",
    mheTypeId: "",
    trained_on: "",
    certificateFile: null,
    certificatePath: "",
    notes: "",
  });

  // Retrain modal state
  const [showRetrainModal, setShowRetrainModal] = useState(false);
  const [retrainModal, setRetrainModal] = useState({
    auth: null,
    trained_on: "",
    certificateFile: null,
    certificatePath: "",
    notes: "",
  });

  // Tooltip / floating box
  const [hoveredColleagueId, setHoveredColleagueId] = useState(null);

  // CSV export (kept for future)
  const [csvValidation, setCsvValidation] = useState(null);

  // ---- Derived: Next training due (Add modal) ----
  const addNextDue = useMemo(() => {
    const mt = mheTypes.find((t) => t.id === addModal.mheTypeId);
    const cycle = mt?.inspection_cycle_days;

    if (!addModal.trained_on || typeof cycle !== "number") {
      return { date: "", days: null };
    }

    const date = addDaysToYMD(addModal.trained_on, cycle);
    const days = date ? daysUntil(date) : null;

    return { date, days };
  }, [addModal.trained_on, addModal.mheTypeId, mheTypes]);

  // ---- Auth map by colleague ----
  const authsByColleague = useMemo(() => {
    const map = new Map();
    for (const a of currentAuths || []) {
      if (!map.has(a.colleague_id)) map.set(a.colleague_id, []);
      map.get(a.colleague_id).push(a);
    }
    return map;
  }, [currentAuths]);

  // ---- Register rows (hide colleagues with 0 training) ----
  const colleagueRows = useMemo(() => {
    const q = searchName.trim().toLowerCase();

    const rows = (colleagues || [])
      .map((c) => {
        const list = authsByColleague.get(c.id) || [];
        const visibleAuths =
          mheTypeFilter === "ALL" ? list : list.filter((a) => a.mhe_type_id === mheTypeFilter);

        const minDays = list.length ? Math.min(...list.map((a) => a.days_to_expiry ?? 999999)) : 999999;
        const dueSoonAny = list.some((a) => (a.days_to_expiry ?? 999999) <= 30);

        return { ...c, _auths: list, _visibleAuths: visibleAuths, _minDays: minDays, _dueSoon: dueSoonAny };
      })
      .filter((c) => c._auths.length > 0) // ✅ hide colleagues with 0 training in the register
      .filter((c) => {
        if (!q) return true;
        const full = `${c.last_name || ""} ${c.first_name || ""}`.toLowerCase();
        return full.includes(q);
      })
      .filter((c) => (mheTypeFilter === "ALL" ? true : c._visibleAuths.length > 0))
      .sort((a, b) => {
        // Due soon at top (<=30 days)
        const aDue = a._minDays <= 30 ? 0 : 1;
        const bDue = b._minDays <= 30 ? 0 : 1;
        if (aDue !== bDue) return aDue - bDue;
        // then closest expiry
        return (a._minDays ?? 999999) - (b._minDays ?? 999999);
      });

    return rows;
  }, [colleagues, authsByColleague, searchName, mheTypeFilter]);

  // ---- Session ----
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const fetchCompanyAndSites = useCallback(async () => {
    if (!userId) return;
    setPageError("");

    const { data: cu, error: cuErr } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (cuErr) {
      setPageError(cuErr.message || "Failed to load company assignment.");
      return;
    }
    if (!cu?.company_id) {
      setPageError("No company assignment found for this user (company_users).");
      return;
    }

    setLockedCompanyId(cu.company_id);

    const { data: comp, error: compErr } = await supabase
      .from("companies")
      .select("id, name")
      .eq("id", cu.company_id)
      .single();

    if (!compErr && comp?.name) setLockedCompanyName(comp.name);

    const { data: siteRows, error: siteErr } = await supabase
      .from("sites")
      .select("id, name, company_id")
      .eq("company_id", cu.company_id)
      .order("name");

    if (siteErr) {
      setPageError(siteErr.message || "Failed to load sites.");
      return;
    }

    setSites(siteRows || []);
    const defaultSite = siteRows?.[0]?.id || "";
    setSiteId((prev) => prev || defaultSite);
  }, [userId]);

  const fetchMheTypes = useCallback(async () => {
    const { data, error } = await supabase
      .from("mhe_types")
      .select("id, type_name, inspection_cycle_days")
      .order("type_name");

    if (error) {
      setPageError(error.message || "Failed to load MHE types.");
      return;
    }
    setMheTypes(data || []);
  }, []);

  const fetchColleaguesForSite = useCallback(
    async (sid) => {
      if (!sid) return;
      const { data, error } = await supabase
        .from("colleagues")
        .select("id, first_name, last_name, employment_type, active, site_id")
        .eq("site_id", sid)
        .eq("active", true)
        .order("last_name");

      if (error) {
        setPageError(error.message || "Failed to load colleagues.");
        return;
      }
      setColleagues(data || []);
    },
    [setColleagues]
  );

  const fetchCurrentAuthorisations = useCallback(
    async (sid) => {
      if (!sid) return;
      const { data, error } = await supabase
        .from("v_mhe_authorisations_current")
        .select("*")
        .eq("site_id", sid);

      if (error) {
        setPageError(error.message || "Failed to load current authorisations.");
        return;
      }
      setCurrentAuths(data || []);
    },
    [setCurrentAuths]
  );

  const fetchHistory = useCallback(
    async (sid) => {
      if (!sid) return;
      const { data, error } = await supabase
        .from("v_mhe_authorisations_history")
        .select("*")
        .eq("site_id", sid)
        .order("created_at", { ascending: false });

      if (error) {
        setPageError(error.message || "Failed to load audit history.");
        return;
      }
      setHistoryAuths(data || []);
    },
    [setHistoryAuths]
  );

  const refreshAll = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setPageError("");
    try {
      await fetchColleaguesForSite(siteId);
      await fetchCurrentAuthorisations(siteId);
      if (activeTab === "audit") {
        await fetchHistory(siteId);
      }
    } finally {
      setLoading(false);
    }
  }, [siteId, activeTab, fetchColleaguesForSite, fetchCurrentAuthorisations, fetchHistory]);

  useEffect(() => {
    if (!userId) return;
    fetchCompanyAndSites();
    fetchMheTypes();
  }, [userId, fetchCompanyAndSites, fetchMheTypes]);

  useEffect(() => {
    if (!siteId) return;
    refreshAll();
  }, [siteId, refreshAll]);

  useEffect(() => {
    if (activeTab === "audit" && siteId) fetchHistory(siteId);
  }, [activeTab, siteId, fetchHistory]);

  // ---- Storage helpers ----
  const uploadCertificate = useCallback(
    async (file, colleagueId, mheTypeId) => {
      if (!file) return "";
      if (!lockedCompanyId) throw new Error("Company context not loaded.");
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const path = `company/${lockedCompanyId}/colleague/${colleagueId}/mhe/${mheTypeId}/${stamp}.${ext}`;

      const { error } = await supabase.storage.from("mhe-certificates").upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      });

      if (error) throw error;
      return path;
    },
    [lockedCompanyId]
  );

  // ---- Add training flow ----
  const openAddModal = () => {
    setAddModal({
      colleagueId: colleagues?.[0]?.id || "",
      mheTypeId: mheTypes?.[0]?.id || "",
      trained_on: "",
      certificateFile: null,
      certificatePath: "",
      notes: "",
    });
    setShowAddModal(true);
  };

  const submitAddTraining = useCallback(async () => {
    if (!siteId) return;
    if (!addModal.colleagueId) return setPageError("Colleague is required.");
    if (!addModal.mheTypeId) return setPageError("MHE type is required.");
    if (!isValidYMD(addModal.trained_on)) return setPageError("Trained on date is required.");

    setUploading(true);
    setPageError("");
    try {
      let certPath = addModal.certificatePath || "";
      if (addModal.certificateFile) {
        certPath = await uploadCertificate(addModal.certificateFile, addModal.colleagueId, addModal.mheTypeId);
      }

      // ✅ IMPORTANT: NO company_id in this table
      const payload = {
        site_id: siteId,
        colleague_id: addModal.colleagueId,
        mhe_type_id: addModal.mheTypeId,
        trained_on: addModal.trained_on,
        status: "ACTIVE",
        signed_off_by: userId,
        certificate_path: certPath || null,
        notes: addModal.notes.trim() || null,
      };

      const { error: insErr } = await supabase.from("colleague_mhe_authorisations").insert(payload);
      if (insErr) throw insErr;

      setShowAddModal(false);
      await refreshAll();
    } catch (e) {
      setPageError(e?.message || "Failed to add training record.");
    } finally {
      setUploading(false);
    }
  }, [siteId, addModal, uploadCertificate, userId, refreshAll]);

  // ---- Upload certificate to an existing authorisation ----
  const updateCertificateForAuth = useCallback(
    async (a, file) => {
      if (!a?.id || !file) return;
      setUploading(true);
      setPageError("");
      try {
        const certPath = await uploadCertificate(file, a.colleague_id, a.mhe_type_id);
        const { error } = await supabase
          .from("colleague_mhe_authorisations")
          .update({ certificate_path: certPath, signed_off_by: userId, signed_off_at: new Date().toISOString() })
          .eq("id", a.id);

        if (error) throw error;
        await refreshAll();
      } catch (e) {
        setPageError(e?.message || "Failed to upload certificate.");
      } finally {
        setUploading(false);
      }
    },
    [uploadCertificate, userId, refreshAll]
  );

  // ---- Retrain flow (history preserving) ----
  const openRetrainModal = (auth) => {
    setRetrainModal({
      auth,
      trained_on: "",
      certificateFile: null,
      certificatePath: "",
      notes: "",
    });
    setShowRetrainModal(true);
  };

  const submitRetrain = useCallback(async () => {
    const a = retrainModal.auth;
    if (!a?.id) return;
    if (!siteId) return;
    if (!isValidYMD(retrainModal.trained_on)) return setPageError("Trained on date is required.");

    setUploading(true);
    setPageError("");
    try {
      // Mark old record not-active (use SUSPENDED to match your table constraint)
      const { error: updErr } = await supabase
        .from("colleague_mhe_authorisations")
        .update({ status: "SUSPENDED" })
        .eq("id", a.id);
      if (updErr) throw updErr;

      let certPath = retrainModal.certificatePath || "";
      if (retrainModal.certificateFile) {
        certPath = await uploadCertificate(retrainModal.certificateFile, a.colleague_id, a.mhe_type_id);
      }

      // ✅ IMPORTANT: NO company_id in this table
      const payload = {
        site_id: siteId,
        colleague_id: a.colleague_id,
        mhe_type_id: a.mhe_type_id,
        trained_on: retrainModal.trained_on,
        status: "ACTIVE",
        signed_off_by: userId,
        certificate_path: certPath || null,
        notes: retrainModal.notes.trim() || null,
      };

      const { error: insErr } = await supabase.from("colleague_mhe_authorisations").insert(payload);
      if (insErr) throw insErr;

      setShowRetrainModal(false);
      await refreshAll();
    } catch (e) {
      setPageError(e?.message || "Failed to retrain.");
    } finally {
      setUploading(false);
    }
  }, [retrainModal, siteId, uploadCertificate, userId, refreshAll]);

  // ---- CSV validation placeholder (kept, not used in UI yet) ----
  const validateCsv = async (file) => {
    setCsvValidation(null);
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          resolve(res);
        },
        error: (err) => resolve({ error: err }),
      });
    });
  };

  // ---- UI helpers ----
  const siteName = useMemo(() => sites.find((s) => s.id === siteId)?.name || "", [sites, siteId]);

  return (
    <AppLayout>
      <div className="wi-page">
        <div className="wi-headerRow">
          <div>
            <h1 className="wi-title">MHE training tracker</h1>
            <div className="wi-subtitle">
              Company enforced: <strong>{lockedCompanyName || "—"}</strong> • Site: <strong>{siteName || "—"}</strong>
            </div>
          </div>
          <div className="wi-actions">
            <Button onClick={refreshAll} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {pageError ? <div className="wi-error">{pageError}</div> : null}

        <div className="wi-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`wi-tab ${activeTab === t.id ? "is-active" : ""}`}
              onClick={() => setActiveTab(t.id)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "register" ? (
          <Card>
            <div className="wi-cardHeader">
              <div>
                <h2 className="wi-cardTitle">Training register</h2>
                <div className="wi-cardSub">
                  Due soon colleagues (≤ 30 days to expiry) are shown at the top. Hover a colleague to see all current
                  authorisations.
                </div>
              </div>
              <div className="wi-cardHeaderActions">
                <Button onClick={openAddModal}>Add training record</Button>
              </div>
            </div>

            <div className="wi-filters">
              <div className="wi-field">
                <label className="wi-label">Site</label>
                <select className="wi-input" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  {sites.map((s) => (
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
                  placeholder="Name..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                />
              </div>

              <div className="wi-field">
                <label className="wi-label">Filter MHE type</label>
                <select className="wi-input" value={mheTypeFilter} onChange={(e) => setMheTypeFilter(e.target.value)}>
                  <option value="ALL">All types</option>
                  {mheTypes.map((mt) => (
                    <option key={mt.id} value={mt.id}>
                      {mt.type_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="wi-list">
              {colleagueRows.length === 0 ? (
                <div className="wi-empty">No trained colleagues found for the current filters.</div>
              ) : null}

              {colleagueRows.map((c) => {
                const visible = c._visibleAuths || [];
                return (
                  <div
                    key={c.id}
                    className={`wi-colleagueCard ${c._minDays <= 30 ? "is-dueSoon" : ""}`}
                    onMouseEnter={() => setHoveredColleagueId(c.id)}
                    onMouseLeave={() => setHoveredColleagueId((prev) => (prev === c.id ? null : prev))}
                  >
                    <div className="wi-colleagueHeader">
                      <div className="wi-colleagueName">
                        <strong>
                          {c.last_name}, {c.first_name}
                        </strong>{" "}
                        <span className="wi-muted">({c.employment_type})</span>
                      </div>
                      <div className="wi-pill">{visible.length} authorisation(s)</div>
                    </div>

                    {visible.length === 0 ? (
                      <div className="wi-muted">No active authorisations for the selected MHE filter.</div>
                    ) : (
                      <table className="wi-table">
                        <thead>
                          <tr>
                            <th>MHE type</th>
                            <th>Trained on</th>
                            <th>Next due</th>
                            <th>Days</th>
                            <th>Certificate</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((a) => (
                            <tr key={a.id}>
                              <td>{a.mhe_type}</td>
                              <td>{a.trained_on}</td>
                              <td>{a.expires_on}</td>
                              <td>{a.days_to_expiry}</td>
                              <td>{a.certificate_path ? "Yes" : "No"}</td>
                              <td className="wi-actionsCell">
                                <label className="wi-fileBtn">
                                  Upload cert
                                  <input
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0] || null;
                                      e.target.value = "";
                                      if (f) updateCertificateForAuth(a, f);
                                    }}
                                    disabled={uploading}
                                  />
                                </label>
                                <Button onClick={() => openRetrainModal(a)} disabled={uploading}>
                                  Retrain
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {hoveredColleagueId === c.id ? (
                      <div className="wi-hoverBox">
                        <div className="wi-hoverTitle">
                          {c.last_name}, {c.first_name}
                        </div>
                        <div className="wi-hoverGrid">
                          <div>
                            <div className="wi-hoverLabel">Employment</div>
                            <div>{c.employment_type}</div>
                          </div>
                          <div>
                            <div className="wi-hoverLabel">Next due</div>
                            <div>
                              {c._minDays === 999999 ? "—" : `${c._minDays} day(s)`}
                            </div>
                          </div>
                          <div className="wi-hoverSpan2">
                            <div className="wi-hoverLabel">All current authorisations</div>
                            <div className="wi-hoverAuths">
                              {(c._auths || []).map((a) => (
                                <div key={a.id} className="wi-hoverAuth">
                                  <strong>{a.mhe_type}</strong> — due {a.expires_on} ({a.days_to_expiry} days)
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        ) : null}

        {activeTab === "audit" ? (
          <Card>
            <div className="wi-cardHeader">
              <div>
                <h2 className="wi-cardTitle">Audit history</h2>
                <div className="wi-cardSub">All training records for the selected site.</div>
              </div>
            </div>

            <div className="wi-filters">
              <div className="wi-field">
                <label className="wi-label">Site</label>
                <select className="wi-input" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="wi-list">
              {historyAuths.length === 0 ? <div className="wi-empty">No history records.</div> : null}
              {historyAuths.length > 0 ? (
                <table className="wi-table">
                  <thead>
                    <tr>
                      <th>Colleague</th>
                      <th>MHE type</th>
                      <th>Trained on</th>
                      <th>Next due</th>
                      <th>Status</th>
                      <th>Certificate</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyAuths.map((a) => (
                      <tr key={a.id}>
                        <td>
                          {a.last_name}, {a.first_name}
                        </td>
                        <td>{a.mhe_type}</td>
                        <td>{a.trained_on}</td>
                        <td>{a.expires_on}</td>
                        <td>{a.status}</td>
                        <td>{a.certificate_path ? "Yes" : "No"}</td>
                        <td>{a.created_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </Card>
        ) : null}

        {/* Add Training Modal */}
        {showAddModal ? (
          <div className="wi-modalOverlay" role="dialog" aria-modal="true">
            <div className="wi-modal">
              <div className="wi-modalHeader">
                <h3>Add training record</h3>
                <button className="wi-modalClose" onClick={() => setShowAddModal(false)} type="button">
                  ×
                </button>
              </div>

              <div className="wi-modalBody">
                <div className="wi-field wi-span2">
                  <label className="wi-label">Colleague</label>
                  <select
                    className="wi-input"
                    value={addModal.colleagueId}
                    onChange={(e) => setAddModal((p) => ({ ...p, colleagueId: e.target.value }))}
                  >
                    {colleagues.map((c) => (
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
                    onChange={(e) => setAddModal((p) => ({ ...p, mheTypeId: e.target.value }))}
                  >
                    {mheTypes.map((mt) => (
                      <option key={mt.id} value={mt.id}>
                        {mt.type_name}
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
                    onChange={(e) => setAddModal((p) => ({ ...p, trained_on: e.target.value }))}
                  />
                </div>

                {/* ✅ Next training due (calculated preview) */}
                <div className="wi-field">
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
                  <div className="wi-fileRow">
                    <label className="wi-fileBtn">
                      Upload file
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={(e) =>
                          setAddModal((p) => ({ ...p, certificateFile: e.target.files?.[0] || null }))
                        }
                        disabled={uploading}
                      />
                    </label>
                    <div className="wi-muted">PDF/JPG/PNG</div>
                  </div>
                </div>

                <div className="wi-field wi-span2">
                  <label className="wi-label">Notes (optional)</label>
                  <input
                    className="wi-input"
                    value={addModal.notes}
                    onChange={(e) => setAddModal((p) => ({ ...p, notes: e.target.value }))}
                  />
                </div>
              </div>

              <div className="wi-modalFooter">
                <Button onClick={submitAddTraining} disabled={uploading}>
                  Save
                </Button>
                <Button onClick={() => setShowAddModal(false)} disabled={uploading}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Retrain Modal */}
        {showRetrainModal ? (
          <div className="wi-modalOverlay" role="dialog" aria-modal="true">
            <div className="wi-modal">
              <div className="wi-modalHeader">
                <h3>Retrain colleague</h3>
                <button className="wi-modalClose" onClick={() => setShowRetrainModal(false)} type="button">
                  ×
                </button>
              </div>

              <div className="wi-modalBody">
                <div className="wi-field wi-span2">
                  <label className="wi-label">Colleague</label>
                  <input
                    className="wi-input"
                    value={
                      retrainModal.auth
                        ? `${retrainModal.auth.last_name}, ${retrainModal.auth.first_name}`
                        : ""
                    }
                    disabled
                  />
                </div>

                <div className="wi-field wi-span2">
                  <label className="wi-label">MHE type</label>
                  <input className="wi-input" value={retrainModal.auth?.mhe_type || ""} disabled />
                </div>

                <div className="wi-field wi-span2">
                  <label className="wi-label">New trained on</label>
                  <input
                    className="wi-input"
                    type="date"
                    value={retrainModal.trained_on}
                    onChange={(e) => setRetrainModal((p) => ({ ...p, trained_on: e.target.value }))}
                  />
                </div>

                <div className="wi-field wi-span2">
                  <label className="wi-label">Certificate (optional)</label>
                  <div className="wi-fileRow">
                    <label className="wi-fileBtn">
                      Upload file
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={(e) =>
                          setRetrainModal((p) => ({ ...p, certificateFile: e.target.files?.[0] || null }))
                        }
                        disabled={uploading}
                      />
                    </label>
                    <div className="wi-muted">PDF/JPG/PNG</div>
                  </div>
                </div>

                <div className="wi-field wi-span2">
                  <label className="wi-label">Notes (optional)</label>
                  <input
                    className="wi-input"
                    value={retrainModal.notes}
                    onChange={(e) => setRetrainModal((p) => ({ ...p, notes: e.target.value }))}
                  />
                </div>
              </div>

              <div className="wi-modalFooter">
                <Button onClick={submitRetrain} disabled={uploading}>
                  Save
                </Button>
                <Button onClick={() => setShowRetrainModal(false)} disabled={uploading}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
