import React from "react";
import "../styles/public.css";

export default function PublicServices() {
  return (
    <div className="pub-page">
      <section className="pub-hero">
        <h1 className="pub-h1">Services</h1>
        <p className="pub-lead">
          Choose what you need now and expand later. Each module is optimised for mobile usage and operational workflows.
        </p>

        <div className="pub-grid">
          <div className="pub-card">
            <div className="pub-card__title">Scheduling & labour control</div>
            <p className="pub-card__text">
              Shift coverage, planning support, and operational controls aligned to warehouse realities.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-card__title">MHE training & authorisation</div>
            <p className="pub-card__text">
              Track training status, due dates, authorisations, and evidence with clean audit trails.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-card__title">Dashboards & reporting</div>
            <p className="pub-card__text">
              Operational visuals and management information without complex BI implementation overhead.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
