// /src/pages/MheTrainingSetup.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";

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

// Outstanding definition:
// - due date missing => outstanding
// - due date within 30 days => outstanding
// - overdue => outstanding
const OUTSTANDING_DAYS = 30;

function activeFromPath(pathname) {
  // Most specific first
  if (pathname.startsWith("/app/setup/mhe-training")) return "mhe-training";
  if (pathname.startsWith("/app/tools/mhe-training")) return "mhe-training";

  if (pathname.startsWith("/app/setup/companies-sites")) return "company-site-setup";
  if (pathname.startsWith("/app/setup/colleagues")) return "colleagues-setup";
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
    case "colleagues-setup":
      return "/app/setup/colleagues";
    case "mhe-setup":
      return "/app/setup/mhe";
    case "connections":
      return "/app/connections";
    case "scheduling-tool":
      return "/app/tools/scheduling";
    case "mhe-training":
      return "/app/setup/mhe-training";
    case "users":
      return "/app/users";
    case "password":
      return "/app/password";
    default:
      return "/app/dashboard";
  }
}

export default function MheTrainingSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeNav = useMemo(() => activeFromPath(location.pathname), [location.pathname]);
  const onSelectNav = (key) => navigate(pathFromKey(key));

  const [tab, setTab] = useState("register"); // register | history

  // Hover tooltip (now includes full training history)
  const [hoverTip, setHoverTip] = useState({
    open: false,
    x: 0,
    y: 0,
    colleagueId: "",
    loading: false,
    rows: [],
  });

  const hoverCacheRef = useRef(new Map()); // colleagueId -> rows[]
  const hoverLastIdRef = useRef(""); // reduce re-fetch noise

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState({ type: "", message: "" });

  // Header email + tenant boundary
  const [email, setEmail] = useState("");
  const [accountId, setAccountId] = useState("");

  // Company enforcement (multi-company capable)
  const [allowedCompanies, setAllowedCompanies] = useState([]); // [{id,name}]
  const [companyId, setCompanyId] = useState("");

  // Reference data
  const [sites, setSites] = useState([]);
  const [mheTypes, setMheTypes] = useState([]);

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

  // Retrain modal
  const retrainFileRef = useRef(null);
  const [retrainModal, setRetrainModal] = useState({
    open: false,
    auth: null,
    trained_on: "",
    notes: "",
    fileName: "",
    certificatePath: "",
    training_due: "",
  });

  // Add training modal
  const addFileRef = useRef(null);
  const [addModal, setAddModal] = useState({
    open: false,
    colleagueId: "",
    mheTypeId: "",
    trained_on: "",
    training_due: "",
    notes: "",
    fileName: "",
    certificatePath: "",
  });

  // Actions dropdown (PORTAL: renders to body, fixed positioned)
  const [actionsMenu, setActionsMenu] = useState({
    open: false,
    authId: "",
    left: 0,
    top: 0,
  });
  const [dueEdit, setDueEdit] = useState({ authId: "", value: "" });
  const actionsMenuRef = useRef(null);

  // Close portal menu on outside click, escape, scroll, resize
  useEffect(() => {
    const onDown = (e) => {
      if (!actionsMenu.open) return;
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target)) {
        setActionsMenu({ open: false, authId: "", left: 0, top: 0 });
        setDueEdit({ authId: "", value: "" });
      }
    };

    const onKey = (e) => {
      if (!actionsMenu.open) return;
      if (e.key === "Escape") {
        setActionsMenu({ open: false, authId: "", left: 0, top: 0 });
        setDueEdit({ authId: "", value: "" });
      }
    };

    const onScrollOrResize = () => {
      if (!actionsMenu.open) return;
      setActionsMenu({ open: false, authId: "", left: 0, top: 0 });
      setDueEdit({ authId: "", value: "" });
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize, true);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize, true);
    };
  }, [actionsMenu.open]);

  const siteName = useMemo(() => sites.find((s) => s.id === siteId)?.name || "", [sites, siteId]);

  const mheTypeNameById = useMemo(() => {
    const map = new Map();
    (mheTypes || []).forEach((t) => map.set(t.id, t.type_name));
    return map;
  }, [mheTypes]);

  const colleagueNameById = useMemo(() => {
    const map = new Map();
    (siteColleagues || []).forEach((c) => {
      map.set(c.id, `${c.last_name}, ${c.first_name}`);
    });
    return map;
  }, [siteColleagues]);

  const resolveAccountId = useCallback(async (userId) => {
    {
      const { data, error } = await supabase.from("users").select("account_id").eq("id", userId).maybeSingle();
      if (!error && data?.account_id) return data.account_id;
    }
    {
      const { data, error } = await supabase
        .from("company_users")
        .select("account_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (!error && data?.account_id) return data.account_id;
    }
    return "";
  }, []);

  // -----------------------------
  // Certificate view/download (private bucket via signed URL)
  // -----------------------------
  const CERT_BUCKET = "mhe-certificates";

  const fileNameFromPath = (p) => {
    if (!p) return "certificate";
    const last = String(p).split("/").pop() || "certificate";
    // strip the timestamp prefix you add: 169..._filename.pdf
    const idx = last.indexOf("_");
    return idx > 0 ? last.slice(idx + 1) : last;
  };

  const getSignedCertUrl = useCallback(async (path, expiresIn = 300) => {
    if (!path) throw new Error("No certificate path found.");
    const { data, error } = await supabase.storage.from(CERT_BUCKET).createSignedUrl(path, expiresIn);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("Could not generate certificate URL.");
    return data.signedUrl;
  }, []);

  const viewCertificate = useCallback(
    async (path) => {
      try {
        setNotice({ type: "", message: "" });
        const url = await getSignedCertUrl(path, 300);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to open certificate." });
      }
    },
    [getSignedCertUrl]
  );

  const downloadCertificate = useCallback(
    async (path) => {
      try {
        setNotice({ type: "", message: "" });
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
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to download certificate." });
      }
    },
    [getSignedCertUrl]
  );

  // Init session
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setNotice({ type: "", message: "" });

        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const user = authData?.user;
        if (!user) {
          navigate("/login", { replace: true });
          return;
        }

        setEmail(user.email || "");

        const aId = await resolveAccountId(user.id);
        if (!aId) {
          setNotice({
            type: "error",
            message:
              "Could not resolve account_id for this user. Ensure public.users (or company_users) contains account_id.",
          });
          return;
        }
        setAccountId(aId);
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to initialise MHE Training." });
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, resolveAccountId]);

  // Load allowed companies
  useEffect(() => {
    if (!accountId) return;

    (async () => {
      try {
        setLoading(true);

        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        const user = authData?.user;
        if (!user) return;

        const { data: mem, error: memErr } = await supabase
          .from("company_users")
          .select("company_id, companies(name)")
          .eq("account_id", accountId)
          .eq("user_id", user.id);

        if (memErr) throw memErr;

        const membershipCompanies =
          (mem || [])
            .map((r) => ({ id: r.company_id, name: r?.companies?.name || "—" }))
            .filter((x) => !!x.id) || [];

        if (membershipCompanies.length > 0) {
          setAllowedCompanies(membershipCompanies);
          if (!companyId) setCompanyId(membershipCompanies[0].id);
          return;
        }

        const { data: allC, error: allErr } = await supabase
          .from("companies")
          .select("id, name")
          .eq("account_id", accountId)
          .order("name");

        if (allErr) throw allErr;

        setAllowedCompanies(allC || []);
        if (!companyId && (allC || []).length) setCompanyId(allC[0].id);

        setNotice({
          type: "warning",
          message:
            "No companies assigned to this user in company_users for this account. Falling back to all companies in this account (add company_users rows to enforce memberships).",
        });
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to load companies." });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Load sites + MHE types when company changes
  useEffect(() => {
    if (!companyId) {
      setSites([]);
      setSiteId("");
      return;
    }

    (async () => {
      try {
        setLoading(true);

        const [{ data: st, error: es }, { data: mt, error: emt }] = await Promise.all([
          supabase.from("sites").select("id, company_id, name").eq("company_id", companyId).order("name"),
          supabase.from("mhe_types").select("id, type_name, inspection_cycle_days").order("type_name"),
        ]);

        if (es) throw es;
        if (emt) throw emt;

        setSites(st || []);
        setMheTypes(mt || []);

        setSiteId((prev) => {
          if (prev && (st || []).some((s) => s.id === prev)) return prev;
          return st?.[0]?.id || "";
        });
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to load reference data." });
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  // Save manual due date
  const updateTrainingDue = useCallback(async (authId, ymd) => {
    setNotice({ type: "", message: "" });

    const clean = (ymd || "").trim();
    const value = clean === "" ? null : clean;

    if (value && !isValidYMD(value)) {
      setNotice({ type: "error", message: "Training due date must be a valid date." });
      return;
    }

    const { error } = await supabase
      .from("colleague_mhe_authorisations")
      .update({ expires_on: value })
      .eq("id", authId);

    if (error) {
      setNotice({ type: "error", message: error.message || "Failed to update training due date." });
      return;
    }

    setCurrentAuths((prev) => (prev || []).map((a) => (a.id === authId ? { ...a, training_due: value } : a)));
  }, []);

  /**
   * IMPORTANT FIX:
   * We DO NOT use v_mhe_authorisations_currents for the register because it does not include
   * base-table id/training_due (as per your screenshot). We load ACTIVE records directly from
   * colleague_mhe_authorisations so training_due updates persist.
   */
  const refreshRegisterData = useCallback(async () => {
    if (!siteId) {
      setSiteColleagues([]);
      setCurrentAuths([]);
      return;
    }

    // Colleagues
    const { data: cData, error: cErr } = await supabase
      .from("colleagues")
      .select("id, first_name, last_name, employment_type, active")
      .eq("site_id", siteId)
      .order("last_name", { ascending: true });

    if (cErr) throw cErr;

    const activeOnly = (cData || []).filter((c) => c.active === true);
    setSiteColleagues(activeOnly);

    // Current active authorisations (base table, with id + training_due)
    const { data: aRows, error: aErr } = await supabase
      .from("colleague_mhe_authorisations")
      .select("id, colleague_id, mhe_type_id, trained_on, expires_on, status, certificate_path")
      .eq("site_id", siteId)
      .eq("status", "ACTIVE")
      .order("trained_on", { ascending: false });

    if (aErr) throw aErr;

    // Enrich with mhe type name (from loaded mheTypes, fallback to direct fetch if needed)
    const localMap = new Map((mheTypes || []).map((t) => [t.id, t.type_name]));
    let useRows = aRows || [];

    // If types not loaded yet, do a minimal fetch once
    if (useRows.length && localMap.size === 0) {
      const { data: mt, error: mtErr } = await supabase.from("mhe_types").select("id, type_name");
      if (!mtErr && mt) mt.forEach((t) => localMap.set(t.id, t.type_name));
    }

    useRows = useRows.map((r) => ({
      ...r,
      training_due: r.expires_on, // UI uses training_due label
      mhe_type: localMap.get(r.mhe_type_id) || r.mhe_type_id,
    }));

    setCurrentAuths(useRows);

    if (!historyColleagueId && activeOnly.length) setHistoryColleagueId(activeOnly[0].id);
  }, [siteId, mheTypes, historyColleagueId]);

  useEffect(() => {
    (async () => {
      try {
        await refreshRegisterData();
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to load site training data." });
      }
    })();
  }, [refreshRegisterData]);

  // Group current auths by colleague
  const authsByColleague = useMemo(() => {
    const map = new Map();
    (currentAuths || []).forEach((a) => {
      const arr = map.get(a.colleague_id) || [];
      arr.push(a);
      map.set(a.colleague_id, arr);
    });

    // Sort by training_due then trained_on
    map.forEach((arr, key) => {
      arr.sort((x, y) => {
        const dx = String(x.training_due || "");
        const dy = String(y.training_due || "");
        const c = dx.localeCompare(dy);
        if (c !== 0) return c;
        return String(y.trained_on || "").localeCompare(String(x.trained_on || ""));
      });
      map.set(key, arr);
    });

    return map;
  }, [currentAuths]);

  const fetchHoverHistory = useCallback(
    async (colleagueId) => {
      if (hoverCacheRef.current.has(colleagueId)) {
        const rows = hoverCacheRef.current.get(colleagueId) || [];
        setHoverTip((h) => ({ ...h, loading: false, rows }));
        return;
      }

      setHoverTip((h) => ({ ...h, loading: true, rows: [] }));

      const { data, error } = await supabase
        .from("colleague_mhe_authorisations")
        .select("id, mhe_type_id, trained_on, expires_on, status, certificate_path, created_at")
        .eq("colleague_id", colleagueId)
        .order("trained_on", { ascending: false });

      if (error) {
        setHoverTip((h) => ({ ...h, loading: false, rows: [] }));
        return;
      }

      const rows =
        (data || []).map((r) => ({
          ...r,
          training_due: r.expires_on,
          mhe_type: mheTypeNameById.get(r.mhe_type_id) || r.mhe_type_id,
        })) || [];

      hoverCacheRef.current.set(colleagueId, rows);
      setHoverTip((h) => ({ ...h, loading: false, rows }));
    },
    [mheTypeNameById]
  );

  const moveHoverTip = useCallback(
    (e, colleagueId) => {
      const boxW = 520;
      const boxH = 360;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let x = e.clientX + 14;
      let y = e.clientY + 14;

      if (x + boxW + 14 > vw) x = e.clientX - boxW - 14;
      if (y + boxH + 14 > vh) y = e.clientY - boxH - 14;

      setHoverTip((prev) => ({
        ...prev,
        open: true,
        x,
        y,
        colleagueId,
      }));

      // Prevent repeated fetch spam while moving within same card
      if (hoverLastIdRef.current !== colleagueId) {
        hoverLastIdRef.current = colleagueId;
        fetchHoverHistory(colleagueId);
      } else if (hoverCacheRef.current.has(colleagueId)) {
        const rows = hoverCacheRef.current.get(colleagueId) || [];
        setHoverTip((h) => ({ ...h, loading: false, rows }));
      }
    },
    [fetchHoverHistory]
  );

  const closeHoverTip = () => {
    hoverLastIdRef.current = "";
    setHoverTip({ open: false, x: 0, y: 0, colleagueId: "", loading: false, rows: [] });
  };

  // Outstanding list:
  // - Hide 0-training colleagues from the register
  // - Show only colleagues with training outstanding
  const colleagueRows = useMemo(() => {
    const nf = safeLower(nameFilter);

    const rows = (siteColleagues || [])
      .map((c) => {
        const list = authsByColleague.get(c.id) || [];
        const hasAnyTraining = list.length > 0;

        const visibleAuths = mheTypeFilter === "ALL" ? list : list.filter((a) => a.mhe_type_id === mheTypeFilter);

        let outstanding = false;
        let minDays = 999999;

        if (!hasAnyTraining) {
          // requirement: do not show 0-training colleagues in this view
          outstanding = false;
          minDays = 999999;
        } else if (visibleAuths.length === 0) {
          outstanding = mheTypeFilter !== "ALL";
          minDays = outstanding ? -999999 : 999999;
        } else {
          for (const a of visibleAuths) {
            if (!a.training_due) {
              outstanding = true;
              minDays = Math.min(minDays, 0);
              continue;
            }
            const d = daysUntil(a.training_due);
            if (d != null) minDays = Math.min(minDays, d);
            if (d == null) outstanding = true;
            else if (d <= OUTSTANDING_DAYS) outstanding = true;
          }
        }

        return {
          ...c,
          _auths: list,
          _hasAnyTraining: hasAnyTraining,
          _visibleAuths: visibleAuths,
          _outstanding: outstanding,
          _minDays: minDays,
        };
      })
      .filter((c) => {
        if (!nf) return true;
        const full = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
        const rev = `${c.last_name || ""} ${c.first_name || ""}`.toLowerCase();
        return full.includes(nf) || rev.includes(nf);
      })
      .filter((c) => c._hasAnyTraining === true);

    rows.sort((a, b) => {
      if (a._minDays !== b._minDays) return a._minDays - b._minDays;
      const ln = (a.last_name || "").localeCompare(b.last_name || "");
      if (ln !== 0) return ln;
      return (a.first_name || "").localeCompare(b.first_name || "");
    });

    return rows;
  }, [siteColleagues, authsByColleague, nameFilter, mheTypeFilter]);

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
      if (!companyId) throw new Error("No company selected.");

      const path = `company/${companyId}/colleague/${pendingUpload.colleagueId}/mhe/${pendingUpload.mheTypeId}/${Date.now()}_${file.name}`;

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

      hoverCacheRef.current.delete(pendingUpload.colleagueId);

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
  const openAddTraining = (colleagueIdArg = "") => {
    setNotice({ type: "", message: "" });
    setAddModal({
      open: true,
      colleagueId: colleagueIdArg || (siteColleagues[0]?.id || ""),
      mheTypeId: mheTypes[0]?.id || "",
      trained_on: "",
      training_due: "",
      notes: "",
      fileName: "",
      certificatePath: "",
    });
  };

  const closeAddTraining = () => {
    setAddModal({
      open: false,
      colleagueId: "",
      mheTypeId: "",
      trained_on: "",
      training_due: "",
      notes: "",
      fileName: "",
      certificatePath: "",
    });
  };

  const handleAddFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setNotice({ type: "", message: "" });
    setLoading(true);

    try {
      if (!companyId) throw new Error("No company selected.");
      if (!addModal.colleagueId) throw new Error("Select a colleague first.");
      if (!addModal.mheTypeId) throw new Error("Select an MHE type first.");

      const path = `company/${companyId}/colleague/${addModal.colleagueId}/mhe/${addModal.mheTypeId}/${Date.now()}_${file.name}`;

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
    if (!addModal.training_due || !isValidYMD(addModal.training_due)) {
      return setNotice({ type: "error", message: "Training due date is required." });
    }

    setLoading(true);
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const userId = authData?.user?.id || null;

      const payload = {
        company_id: companyId,
        site_id: siteId,
        colleague_id: addModal.colleagueId,
        mhe_type_id: addModal.mheTypeId,
        trained_on: addModal.trained_on,
        expires_on: addModal.training_due || null,
        status: "ACTIVE",
        signed_off_by: userId,
        certificate_path: addModal.certificatePath || null,
        notes: addModal.notes.trim() || null,
      };

      const { error: insErr } = await supabase.from("colleague_mhe_authorisations").insert(payload);
      if (insErr) throw insErr;

      hoverCacheRef.current.delete(addModal.colleagueId);

      setNotice({ type: "success", message: "Training record created." });
      closeAddTraining();
      await refreshRegisterData();
    } catch (e) {
      setNotice({ type: "error", message: e?.message || "Failed to create training record." });
    } finally {
      setLoading(false);
    }
  };

  // ---- Retrain ----
  const openRetrain = (authRow) => {
    setNotice({ type: "", message: "" });
    setRetrainModal({
      open: true,
      auth: authRow,
      trained_on: "",
      training_due: "",
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
      training_due: "",
      notes: "",
      fileName: "",
      certificatePath: "",
    });
  };

  const handleRetrainFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setNotice({ type: "", message: "" });
    setLoading(true);

    try {
      if (!retrainModal.auth) throw new Error("No authorisation selected.");
      if (!companyId) throw new Error("No company selected.");

      const a = retrainModal.auth;

      const path = `company/${companyId}/colleague/${a.colleague_id}/mhe/${a.mhe_type_id}/${Date.now()}_${file.name}`;

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
    setHistoryRows((data || []).map((r) => ({ ...r, training_due: r.expires_on })));
  }, [historyColleagueId, historyMheTypeId]);

  const submitRetrain = async () => {
    setNotice({ type: "", message: "" });

    const a = retrainModal.auth;
    if (!a) return setNotice({ type: "error", message: "No authorisation selected." });

    if (!retrainModal.trained_on || !isValidYMD(retrainModal.trained_on)) {
      return setNotice({ type: "error", message: "Trained on date is required." });
    }
    if (retrainModal.training_due && !isValidYMD(retrainModal.training_due)) {
      return setNotice({ type: "error", message: "Training due date must be a valid date (or blank)." });
    }

    setLoading(true);
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const userId = authData?.user?.id || null;

      // revoke existing
      const { error: revErr } = await supabase
        .from("colleague_mhe_authorisations")
        .update({ status: "REVOKED" })
        .eq("id", a.id);
      if (revErr) throw revErr;

      // insert new ACTIVE
      const payload = {
        company_id: companyId,
        site_id: siteId,
        colleague_id: a.colleague_id,
        mhe_type_id: a.mhe_type_id,
        trained_on: retrainModal.trained_on,
        expires_on: retrainModal.training_due || null,
        status: "ACTIVE",
        signed_off_by: userId,
        certificate_path: retrainModal.certificatePath || null,
        notes: retrainModal.notes.trim() || null,
      };

      const { error: insErr } = await supabase.from("colleague_mhe_authorisations").insert(payload);
      if (insErr) throw insErr;

      hoverCacheRef.current.delete(a.colleague_id);

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

  // Helper: open portal menu aligned to button (right edge)
  const openActionsMenu = useCallback(
    (authRow, buttonEl) => {
      if (!authRow || !buttonEl) return;
      const rect = buttonEl.getBoundingClientRect();
      setNotice({ type: "", message: "" });
      setDueEdit({ authId: authRow.id, value: authRow.training_due || "" });

      setActionsMenu((prev) => {
        const isSame = prev.open && prev.authId === authRow.id;
        if (isSame) return { open: false, authId: "", left: 0, top: 0 };
        return {
          open: true,
          authId: authRow.id,
          left: rect.right,
          top: rect.bottom + 8,
        };
      });
    },
    []
  );

  const closeActionsMenu = useCallback(() => {
    setActionsMenu({ open: false, authId: "", left: 0, top: 0 });
    setDueEdit({ authId: "", value: "" });
  }, []);

  const authForMenu = useMemo(() => {
    if (!actionsMenu.open || !actionsMenu.authId) return null;
    return (currentAuths || []).find((x) => x.id === actionsMenu.authId) || null;
  }, [actionsMenu.open, actionsMenu.authId, currentAuths]);

  return (
    <AppLayout activeNav={activeNav} onSelectNav={onSelectNav} headerEmail={email}>
      <div className="wi-page wi-mheTrainingPage">
        <div className="wi-pageHeader">
          <h1 className="wi-pageTitle">MHE training tracker</h1>
          <div className="wi-pageSubtitle">
            Company: <strong>{(allowedCompanies || []).find((c) => c.id === companyId)?.name || "—"}</strong>
            {siteName ? (
              <>
                {" "}
                • Site: <strong>{siteName}</strong>
              </>
            ) : null}
          </div>
        </div>

        {notice.message && <div className={`wi-alert wi-alert--${notice.type || "info"}`}>{notice.message}</div>}

        <div className="wi-formGrid" style={{ marginBottom: 10 }}>
          <div className="wi-field wi-span2">
            <label className="wi-label">Company</label>
            <select
              className="wi-input"
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                closeHoverTip();
                hoverCacheRef.current.clear();
              }}
              disabled={loading || allowedCompanies.length <= 1}
            >
              <option value="">{allowedCompanies.length ? "Select company…" : "Loading…"}</option>
              {allowedCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

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
          accept=".pdf,.jpg,.jpeg,.png"
          style={{ display: "none" }}
          onChange={handleUploadFile}
        />
        <input
          ref={retrainFileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          style={{ display: "none" }}
          onChange={handleRetrainFile}
        />
        <input
          ref={addFileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          style={{ display: "none" }}
          onChange={handleAddFile}
        />

        {tab === "register" && (
          <Card
            title="Training register"
            subtitle="Only colleagues with training outstanding are shown (colleagues with zero training records are hidden here and can be added via ‘Add training’)."
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
                    closeHoverTip();
                    hoverCacheRef.current.clear();
                  }}
                  disabled={loading || !companyId}
                >
                  <option value="">{companyId ? "Select site…" : "Select a company first…"}</option>
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
                <div className="wi-muted">No colleagues currently have training outstanding for the selected filters.</div>
              ) : (
                colleagueRows.map((c) => (
                  <div
                    key={c.id}
                    className="wi-colleagueBlock is-dueSoon"
                    onMouseEnter={(e) => moveHoverTip(e, c.id)}
                    onMouseMove={(e) => moveHoverTip(e, c.id)}
                    onMouseLeave={closeHoverTip}
                  >
                    <div className="wi-colleagueHeader">
                      <div className="wi-colleagueName">
                        {c.last_name}, {c.first_name}
                        <span className="wi-colleagueMeta">({c.employment_type})</span>
                      </div>

                      <div className="wi-colleagueBadges">
                        <span className="wi-badge wi-badge--danger">Outstanding</span>
                        <span className="wi-badge">{c._auths.length} authorisation(s)</span>
                      </div>
                    </div>

                    {c._visibleAuths.length === 0 ? (
                      <div className="wi-muted" style={{ padding: "8px 0" }}>
                        No active authorisations for the selected MHE type (training required).
                      </div>
                    ) : (
                      <div className="wi-tableWrap">
                        <table className="wi-table">
                          <thead>
                            <tr>
                              <th>MHE type</th>
                              <th>Trained on</th>
                              <th>Training due</th>
                              <th>Days</th>
                              <th>Certificate</th>
                              <th style={{ width: 120 }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c._visibleAuths.map((a) => {
                              const d = a.training_due ? daysUntil(a.training_due) : null;
                              const hasCert = !!a.certificate_path;

                              return (
                                <tr
                                  key={a.id}
                                  className={!a.training_due || (d != null && d <= OUTSTANDING_DAYS) ? "wi-rowDueSoon" : ""}
                                >
                                  <td>{a.mhe_type}</td>
                                  <td>{a.trained_on}</td>
                                  <td>{a.training_due || "—"}</td>
                                  <td>{d == null ? "—" : d}</td>

                                  <td>
                                    {hasCert ? (
                                      <span className="wi-certHover">
                                        <span className="wi-certYes">Yes</span>
                                        <span className="wi-certPop">
                                          <button
                                            type="button"
                                            className="wi-certPopLink"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              viewCertificate(a.certificate_path);
                                            }}
                                          >
                                            View
                                          </button>
                                          <span className="wi-certSep">•</span>
                                          <button
                                            type="button"
                                            className="wi-certPopLink"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              downloadCertificate(a.certificate_path);
                                            }}
                                          >
                                            Download
                                          </button>
                                        </span>
                                      </span>
                                    ) : (
                                      "No"
                                    )}
                                  </td>

                                  <td>
                                    <div className="wi-actionsMenuWrap">
                                      <button
                                        type="button"
                                        className="wi-actionsBtn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openActionsMenu(a, e.currentTarget);
                                        }}
                                        disabled={loading}
                                      >
                                        Actions ▾
                                      </button>
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
              <div className="wi-floatTip" style={{ left: hoverTip.x, top: hoverTip.y, width: 520 }}>
                <div className="wi-floatTip__title">
                  {colleagueNameById.get(hoverTip.colleagueId) || "Colleague"} – Training record (all)
                </div>

                {hoverTip.loading ? (
                  <div className="wi-muted">Loading…</div>
                ) : hoverTip.rows.length === 0 ? (
                  <div className="wi-muted">No training records found.</div>
                ) : (
                  <div className="wi-floatTip__list" style={{ maxHeight: 300, overflow: "auto", paddingRight: 6 }}>
                    {hoverTip.rows.map((r) => {
                      const d = r.training_due ? daysUntil(r.training_due) : null;
                      return (
                        <div key={r.id} className="wi-floatTip__row">
                          <div className="t">
                            {r.mhe_type}{" "}
                            <span style={{ fontWeight: 800, color: "#6b7280", marginLeft: 8 }}>({r.status || "—"})</span>
                          </div>
                          <div className="d">
                            Trained: <strong>{r.trained_on || "—"}</strong> • Due: <strong>{r.training_due || "—"}</strong>{" "}
                            • {d == null ? "—" : `${d}d`} • Cert: <strong>{r.certificate_path ? "Yes" : "No"}</strong>
                          </div>
                        </div>
                      );
                    })}
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
                <select
                  className="wi-input"
                  value={historyColleagueId}
                  onChange={(e) => setHistoryColleagueId(e.target.value)}
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
                <div className="wi-muted">No training records found.</div>
              ) : (
                <div className="wi-tableWrap wi-tableWrap--tall">
                  <table className="wi-table">
                    <thead>
                      <tr>
                        <th>MHE type</th>
                        <th>Trained on</th>
                        <th>Training due</th>
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
                        const dte = r.training_due ? daysUntil(r.training_due) : null;
                        const hasCert = !!r.certificate_path;

                        return (
                          <tr key={r.id} className={r.status === "ACTIVE" ? "" : "wi-rowHistory"}>
                            <td>{typeName}</td>
                            <td>{r.trained_on}</td>
                            <td>{r.training_due || "—"}</td>
                            <td>{dte ?? "—"}</td>
                            <td>{r.status || "—"}</td>

                            <td>
                              {hasCert ? (
                                <span className="wi-certHover">
                                  <span className="wi-certYes">Yes</span>
                                  <span className="wi-certPop">
                                    <button
                                      type="button"
                                      className="wi-certPopLink"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        viewCertificate(r.certificate_path);
                                      }}
                                    >
                                      View
                                    </button>
                                    <span className="wi-certSep">•</span>
                                    <button
                                      type="button"
                                      className="wi-certPopLink"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        downloadCertificate(r.certificate_path);
                                      }}
                                    >
                                      Download
                                    </button>
                                  </span>
                                </span>
                              ) : (
                                "No"
                              )}
                            </td>

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
                <button className="wi-modalClose" onClick={closeAddTraining} type="button">
                  ×
                </button>
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
                        <option key={t.id} value={t.id}>
                          {t.type_name}
                        </option>
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
                    <label className="wi-label">Training due (manual)</label>
                    <input
                      type="date"
                      className="wi-input"
                      value={addModal.training_due}
                      onChange={(e) => setAddModal((m) => ({ ...m, training_due: e.target.value }))}
                      disabled={loading}
                    />
                  </div>

                  <div className="wi-field wi-span2">
                    <label className="wi-label">Certificate (optional)</label>
                    <div className="wi-uploadRow">
                      <Button variant="primary" onClick={() => addFileRef.current?.click()} disabled={loading}>
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
                <button className="wi-modalClose" onClick={closeRetrain} type="button">
                  ×
                </button>
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
                    <label className="wi-label">Training due (manual)</label>
                    <input
                      type="date"
                      className="wi-input"
                      value={retrainModal.training_due}
                      onChange={(e) => setRetrainModal((m) => ({ ...m, training_due: e.target.value }))}
                      disabled={loading}
                    />
                  </div>

                  <div className="wi-field wi-span2">
                    <label className="wi-label">Certificate (optional)</label>
                    <div className="wi-uploadRow">
                      <Button variant="primary" onClick={() => retrainFileRef.current?.click()} disabled={loading}>
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

        {/* ACTIONS MENU PORTAL (overlays entire app) */}
        {actionsMenu.open &&
          authForMenu &&
          createPortal(
            <div
              ref={actionsMenuRef}
              className="wi-actionsMenu wi-actionsMenu--portal"
              role="menu"
              style={{
                top: actionsMenu.top,
                left: actionsMenu.left,
                transform: "translateX(-100%)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="wi-actionsItem"
                onClick={() => {
                  closeActionsMenu();
                  openAddTraining(authForMenu.colleague_id);
                }}
              >
                Add training
              </button>

              <button
                type="button"
                className="wi-actionsItem"
                onClick={() => {
                  closeActionsMenu();
                  beginUpload(authForMenu);
                }}
              >
                {authForMenu.certificate_path ? "Replace certificate" : "Add certificate"}
              </button>

              <div className="wi-actionsDivider" />

              <div className="wi-actionsSubTitle">Update training due date</div>
              <div className="wi-actionsInline">
                <input
                  className="wi-actionsDate"
                  type="date"
                  value={dueEdit.authId === authForMenu.id ? dueEdit.value : authForMenu.training_due || ""}
                  onChange={(e) => setDueEdit({ authId: authForMenu.id, value: e.target.value })}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="wi-actionsSave"
                  onClick={() => {
                    const v = dueEdit.authId === authForMenu.id ? dueEdit.value : authForMenu.training_due || "";
                    updateTrainingDue(authForMenu.id, v);
                    closeActionsMenu();
                  }}
                  disabled={loading}
                >
                  Save
                </button>
              </div>

              <div className="wi-actionsDivider" />

              <button
                type="button"
                className="wi-actionsItem"
                onClick={() => {
                  closeActionsMenu();
                  openRetrain(authForMenu);
                }}
                disabled={loading}
              >
                Retrain
              </button>
            </div>,
            document.body
          )}
      </div>
    </AppLayout>
  );
}
