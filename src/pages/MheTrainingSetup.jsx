// /src/pages/MheTrainingSetup.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";
import { Input } from "../components/Input/Input";
import { Select } from "../components/Select/Select";
import { Modal } from "../components/Modal/Modal";

import { createClient } from "@supabase/supabase-js";
import "./MheTrainingSetup.css";

// NOTE: this page is tenant-safe via site/company membership and RLS.
// All inserts/updates go to: public.colleague_mhe_authorisations

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function toLowerTrim(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

function isValidYMD(v) {
  // Basic YYYY-MM-DD validation
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

  // Tenant reference data
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [mheTypes, setMheTypes] = useState([]);

  // Multi-company enforcement
  const [allowedCompanies, setAllowedCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(""); // selected company

  // Filters
  const [siteId, setSiteId] = useState(""); // selected site
  const [searchName, setSearchName] = useState("");
  const [filterMheTypeId, setFilterMheTypeId] = useState("");

  // Register data
  const [siteColleagues, setSiteColleagues] = useState([]);
  const [currentAuths, setCurrentAuths] = useState([]);

  // History filters
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
    status: "ACTIVE",
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

  // Inline certificate upload (register row)
  const [pendingInlineUpload, setPendingInlineUpload] = useState({
    open: false,
    authId: "",
    file: null,
    fileName: "",
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

  // ---------- Load reference data + memberships (multi-company) ----------
  useEffect(() => {
    if (!userId) return;

    (async () => {
      setLoading(true);
      setNotice({ type: "", message: "" });

      try {
        // Determine companies this user can access
        const { data: cuRows, error: cuErr } = await supabase
          .from("company_users")
          .select("company_id")
          .eq("user_id", userId);

        if (cuErr) throw cuErr;

        const companyIds = Array.from(new Set((cuRows || []).map((r) => r.company_id).filter(Boolean)));

        const [{ data: compData, error: compErr }, { data: siteData, error: siteErr }, { data: mheData, error: mheErr }] =
          await Promise.all([
            companyIds.length
              ? supabase.from("companies").select("id, name").in("id", companyIds).order("name", { ascending: true })
              : Promise.resolve({ data: [], error: null }),
            companyIds.length
              ? supabase.from("sites").select("id, name, company_id").in("company_id", companyIds).order("name", { ascending: true })
              : Promise.resolve({ data: [], error: null }),
            // mhe_types treated as global
            supabase.from("mhe_types").select("id, type_name").order("type_name", { ascending: true }),
          ]);

        if (compErr) throw compErr;
        if (siteErr) throw siteErr;
        if (mheErr) throw mheErr;

        setAllowedCompanies(compData || []);
        setCompanies(compData || []);
        setSites(siteData || []);
        setMheTypes(mheData || []);

        // Ensure selected company is valid
        const firstCompanyId = (compData || [])[0]?.id || "";
        setCompanyId((prev) => (prev && (compData || []).some((c) => c.id === prev) ? prev : firstCompanyId));
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to load MHE reference data." });
        setAllowedCompanies([]);
        setCompanies([]);
        setSites([]);
        setMheTypes([]);
        setCompanyId("");
        setSiteId("");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  // Ensure siteId remains valid when company changes
  useEffect(() => {
    if (!companyId) {
      setSiteId("");
      return;
    }
    const companySites = (sites || []).filter((s) => s.company_id === companyId);
    const firstSite = companySites[0];
    setSiteId((prev) => (prev && companySites.some((s) => s.id === prev) ? prev : firstSite?.id || ""));
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

    // Current authorisations view (filtered by site_id)
    let aQuery = supabase
      .from("v_mhe_authorisations_current")
      .select("*")
      .eq("site_id", siteId)
      .order("last_name", { ascending: true });

    // Note: this view is tenant-safe via site/company RLS; do not filter by account_id.
    const { data: aData, error: aErr } = await aQuery;
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

    if (historyMheTypeId) {
      q = q.eq("mhe_type_id", historyMheTypeId);
    }

    const { data, error } = await q;
    if (error) throw error;

    setHistoryRows(data || []);
  }, [historyColleagueId, historyMheTypeId]);

  // ---------- Trigger refresh on relevant changes ----------
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

  // ---------- Derived filtered register ----------
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

  // Due soon (<= 30 days)
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

  // ---------- Modal helpers ----------
  const openAdd = () => {
    setAddModal((prev) => ({
      ...prev,
      open: true,
      colleague_id: "",
      mhe_type_id: "",
      trained_on: "",
      expires_on: "",
      status: "ACTIVE",
      notes: "",
      fileName: "",
      certificatePath: "",
    }));
  };
  const closeAdd = () => setAddModal((prev) => ({ ...prev, open: false }));

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
    setRetrainModal({ open: false, auth: null, trained_on: "", expires_on: "", notes: "", fileName: "", certificatePath: "" });
  };

  // ---------- Storage helpers ----------
  const uploadCertificate = async (file, prefix = "mhe_certificates") => {
    if (!file) return { path: "" };
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const key = `${prefix}/${siteId}/${Date.now()}_${safeName}`;

    const { error } = await supabase.storage.from("certificates").upload(key, file, { upsert: true });
    if (error) throw error;

    return { path: key };
  };

  // ---------- Add training record ----------
  const pickAddFileRef = useRef(null);
  const pickAddFile = () => pickAddFileRef.current?.click();

  const onAddFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAddModal((prev) => ({ ...prev, fileName: file.name }));

    try {
      setLoading(true);
      const { path } = await uploadCertificate(file, "mhe_certificates");
      setAddModal((prev) => ({ ...prev, certificatePath: path }));
      setNotice({ type: "success", message: "Certificate uploaded." });
    } catch (err) {
      setNotice({ type: "error", message: err?.message || "Failed to upload certificate." });
      setAddModal((prev) => ({ ...prev, certificatePath: "" }));
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
      // INSERT TARGET CONFIRMATION:
      // New records are written to: public.colleague_mhe_authorisations
      const payload = {
        site_id: siteId,
        colleague_id: addModal.colleague_id,
        mhe_type_id: addModal.mhe_type_id,
        trained_on: addModal.trained_on,
        expires_on: addModal.expires_on, // manual “next training due”
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

  // ---------- Inline certificate upload (existing record) ----------
  const inlineFileRef = useRef(null);
  const openInlineUpload = (authId) => {
    setPendingInlineUpload({ open: true, authId, file: null, fileName: "" });
    setTimeout(() => inlineFileRef.current?.click(), 0);
  };

  const onInlineFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setPendingInlineUpload({ open: false, authId: "", file: null, fileName: "" });
      return;
    }

    try {
      setLoading(true);
      const { path } = await uploadCertificate(file, "mhe_certificates");

      const { error } = await supabase
        .from("colleague_mhe_authorisations")
        .update({ certificate_path: path })
        .eq("id", pendingInlineUpload.authId);

      if (error) throw error;

      setNotice({ type: "success", message: "Certificate attached." });
      await refreshRegisterData();
    } catch (err) {
      setNotice({ type: "error", message: err?.message || "Failed to attach certificate." });
    } finally {
      setLoading(false);
      setPendingInlineUpload({ open: false, authId: "", file: null, fileName: "" });
      e.target.value = "";
    }
  };

  // ---------- Retrain flow ----------
  const pickRetrainFileRef = useRef(null);
  const pickRetrainFile = () => pickRetrainFileRef.current?.click();

  const onRetrainFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRetrainModal((prev) => ({ ...prev, fileName: file.name }));

    try {
      setLoading(true);
      const { path } = await uploadCertificate(file, "mhe_certificates");
      setRetrainModal((prev) => ({ ...prev, certificatePath: path }));
      setNotice({ type: "success", message: "Certificate uploaded." });
    } catch (err) {
      setNotice({ type: "error", message: err?.message || "Failed to upload certificate." });
      setRetrainModal((prev) => ({ ...prev, certificatePath: "" }));
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
      // 1) Expire old
      const { error: upErr } = await supabase
        .from("colleague_mhe_authorisations")
        .update({ status: "EXPIRED" })
        .eq("id", a.id);

      if (upErr) throw upErr;

      // 2) Insert new ACTIVE
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

  // ---------- UI helpers ----------
  const renderNotice = () => {
    if (!notice?.message) return null;
    const cls = notice.type === "error" ? "wi-alert wi-alert--error" : "wi-alert wi-alert--success";
    return <div className={cls}>{notice.message}</div>;
  };

  const mheTypeOptions = useMemo(() => {
    return (mheTypes || []).map((t) => ({ value: t.id, label: t.type_name }));
  }, [mheTypes]);

  const colleagueOptions = useMemo(() => {
    return (siteColleagues || []).map((c) => ({
      value: c.id,
      label: `${c.first_name || ""} ${c.last_name || ""}`.trim(),
    }));
  }, [siteColleagues]);

  const companyOptions = useMemo(() => {
    return (allowedCompanies || []).map((c) => ({ value: c.id, label: c.name }));
  }, [allowedCompanies]);

  const siteOptions = useMemo(() => {
    return (sitesForSelectedCompany || []).map((s) => ({ value: s.id, label: s.name }));
  }, [sitesForSelectedCompany]);

  // ---------- Render ----------
  return (
    <AppLayout
      activeNav={activeNav}
      onSelectNav={onSelectNav}
      headerTitle="MHE training tracker"
      headerSubtitle={`Company: ${selectedCompanyName || "—"}  ·  Site: ${selectedSiteName || "—"}`}
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
                <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} disabled={loading}>
                  <option value="">Select company…</option>
                  {companyOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="wi-control">
                <label className="wi-label">Site</label>
                <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={loading || !companyId}>
                  <option value="">Select site…</option>
                  {siteOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="wi-control wi-control--tabs">
                <Button
                  variant={tab === "register" ? "primary" : "secondary"}
                  onClick={() => setTab("register")}
                  disabled={loading}
                >
                  Training register
                </Button>
                <Button
                  variant={tab === "history" ? "primary" : "secondary"}
                  onClick={() => setTab("history")}
                  disabled={loading}
                >
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
                  Due soon colleagues (≤ 30 days to next training due) are shown at the top. Hover a colleague to see all current
                  authorisations.
                </div>
              </div>

              <div className="wi-registerFilters">
                <div className="wi-control">
                  <label className="wi-label">Search colleague</label>
                  <Input value={searchName} onChange={(e) => setSearchName(e.target.value)} placeholder="Name…" />
                </div>

                <div className="wi-control">
                  <label className="wi-label">Filter MHE type</label>
                  <Select value={filterMheTypeId} onChange={(e) => setFilterMheTypeId(e.target.value)}>
                    <option value="">All types</option>
                    {mheTypeOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
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
                          <td>
                            {a.certificate_path ? (
                              <span className="wi-badge wi-badge--ok">Attached</span>
                            ) : (
                              <span className="wi-badge">None</span>
                            )}
                          </td>
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
                          <td>
                            {a.certificate_path ? (
                              <span className="wi-badge wi-badge--ok">Attached</span>
                            ) : (
                              <span className="wi-badge">None</span>
                            )}
                          </td>
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
                <Select value={historyColleagueId} onChange={(e) => setHistoryColleagueId(e.target.value)} disabled={loading || !siteId}>
                  <option value="">Select colleague…</option>
                  {colleagueOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="wi-control">
                <label className="wi-label">MHE type</label>
                <Select value={historyMheTypeId} onChange={(e) => setHistoryMheTypeId(e.target.value)} disabled={loading || !historyColleagueId}>
                  <option value="">All types</option>
                  {mheTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
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
        <Modal open={addModal.open} onClose={closeAdd} title="Add training record">
          <div className="wi-modalBody">
            <div className="wi-grid2">
              <div className="wi-control">
                <label className="wi-label">Colleague</label>
                <Select
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
                </Select>
              </div>

              <div className="wi-control">
                <label className="wi-label">MHE type</label>
                <Select
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
                </Select>
              </div>

              <div className="wi-control">
                <label className="wi-label">Trained on</label>
                <Input
                  type="date"
                  value={addModal.trained_on}
                  onChange={(e) => setAddModal((p) => ({ ...p, trained_on: e.target.value }))}
                  disabled={loading}
                />
              </div>

              <div className="wi-control">
                <label className="wi-label">Next training due</label>
                <Input
                  type="date"
                  value={addModal.expires_on}
                  onChange={(e) => setAddModal((p) => ({ ...p, expires_on: e.target.value }))}
                  disabled={loading}
                />
              </div>

              <div className="wi-control wi-control--full">
                <label className="wi-label">Notes</label>
                <Input
                  value={addModal.notes}
                  onChange={(e) => setAddModal((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional…"
                  disabled={loading}
                />
              </div>

              <div className="wi-control wi-control--full">
                <label className="wi-label">Certificate</label>
                <div className="wi-fileRow">
                  <Button variant="secondary" onClick={pickAddFile} disabled={loading || !siteId}>
                    Upload certificate
                  </Button>
                  <span className="wi-muted">{addModal.fileName || (addModal.certificatePath ? "Uploaded" : "None")}</span>
                </div>
                <input ref={pickAddFileRef} type="file" style={{ display: "none" }} onChange={onAddFileChange} />
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
          </div>
        </Modal>

        {/* RETRAIN MODAL */}
        <Modal open={retrainModal.open} onClose={closeRetrain} title="Record retraining">
          <div className="wi-modalBody">
            <div className="wi-grid2">
              <div className="wi-control">
                <label className="wi-label">Trained on</label>
                <Input
                  type="date"
                  value={retrainModal.trained_on}
                  onChange={(e) => setRetrainModal((p) => ({ ...p, trained_on: e.target.value }))}
                  disabled={loading}
                />
              </div>

              <div className="wi-control">
                <label className="wi-label">Next training due</label>
                <Input
                  type="date"
                  value={retrainModal.expires_on}
                  onChange={(e) => setRetrainModal((p) => ({ ...p, expires_on: e.target.value }))}
                  disabled={loading}
                />
              </div>

              <div className="wi-control wi-control--full">
                <label className="wi-label">Notes</label>
                <Input
                  value={retrainModal.notes}
                  onChange={(e) => setRetrainModal((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional…"
                  disabled={loading}
                />
              </div>

              <div className="wi-control wi-control--full">
                <label className="wi-label">Certificate</label>
                <div className="wi-fileRow">
                  <Button variant="secondary" onClick={pickRetrainFile} disabled={loading || !siteId}>
                    Upload certificate
                  </Button>
                  <span className="wi-muted">{retrainModal.fileName || (retrainModal.certificatePath ? "Uploaded" : "None")}</span>
                </div>
                <input ref={pickRetrainFileRef} type="file" style={{ display: "none" }} onChange={onRetrainFileChange} />
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
          </div>
        </Modal>

        {/* INLINE UPLOAD INPUT */}
        <input ref={inlineFileRef} type="file" style={{ display: "none" }} onChange={onInlineFileChange} />
      </div>
    </AppLayout>
  );
}
