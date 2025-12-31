import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function MasterData() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const [companyName, setCompanyName] = useState("");
  const [companies, setCompanies] = useState([]);

  /* -----------------------------------------
     LOAD COMPANIES (via membership model)
  ------------------------------------------ */
  const loadCompanies = async () => {
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;

    if (userErr || !user) {
      console.error("Auth error:", userErr);
      setStatus({ text: "You are not signed in.", isError: true });
      return;
    }

    const { data, error } = await supabase
      .from("company_users")
      .select(`
        company_id,
        role,
        companies (
          id,
          name
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Load companies error:", error);
      setStatus({ text: error.message, isError: true });
      return;
    }

    const mapped = data.map((row) => ({
      id: row.companies.id,
      name: row.companies.name,
      role: row.role,
    }));

    setCompanies(mapped);
  };

  /* -----------------------------------------
     CREATE COMPANY + MEMBERSHIP
  ------------------------------------------ */
  const createCompany = async () => {
    if (!companyName.trim()) {
      setStatus({ text: "Company name is required.", isError: true });
      return;
    }

    setLoading(true);
    setStatus({ text: "Creating company...", isError: false });

    // 1) Get logged-in user
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;

    if (userErr || !user) {
      setStatus({ text: "You are not signed in.", isError: true });
      setLoading(false);
      return;
    }

    // 2) Create company
    const { data: company, error: cErr } = await supabase
      .from("companies")
      .insert({ name: companyName.trim() })
      .select("id, name")
      .single();

    if (cErr) {
      console.error("Create company error:", cErr);
      setStatus({ text: cErr.message, isError: true });
      setLoading(false);
      return;
    }

    // 3) Create membership
    const { error: mErr } = await supabase.from("company_users").insert({
      company_id: company.id,
      user_id: user.id,
      role: "admin",
    });

    if (mErr) {
      console.error("Create membership error:", mErr);
      setStatus({
        text: `Company created, but membership failed: ${mErr.message}`,
        isError: true,
      });
      setLoading(false);
      return;
    }

    setCompanyName("");
    setStatus({ text: "Company created.", isError: false });
    await loadCompanies();
    setLoading(false);
  };

  /* -----------------------------------------
     INIT
  ------------------------------------------ */
  useEffect(() => {
    loadCompanies();
  }, []);

  /* -----------------------------------------
     RENDER
  ------------------------------------------ */
  return (
    <div className="wi-page">
      <h1>Company & site setup</h1>

      {status && (
        <div
          className={`wi-alert ${
            status.isError ? "wi-alert--error" : "wi-alert--success"
          }`}
        >
          {status.text}
        </div>
      )}

      <section className="wi-card">
        <h2>Create company</h2>

        <input
          type="text"
          placeholder="Company name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          disabled={loading}
        />

        <button onClick={createCompany} disabled={loading}>
          Create company
        </button>
      </section>

      <section className="wi-card">
        <h2>Your companies</h2>

        {companies.length === 0 ? (
          <p>No companies yet.</p>
        ) : (
          <ul>
            {companies.map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong> ({c.role})
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
