// /src/pages/MheTrainingSetup.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";

import { createClient } from "@supabase/supabase-js";

import "./MheTrainingSetup.css";

/**
 * Design system note:
 * This page must only use standard layout primitives (AppLayout/Card/Button).
 * Inputs/selects are native HTML controls styled via CSS.
 *
 * DB write target ("sheet"):
 *   public.colleague_mhe_authorisations
 */

// Supabase client (matches your existing pattern in other pages)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function toLowerTrim(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

function isValidYMD(v) {
  if (!v) return false;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime());
}

function activeFromPath(pathname) {
  const p = toLowerTrim(pathname);
  if (p.includes("/setup/mhe-training")) return "mhe_training";
  if (p.includes("/setup/mhe")) return "mhe_setup";
  if (p.includes("/setup/company")) return "company_site_setup";
  if (p.includes("/setup/colleagues")) return "colleagues";
  if (p.includes("/tools/scheduling")) return "scheduling_tool";
  if (p.includes("/connections")) return "data_connections";
  if (p.includes("/settings/users")) return "users";
  if (p.includes("/settings/password")) return "password_reset";
  return "overview";
}

function pathFromKey(key) {
  switch (key) {
    case "overview":
      return "/dashboard";
    case "company_site_setup":
      return "/setup/company-site";
    case "colleagues":
      return "/setup/colleagues";
    case "mhe_setup":
      return "/setup/mhe";
    case "mhe_training":
      return "/setup/mhe-training";
    case "data_connections":
      return "/connections";
    case "scheduling_tool":
      return "/tools/scheduling";
    case "users":
      return "/settings/users";
    case "password_reset":
      return "/settings/password";
    default:
      return "/dashboard";
  }
}

/**
 * Page-local modal (uses Card + Button so it stays within your design system)
 */
function PageModal({ open, title, onClose, children }) {
  if (!open) return null;

  return (
    <div className="wi-modalBackdrop" onMouseDown={onClose} role="presentation">
      <div className="wi-modalContainer" onMouseDown={(e) => e.stopPropagation()} role="presentation">
        <Card>
          <div className="wi-modalHeader">
            <div className="wi-modalTitle">{title}</div>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
          <div className="wi-modalBody">{children}</div>
        </Card>
      </div>
    </div>
  );
}

