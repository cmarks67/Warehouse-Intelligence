import React, { useMemo, useState } from "react";
import "../styles/public.css";

export default function PublicContact() {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  const canSend = useMemo(() => {
    const n = form.name.trim();
    const e = form.email.trim();
    const m = form.message.trim();
    return n.length >= 2 && e.includes("@") && m.length >= 10;
  }, [form]);

  const onSubmit = async (e) => {
    e.preventDefault();
    // Placeholder: wire to Supabase Edge Function or email provider when ready
    setStatus(
      "Submitted. This form is currently UI-only; tell me your preferred email endpoint (Supabase Edge Function or API) and I will wire it."
    );
  };

  return (
    <div className="pub-page">
      <section className="pub-hero">
        <h1 className="pub-h1">Contact us</h1>
        <p className="pub-lead">
          Send a message and we will come back to you.
        </p>

        <form className="pub-form" onSubmit={onSubmit}>
          <div className="pub-field">
            <label className="pub-label">Name</label>
            <input
              className="pub-input"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Your name"
              autoComplete="name"
            />
          </div>

          <div className="pub-field">
            <label className="pub-label">Email</label>
            <input
              className="pub-input"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="you@company.com"
              autoComplete="email"
            />
          </div>

          <div className="pub-field">
            <label className="pub-label">Message</label>
            <textarea
              className="pub-textarea"
              value={form.message}
              onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
              placeholder="Tell us what you want to achieve..."
            />
          </div>

          <button className="pub-btn" type="submit" disabled={!canSend} aria-disabled={!canSend}>
            Send message
          </button>

          {status && <div className="pub-note">{status}</div>}
        </form>
      </section>
    </div>
  );
}
