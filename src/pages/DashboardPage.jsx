import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";
import { supabase } from "../lib/supabaseClient";

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

/** Date helpers (ported from your original dashboard.html) */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function parseYMD(ymd) {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function daysUntil(ymd) {
  const d = parseYMD(ymd);
  if (!d) return null;
  return Math.floor((d.getTime() - startOfToday().getTime()) / (1000 * 60 * 60 * 24));
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

export function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const active = useMemo(() => activeFromPath(location.pathname), [location.pathname]);
  const [email, setEmail] = useState("");

  // Alerts UI state
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState("");
  const [alertsRows, setAlertsRows] = useState([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email || ""));
  }, []);

  const onSelectNav = (key) => {
    navigate(pathFromKey(key));
  };

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setAlertsError("");
    setAlertsRows([]);

    try {
      // IMPORTANT:
      // This matches your original HTML logic (4 queries + client-side calculation).
      // If your RLS requires scoping by account/business_owner_id, see section 2 below.

      const [{ data: companies, error: ec }, { data: sites, error: es }, { data: types, error: et }] =
        await Promise.all([
          supabase.from("companies").select("id, name"),
          supabase.from("sites").select("id, company_id, name, code"),
          supabase.from("mhe_types").select("id, type_name"),
        ]);

      if (ec) throw ec;
      if (es) throw es;
      if (et) throw et;

      const { data: assets, error: ea } = await supabase
        .from("mhe_assets")
        .select(
          "id, site_id, mhe_type_id, asset_tag, serial_number, status, next_inspection_due, next_loler_due, next_service_due, next_puwer_due"
        );

      if (ea) throw ea;

      const safe = (v) => (v === null || v === undefined ? "" : String(v));

      const rows = (assets || [])
        .map((a) => {
          const due = nextDueReason(a);

          const site = (sites || []).find((s) => s.id === a.site_id);
          const comp = (companies || []).find((c) => c.id === site?.company_id);
          const type = (types || []).find((t) => t.id === a.mhe_type_id);

          const siteLabel = `${safe(comp?.name)} – ${safe(site?.name)}${
            site?.code ? ` (${safe(site.code)})` : ""
          }`;
          const assetLabel = a.asset_tag || a.serial_number || "—";

          let bucket = 3; // 0 overdue, 1 due soon, 2 ok, 3 no dates
          let key = Number.POSITIVE_INFINITY;

          if (due.date) {
            key = due.date.getTime();
            bucket = 2;
          }
          if (due.days !== null && due.days < 0) bucket = 0;
          else if (due.days !== null && due.days < 30) bucket = 1;

          return {
            _bucket: bucket,
            _key: key,
            siteLabel,
            assetLabel,
            typeLabel: safe(type?.type_name) || "—",
            reason: due.label,
            dueYmd: due.ymd,
            days: due.days,
            status: a.status || "—",
          };
        })
        .filter((r) => r._bucket === 0 || r._bucket === 1)
        .sort((a, b) => (a._bucket - b._bucket) || (a._key - b._key));

      setAlertsRows(rows);
    } catch (e) {
      console.error(e);
      setAlertsError(e?.message || "Unable to load alerts.");
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  // Load on initial dashboard render (overview)
  useEffect(() => {
    if (active === "overview") loadAlerts();
  }, [active, loadAlerts]);

  return (
    <AppLayout activeNav={active} onSelectNav={onSelectNav} headerEmail={email}>
      {active === "overview" && (
        <>
          <Card title="Account" subtitle="Account ID:">
            <div className="wi-muted">All users and tools are scoped to this account.</div>
          </Card>

          <Card
            title="Equipment alerts"
            subtitle="Overdue and due within 30 days (earliest of Inspection / LOLER / Service / PUWER)."
            actions={
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <Button variant="primary" onClick={loadAlerts}>
                  Reload
                </Button>
                <Button variant="primary" onClick={() => navigate("/app/setup/mhe")}>
                  Open MHE setup
                </Button>
              </div>
            }
          >
            {alertsLoading && <div className="wi-muted">Loading…</div>}

            {!alertsLoading && alertsError && (
              <div className="wi-muted" style={{ color: "#b91c1c" }}>
                {alertsError}
              </div>
            )}

            {!alertsLoading && !alertsError && alertsRows.length === 0 && (
              <div className="wi-muted">No items due within 30 days. Good position.</div>
            )}

            {!alertsLoading && !alertsError && alertsRows.length > 0 && (
              <div style={{ marginTop: 10, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "6px 4px" }}>Site</th>
                      <th style={{ textAlign: "left", padding: "6px 4px" }}>Asset tag</th>
                      <th style={{ textAlign: "left", padding: "6px 4px" }}>Type</th>
                      <th style={{ textAlign: "left", padding: "6px 4px" }}>Next due</th>
                      <th style={{ textAlign: "left", padding: "6px 4px" }}>Due date</th>
                      <th style={{ textAlign: "left", padding: "6px 4px" }}>Days</th>
                      <th style={{ textAlign: "left", padding: "6px 4px" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertsRows.map((r, idx) => {
                      const isOverdue = r._bucket === 0;
                      const isSoon = r._bucket === 1;

                      const daysText =
                        r.days === null
                          ? "—"
                          : r.days < 0
                          ? `${Math.abs(r.days)} overdue`
                          : `${r.days} days`;

                      // Minimal styling without changing your component library
                      const rowStyle = isOverdue
                        ? { background: "#7f1d1d", color: "#fff" }
                        : isSoon
                        ? { background: "#fff7f7" }
                        : undefined;

                      const pillStyle = isOverdue
                        ? {
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,.2)",
                            background: "#7f1d1d",
                            color: "#fff",
                            fontSize: ".75rem",
                            fontWeight: 600,
                          }
                        : {
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: "1px solid #fecaca",
                            background: "#fee2e2",
                            color: "#991b1b",
                            fontSize: ".75rem",
                            fontWeight: 600,
                          };

                      return (
                        <tr key={`${r.assetLabel}-${r.dueYmd}-${idx}`} style={rowStyle}>
                          <td style={{ padding: "6px 4px", borderBottom: "1px solid #e5e7eb" }}>
                            {r.siteLabel}
                          </td>
                          <td style={{ padding: "6px 4px", borderBottom: "1px solid #e5e7eb" }}>
                            {r.assetLabel}
                          </td>
                          <td style={{ padding: "6px 4px", borderBottom: "1px solid #e5e7eb" }}>
                            {r.typeLabel}
                          </td>
                          <td style={{ padding: "6px 4px", borderBottom: "1px solid #e5e7eb" }}>
                            <span style={pillStyle}>{r.reason}</span>
                          </td>
                          <td style={{ padding: "6px 4px", borderBottom: "1px solid #e5e7eb" }}>
                            {r.dueYmd || "—"}
                          </td>
                          <td style={{ padding: "6px 4px", borderBottom: "1px solid #e5e7eb" }}>
                            {daysText}
                          </td>
                          <td style={{ padding: "6px 4px", borderBottom: "1px solid #e5e7eb" }}>
                            {r.status}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card
            title="Scheduling tool"
            subtitle="Plan MHE and labour, track indirect time, and compare plan vs actual by shift."
          >
            <Button variant="primary" onClick={() => navigate("/app/tools/scheduling")}>
              Open scheduling tool
            </Button>
          </Card>
        </>
      )}

      {active === "users" && (
        <Card title="Users" subtitle="">
          <div className="wi-muted">Users section will render here.</div>
        </Card>
      )}

      {active === "password" && (
        <Card title="Password reset" subtitle="">
          <div className="wi-muted">Password reset section will render here.</div>
        </Card>
      )}
    </AppLayout>
  );
}
