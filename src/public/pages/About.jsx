import React from "react";
import "../styles/public.css";

export default function PublicAbout() {
  return (
    <div className="pub-page">
      <section className="pub-hero">
        <h1 className="pub-h1">About</h1>
        <p className="pub-lead">
          Warehouse Intelligence is focused on straightforward operational tooling—built for warehouse teams, not just analysts.
        </p>

        <div className="pub-grid">
          <div className="pub-card">
            <div className="pub-card__title">Built for operators</div>
            <p className="pub-card__text">
              Mobile-first, clear ownership, minimal friction for supervisors and managers.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-card__title">Designed to scale</div>
            <p className="pub-card__text">
              Start small and add modules over time while preserving consistency across sites.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-card__title">Data-led, not data-heavy</div>
            <p className="pub-card__text">
              Capture what matters and present it in a format teams can actually act on.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
