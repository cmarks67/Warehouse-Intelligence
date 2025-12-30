// /src/pages/ColleaguesSetup.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";
import { supabase } from "../lib/supabaseClient";
import Papa from "papaparse";

import "./ColleaguesSetup.css";

const CSV_HEADERS = [
  "company_name",
  "site_name",
  "first_name",
  "last_name",
  "employment_type", // FULL_TIME | AGENCY
  "employment_start_date", // required if FULL_TIME
  "agency_name", // required if AGENCY
  "agency_start_date", // required if AGENCY
  "weeks_until_full_time", // optional
  "emergency_contact_name", // optional
  "emergency_contact_phone", // optional
  "active", // optional true/false (default true)
];

const EMPLOYMENT_TYPES = [
  { value: "FULL_TIME", label: "Full Time" },
  { value: "AGENCY", label: "Agency" },
];

function safeLower(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

function parseBool(v, defaultValue = true) {
  if (v === null || v === undefined || v === "") return defaultValue;
  const s = String(v).trim().toLowerCase();
  if (["true", "t", "yes", "y", "1"].includes(s)) return true;
  if (["false", "f", "no", "n", "0"].includes(s)) return false;
  return defaultValue;
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
  const diff = dt.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
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

export default function ColleaguesSetup() {
  const fileRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState({ type: "", message: "" });

  // Tabs (default to list)
  const [tab, setTab] = useState("list"); // "list" | "add"

  // Reference data
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);

  // Locked company from company_users
  const [lockedCompanyId, setLockedCompanyId] = useState("");
  const [lockedCompanyName, setLockedCompanyName] = useState("");

  // Selected site (shared across tabs)
  const [siteId, setSiteId] = useState("");

  // Manual form fields
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

  // Colleagues list
  const [colleagues, setColleagues] = useState([]);

  // Filters
  const [fName, setFName] = useState("");
  const [fType, setFType] = useState("ALL"); // ALL | FULL_TIME | AGENCY
  const [fAgency, setFAgency] = useState("");
  const [fStatus, setFStatus] = useState("ACTIVE"); // ACTIVE | DISABLED | ALL
  const [showDisabled, setShowDisabled] = useState(false);

  // Floating tooltip
  const [hoverTip, setHoverTip] = useState({
    open: false,
    x: 0,
    y: 0,
    colleague: null,
  });

  const moveHoverTip = (e, colleague) => {
    const pad = 14;
    const boxW = 380;
    const boxH = 280;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = e.clientX + 14;
    let y = e.clientY + 14;

    if (x + boxW + pad > vw) x = e.clientX - boxW - 14;
    if (y + boxH + pad > vh) y = e.clientY - boxH - 14;

    setHoverTip({ open: true, x, y, colleague });
  };

  // Import state
  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] = useState([]);
  const [importErrors, setImportErrors] = useState([]);
  const [importWarnings, setImportWarnings] = useState([]);
  const [importReadyCount, setImportReadyCount] = useState(0);
  const [importTotalCount, setImportTotalCount] = useState(0);

  // Init: load companies & sites, lock company by company_users
  useEffect(() => {
    (async () => {
      setLoading(true);
      setNotice({ type: "", message: "" });

      try {
        const [{ data: comp, error: ec }, { data: st, error: es }] = await Promise.all([
          supabase.from("companies").select("id, name").order("name", { ascending: true }),
          supabase.from("sites").select("id, company_id, name").order("name", { ascending: true }),
        ]);
        if (ec) throw ec;
        if (es) throw es;

        setCompanies(comp || []);
        setSites(st || []);

        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const userId = authData?.user?.id;
        if (!userId) throw new Error("No authenticated user found.");

        const { data: cu, error: cuErr } = await supabase
          .from("company_users")
          .select("company_id")
          .eq("user_id", userId)
          .single();

        if (cuErr) throw cuErr;

        const lcId = cu?.company_id;
        if (!lcId) throw new Error("No company assigned to this user in company_users.");

        setLockedCompanyId(lcId);

        const c = (comp || []).find((x) => x.id === lcId);
        setLockedCompanyName(c?.name || "");

        const firstSite = (st || []).find((s) => s.company_id === lcId);
        setSiteId(firstSite?.id || "");
      } catch (e) {
        setNotice({ type: "error", message: e?.message || "Failed to initialise Colleagues page." });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sitesForCompany = useMemo(() => {
    if (!lockedCompanyId) return [];
    return (sites || []).filter((s) => s.company_id === lockedCompanyId);
  }, [sites, lockedCompanyId]);

  const siteByNameForLockedCompany = useMemo(() => {
    const map = new Map();
    if (!lockedCompanyId) return map;
    sitesForCompany.forEach((s) => map.set(safeLower(s.name), s));
    return map;
  }, [sitesForCompany, lockedCompanyId]);

  const refreshColleagues = useCallback(async () => {
    if (!siteId) {
      setColleagues([]);
      return;
    }

    const { data, error } = await supabase
      .from("colleagues")
      .select(
        [
          "id",
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
      .eq("site_id", siteId)
      .order("last_name", { ascending: true });

    if (error) throw error;
    setColleagues(data || []);
  }, [siteId]);

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

  const manualFormErrors = useMemo(() => {
    const errs = [];
    if (!lockedCompanyId) errs.push("Company is not assigned to this user (company_users).");
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
    lockedCompanyId,
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
        company_id: lockedCompanyId,
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
      const { error } = await supabase.from("colleagues").update({ active: next }).eq("id", colleague.id);
      if (error) throw error;

      setColleagues((prev) => prev.map((c) => (c.id === colleague.id ? { ...c, active: next } : c)));

      // If tooltip is currently open for this colleague, update it too
      setHoverTip((ht) =>
        ht.open && ht.colleague?.id === colleague.id ? { ...ht, colleague: { ...ht.colleague, active: next } } : ht
      );
    } catch (e) {
      setNotice({ type: "error", message: e?.message || "Failed to update status." });
    } finally {
      setLoading(false);
    }
  }

  // Add computed conversion/dueSoon metadata
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
    const fullTime = activeRows.filter((c) => c.employment_type === "FULL_TIME").length;
    const agency = activeRows.filter((c) => c.employment_type === "AGENCY").length;
    return { fullTime, agency, totalActive: activeRows.length };
  }, [colleagues]);

  const filteredAndSorted = useMemo(() => {
    const nameNeedle = safeLower(fName);
    const agencyNeedle = safeLower(fAgency);

    let rows = enrichedColleagues;

    // default hide disabled unless explicitly shown
    if (!showDisabled) rows = rows.filter((r) => r.active === true);

    // status filter
    if (fStatus === "ACTIVE") rows = rows.filter((r) => r.active === true);
    if (fStatus === "DISABLED") rows = rows.filter((r) => r.active === false);

    // type filter
    if (fType !== "ALL") rows = rows.filter((r) => r.employment_type === fType);

    // name filter
    if (nameNeedle) {
      rows = rows.filter((r) => {
        const full = `${r.first_name || ""} ${r.last_name || ""}`.toLowerCase();
        const rev = `${r.last_name || ""} ${r.first_name || ""}`.toLowerCase();
        return full.includes(nameNeedle) || rev.includes(nameNeedle);
      });
    }

    // agency filter
    if (agencyNeedle) rows = rows.filter((r) => safeLower(r.agency_name).includes(agencyNeedle));

    // Sort:
    // 1) active first (disabled at bottom)
    // 2) due soon (within 30 days) at top (red)
    // 3) earlier due date first
    // 4) last name, first name
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

  // Export (respects filters)
  const handleExport = () => {
    const rows = filteredAndSorted;
    const siteName = sitesForCompany.find((s) => s.id === siteId)?.name || "";

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
        lockedCompanyName,
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

    const fn = `colleagues_export_${lockedCompanyName}_${siteName}`.replace(/\s+/g, "_") + ".csv";
    downloadTextFile(fn, lines.join("\n"));
  };

  // -------------------- CSV IMPORT --------------------
  const validateImportRows = useCallback(
    (rows) => {
      const errors = [];
      const warnings = [];
      const preview = [];

      const headerSet = new Set(CSV_HEADERS);

      if (!rows.length) {
        errors.push("No data rows found in CSV.");
        return { errors, warnings, preview, readyCount: 0, total: 0 };
      }

      const foundHeaders = Object.keys(rows[0] || {});
      const missing = CSV_HEADERS.filter((h) => !foundHeaders.includes(h));
      const extra = foundHeaders.filter((h) => h && !headerSet.has(h));

      if (missing.length) errors.push(`CSV is missing required header(s): ${missing.join(", ")}`);
      if (extra.length) warnings.push(`CSV has extra column(s) that will be ignored: ${extra.join(", ")}`);

      let readyCount = 0;

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

        if (!lockedCompanyId) rowErrors.push("No company assigned to this user (company_users).");

        if (!companyName) rowErrors.push("company_name is required.");
        if (!siteName) rowErrors.push("site_name is required.");
        if (!fn) rowErrors.push("first_name is required.");
        if (!ln) rowErrors.push("last_name is required.");
        if (!et) rowErrors.push("employment_type is required.");
        if (et && et !== "FULL_TIME" && et !== "AGENCY") rowErrors.push("employment_type must be FULL_TIME or AGENCY.");

        // Enforce company_name equals locked company
        if (lockedCompanyName && companyName && safeLower(companyName) !== safeLower(lockedCompanyName)) {
          rowErrors.push(`company_name must be "${lockedCompanyName}".`);
        }

        // Resolve site within locked company
        const site = siteName ? siteByNameForLockedCompany.get(safeLower(siteName)) : null;
        if (siteName && !site) rowErrors.push(`site_name not found for company "${lockedCompanyName}": "${siteName}".`);

        // Conditional rules
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
          _company_id: lockedCompanyId || null,
          _site_id: site?.id || null,

          company_name: companyName,
          site_name: siteName,
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
    [lockedCompanyId, lockedCompanyName, siteByNameForLockedCompany]
  );

  const handleDownloadTemplate = () => {
    const exampleRow = [
      lockedCompanyName || "Your Company",
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

    const csv = [
      CSV_HEADERS.join(","),
      exampleRow.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
    ].join("\n");

    downloadTextFile("colleagues_import_template.csv", csv);
  };

  const handlePickFile = () => {
    setNotice({ type: "", message: "" });
    fileRef.current?.click();
  };

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

      const rows = (parsed.data || []).filter((r) => {
        const values = Object.values(r || {}).map((v) => String(v ?? "").trim());
        return values.some((v) => v.length > 0);
      });

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
          company_id: r._company_id,
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
          weeks_until_full_time:
            et === "AGENCY" && r.weeks_until_full_time !== "" ? Number(r.weeks_until_full_time) : null,
        };
      });

      const BATCH_SIZE = 200;
      for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
        const batch = payloads.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from("colleagues").insert(batch);
        if (error) throw error;
      }

      setNotice({ type: "success", message: `Imported ${payloads.length} colleague(s) successfully.` });

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

  // Tooltip content helper
  const tooltipData = useMemo(() => {
    if (!hoverTip.open || !hoverTip.colleague) return null;

    const c = hoverTip.colleague;
    const siteName = sitesForCompany.find((s) => s.id === c.site_id)?.name || "";

    const conversion =
      c.full_time_conversion_date ||
      (c.employment_type === "AGENCY" && c.agency_start_date && c.weeks_until_full_time != null
        ? addDays(c.agency_start_date, Number(c.weeks_until_full_time) * 7)
        : null);

    const due = conversion ? daysUntil(conversion) : null;

    return { c, siteName, conversion, due };
  }, [hoverTip.open, hoverTip.colleague, sitesForCompany]);

  // -------------------- UI --------------------
  return (
    <AppLayout>
      <div className="wi-page wi-colleaguesPage">
        <div className="wi-pageHeader">
          <h1 className="wi-pageTitle">Colleagues</h1>
          <div className="wi-pageSubtitle">
            Company enforced: <strong>{lockedCompanyName || "—"}</strong>
          </div>
        </div>

        {notice.message && (
          <div className={`wi-alert wi-alert--${notice.type || "info"}`}>{notice.message}</div>
        )}

        <div className="wi-tabsRow">
          <button
            className={`wi-tabPill ${tab === "list" ? "active" : ""}`}
            onClick={() => setTab("list")}
            type="button"
          >
            Colleague list
          </button>
          <button
            className={`wi-tabPill ${tab === "add" ? "active" : ""}`}
            onClick={() => setTab("add")}
            type="button"
          >
            Add / Import
          </button>
        </div>

        {/* LIST TAB */}
        {tab === "list" && (
          <div className="wi-colleaguesGrid">
            <Card
              title="Colleague list"
              subtitle="Agency conversions due within 30 days are prioritised and highlighted."
              actions={
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Button variant="primary" onClick={refreshColleagues} disabled={loading}>
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
                      setHoverTip({ open: false, x: 0, y: 0, colleague: null });
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
                  <input
                    className="wi-input"
                    value={fAgency}
                    onChange={(e) => setFAgency(e.target.value)}
                    placeholder="Agency name…"
                  />
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
                  <input
                    id="showDisabled"
                    type="checkbox"
                    checked={showDisabled}
                    onChange={(e) => setShowDisabled(e.target.checked)}
                  />
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
                {siteId && filteredAndSorted.length === 0 ? (
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
                          const dueLabel =
                            c._due_soon && c._due_in_days != null ? `Due in ${c._due_in_days} day(s)` : "";

                          return (
                            <tr
                              key={c.id}
                              className={`${c._due_soon ? "wi-rowDueSoon" : ""} ${c.active ? "" : "wi-rowDisabled"}`}
                              onMouseEnter={(e) => moveHoverTip(e, c)}
                              onMouseMove={(e) => moveHoverTip(e, c)}
                              onMouseLeave={() => setHoverTip({ open: false, x: 0, y: 0, colleague: null })}
                            >
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

              {/* Floating tooltip */}
              {tooltipData && (
                <div className="wi-floatTip" style={{ left: hoverTip.x, top: hoverTip.y }}>
                  <div className="wi-floatTip__title">
                    {tooltipData.c.first_name} {tooltipData.c.last_name}
                  </div>

                  <div className="wi-floatTip__grid">
                    <div className="k">Site</div>
                    <div className="v">{tooltipData.siteName || "—"}</div>

                    <div className="k">Type</div>
                    <div className="v">{tooltipData.c.employment_type}</div>

                    <div className="k">Emp start</div>
                    <div className="v">{tooltipData.c.employment_start_date || "—"}</div>

                    <div className="k">Agency</div>
                    <div className="v">{tooltipData.c.agency_name || "—"}</div>

                    <div className="k">Agency start</div>
                    <div className="v">{tooltipData.c.agency_start_date || "—"}</div>

                    <div className="k">Weeks → FT</div>
                    <div className="v">{tooltipData.c.weeks_until_full_time ?? "—"}</div>

                    <div className="k">Conversion</div>
                    <div className="v">
                      {tooltipData.conversion || "—"}
                      {tooltipData.due != null ? ` (in ${tooltipData.due}d)` : ""}
                    </div>

                    <div className="k">Emergency</div>
                    <div className="v">{tooltipData.c.emergency_contact_name || "—"}</div>

                    <div className="k">Phone</div>
                    <div className="v">{tooltipData.c.emergency_contact_phone || "—"}</div>

                    <div className="k">Status</div>
                    <div className="v">{tooltipData.c.active ? "Active" : "Disabled"}</div>
                  </div>
                </div>
              )}
            </Card>

            {/* Right side: Export (separate visual box) */}
            <div className="wi-rightStack">
              <Card title="Export" subtitle="Export the currently filtered list to CSV.">
                <div className="wi-muted" style={{ marginBottom: 10 }}>
                  Export respects your filters. For “all colleagues”, set Status = All and tick Show disabled.
                </div>
                <Button variant="primary" onClick={handleExport} disabled={loading || !siteId}>
                  Export CSV
                </Button>
              </Card>
            </div>
          </div>
        )}

        {/* ADD / IMPORT TAB */}
        {tab === "add" && (
          <div className="wi-colleaguesGrid">
            <Card
              title="Add colleague"
              subtitle="Company is enforced from the logged-in user."
              actions={
                <Button variant="primary" onClick={handleCreateManual} disabled={loading}>
                  {loading ? "Saving…" : "Create colleague"}
                </Button>
              }
            >
              <div className="wi-formGrid">
                <div className="wi-field wi-span2">
                  <label className="wi-label">Company</label>
                  <input className="wi-input" value={lockedCompanyName || "—"} disabled />
                </div>

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
                    <input
                      type="date"
                      className="wi-input"
                      value={employmentStartDate}
                      onChange={(e) => setEmploymentStartDate(e.target.value)}
                      disabled={loading}
                    />
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
                      <input
                        type="date"
                        className="wi-input"
                        value={agencyStartDate}
                        onChange={(e) => setAgencyStartDate(e.target.value)}
                        disabled={loading}
                      />
                    </div>

                    <div className="wi-field">
                      <label className="wi-label">Weeks until full time</label>
                      <input
                        type="number"
                        min="0"
                        className="wi-input"
                        value={weeksUntilFullTime}
                        onChange={(e) => setWeeksUntilFullTime(e.target.value)}
                        disabled={loading}
                        placeholder="e.g. 12"
                      />
                      <div className="wi-helper">Conversion date is calculated automatically in the database.</div>
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
                  <Button variant="primary" onClick={handleDownloadTemplate} disabled={loading || !lockedCompanyId}>
                    Download template
                  </Button>
                  <Button variant="primary" onClick={handlePickFile} disabled={loading || !lockedCompanyId}>
                    Upload CSV
                  </Button>
                </div>
              }
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />

              <div className="wi-importMeta">
                <div>
                  <div className="wi-muted">File</div>
                  <div className="wi-helper">{importFileName || "No file selected"}</div>
                </div>
                <div>
                  <div className="wi-muted">Company enforced</div>
                  <div className="wi-helper">{lockedCompanyName || "—"}</div>
                </div>
                <div>
                  <div className="wi-muted">Validation</div>
                  <div className="wi-helper">
                    {importTotalCount === 0 ? "No rows loaded" : `${importReadyCount}/${importTotalCount} rows valid`}
                  </div>
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
                    {importWarnings.length > 8 && (
                      <li className="wi-helper">…and {importWarnings.length - 8} more</li>
                    )}
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

              {importPreview.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="wi-muted" style={{ marginBottom: 6 }}>
                    Preview (first 20 rows)
                  </div>
                  <div className="wi-tableWrap">
                    <table className="wi-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Site</th>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Valid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, 20).map((r) => (
                          <tr key={r._row} style={r._ok ? undefined : { background: "#fff7f7" }}>
                            <td>{r._row}</td>
                            <td>{r.site_name}</td>
                            <td>
                              {r.last_name}, {r.first_name}
                            </td>
                            <td>{r.employment_type}</td>
                            <td>{r._ok ? "Yes" : "No"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