export default function MheTrainingSetup() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeNav = useMemo(() => activeFromPath(location.pathname), [location.pathname]);
  const onSelectNav = (key) => navigate(pathFromKey(key));

  const [tab, setTab] = useState("register"); // register | history
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState({ type: "", message: "" });

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");

  // Tenanted reference data
  const [allowedCompanies, setAllowedCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [mheTypes, setMheTypes] = useState([]);

  // Selection
  const [companyId, setCompanyId] = useState("");
  const [siteId, setSiteId] = useState("");

  // Filters
  const [searchName, setSearchName] = useState("");
  const [filterMheTypeId, setFilterMheTypeId] = useState("");

  // Register data
  const [siteColleagues, setSiteColleagues] = useState([]);
  const [currentAuths, setCurrentAuths] = useState([]);

  // History
  const [historyColleagueId, setHistoryColleagueId] = useState("");
  const [historyMheTypeId, setHistoryMheTypeId] = useState("");
  const [historyRows, setHistoryRows] = useState([]);

  // Modals
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

  const [retrainModal, setRetrainModal] = useState({
    open: false,
    auth: null,
    trained_on: "",
    expires_on: "",
    notes: "",
    fileName: "",
    certificatePath: "",
  });

  // Inline certificate upload (existing record)
  const [pendingInlineUpload, setPendingInlineUpload] = useState({
    authId: "",
  });

  const selectedCompanyName = useMemo(() => {
    return (allowedCompanies || []).find((c) => c.id === companyId)?.name || "";
  }, [allowedCompanies, companyId]);

  const sitesForSelectedCompany = useMemo(() => {
    if (!companyId) return [];
    return (sites || []).filter((s) => s.company_id === companyId);
  }, [companyId, sites]);

  const selectedSiteName = useMemo(() => {
    return sitesForSelectedCompany.find((s) => s.id === siteId)?.name || "";
  }, [sitesForSelectedCompany, siteId]);

  // ---------- Auth ----------
  useEffect(() => {
    (async () => {
      setLoading(true);
      setNotice({ type: "", message: "" });

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const user = authData?.user;
        if (!user?.id) throw new Error("Not signed in.");

        setUserId(user.id);
        setEmail(user.email || "");
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to initialise MHE training." });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---------- Load memberships + reference data ----------
  useEffect(() => {
    if (!userId) return;

    (async () => {
      setLoading(true);
      setNotice({ type: "", message: "" });

      try {
        // Companies available to this user
        const { data: cuRows, error: cuErr } = await supabase
          .from("company_users")
          .select("company_id")
          .eq("user_id", userId);

        if (cuErr) throw cuErr;

        const companyIds = Array.from(new Set((cuRows || []).map((r) => r.company_id).filter(Boolean)));

        const [compRes, siteRes, mheRes] = await Promise.all([
          companyIds.length
            ? supabase.from("companies").select("id, name").in("id", companyIds).order("name", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          companyIds.length
            ? supabase.from("sites").select("id, name, company_id").in("company_id", companyIds).order("name", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          supabase.from("mhe_types").select("id, type_name").order("type_name", { ascending: true }),
        ]);

        if (compRes.error) throw compRes.error;
        if (siteRes.error) throw siteRes.error;
        if (mheRes.error) throw mheRes.error;

        setAllowedCompanies(compRes.data || []);
        setSites(siteRes.data || []);
        setMheTypes(mheRes.data || []);

        const firstCompanyId = (compRes.data || [])[0]?.id || "";
        setCompanyId((prev) => (prev && (compRes.data || []).some((c) => c.id === prev) ? prev : firstCompanyId));
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to load MHE reference data." });
        setAllowedCompanies([]);
        setSites([]);
        setMheTypes([]);
        setCompanyId("");
        setSiteId("");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  // Keep site selection valid when company changes
  useEffect(() => {
    if (!companyId) {
      setSiteId("");
      return;
    }
    const companySites = (sites || []).filter((s) => s.company_id === companyId);
    const firstSite = companySites[0]?.id || "";
    setSiteId((prev) => (prev && companySites.some((s) => s.id === prev) ? prev : firstSite));
  }, [companyId, sites]);

  // ---------- Register refresh ----------
  const refreshRegisterData = useCallback(async () => {
    if (!siteId) {
      setSiteColleagues([]);
      setCurrentAuths([]);
      return;
    }

    const { data: cData, error: cErr } = await supabase
      .from("colleagues")
      .select("id, first_name, last_name, employment_type, active, site_id")
      .eq("site_id", siteId)
      .order("last_name", { ascending: true });

    if (cErr) throw cErr;

    const activeOnly = (cData || []).filter((c) => c.active !== false);
    setSiteColleagues(activeOnly);

    // Read from current view (DO NOT filter by account_id)
    const { data: aData, error: aErr } = await supabase
      .from("v_mhe_authorisations_current")
      .select("*")
      .eq("site_id", siteId)
      .order("last_name", { ascending: true });

    if (aErr) throw aErr;
    setCurrentAuths(aData || []);
  }, [siteId]);

  // ---------- History refresh ----------
  const refreshHistoryData = useCallback(async () => {
    if (!historyColleagueId) {
      setHistoryRows([]);
      return;
    }

    let q = supabase
      .from("colleague_mhe_authorisations")
      .select("id, colleague_id, mhe_type_id, trained_on, expires_on, status, certificate_path, notes, created_at")
      .eq("colleague_id", historyColleagueId)
      .order("created_at", { ascending: false });

    if (historyMheTypeId) q = q.eq("mhe_type_id", historyMheTypeId);

    const { data, error } = await q;
    if (error) throw error;

    setHistoryRows(data || []);
  }, [historyColleagueId, historyMheTypeId]);

  // Refresh data on tab/site changes
  useEffect(() => {
    if (tab !== "register") return;
    (async () => {
      try {
        await refreshRegisterData();
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to load training register." });
      }
    })();
  }, [tab, refreshRegisterData, siteId]);

  useEffect(() => {
    if (tab !== "history") return;
    (async () => {
      try {
        await refreshHistoryData();
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to load audit history." });
      }
    })();
  }, [tab, refreshHistoryData]);

  // ---------- Filters ----------
  const filteredAuths = useMemo(() => {
    const s = toLowerTrim(searchName);
    const t = filterMheTypeId;

    return (currentAuths || []).filter((a) => {
      if (t && a.mhe_type_id !== t) return false;
      if (s) {
        const full = `${a.first_name || ""} ${a.last_name || ""}`.toLowerCase();
        if (!full.includes(s)) return false;
      }
      return true;
    });
  }, [currentAuths, searchName, filterMheTypeId]);

  const dueSoon = useMemo(() => {
    return (filteredAuths || []).filter((a) => {
      const d = Number(a.days_to_expiry);
      return Number.isFinite(d) && d <= 30;
    });
  }, [filteredAuths]);

  const normalList = useMemo(() => {
    const dueIds = new Set((dueSoon || []).map((a) => a.id));
    return (filteredAuths || []).filter((a) => !dueIds.has(a.id));
  }, [filteredAuths, dueSoon]);

  // ---------- Storage ----------
  const uploadCertificate = async (file, prefix = "mhe_certificates") => {
    if (!file) return { path: "" };
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const key = `${prefix}/${siteId}/${Date.now()}_${safeName}`;

    const { error } = await supabase.storage.from("certificates").upload(key, file, { upsert: true });
    if (error) throw error;

    return { path: key };
  };

  // ---------- Add record ----------
  const addFileRef = useRef(null);

  const openAdd = () => {
    setAddModal({
      open: true,
      colleague_id: "",
      mhe_type_id: "",
      trained_on: "",
      expires_on: "",
      notes: "",
      fileName: "",
      certificatePath: "",
    });
  };

  const closeAdd = () => setAddModal((p) => ({ ...p, open: false }));

  const onAddFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAddModal((p) => ({ ...p, fileName: file.name }));

    try {
      setLoading(true);
      const { path } = await uploadCertificate(file, "mhe_certificates");
      setAddModal((p) => ({ ...p, certificatePath: path }));
      setNotice({ type: "success", message: "Certificate uploaded." });
    } catch (err) {
      setNotice({ type: "error", message: err?.message || "Failed to upload certificate." });
      setAddModal((p) => ({ ...p, certificatePath: "" }));
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const submitAdd = async () => {
    setNotice({ type: "", message: "" });

    if (!companyId) return setNotice({ type: "error", message: "Select a company first." });
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
      // INSERT TARGET ("sheet"):
      // public.colleague_mhe_authorisations
      const payload = {
        site_id: siteId,
        colleague_id: addModal.colleague_id,
        mhe_type_id: addModal.mhe_type_id,
        trained_on: addModal.trained_on,
        expires_on: addModal.expires_on, // manual next due
        status: "ACTIVE",
        certificate_path: addModal.certificatePath || null,
        notes: addModal.notes.trim() || null,
      };

      const { error: insErr } = await supabase.from("colleague_mhe_authorisations").insert(payload);
      if (insErr) throw insErr;

      setNotice({ type: "success", message: "Training record added." });
      closeAdd();
      await refreshRegisterData();
    } catch (e) {
      setNotice({ type: "error", message: e?.message || "Failed to add training record." });
    } finally {
      setLoading(false);
    }
  };

  // ---------- Inline certificate upload ----------
  const inlineFileRef = useRef(null);

  const openInlineUpload = (authId) => {
    setPendingInlineUpload({ authId });
    setTimeout(() => inlineFileRef.current?.click(), 0);
  };

  const onInlineFileChange = async (e) => {
    const file = e.target.files?.[0];
    const authId = pendingInlineUpload.authId;

    if (!file || !authId) return;

    try {
      setLoading(true);
      const { path } = await uploadCertificate(file, "mhe_certificates");

      const { error } = await supabase
        .from("colleague_mhe_authorisations")
        .update({ certificate_path: path })
        .eq("id", authId);

      if (error) throw error;

      setNotice({ type: "success", message: "Certificate attached." });
      await refreshRegisterData();
    } catch (err) {
      setNotice({ type: "error", message: err?.message || "Failed to attach certificate." });
    } finally {
      setLoading(false);
      setPendingInlineUpload({ authId: "" });
      e.target.value = "";
    }
  };

  // ---------- Retrain ----------
  const retrainFileRef = useRef(null);

  const openRetrain = (authRow) => {
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
    setRetrainModal({
      open: false,
      auth: null,
      trained_on: "",
      expires_on: "",
      notes: "",
      fileName: "",
      certificatePath: "",
    });
  };

  const onRetrainFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRetrainModal((p) => ({ ...p, fileName: file.name }));

    try {
      setLoading(true);
      const { path } = await uploadCertificate(file, "mhe_certificates");
      setRetrainModal((p) => ({ ...p, certificatePath: path }));
      setNotice({ type: "success", message: "Certificate uploaded." });
    } catch (err) {
      setNotice({ type: "error", message: err?.message || "Failed to upload certificate." });
      setRetrainModal((p) => ({ ...p, certificatePath: "" }));
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const submitRetrain = async () => {
    setNotice({ type: "", message: "" });

    const a = retrainModal.auth;
    if (!a) return;

    if (!siteId) return setNotice({ type: "error", message: "Select a site first." });

    if (!retrainModal.trained_on || !isValidYMD(retrainModal.trained_on)) {
      return setNotice({ type: "error", message: "Trained on date is required." });
    }
    if (!retrainModal.expires_on || !isValidYMD(retrainModal.expires_on)) {
      return setNotice({ type: "error", message: "Next training due date is required." });
    }

    setLoading(true);
    try {
      // Expire old
      const { error: upErr } = await supabase
        .from("colleague_mhe_authorisations")
        .update({ status: "EXPIRED" })
        .eq("id", a.id);

      if (upErr) throw upErr;

      // Insert new ACTIVE
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

      setNotice({ type: "success", message: "Retraining recorded." });
      closeRetrain();
      await refreshRegisterData();
    } catch (e) {
      setNotice({ type: "error", message: e?.message || "Failed to record retraining." });
    } finally {
      setLoading(false);
    }
  };

  // ---------- Options ----------
  const companyOptions = useMemo(() => {
    return (allowedCompanies || []).map((c) => ({ value: c.id, label: c.name }));
  }, [allowedCompanies]);

  const siteOptions = useMemo(() => {
    return (sitesForSelectedCompany || []).map((s) => ({ value: s.id, label: s.name }));
  }, [sitesForSelectedCompany]);

  const mheTypeOptions = useMemo(() => {
    return (mheTypes || []).map((t) => ({ value: t.id, label: t.type_name }));
  }, [mheTypes]);

  const colleagueOptions = useMemo(() => {
    return (siteColleagues || []).map((c) => ({
      value: c.id,
      label: `${c.first_name || ""} ${c.last_name || ""}`.trim(),
    }));
  }, [siteColleagues]);

  const renderNotice = () => {
    if (!notice?.message) return null;
    const cls = notice.type === "error" ? "wi-alert wi-alert--error" : "wi-alert wi-alert--success";
    return <div className={cls}>{notice.message}</div>;
  };

  return (
    <AppLayout
      activeNav={activeNav}
      onSelectNav={onSelectNav}
      headerTitle="MHE training tracker"
      headerSubtitle={`Company: ${selectedCompanyName || "—"} · Site: ${selectedSiteName || "—"}`}
      headerRight={
        <div className="wi-headerRight">
          <div className="wi-headerEmail">{email}</div>
        </div>
      }
    >
      <div className="wi-page">
        {renderNotice()}

        <div className="wi-topControls">
          <Card>
            <div className="wi-controlsRow">
              <div className="wi-control">
                <label className="wi-label">Company</label>
                <select
                  className="wi-field"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  disabled={loading}
                >
                  <option value="">Select company…</option>
                  {companyOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="wi-control">
                <label className="wi-label">Site</label>
                <select className="wi-field" value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={loading || !companyId}>
                  <option value="">Select site…</option>
                  {siteOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="wi-control wi-control--tabs">
                <Button variant={tab === "register" ? "primary" : "secondary"} onClick={() => setTab("register")} disabled={loading}>
                  Training register
                </Button>
                <Button variant={tab === "history" ? "primary" : "secondary"} onClick={() => setTab("history")} disabled={loading}>
                  Audit history
                </Button>
              </div>

              {tab === "register" && (
                <div className="wi-control wi-control--actions">
                  <Button variant="secondary" onClick={refreshRegisterData} disabled={loading || !siteId}>
                    Refresh
                  </Button>
                  <Button variant="primary" onClick={openAdd} disabled={loading || !siteId}>
                    Add training record
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {tab === "register" && (
          <Card>
            <div className="wi-registerHeader">
              <div>
                <h3 className="wi-h3">Training register</h3>
                <div className="wi-muted">
                  Due soon colleagues (≤ 30 days to next training due) are shown at the top.
                </div>
              </div>

              <div className="wi-registerFilters">
                <div className="wi-control">
                  <label className="wi-label">Search colleague</label>
                  <input
                    className="wi-field"
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    placeholder="Name…"
                  />
                </div>

                <div className="wi-control">
                  <label className="wi-label">Filter MHE type</label>
                  <select className="wi-field" value={filterMheTypeId} onChange={(e) => setFilterMheTypeId(e.target.value)}>
                    <option value="">All types</option>
                    {mheTypeOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="wi-section">
              <h4 className="wi-h4">Due soon</h4>
              {dueSoon.length === 0 ? (
                <div className="wi-muted">No colleagues are due within 30 days.</div>
              ) : (
                <div className="wi-tableWrap">
                  <table className="wi-table">
                    <thead>
                      <tr>
                        <th>Colleague</th>
                        <th>Employment</th>
                        <th>MHE type</th>
                        <th>Trained on</th>
                        <th>Next due</th>
                        <th>Days</th>
                        <th>Certificate</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {dueSoon.map((a) => (
                        <tr key={a.id}>
                          <td>{`${a.first_name || ""} ${a.last_name || ""}`}</td>
                          <td>{a.employment_type || ""}</td>
                          <td>{a.mhe_type || ""}</td>
                          <td>{a.trained_on || ""}</td>
                          <td>{a.expires_on || ""}</td>
                          <td>{a.days_to_expiry ?? ""}</td>
                          <td>{a.certificate_path ? "Yes" : "No"}</td>
                          <td className="wi-rowActions">
                            <Button variant="secondary" onClick={() => openInlineUpload(a.id)} disabled={loading}>
                              Upload cert
                            </Button>
                            <Button variant="primary" onClick={() => openRetrain(a)} disabled={loading}>
                              Retrain
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="wi-section">
              <h4 className="wi-h4">All current</h4>
              {normalList.length === 0 ? (
                <div className="wi-muted">No trained colleagues match the current filters.</div>
              ) : (
                <div className="wi-tableWrap">
                  <table className="wi-table">
                    <thead>
                      <tr>
                        <th>Colleague</th>
                        <th>Employment</th>
                        <th>MHE type</th>
                        <th>Trained on</th>
                        <th>Next due</th>
                        <th>Days</th>
                        <th>Certificate</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {normalList.map((a) => (
                        <tr key={a.id}>
                          <td>{`${a.first_name || ""} ${a.last_name || ""}`}</td>
                          <td>{a.employment_type || ""}</td>
                          <td>{a.mhe_type || ""}</td>
                          <td>{a.trained_on || ""}</td>
                          <td>{a.expires_on || ""}</td>
                          <td>{a.days_to_expiry ?? ""}</td>
                          <td>{a.certificate_path ? "Yes" : "No"}</td>
                          <td className="wi-rowActions">
                            <Button variant="secondary" onClick={() => openInlineUpload(a.id)} disabled={loading}>
                              Upload cert
                            </Button>
                            <Button variant="primary" onClick={() => openRetrain(a)} disabled={loading}>
                              Retrain
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        )}

        {tab === "history" && (
          <Card>
            <div className="wi-historyHeader">
              <div>
                <h3 className="wi-h3">Audit history</h3>
                <div className="wi-muted">View training history (including expired records).</div>
              </div>
            </div>

            <div className="wi-historyFilters">
              <div className="wi-control">
                <label className="wi-label">Colleague</label>
                <select
                  className="wi-field"
                  value={historyColleagueId}
                  onChange={(e) => setHistoryColleagueId(e.target.value)}
                  disabled={loading || !siteId}
                >
                  <option value="">Select colleague…</option>
                  {colleagueOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="wi-control">
                <label className="wi-label">MHE type</label>
                <select
                  className="wi-field"
                  value={historyMheTypeId}
                  onChange={(e) => setHistoryMheTypeId(e.target.value)}
                  disabled={loading || !historyColleagueId}
                >
                  <option value="">All types</option>
                  {mheTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="wi-control wi-control--actions">
                <Button variant="secondary" onClick={refreshHistoryData} disabled={loading || !historyColleagueId}>
                  Refresh
                </Button>
              </div>
            </div>

            {historyRows.length === 0 ? (
              <div className="wi-muted">No history records found.</div>
            ) : (
              <div className="wi-tableWrap">
                <table className="wi-table">
                  <thead>
                    <tr>
                      <th>Created</th>
                      <th>Trained on</th>
                      <th>Next due</th>
                      <th>Status</th>
                      <th>Certificate</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.created_at ? new Date(r.created_at).toLocaleString() : ""}</td>
                        <td>{r.trained_on || ""}</td>
                        <td>{r.expires_on || ""}</td>
                        <td>{r.status || ""}</td>
                        <td>{r.certificate_path ? "Yes" : "No"}</td>
                        <td>{r.notes || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* ADD MODAL */}
        <PageModal open={addModal.open} title="Add training record" onClose={closeAdd}>
          <div className="wi-grid2">
            <div className="wi-control">
              <label className="wi-label">Colleague</label>
              <select
                className="wi-field"
                value={addModal.colleague_id}
                onChange={(e) => setAddModal((p) => ({ ...p, colleague_id: e.target.value }))}
                disabled={loading}
              >
                <option value="">Select colleague…</option>
                {colleagueOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="wi-control">
              <label className="wi-label">MHE type</label>
              <select
                className="wi-field"
                value={addModal.mhe_type_id}
                onChange={(e) => setAddModal((p) => ({ ...p, mhe_type_id: e.target.value }))}
                disabled={loading}
              >
                <option value="">Select type…</option>
                {mheTypeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="wi-control">
              <label className="wi-label">Trained on</label>
              <input
                className="wi-field"
                type="date"
                value={addModal.trained_on}
                onChange={(e) => setAddModal((p) => ({ ...p, trained_on: e.target.value }))}
                disabled={loading}
              />
            </div>

            <div className="wi-control">
              <label className="wi-label">Next training due</label>
              <input
                className="wi-field"
                type="date"
                value={addModal.expires_on}
                onChange={(e) => setAddModal((p) => ({ ...p, expires_on: e.target.value }))}
                disabled={loading}
              />
            </div>

            <div className="wi-control wi-control--full">
              <label className="wi-label">Notes</label>
              <input
                className="wi-field"
                value={addModal.notes}
                onChange={(e) => setAddModal((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional…"
                disabled={loading}
              />
            </div>

            <div className="wi-control wi-control--full">
              <label className="wi-label">Certificate</label>
              <div className="wi-fileRow">
                <Button variant="secondary" onClick={() => addFileRef.current?.click()} disabled={loading || !siteId}>
                  Upload certificate
                </Button>
                <span className="wi-muted">{addModal.fileName || (addModal.certificatePath ? "Uploaded" : "None")}</span>
              </div>
              <input ref={addFileRef} type="file" style={{ display: "none" }} onChange={onAddFileChange} />
            </div>
          </div>

          <div className="wi-modalActions">
            <Button variant="secondary" onClick={closeAdd} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitAdd} disabled={loading}>
              Save
            </Button>
          </div>
        </PageModal>

        {/* RETRAIN MODAL */}
        <PageModal open={retrainModal.open} title="Record retraining" onClose={closeRetrain}>
          <div className="wi-grid2">
            <div className="wi-control">
              <label className="wi-label">Trained on</label>
              <input
                className="wi-field"
                type="date"
                value={retrainModal.trained_on}
                onChange={(e) => setRetrainModal((p) => ({ ...p, trained_on: e.target.value }))}
                disabled={loading}
              />
            </div>

            <div className="wi-control">
              <label className="wi-label">Next training due</label>
              <input
                className="wi-field"
                type="date"
                value={retrainModal.expires_on}
                onChange={(e) => setRetrainModal((p) => ({ ...p, expires_on: e.target.value }))}
                disabled={loading}
              />
            </div>

            <div className="wi-control wi-control--full">
              <label className="wi-label">Notes</label>
              <input
                className="wi-field"
                value={retrainModal.notes}
                onChange={(e) => setRetrainModal((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional…"
                disabled={loading}
              />
            </div>

            <div className="wi-control wi-control--full">
              <label className="wi-label">Certificate</label>
              <div className="wi-fileRow">
                <Button variant="secondary" onClick={() => retrainFileRef.current?.click()} disabled={loading || !siteId}>
                  Upload certificate
                </Button>
                <span className="wi-muted">{retrainModal.fileName || (retrainModal.certificatePath ? "Uploaded" : "None")}</span>
              </div>
              <input ref={retrainFileRef} type="file" style={{ display: "none" }} onChange={onRetrainFileChange} />
            </div>
          </div>

          <div className="wi-modalActions">
            <Button variant="secondary" onClick={closeRetrain} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitRetrain} disabled={loading}>
              Save retraining
            </Button>
          </div>
        </PageModal>

        {/* INLINE UPLOAD INPUT */}
        <input ref={inlineFileRef} type="file" style={{ display: "none" }} onChange={onInlineFileChange} />
      </div>
    </AppLayout>
  );
}
