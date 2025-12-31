// /src/pages/ColleaguesSetup.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";
import { supabase } from "../lib/supabaseClient";

import Papa from "papaparse";
import "./ColleaguesSetup.css";

const EMPLOYMENT_TYPES = [
  { value: "FULL_TIME", label: "Full Time" },
  { value: "AGENCY", label: "Agency" },
];

const CSV_HEADERS = [
  "company_name",
  "site_name",
  "first_name",
  "last_name",
  "employment_type",
  "employment_start_date",
  "agency_name",
  "agency_start_date",
  "weeks_until_full_time",
  "emergency_contact_name",
  "emergency_contact_phone",
  "active",
];

function safeLower(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

function parseBool(v, def = true) {
  if (v === null || v === undefined || v === "") return def;
  const s = String(v).trim().toLowerCase();
  if (["true", "t", "yes", "y", "1"].includes(s)) return true;
  if (["false", "f", "no", "n", "0"].includes(s)) return false;
  return def;
}

function isValidYMD(ymd) {
  if (!ymd) return false;
  const s = String(ymd).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

function addDays(ymd, days) {
  if (!isValidYMD(ymd)) return null;
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function daysUntil(ymd) {
  if (!isValidYMD(ymd)) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dt = new Date(`${ymd}T00:00:00`);
  return Math.ceil((dt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v) {
  const s = (v ?? "").toString();
  return `"${s.replace(/"/g, '""')}"`;
}

function activeFromPath(pathname) {
  if (pathname.startsWith("/app/colleagues")) return "colleagues";
  if (pathname.startsWith("/app/setup/mhe")) return "mhe-setup";
  if (pathname.startsWith("/app/setup/companies-sites")) return "company-site-setup";
  if (pathname.startsWith("/app/tools/scheduling")) return "scheduling-tool";
  if (pathname.startsWith("/app/connections")) return "connections";
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
    case "colleagues":
      return "/app/colleagues";
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

export default function ColleaguesSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeNav = useMemo(() => activeFromPath(location.pathname), [location.pathname]);

  const fileRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState({ type: "", message: "" });

  const [email, setEmail] = useState("");
  const [accountId, setAccountId] = useState("");

  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);

  // Multi-company enforcement:
  // allowedCompanies = companies in this tenant that the user is a member of (via company_users)
  const [allowedCompanies, setAllowedCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(""); // selected company

  const [siteId, setSiteId] = useState("");

  const [tab, setTab] = useState("list"); // list | add

  // manual form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [employmentType, setEmploymentType] = useState("FULL_TIME");
  const [employmentStartDate, setEmploymentStartDate] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [agencyStartDate, setAgencyStartDate] = useState("");
  const [weeksUntilFullTime, setWeeksUntilFullTime] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [active, setActive] = useState(true);

  const [colleagues, setColleagues] = useState([]);

  // filters
  const [fName, setFName] = useState("");
  const [fType, setFType] = useState("ALL"); // ALL | FULL_TIME | AGENCY
  const [fAgency, setFAgency] = useState("");
  const [fStatus, setFStatus] = useState("ACTIVE"); // ACTIVE | DISABLED | ALL
  const [showDisabled, setShowDisabled] = useState(false);

  // import
  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] = useState([]);
  const [importErrors, setImportErrors] = useState([]);
  const [importWarnings, setImportWarnings] = useState([]);
  const [importReadyCount, setImportReadyCount] = useState(0);
  const [importTotalCount, setImportTotalCount] = useState(0);

  const onSelectNav = (key) => navigate(pathFromKey(key));

  const selectedCompanyName = useMemo(() => {
    return (allowedCompanies || []).find((c) => c.id === companyId)?.name || "";
  }, [allowedCompanies, companyId]);

  const resolveAccountId = useCallback(async (userId) => {
    // Primary: public.users
    const { data: uRow, error: uErr } = await supabase
      .from("users")
      .select("account_id")
      .eq("id", userId)
      .maybeSingle();

    if (!uErr && uRow?.account_id) return uRow.account_id;

    // Fallback: company_users
    const { data: cuRow, error: cuErr } = await supabase
      .from("company_users")
      .select("account_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!cuErr && cuRow?.account_id) return cuRow.account_id;

    return "";
  }, []);

  const requireSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const user = data?.session?.user;
    if (!user) {
      navigate("/login", { replace: true });
      return null;
    }

    setEmail(user.email || "");

    if (!accountId) {
      const aId = await resolveAccountId(user.id);
      if (!aId) throw new Error("Could not resolve account_id for this user.");
      setAccountId(aId);
    }

    return user;
  }, [navigate, accountId, resolveAccountId]);

  // bootstrap session
  useEffect(() => {
    (async () => {
      setLoading(true);
      setNotice({ type: "", message: "" });
      try {
        await requireSession();
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Auth initialisation failed." });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load tenant-scoped reference data + memberships (multi-company)
  useEffect(() => {
    if (!accountId) return;

    (async () => {
      setLoading(true);
      setNotice({ type: "", message: "" });

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const userId = authData?.user?.id;
        if (!userId) throw new Error("No authenticated user found.");

        const [{ data: comp, error: ec }, { data: st, error: es }] = await Promise.all([
          supabase
            .from("companies")
            .select("id, name, account_id")
            .eq("account_id", accountId)
            .order("name", { ascending: true }),
          supabase
            .from("sites")
            .select("id, company_id, name, code, account_id")
            .eq("account_id", accountId)
            .order("name", { ascending: true }),
        ]);

        if (ec) throw ec;
        if (es) throw es;

        setCompanies(comp || []);
        setSites(st || []);

        // Memberships: user can have multiple companies
        const { data: cuRows, error: cuError } = await supabase
          .from("company_users")
          .select("company_id, account_id")
          .eq("user_id", userId)
          .eq("account_id", accountId);

        if (cuError) throw cuError;

        const memberCompanyIds = new Set((cuRows || []).map((r) => r.company_id).filter(Boolean));
        if (memberCompanyIds.size === 0) {
          throw new Error("No companies assigned to this user in company_users for this account.");
        }

        const allowed = (comp || []).filter((c) => memberCompanyIds.has(c.id));
        if (allowed.length === 0) {
          throw new Error("Your company memberships do not match any companies in this tenant.");
        }

        setAllowedCompanies(allowed);

        // pick existing company if still valid, else first allowed
        setCompanyId((prev) => (prev && allowed.some((x) => x.id === prev) ? prev : allowed[0].id));
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to initialise Colleagues page." });
      } finally {
        setLoading(false);
      }
    })();
  }, [accountId]);

  // When company changes, ensure siteId is valid for that company (or default to first)
  useEffect(() => {
    if (!companyId) {
      setSiteId("");
      return;
    }
    const companySites = (sites || []).filter((s) => s.company_id === companyId);
    const firstSite = companySites[0];
    setSiteId((prev) => (prev && companySites.some((x) => x.id === prev) ? prev : (firstSite?.id || "")));
  }, [companyId, sites]);

  const sitesForSelectedCompany = useMemo(() => {
    if (!companyId) return [];
    return (sites || []).filter((s) => s.company_id === companyId);
  }, [sites, companyId]);

  const refreshColleagues = useCallback(async () => {
    if (!accountId || !siteId) {
      setColleagues([]);
      return;
    }

    const { data, error } = await supabase
      .from("colleagues")
      .select(
        [
          "id",
          "account_id",
          "company_id",
          "site_id",
          "first_name",
          "last_name",
          "employment_type",
          "employment_start_date",
          "agency_name",
          "agency_start_date",
          "weeks_until_full_time",
          "full_time_conversion_date",
          "emergency_contact_name",
          "emergency_contact_phone",
          "active",
          "created_at",
        ].join(",")
      )
      .eq("account_id", accountId)
      .eq("site_id", siteId)
      .order("last_name", { ascending: true });

    if (error) throw error;
    setColleagues(data || []);
  }, [accountId, siteId]);

  useEffect(() => {
    (async () => {
      try {
        await refreshColleagues();
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to load colleagues." });
      }
    })();
  }, [refreshColleagues]);

  // Clear irrelevant fields when switching employment type
  useEffect(() => {
    if (employmentType === "FULL_TIME") {
      setAgencyName("");
      setAgencyStartDate("");
      setWeeksUntilFullTime("");
    } else {
      setEmploymentStartDate("");
    }
  }, [employmentType]);

  const enrichedColleagues = useMemo(() => {
    return (colleagues || []).map((c) => {
      let conversion = c.full_time_conversion_date;
      if (!conversion && c.employment_type === "AGENCY" && c.agency_start_date && c.weeks_until_full_time != null) {
        conversion = addDays(c.agency_start_date, Number(c.weeks_until_full_time) * 7);
      }
      const dueInDays = conversion ? daysUntil(conversion) : null;
      const dueSoon = dueInDays != null && dueInDays >= 0 && dueInDays <= 30;
      return { ...c, _conversion_date: conversion, _due_in_days: dueInDays, _due_soon: dueSoon };
    });
  }, [colleagues]);

  const activeCounts = useMemo(() => {
    const activeRows = (colleagues || []).filter((c) => c.active === true);
    return {
      fullTime: activeRows.filter((c) => c.employment_type === "FULL_TIME").length,
      agency: activeRows.filter((c) => c.employment_type === "AGENCY").length,
      totalActive: activeRows.length,
    };
  }, [colleagues]);

  const filteredAndSorted = useMemo(() => {
    const nameNeedle = safeLower(fName);
    const agencyNeedle = safeLower(fAgency);

    let rows = enrichedColleagues;

    if (!showDisabled) rows = rows.filter((r) => r.active === true);

    if (fStatus === "ACTIVE") rows = rows.filter((r) => r.active === true);
    if (fStatus === "DISABLED") rows = rows.filter((r) => r.active === false);

    if (fType !== "ALL") rows = rows.filter((r) => r.employment_type === fType);

    if (nameNeedle) {
      rows = rows.filter((r) => {
        const full = `${r.first_name || ""} ${r.last_name || ""}`.toLowerCase();
        const rev = `${r.last_name || ""} ${r.first_name || ""}`.toLowerCase();
        return full.includes(nameNeedle) || rev.includes(nameNeedle);
      });
    }

    if (agencyNeedle) rows = rows.filter((r) => safeLower(r.agency_name).includes(agencyNeedle));

    rows = [...rows].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (a._due_soon !== b._due_soon) return a._due_soon ? -1 : 1;

      if (a._due_soon && b._due_soon) {
        const da = a._due_in_days ?? 999999;
        const db = b._due_in_days ?? 999999;
        if (da !== db) return da - db;
      }

      const ln = (a.last_name || "").localeCompare(b.last_name || "");
      if (ln !== 0) return ln;
      return (a.first_name || "").localeCompare(b.first_name || "");
    });

    return rows;
  }, [enrichedColleagues, fName, fType, fAgency, fStatus, showDisabled]);

  const manualFormErrors = useMemo(() => {
    const errs = [];
    if (!accountId) errs.push("Account is not resolved for this user.");
    if (!companyId) errs.push("Company is required.");
    if (!siteId) errs.push("Site is required.");
    if (!firstName.trim()) errs.push("First name is required.");
    if (!lastName.trim()) errs.push("Last name is required.");

    if (employmentType === "FULL_TIME") {
      if (!employmentStartDate) errs.push("Employment start date is required for Full Time.");
      else if (!isValidYMD(employmentStartDate)) errs.push("Employment start date must be YYYY-MM-DD.");
    }

    if (employmentType === "AGENCY") {
      if (!agencyName.trim()) errs.push("Agency name is required for Agency.");
      if (!agencyStartDate) errs.push("Agency start date is required for Agency.");
      else if (!isValidYMD(agencyStartDate)) errs.push("Agency start date must be YYYY-MM-DD.");

      if (weeksUntilFullTime !== "" && Number.isNaN(Number(weeksUntilFullTime))) {
        errs.push("Weeks until full time must be a number.");
      }
      if (weeksUntilFullTime !== "" && Number(weeksUntilFullTime) < 0) {
        errs.push("Weeks until full time cannot be negative.");
      }
    }

    return errs;
  }, [
    accountId,
    companyId,
    siteId,
    firstName,
    lastName,
    employmentType,
    employmentStartDate,
    agencyName,
    agencyStartDate,
    weeksUntilFullTime,
  ]);

  async function handleCreateManual() {
    setNotice({ type: "", message: "" });

    if (manualFormErrors.length) {
      setNotice({ type: "error", message: manualFormErrors[0] });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        account_id: accountId,
        company_id: companyId,
        site_id: siteId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        employment_type: employmentType,
        active,

        emergency_contact_name: emergencyContactName.trim() || null,
        emergency_contact_phone: emergencyContactPhone.trim() || null,

        employment_start_date: employmentType === "FULL_TIME" ? employmentStartDate : null,

        agency_name: employmentType === "AGENCY" ? (agencyName.trim() || null) : null,
        agency_start_date: employmentType === "AGENCY" ? agencyStartDate : null,
        weeks_until_full_time:
          employmentType === "AGENCY" && weeksUntilFullTime !== "" ? Number(weeksUntilFullTime) : null,
      };

      const { error } = await supabase.from("colleagues").insert(payload);
      if (error) throw error;

      setNotice({ type: "success", message: "Colleague created." });
      await refreshColleagues();

      setFirstName("");
      setLastName("");
      setEmploymentType("FULL_TIME");
      setEmploymentStartDate("");
      setAgencyName("");
      setAgencyStartDate("");
      setWeeksUntilFullTime("");
      setEmergencyContactName("");
      setEmergencyContactPhone("");
      setActive(true);

      setTab("list");
    } catch (e) {
      setNotice({ type: "error", message: e?.message || "Failed to create colleague." });
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActive(colleague) {
    setNotice({ type: "", message: "" });
    setLoading(true);
    try {
      const next = !colleague.active;

      const { error } = await supabase
        .from("colleagues")
        .update({ active: next })
        .eq("id", colleague.id)
        .eq("account_id", accountId);

      if (error) throw error;

      setColleagues((prev) => prev.map((c) => (c.id === colleague.id ? { ...c, active: next } : c)));
    } catch (e) {
      setNotice({ type: "error", message: e?.message || "Failed to update status." });
    } finally {
      setLoading(false);
    }
  }

  const handleExport = () => {
    const rows = filteredAndSorted;
    const siteName = sitesForSelectedCompany.find((s) => s.id === siteId)?.name || "";

    const headers = [
      "company_name",
      "site_name",
      "first_name",
      "last_name",
      "employment_type",
      "employment_start_date",
      "agency_name",
      "agency_start_date",
      "weeks_until_full_time",
      "full_time_conversion_date",
      "emergency_contact_name",
      "emergency_contact_phone",
      "active",
      "created_at",
    ];

    const lines = [];
    lines.push(headers.join(","));

    rows.forEach((c) => {
      const conversion = c._conversion_date || "";
      const line = [
        selectedCompanyName,
        siteName,
        c.first_name,
        c.last_name,
        c.employment_type,
        c.employment_start_date || "",
        c.agency_name || "",
        c.agency_start_date || "",
        c.weeks_until_full_time ?? "",
        conversion,
        c.emergency_contact_name || "",
        c.emergency_contact_phone || "",
        c.active ? "true" : "false",
        c.created_at || "",
      ]
        .map(csvEscape)
        .join(",");
      lines.push(line);
    });

    const fn = `colleagues_export_${selectedCompanyName}_${siteName}`.replace(/\s+/g, "_") + ".csv";
    downloadTextFile(fn, lines.join("\n"));
  };

  const validateImportRows = useCallback(
    (rows) => {
      const errors = [];
      const warnings = [];
      const preview = [];

      if (!rows.length) {
        errors.push("No data rows found in CSV.");
        return { errors, warnings, preview, readyCount: 0, total: 0 };
      }

      const foundHeaders = Object.keys(rows[0] || {});
      const missing = CSV_HEADERS.filter((h) => !foundHeaders.includes(h));
      if (missing.length) errors.push(`CSV is missing required header(s): ${missing.join(", ")}`);

      let readyCount = 0;

      const siteByName = new Map();
      sitesForSelectedCompany.forEach((s) => siteByName.set(safeLower(s.name), s));

      rows.forEach((r, idx) => {
        const rowNum = idx + 2;
        const rowErrors = [];
        const rowWarnings = [];

        const companyName = (r.company_name ?? "").toString().trim();
        const siteName = (r.site_name ?? "").toString().trim();
        const fn = (r.first_name ?? "").toString().trim();
        const ln = (r.last_name ?? "").toString().trim();
        const et = (r.employment_type ?? "").toString().trim().toUpperCase();

        const empStart = (r.employment_start_date ?? "").toString().trim();
        const agName = (r.agency_name ?? "").toString().trim();
        const agStart = (r.agency_start_date ?? "").toString().trim();
        const weeks = (r.weeks_until_full_time ?? "").toString().trim();

        const ecName = (r.emergency_contact_name ?? "").toString().trim();
        const ecPhone = (r.emergency_contact_phone ?? "").toString().trim();

        const activeVal = parseBool(r.active, true);

        if (!companyName) rowErrors.push("company_name is required.");
        if (!siteName) rowErrors.push("site_name is required.");
        if (!fn) rowErrors.push("first_name is required.");
        if (!ln) rowErrors.push("last_name is required.");
        if (!et) rowErrors.push("employment_type is required.");
        if (et && et !== "FULL_TIME" && et !== "AGENCY") rowErrors.push("employment_type must be FULL_TIME or AGENCY.");

        if (selectedCompanyName && companyName && safeLower(companyName) !== safeLower(selectedCompanyName)) {
          rowErrors.push(`company_name must be "${selectedCompanyName}".`);
        }

        const site = siteName ? siteByName.get(safeLower(siteName)) : null;
        if (siteName && !site) rowErrors.push(`site_name not found for company "${selectedCompanyName}": "${siteName}".`);

        if (et === "FULL_TIME") {
          if (!empStart) rowErrors.push("employment_start_date is required for FULL_TIME.");
          else if (!isValidYMD(empStart)) rowErrors.push("employment_start_date must be YYYY-MM-DD.");

          if (agName) rowWarnings.push("agency_name provided but employment_type is FULL_TIME (ignored).");
          if (agStart) rowWarnings.push("agency_start_date provided but employment_type is FULL_TIME (ignored).");
          if (weeks) rowWarnings.push("weeks_until_full_time provided but employment_type is FULL_TIME (ignored).");
        }

        if (et === "AGENCY") {
          if (!agName) rowErrors.push("agency_name is required for AGENCY.");
          if (!agStart) rowErrors.push("agency_start_date is required for AGENCY.");
          else if (!isValidYMD(agStart)) rowErrors.push("agency_start_date must be YYYY-MM-DD.");

          if (empStart) rowWarnings.push("employment_start_date provided but employment_type is AGENCY (ignored).");
          if (weeks) {
            const n = Number(weeks);
            if (Number.isNaN(n)) rowErrors.push("weeks_until_full_time must be a number if provided.");
            else if (n < 0) rowErrors.push("weeks_until_full_time cannot be negative.");
          }
        }

        const ok = rowErrors.length === 0;
        if (ok) readyCount += 1;

        preview.push({
          _row: rowNum,
          _ok: ok,
          _site_id: site?.id || null,
          first_name: fn,
          last_name: ln,
          employment_type: et,
          employment_start_date: empStart || "",
          agency_name: agName || "",
          agency_start_date: agStart || "",
          weeks_until_full_time: weeks || "",
          emergency_contact_name: ecName || "",
          emergency_contact_phone: ecPhone || "",
          active: activeVal,
          _errors: rowErrors,
          _warnings: rowWarnings,
        });

        if (rowErrors.length) errors.push(`Row ${rowNum}: ${rowErrors.join(" ")}`);
        if (rowWarnings.length) warnings.push(`Row ${rowNum}: ${rowWarnings.join(" ")}`);
      });

      return { errors, warnings, preview, readyCount, total: rows.length };
    },
    [sitesForSelectedCompany, selectedCompanyName]
  );

  const handleDownloadTemplate = () => {
    const exampleRow = [
      selectedCompanyName || "Your Company",
      "Example Site",
      "John",
      "Smith",
      "FULL_TIME",
      "2025-01-01",
      "",
      "",
      "",
      "",
      "",
      "true",
    ];
    const csv = [CSV_HEADERS.join(","), exampleRow.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")].join("\n");
    downloadTextFile("colleagues_import_template.csv", csv);
  };

  const handlePickFile = () => fileRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImportPreview([]);
    setImportErrors([]);
    setImportWarnings([]);
    setImportReadyCount(0);
    setImportTotalCount(0);

    setLoading(true);
    try {
      const text = await file.text();
      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => (h ?? "").toString().trim(),
      });

      if (parsed.errors?.length) {
        setImportErrors(parsed.errors.map((x) => x.message || "CSV parse error."));
        return;
      }

      const rows = (parsed.data || []).filter((r) =>
        Object.values(r || {}).some((v) => String(v ?? "").trim().length > 0)
      );

      const { errors, warnings, preview, readyCount, total } = validateImportRows(rows);
      setImportErrors(errors);
      setImportWarnings(warnings);
      setImportPreview(preview);
      setImportReadyCount(readyCount);
      setImportTotalCount(total);
    } catch (err) {
      setImportErrors([err?.message || "Unable to read CSV file."]);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const canImport = useMemo(() => {
    return importTotalCount > 0 && importReadyCount === importTotalCount && importErrors.length === 0;
  }, [importTotalCount, importReadyCount, importErrors.length]);

  const handleImport = async () => {
    setNotice({ type: "", message: "" });
    if (!canImport) {
      setNotice({ type: "error", message: "Fix import errors before importing." });
      return;
    }

    setLoading(true);
    try {
      const payloads = importPreview.map((r) => {
        const et = r.employment_type;
        return {
          account_id: accountId,
          company_id: companyId,
          site_id: r._site_id,
          first_name: r.first_name,
          last_name: r.last_name,
          employment_type: et,
          active: parseBool(r.active, true),

          emergency_contact_name: r.emergency_contact_name ? r.emergency_contact_name : null,
          emergency_contact_phone: r.emergency_contact_phone ? r.emergency_contact_phone : null,

          employment_start_date: et === "FULL_TIME" ? r.employment_start_date : null,
          agency_name: et === "AGENCY" ? (r.agency_name || null) : null,
          agency_start_date: et === "AGENCY" ? (r.agency_start_date || null) : null,
          weeks_until_full_time: et === "AGENCY" && r.weeks_until_full_time !== "" ? Number(r.weeks_until_full_time) : null,
        };
      });

      const BATCH = 200;
      for (let i = 0; i < payloads.length; i += BATCH) {
        const { error } = await supabase.from("colleagues").insert(payloads.slice(i, i + BATCH));
        if (error) throw error;
      }

      setNotice({ type: "success", message: `Imported ${payloads.length} colleague(s).` });
      setImportFileName("");
      setImportPreview([]);
      setImportErrors([]);
      setImportWarnings([]);
      setImportReadyCount(0);
      setImportTotalCount(0);

      await refreshColleagues();
      setTab("list");
    } catch (e) {
      setNotice({ type: "error", message: e?.message || "Import failed." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout activeNav={activeNav} onSelectNav={onSelectNav} headerEmail={email}>
      <div className="wi-page wi-colleaguesPage">
        <div className="wi-pageHeader">
          <h1 className="wi-pageTitle">Colleagues</h1>
          <div className="wi-pageSubtitle" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span>Company:</span>
            <select
              className="wi-input"
              style={{ maxWidth: 420 }}
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
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

        {notice.message && <div className={`wi-alert wi-alert--${notice.type || "info"}`}>{notice.message}</div>}

        <div className="wi-tabsRow">
          <button className={`wi-tabPill ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")} type="button">
            Colleague list
          </button>
          <button className={`wi-tabPill ${tab === "add" ? "active" : ""}`} onClick={() => setTab("add")} type="button">
            Add / Import
          </button>
        </div>

        {tab === "list" && (
          <Card
            title="Colleague list"
            subtitle="Agency conversions due within 30 days are prioritised."
            actions={
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button variant="primary" onClick={refreshColleagues} disabled={loading || !siteId}>
                  Refresh
                </Button>
                <Button variant="primary" onClick={handleExport} disabled={loading || !siteId}>
                  Export CSV
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
                  onChange={(e) => setSiteId(e.target.value)}
                  disabled={loading || !companyId}
                >
                  <option value="">{companyId ? "Select site…" : "Select a company…"}</option>
                  {sitesForSelectedCompany.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="wi-field">
                <label className="wi-label">Name filter</label>
                <input className="wi-input" value={fName} onChange={(e) => setFName(e.target.value)} />
              </div>

              <div className="wi-field">
                <label className="wi-label">Type</label>
                <select className="wi-input" value={fType} onChange={(e) => setFType(e.target.value)}>
                  <option value="ALL">All</option>
                  <option value="FULL_TIME">Full time</option>
                  <option value="AGENCY">Agency</option>
                </select>
              </div>

              <div className="wi-field">
                <label className="wi-label">Agency filter</label>
                <input className="wi-input" value={fAgency} onChange={(e) => setFAgency(e.target.value)} placeholder="Agency name…" />
              </div>

              <div className="wi-field">
                <label className="wi-label">Status</label>
                <select className="wi-input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                  <option value="ACTIVE">Active only</option>
                  <option value="DISABLED">Disabled only</option>
                  <option value="ALL">All</option>
                </select>
              </div>

              <div className="wi-field wi-span2 wi-checkboxRow">
                <input id="showDisabled" type="checkbox" checked={showDisabled} onChange={(e) => setShowDisabled(e.target.checked)} />
                <label htmlFor="showDisabled">Show disabled colleagues (otherwise hidden)</label>
              </div>
            </div>

            <div className="wi-metricsRow">
              <div className="wi-metricCard">
                <div className="wi-metricLabel">Active full time</div>
                <div className="wi-metricValue">{activeCounts.fullTime}</div>
              </div>
              <div className="wi-metricCard">
                <div className="wi-metricLabel">Active agency</div>
                <div className="wi-metricValue">{activeCounts.agency}</div>
              </div>
              <div className="wi-metricCard">
                <div className="wi-metricLabel">Total active</div>
                <div className="wi-metricValue">{activeCounts.totalActive}</div>
              </div>
            </div>

            <div style={{ marginTop: 6 }}>
              {!siteId ? (
                <div className="wi-muted">Select a site to view colleagues.</div>
              ) : filteredAndSorted.length === 0 ? (
                <div className="wi-muted">No colleagues match your filters.</div>
              ) : (
                <div className="wi-tableWrap">
                  <table className="wi-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Agency</th>
                        <th>Start date</th>
                        <th>Agency start</th>
                        <th>Conversion</th>
                        <th>Status</th>
                        <th style={{ width: 140 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAndSorted.map((c) => {
                        const startDate = c.employment_type === "FULL_TIME" ? c.employment_start_date : "";
                        const conversion = c._conversion_date || "";
                        const dueLabel = c._due_soon && c._due_in_days != null ? `Due in ${c._due_in_days} day(s)` : "";
                        return (
                          <tr key={c.id} className={`${c._due_soon ? "wi-rowDueSoon" : ""} ${c.active ? "" : "wi-rowDisabled"}`}>
                            <td>
                              {c.last_name}, {c.first_name}
                              {dueLabel && <div className="wi-rowHint">{dueLabel}</div>}
                            </td>
                            <td>{c.employment_type}</td>
                            <td>{c.agency_name || "—"}</td>
                            <td>{startDate || "—"}</td>
                            <td>{c.agency_start_date || "—"}</td>
                            <td>{conversion || "—"}</td>
                            <td>{c.active ? "Active" : "Disabled"}</td>
                            <td>
                              <Button variant="primary" onClick={() => handleToggleActive(c)} disabled={loading}>
                                {c.active ? "Disable" : "Activate"}
                              </Button>
                            </td>
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

        {tab === "add" && (
          <div className="wi-colleaguesGrid">
            <Card
              title="Add colleague"
              subtitle="Company and sites are limited to your memberships."
              actions={
                <Button variant="primary" onClick={handleCreateManual} disabled={loading}>
                  {loading ? "Saving…" : "Create colleague"}
                </Button>
              }
            >
              <div className="wi-formGrid">
                <div className="wi-field wi-span2">
                  <label className="wi-label">Company</label>
                  <select
                    className="wi-input"
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
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

                <div className="wi-field wi-span2">
                  <label className="wi-label">Site</label>
                  <select className="wi-input" value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={loading || !companyId}>
                    <option value="">{companyId ? "Select site…" : "Select a company…"}</option>
                    {sitesForSelectedCompany.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="wi-field">
                  <label className="wi-label">First name</label>
                  <input className="wi-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={loading} />
                </div>

                <div className="wi-field">
                  <label className="wi-label">Last name</label>
                  <input className="wi-input" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={loading} />
                </div>

                <div className="wi-field wi-span2">
                  <label className="wi-label">Employment type</label>
                  <div className="wi-radioRow">
                    {EMPLOYMENT_TYPES.map((t) => (
                      <label key={t.value} className="wi-radio">
                        <input
                          type="radio"
                          name="employmentType"
                          value={t.value}
                          checked={employmentType === t.value}
                          onChange={() => setEmploymentType(t.value)}
                          disabled={loading}
                        />
                        <span>{t.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {employmentType === "FULL_TIME" && (
                  <div className="wi-field wi-span2">
                    <label className="wi-label">Employment start date</label>
                    <input type="date" className="wi-input" value={employmentStartDate} onChange={(e) => setEmploymentStartDate(e.target.value)} disabled={loading} />
                  </div>
                )}

                {employmentType === "AGENCY" && (
                  <>
                    <div className="wi-field wi-span2">
                      <label className="wi-label">Agency name</label>
                      <input className="wi-input" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} disabled={loading} />
                    </div>

                    <div className="wi-field">
                      <label className="wi-label">Agency start date</label>
                      <input type="date" className="wi-input" value={agencyStartDate} onChange={(e) => setAgencyStartDate(e.target.value)} disabled={loading} />
                    </div>

                    <div className="wi-field">
                      <label className="wi-label">Weeks until full time</label>
                      <input type="number" min="0" className="wi-input" value={weeksUntilFullTime} onChange={(e) => setWeeksUntilFullTime(e.target.value)} disabled={loading} />
                    </div>
                  </>
                )}

                <div className="wi-field wi-span2">
                  <label className="wi-label">Emergency contact name (optional)</label>
                  <input className="wi-input" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} disabled={loading} />
                </div>

                <div className="wi-field wi-span2">
                  <label className="wi-label">Emergency contact phone (optional)</label>
                  <input className="wi-input" value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} disabled={loading} />
                </div>

                <div className="wi-field wi-span2 wi-checkboxRow">
                  <input id="colleagueActive" type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={loading} />
                  <label htmlFor="colleagueActive">Active</label>
                </div>

                {manualFormErrors.length > 0 && (
                  <div className="wi-field wi-span2">
                    <div className="wi-helper" style={{ color: "#b91c1c" }}>
                      {manualFormErrors[0]}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <Card
              title="Import colleagues (CSV)"
              subtitle="Download the template, complete it, then upload the CSV to import."
              actions={
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Button variant="primary" onClick={handleDownloadTemplate} disabled={loading || !companyId}>
                    Download template
                  </Button>
                  <Button variant="primary" onClick={handlePickFile} disabled={loading || !companyId}>
                    Upload CSV
                  </Button>
                </div>
              }
            >
              <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={handleFileChange} />

              <div className="wi-importMeta">
                <div>
                  <div className="wi-muted">File</div>
                  <div className="wi-helper">{importFileName || "No file selected"}</div>
                </div>
                <div>
                  <div className="wi-muted">Validation</div>
                  <div className="wi-helper">{importTotalCount === 0 ? "No rows loaded" : `${importReadyCount}/${importTotalCount} rows valid`}</div>
                </div>
              </div>

              {importWarnings.length > 0 && (
                <div className="wi-importBlock">
                  <div className="wi-muted" style={{ marginBottom: 6 }}>
                    Warnings (import will proceed)
                  </div>
                  <ul className="wi-list">
                    {importWarnings.slice(0, 8).map((w, i) => (
                      <li key={i} className="wi-helper">
                        {w}
                      </li>
                    ))}
                    {importWarnings.length > 8 && <li className="wi-helper">…and {importWarnings.length - 8} more</li>}
                  </ul>
                </div>
              )}

              {importErrors.length > 0 && (
                <div className="wi-importBlock wi-importBlock--error">
                  <div className="wi-muted" style={{ marginBottom: 6, color: "#b91c1c" }}>
                    Errors (must be fixed)
                  </div>
                  <ul className="wi-list">
                    {importErrors.slice(0, 10).map((err, i) => (
                      <li key={i} className="wi-helper" style={{ color: "#b91c1c" }}>
                        {err}
                      </li>
                    ))}
                    {importErrors.length > 10 && (
                      <li className="wi-helper" style={{ color: "#b91c1c" }}>
                        …and {importErrors.length - 10} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button variant="primary" onClick={handleImport} disabled={loading || !canImport}>
                  {loading ? "Importing…" : "Import"}
                </Button>
                {!canImport && importTotalCount > 0 && (
                  <div className="wi-helper" style={{ color: "#b91c1c" }}>
                    Import disabled until all rows are valid.
                  </div>
                )}
                {importTotalCount === 0 && <div className="wi-helper">Upload a CSV to validate and import.</div>}
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
