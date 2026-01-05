import React from "react";
import { Link } from "react-router-dom";
import "../styles/public.css";

export default function PublicIndex() {
  return (
    <div className="pub-page">
      <section className="pub-hero">
      <h1 className="pub-h1">
  Warehouse <span className="wi-brand-primary">Intelligence</span>
</h1>
        <p className="pub-lead">
          Practical tooling for warehouse operations: compliance, scheduling, MHE training, and performance visibility—
          designed to work cleanly on mobile and desktop.
        </p>

        <div className="pub-actions">
          <Link className="pub-btn" to="/services">
            View services
          </Link>
          <Link className="pub-btn pub-btn--ghost" to="/contact">
            Contact us
          </Link>
        </div>

        <div className="pub-grid">
          <div className="pub-card">
            <div className="pub-card__title">Operational control</div>
            <p className="pub-card__text">
              Standardise processes across teams with consistent workflows and accountability.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-card__title">Compliance & training</div>
            <p className="pub-card__text">
              Maintain audit readiness with traceable records and clear ownership.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-card__title">Visibility</div>
            <p className="pub-card__text">
              Surface the signals that matter without heavy BI subscriptions.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
