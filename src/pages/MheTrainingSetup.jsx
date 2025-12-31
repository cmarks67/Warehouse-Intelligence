import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";
import "./MheTrainingSetup.css";

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  const d = new Date(`${dateStr}T00:00:00`);
  return Math.ceil((d - today) / (1000 * 60 * 60 * 24));
}

export default function MheTrainingSetup() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [companyId, setCompanyId] = useState(null);
  const [siteId, setSiteId] = useState(null);

  const [sites, setSites] = useState([]);
  const [colleagues, setColleagues] = useState([]);
  const [mheTypes, setMheTypes] = useState([]);
  const [auths, setAuths] = useState([]);

  const [tab, setTab] = useState("register");
  const [search, setSearch] = useState("");
  const [mheTypeFilter, setMheTypeFilter] = useState("ALL");

  const [showAdd, setShowAdd] = useState(false);
  const [addModal, setAddModal] = useState({
    colleagueId: "",
    mheTypeId: "",
    trained_on: "",
    expires_on: "",
    notes: "",
    file: null,
  });

  /* -------------------------------------------------- */
  /* Load bootstrap data                                */
  /* -------------------------------------------------- */
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      const { data: cu } = await supabase
        .from("company_users")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!cu) {
        setError("No company access");
        setLoading(false);
        return;
      }

      setCompanyId(cu.company_id);

      const { data: sitesData } = await supabase
        .from("sites")
        .select("id, name")
        .eq("company_id", cu.company_id)
        .order("name");

      setSites(sitesData || []);
      if (sitesData?.length) setSiteId(sitesData[0].id);

      const { data: mhe } = await supabase
        .from("mhe_types")
        .select("id, type_name")
        .order("type_name");

      setMheTypes(mhe || []);

      setLoading(false);
    }

    load();
  }, []);

  /* -------------------------------------------------- */
  /* Reload site-specific data                          */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!siteId) return;

    async function loadSiteData() {
      const { data: c } = await supabase
        .from("colleagues")
        .select("id, first_name, last_name, employment_type, active")
        .eq("site_id", siteId)
        .eq("active", true)
        .order("last_name");

      setColleagues(c || []);

      const { data: a } = await supabase
        .from("v_mhe_authorisations_current")
        .select("*")
        .eq("site_id", siteId);

      setAuths(a || []);
    }

    loadSiteData();
  }, [siteId]);

  /* -------------------------------------------------- */
  /* Group auths by colleague                           */
  /* -------------------------------------------------- */
  const authsByColleague = useMemo(() => {
    const map = new Map();
    auths.forEach((a) => {
      if (!map.has(a.colleague_id)) map.set(a.colleague_id, []);
      map.get(a.colleague_id).push(a);
    });
    return map;
  }, [auths]);

  /* -------------------------------------------------- */
  /* Build register rows                                */
  /* -------------------------------------------------- */
  const rows = useMemo(() => {
    return colleagues
      .map((c) => {
        const list = authsByColleague.get(c.id) || [];
        if (list.length === 0) return null; // hide zero-training colleagues

        const visible =
          mheTypeFilter === "ALL"
            ? list
            : list.filter((a) => a.mhe_type_id === mheTypeFilter);

        if (!visible.length) return null;

        const minDays = Math.min(
          ...list.map((a) => daysUntil(a.expires_on) ?? 9999)
        );

        return {
          ...c,
          auths: visible,
          nextDueDays: minDays,
        };
      })
      .filter(Boolean)
      .filter((c) =>
        `${c.first_name} ${c.last_name}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
      .sort((a, b) => a.nextDueDays - b.nextDueDays);
  }, [colleagues, authsByColleague, mheTypeFilter, search]);

  /* -------------------------------------------------- */
  /* Add training                                      */
  /* -------------------------------------------------- */
  async function submitAddTraining() {
    setError("");

    if (
      !addModal.colleagueId ||
      !addModal.mheTypeId ||
      !addModal.trained_on ||
      !addModal.expires_on
    ) {
      setError("All required fields must be completed.");
      return;
    }

    let certificatePath = null;

    if (addModal.file) {
      const fileExt = addModal.file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const path = `company/${companyId}/training/${fileName}`;

      const { error: upErr } = await supabase.storage
        .from("mhe-certificates")
        .upload(path, addModal.file);

      if (upErr) {
        setError("Certificate upload failed.");
        return;
      }

      certificatePath = path;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: insErr } = await supabase
      .from("colleague_mhe_authorisations")
      .insert({
        site_id: siteId,
        colleague_id: addModal.colleagueId,
        mhe_type_id: addModal.mheTypeId,
        trained_on: addModal.trained_on,
        expires_on: addModal.expires_on,
        status: "ACTIVE",
        notes: addModal.notes || null,
        certificate_path: certificatePath,
        signed_off_by: user?.id || null,
        signed_off_at: new Date().toISOString(),
      });

    if (insErr) {
      setError(insErr.message);
      return;
    }

    setShowAdd(false);
    setAddModal({
      colleagueId: "",
      mheTypeId: "",
      trained_on: "",
      expires_on: "",
      notes: "",
      file: null,
    });

    const { data: a } = await supabase
      .from("v_mhe_authorisations_current")
      .select("*")
      .eq("site_id", siteId);

    setAuths(a || []);
  }

  /* -------------------------------------------------- */
  /* Render                                            */
  /* -------------------------------------------------- */
  if (loading) return <div>Loading…</div>;

  return (
    <Card title="MHE training tracker">
      {error && <div className="wi-error">{error}</div>}

      <div className="wi-tabs">
        <button
          className={tab === "register" ? "active" : ""}
          onClick={() => setTab("register")}
        >
          Training register
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          Audit history
        </button>
      </div>

      {tab === "register" && (
        <>
          <div className="wi-toolbar">
            <select
              value={siteId || ""}
              onChange={(e) => setSiteId(e.target.value)}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <input
              placeholder="Search colleague…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              value={mheTypeFilter}
              onChange={(e) => setMheTypeFilter(e.target.value)}
            >
              <option value="ALL">All MHE types</option>
              {mheTypes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.type_name}
                </option>
              ))}
            </select>

            <Button onClick={() => setShowAdd(true)}>
              Add training record
            </Button>
          </div>

          {rows.map((c) => (
            <div key={c.id} className="wi-colleague-card">
              <strong>
                {c.last_name}, {c.first_name}
              </strong>{" "}
              ({c.employment_type})
              <ul>
                {c.auths.map((a) => (
                  <li key={a.id}>
                    {a.mhe_type} — expires {a.expires_on} (
                    {daysUntil(a.expires_on)} days)
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      {tab === "history" && (
        <div>
          <p>Audit history loaded from v_mhe_authorisations_history.</p>
        </div>
      )}

      {showAdd && (
        <div className="wi-modal">
          <div className="wi-modal-content">
            <h3>Add training record</h3>

            <select
              value={addModal.colleagueId}
              onChange={(e) =>
                setAddModal((p) => ({ ...p, colleagueId: e.target.value }))
              }
            >
              <option value="">Select colleague…</option>
              {colleagues.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.last_name}, {c.first_name}
                </option>
              ))}
            </select>

            <select
              value={addModal.mheTypeId}
              onChange={(e) =>
                setAddModal((p) => ({ ...p, mheTypeId: e.target.value }))
              }
            >
              <option value="">Select MHE type…</option>
              {mheTypes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.type_name}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={addModal.trained_on}
              onChange={(e) =>
                setAddModal((p) => ({ ...p, trained_on: e.target.value }))
              }
            />

            <input
              type="date"
              value={addModal.expires_on}
              onChange={(e) =>
                setAddModal((p) => ({ ...p, expires_on: e.target.value }))
              }
            />

            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) =>
                setAddModal((p) => ({ ...p, file: e.target.files[0] }))
              }
            />

            <input
              placeholder="Notes (optional)"
              value={addModal.notes}
              onChange={(e) =>
                setAddModal((p) => ({ ...p, notes: e.target.value }))
              }
            />

            <div className="wi-actions">
              <Button onClick={submitAddTraining}>Save</Button>
              <Button
                variant="secondary"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
